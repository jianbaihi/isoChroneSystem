const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/poi-detail-contract.js`, 'utf8'));
const contract = window.PanmapApp.poiDetailContract;

test('normalizes provider POIs with nullable enhancement fields and unknown categories', () => {
  const normalized = contract.normalizePoi({
    poiId: 'poi-1', name: '测试点', location: { lon: 114.3, lat: 30.5 },
    source: 'ors-openpoiservice', categoryId: 'provider-specific-category', ringId: 'ring-0-10',
  });
  assert.equal(normalized.category.id, 'other');
  assert.equal(normalized.address, null);
  assert.equal(normalized.rating, null);
  assert.equal(normalized.openingHours, null);
  assert.equal(normalized.source.provider, 'ors-openpoiservice');
});

test('builds detail view models before and after minute assignment without DOM/provider raw data', () => {
  const poiResult = { pois: [{ poiId: 'poi-1', name: '测试点', location: { lon: 1, lat: 2 }, categoryId: 'food', source: 'ors-openpoiservice', ringId: 'ring-10-20' }] };
  const before = contract.buildPoiDetailViewModel('poi-1', poiResult, null, 'foot-walking');
  assert.equal(before.travelTimePrimary, null);
  assert.equal(before.travelTimeMethodLabel, '尚未补齐');
  const after = contract.buildPoiDetailViewModel('poi-1', poiResult, { assignments: [{
    poiId: 'poi-1', travelTimeMinuteEstimate: 12,
    travelTimeBand: { lowerExclusiveMinutes: 11, upperInclusiveMinutes: 12 },
  }] }, 'foot-walking');
  assert.equal(after.travelTimePrimary, '约 12 分钟');
  assert.equal(after.travelTimeSecondary, '(11, 12] 分钟');
  assert.equal(after.providerLabel, 'OpenPOIService');
  assert.equal('element' in after, false);
});
