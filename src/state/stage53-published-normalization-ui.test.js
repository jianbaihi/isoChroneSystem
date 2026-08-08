const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const contractsSource = fs.readFileSync(path.join(root, 'src/contracts/analysis-contracts.js'), 'utf8');
const adapterSource = fs.readFileSync(path.join(root, 'src/adapters/panmap-layout-adapter.js'), 'utf8');
const poiGeoJsonSource = fs.readFileSync(path.join(root, 'src/map/analysis-poi-geojson.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function contracts() {
  const context = { window: { PanmapApp: {} } };
  vm.runInNewContext(contractsSource, context);
  return context.window.PanmapApp.contracts;
}

test('legacy cycling archive migrates in memory to POI-level Matrix fields without mutating its source JSON', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(root, 'exports/stage-10-cycling-live/stage51-cycling-complete.json'), 'utf8'));
  const before = JSON.stringify(legacy);
  const normalized = contracts().normalizeAnalysisResult(legacy);
  assert.equal(JSON.stringify(legacy), before);
  assert.equal(normalized.publishedResultSchemaVersion, '2.0');
  assert.equal(normalized.pois.length, 2413);
  assert.equal(normalized.accessibility.length, 2413);
  assert.equal(normalized.pois.filter((poi) => poi.matrixStatus === 'ok').length, 2413);
  assert.equal(normalized.pois.filter((poi) => poi.travelTimeSeconds == null).length, 0);
  assert.equal(normalized.pois.filter((poi) => poi.networkDistanceMeters == null).length, 0);
  assert.equal(normalized.pois.filter((poi) => poi.ringId !== poi.matrixBandId).length, 0);
});

test('ordinary layout, map GeoJSON and POI details read normalized POI fields instead of a view-local Matrix join', () => {
  assert.doesNotMatch(adapterSource, /const accessibility = Array\.isArray\(result\?\.accessibility\)/);
  assert.doesNotMatch(poiGeoJsonSource, /accessibilityById/);
  const detailBody = contractsSource.slice(contractsSource.indexOf('function matrixPoiDetailText'), contractsSource.indexOf('function matrixBandForDuration'));
  assert.doesNotMatch(detailBody, /accessibility/);
  assert.match(appSource, /normalizeAnalysisResult\(JSON\.parse\(cached\)\)/);
  assert.match(appSource, /normalizeAnalysisResult\(await response\.json\(\)\)/);
});

test('normalization and view-only modules make no business upstream requests', () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
  try {
    const normalized = contracts().normalizeAnalysisResult(JSON.parse(fs.readFileSync(path.join(root, 'exports/stage-10-cycling-live/stage51-cycling-complete.json'), 'utf8')));
    assert.equal(normalized.pois.length, 2413);
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
