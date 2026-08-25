const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/analysis-contracts.js`, 'utf8'));
const contracts = window.PanmapApp.contracts;

test('normalizes unordered duplicate draft thresholds and rejects invalid counts', () => {
  assert.deepEqual(contracts.normalizeDraftRanges([30, 5, 15, 15]), [5, 15, 30]);
  assert.throws(() => contracts.normalizeDraftRanges([]));
  assert.throws(() => contracts.normalizeDraftRanges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
  assert.throws(() => contracts.normalizeDraftRanges([0, 10]));
});

function matrixResult() {
  return {
    schemaVersion: '1.0', status: 'completed', analysisId: 'matrix-result',
    center: { lon: 114.296944, lat: 30.546944 }, profile: 'foot-walking', rangesMinutes: [10, 20, 30],
    cumulativeIsochrones: [],
    rings: [
      { ringId: 'ring-0-10', innerRangeMinutes: 0, outerRangeMinutes: 10, geometry: null, statistics: { poiCount: 1 } },
      { ringId: 'ring-10-20', innerRangeMinutes: 10, outerRangeMinutes: 20, geometry: null, statistics: { poiCount: 0 } },
      { ringId: 'ring-20-30', innerRangeMinutes: 20, outerRangeMinutes: 30, geometry: null, statistics: { poiCount: 0 } },
    ],
    pois: [{ poiId: 'poi-1', name: '测试地点', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-0-10' }],
    accessibility: [{
      poiId: 'poi-1', matrixStatus: 'ok', matrixBandId: 'ring-0-10', spatialBandId: 'ring-10-20',
      travelTimeSeconds: 754.2, networkDistanceMeters: 914.6,
    }],
    categories: [],
    metadata: {
      source: 'mixed', sources: { isochrones: 'ors-public-api', pois: 'ors-openpoiservice' },
      matrix: { requestedPoiCount: 1, matrixOkCount: 1, matrixWithinRangeCount: 1, matrixOutOfRangeCount: 0, matrixNullCount: 0, matrixInvalidCount: 0 },
    },
  };
}

test('normalizes complete Matrix accessibility and formats summary and POI detail', () => {
  const result = contracts.normalizeAnalysisResult(matrixResult());
  assert.equal(result.accessibility[0].travelTimeSeconds, 754.2);
  assert.equal(result.publishedResultSchemaVersion, '2.0');
  assert.equal(result.pois[0].travelTimeSeconds, 754.2);
  assert.equal(result.pois[0].networkDistanceMeters, 914.6);
  assert.equal(result.pois[0].ringId, 'ring-10-20');
  assert.equal(result.pois[0].matrixBandId, 'ring-10-20');
  assert.equal(result.pois[0].spatialBandId, 'ring-10-20');
  assert.equal(contracts.matrixSummaryText(result), 'Matrix 已计算 1/1 · 圈内 1 · 超出30分 0 · 异常 0');
  assert.equal(contracts.matrixPoiDetailText(result, 'poi-1'), '测试地点 · Matrix 路网估算：12 分 34 秒 · 路网距离 915 米');
});

test('POI--Matrix join is immutable, keyed by poiId, and respects exact boundaries', () => {
  const input = matrixResult();
  input.pois = [
    { poiId: 'a', name: 'A', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-20-30' },
    { poiId: 'b', name: 'B', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-20-30' },
    { poiId: 'c', name: 'C', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-20-30' },
    { poiId: 'd', name: 'D', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-20-30' },
  ];
  input.accessibility = [
    { poiId: 'd', matrixStatus: 'ok', travelTimeSeconds: 1801, networkDistanceMeters: 4, spatialBandId: 'ring-0-10' },
    { poiId: 'b', matrixStatus: 'ok', travelTimeSeconds: 1200, networkDistanceMeters: 2, spatialBandId: 'ring-0-10' },
    { poiId: 'a', matrixStatus: 'ok', travelTimeSeconds: 600, networkDistanceMeters: 1, spatialBandId: 'ring-0-10' },
    { poiId: 'c', matrixStatus: 'ok', travelTimeSeconds: 1800, networkDistanceMeters: 3, spatialBandId: 'ring-0-10' },
  ];
  const before = JSON.stringify(input);
  const result = contracts.normalizeAnalysisResult(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(result.pois.map((poi) => [poi.poiId, poi.ringId]), [
    ['a', 'ring-0-10'], ['b', 'ring-10-20'], ['c', 'ring-20-30'], ['d', 'matrix-out-of-range'],
  ]);
  assert.ok(result.pois.every((poi) => poi.ringId === poi.matrixBandId));
});

test('POI--Matrix normalization rejects duplicate, missing and extra Matrix records', () => {
  const duplicate = matrixResult();
  duplicate.accessibility.push({ ...duplicate.accessibility[0] });
  assert.throws(() => contracts.normalizeAnalysisResult(duplicate));
  const missing = matrixResult();
  missing.pois.push({ poiId: 'other', name: 'Other', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-0-10' });
  assert.throws(() => contracts.normalizeAnalysisResult(missing));
  const extra = matrixResult();
  extra.accessibility[0].poiId = 'not-a-poi';
  assert.throws(() => contracts.normalizeAnalysisResult(extra));
});

test('Matrix null and invalid remain auditable rather than entering spatial rings', () => {
  const input = matrixResult();
  input.pois = [
    { poiId: 'null', name: 'Null', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-0-10' },
    { poiId: 'invalid', name: 'Invalid', location: { lon: 114.3, lat: 30.55 }, ringId: 'ring-0-10' },
  ];
  input.accessibility = [
    { poiId: 'null', matrixStatus: 'null', spatialBandId: 'ring-0-10' },
    { poiId: 'invalid', matrixStatus: 'invalid', spatialBandId: 'ring-0-10' },
  ];
  const result = contracts.normalizeAnalysisResult(input);
  assert.deepEqual(result.pois.map((poi) => [poi.matrixStatus, poi.ringId, poi.travelTimeSeconds]), [
    ['null', 'matrix-null', null], ['invalid', 'matrix-invalid', null],
  ]);
});

test('old responses remain compatible and null Matrix values do not crash', () => {
  const legacy = matrixResult();
  delete legacy.accessibility;
  delete legacy.metadata.matrix;
  const result = contracts.normalizeAnalysisResult(legacy);
  assert.deepEqual(result.accessibility, []);
  assert.equal(contracts.matrixSummaryText(result), '尚未计算 Matrix 路网估算');
  assert.equal(contracts.matrixPoiDetailText(result, 'poi-1'), '测试地点 · 尚无 Matrix 路网估算');
});

test('rejects incomplete or invalid Matrix accessibility', () => {
  const invalid = matrixResult();
  invalid.accessibility[0].travelTimeSeconds = null;
  assert.throws(() => contracts.normalizeAnalysisResult(invalid));
});
