const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/analysis-map-geojson.js`, 'utf8'));
const geojson = window.PanmapApp.analysisMapGeoJson;

test('converts polygon and multipolygon rings with stable IDs', () => {
  const result = geojson.buildRingFeatures({
    rings: [
      { ringId: 'ring-0-5', innerRangeMinutes: 0, outerRangeMinutes: 5, geometry: { type: 'Polygon', coordinates: [[[116, 39], [117, 39], [117, 40], [116, 39]]] } },
      { ringId: 'ring-5-15', innerRangeMinutes: 5, outerRangeMinutes: 15, geometry: { type: 'MultiPolygon', coordinates: [[[[116, 39], [117, 39], [117, 40], [116, 39]]]] } },
      { ringId: 'ring-15-30', innerRangeMinutes: 15, outerRangeMinutes: 30, geometry: null },
    ],
  });
  assert.deepEqual(result.features.map((feature) => feature.id), ['ring-0-5', 'ring-5-15']);
  assert.equal(result.features[1].properties.ringId, 'ring-5-15');
  assert.equal(result.features.length, 2);
});

test('keeps WGS84 coordinate order and computes multipolygon bounds', () => {
  const center = geojson.buildCenterFeatures({ lon: 116.4815, lat: 39.9906, label: 'test' });
  assert.deepEqual(center.features[0].geometry.coordinates, [116.4815, 39.9906]);
  const bounds = geojson.boundsForGeometry({ type: 'MultiPolygon', coordinates: [[[[116, 39], [117, 39], [117, 40], [116, 39]]], [[[118, 38], [119, 38], [119, 41], [118, 38]]]] });
  assert.deepEqual(bounds, [[116, 38], [119, 41]]);
});

test('rejects invalid geometry and handles empty collections', () => {
  assert.deepEqual(geojson.buildRingFeatures({ rings: [] }), { type: 'FeatureCollection', features: [] });
  assert.throws(() => geojson.buildRingFeatures({ rings: [{ ringId: 'bad', geometry: { type: 'Point', coordinates: [116, 39] } }] }));
  assert.equal(geojson.boundsForFeatures({ type: 'FeatureCollection', features: [] }), null);
});
