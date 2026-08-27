const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'src/adapters/traditional-map-adapter.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'analysis-store.js'), 'utf8'));

test('profile switch resets focus and keeps only a lightweight stale reachability snapshot', () => {
  const store = window.PanmapApp.createAnalysisStore();
  store.setResult({
    analysisId: 'large-result', status: 'completed', profile: 'foot-walking',
    rings: [{ ringId: 'ring-10' }], rangesMinutes: [10], categories: [{ categoryId: 'food' }],
    pois: Array.from({ length: 600 }, (_, index) => ({ poiId: `poi-${index}` })),
  });
  store.setActiveRingId('ring-10');
  store.setHoveredRingId('ring-10');
  store.setActiveProfile('cycling-regular');
  const state = store.getState();
  assert.equal(state.interaction.activeRingId, null);
  assert.equal(state.interaction.hoveredRingId, null);
  assert.equal(state.interaction.focusedRingId, null);
  assert.equal(state.data.resultStale, true);
  assert.deepEqual(state.data.lastSuccessfulResult.pois, []);
  assert.deepEqual(state.data.lastSuccessfulResult.categories, []);
  assert.equal(state.data.resultsByProfile['foot-walking'].poiCount, 600);
  assert.equal(state.data.resultsByProfile['foot-walking'].pois, undefined);
});

test('new reachability results start with no selected or hovered ring', () => {
  const store = window.PanmapApp.createAnalysisStore();
  store.setResult({ analysisId: 'one', profile: 'driving-car', rings: [{ ringId: 'ring-10' }] });
  store.setActiveRingId('ring-10');
  store.setHoveredRingId('ring-10');
  store.setResult({ analysisId: 'two', profile: 'driving-car', rings: [{ ringId: 'ring-10' }] });
  const interaction = store.getState().interaction;
  assert.equal(interaction.activeRingId, null);
  assert.equal(interaction.hoveredRingId, null);
  assert.equal(interaction.focusedRingId, null);
});

test('switch path has no payload hydration, API request, POI rewrite, or panmap layout', () => {
  const body = appSource.slice(appSource.indexOf('async function switchActiveProfile'), appSource.indexOf('function buildAnalysisRequestFromUI'));
  assert.match(body, /setPoiVisibility\(false\)/);
  assert.match(body, /cachePayloadHydrations: 0/);
  assert.match(body, /upstreamApiCalls: 0/);
  assert.doesNotMatch(body, /setPois\(|sessionStorage\.getItem|JSON\.parse|fetch\(|applyAnalysisResultToPanmap|runSpatialTimeAccessibility/);
});

test('POI visibility is an O(1) layer toggle and stale rings ignore hover/click', () => {
  const start = adapterSource.indexOf('function updatePoiVisibility');
  const visibilityBody = adapterSource.slice(start, adapterSource.indexOf('\n    }', start) + 6);
  assert.match(visibilityBody, /setLayoutProperty/);
  assert.doesNotMatch(visibilityBody, /setData|buildPoiFeatures|POI_SOURCE_ID/);
  assert.match(adapterSource, /if \(isPickMode \|\| resultStale\) return;/);
});

test('POI summary is separate from the action button and covers complete, truncated and stale states', () => {
  assert.equal((html.match(/id="poiQuerySummary"/g) || []).length, 1);
  const summary = appSource.slice(appSource.indexOf('function renderPoiQuerySummary'), appSource.indexOf('function updateMatrixPresentation'));
  assert.match(summary, /本次搜索到 \$\{count\} 个 POI/);
  assert.match(summary, /本次返回 \$\{count\} 个 POI · \$\{providerLabel\} · 结果可能不完整/);
  assert.match(summary, /尚未查询当前范围 POI/);
  assert.match(appSource, /setPoiQueryButtonState\('complete', 'POI 查询完成'\)/);
  assert.doesNotMatch(appSource, /setPoiQueryButtonState\('complete', `POI 查询完成 ·/);
});
