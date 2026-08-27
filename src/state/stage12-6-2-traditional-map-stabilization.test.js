const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file, sandbox = { window: { PanmapApp: {} }, TextEncoder, structuredClone }) {
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.window.PanmapApp;
}

test('category change keeps reachability ready and invalidates only POI and minute assignment', () => {
  const app = load('src/state/analysis-store.js');
  const store = app.analysisStore;
  store.setParameterDraft({ categoryIds: ['050000'] });
  store.setResult({ analysisId: 'reach', profile: 'driving-car', center: { lon: 114.296944, lat: 30.546944 }, rangesMinutes: [10,20,30], rings: [], pois: [], categories: [], metadata: { analysisFingerprint: 'fnv1a-reach' } });
  store.setPoiResult({ poiQueryId: 'poi-1', analysisFingerprint: 'fnv1a-reach', profile: 'driving-car', pois: [{ poiId: 'a' }] });
  store.setMinuteResult({ minuteAccessibilityId: 'minute-1', analysisFingerprint: 'fnv1a-reach', poiQueryId: 'poi-1', profile: 'driving-car', assignments: [] });
  store.setParameterDraft({ categoryIds: ['090000'] });
  const state = store.getState();
  assert.equal(state.data.resultStale, false);
  assert.equal(state.data.workflowStatus.reachability, 'ready');
  assert.equal(state.data.workflowStatus.poi, 'stale');
  assert.equal(state.data.workflowStatus.minute, 'stale');
  assert.equal(state.data.workflow.reachabilityResult.analysisId, 'reach');
});

test('reachability fingerprint excludes POI categories while POI fingerprint includes them', () => {
  const app = load('src/contracts/analysis-contracts.js');
  const base = { center: { lon: 114.2, lat: 30.5 }, profile: 'foot-walking', rangesMinutes: [5,10] };
  assert.equal(app.contracts.analysisFingerprint({ ...base, categoryIds: ['050000'] }), app.contracts.analysisFingerprint({ ...base, categoryIds: ['090000'] }));
  const reach = app.contracts.analysisFingerprint(base);
  assert.notEqual(app.contracts.poiQueryFingerprint({ reachabilityFingerprint: reach, categoryIds: ['050000'] }), app.contracts.poiQueryFingerprint({ reachabilityFingerprint: reach, categoryIds: ['090000'] }));
});

test('AMap taxonomy and style registry cover every level-1 category with stable style keys', () => {
  const schema = JSON.parse(fs.readFileSync('data/provider-taxonomy/amap/level1.json'));
  const registry = JSON.parse(fs.readFileSync('data/ui/category-style-registry.json'));
  assert.equal(schema.categories.length, 20);
  for (const category of schema.categories) {
    assert.equal(registry.styles[category.code].label, category.label);
    assert.match(registry.styles[category.code].color, /^#[0-9A-F]{6}$/);
  }
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /id="amapCategoryGrid"/);
  assert.doesNotMatch(html, /data-poi="(?:food|health|transport)"/);
});

test('ResearchPoiDataset preserves provider and semantic categories without UI state', () => {
  const sandbox = { window: { PanmapApp: { categoryStyleRegistry: { version: 'amap-category-style-v1' } } }, TextEncoder };
  const app = load('src/contracts/research-poi-dataset.js', sandbox);
  const result = app.researchPoiDataset.build({ poiQueryId:'q', analysisFingerprint:'r', center:{lon:1,lat:2}, profile:'foot-walking', rangesMinutes:[5], categoryIds:['150000'], metadata:{provider:'amap',completeness:{status:'complete',categories:{'150000':{}},completeCategories:1}}, pois:[{poiId:'p',name:'站',source:'amap',location:{lon:1,lat:2},ringId:'ring-0-5',providerCategory:{level1Code:'150000',level1Label:'交通设施服务'},semanticCategory:{id:'transport',label:'交通'},categoryStyleKey:'amap-l1-150000'}] }, { assignments:[{poiId:'p',travelTimeMinuteEstimate:4,travelTimeBand:{lowerExclusiveMinutes:3,upperInclusiveMinutes:4}}] });
  assert.equal(result.pois[0].categoryStyleKey, 'amap-l1-150000');
  assert.equal(result.categoryRingStatistics['150000']['ring-0-5'], 1);
  assert.equal(result.metadata.queryCompleteness, 'complete');
  assert.equal(JSON.stringify(result).includes('hovered'), false);
});

test('detail selection suppresses hover and close restores it', () => {
  const state = load('src/state/poi-interaction-state.js').createPoiInteractionState();
  state.hover('a'); state.select('a');
  assert.equal(state.hoveredPoiId, null); assert.equal(state.hoverSuppressed, true);
  state.hover('b'); assert.equal(state.hoveredPoiId, null);
  state.close(); state.hover('b'); assert.equal(state.hoveredPoiId, 'b');
});
