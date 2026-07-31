const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/analysis-poi-geojson.js`, 'utf8'));
const poiGeoJson = window.PanmapApp.analysisPoiGeoJson;

test('converts POIs to stable point features and preserves taxonomy properties', () => {
  const diagnostics = [];
  const collection = poiGeoJson.buildPoiFeatures({ pois: [{
    poiId: 'overture:one', datasetId: 'dataset', name: '地点', ringId: 'ring-0-10',
    location: { lon: 114.3, lat: 30.5 }, category: {
      topLevelId: 'food_and_drink', basicCategoryId: 'restaurant', primaryCategoryId: 'hot_pot_restaurant',
    },
  }] }, diagnostics);
  assert.equal(collection.features[0].id, 'overture:one');
  assert.equal(collection.features[0].properties.primaryCategoryId, 'hot_pot_restaurant');
  assert.deepEqual(diagnostics, []);
});

test('skips invalid points with diagnostics', () => {
  const diagnostics = [];
  const collection = poiGeoJson.buildPoiFeatures({ pois: [{ poiId: 'bad', location: { lon: 999, lat: 0 } }] }, diagnostics);
  assert.equal(collection.features.length, 0);
  assert.equal(diagnostics.length, 1);
});
