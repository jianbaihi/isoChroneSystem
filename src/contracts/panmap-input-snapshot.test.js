import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
  const context = { window: { PanmapApp: { categoryStyleRegistry: { version: 'styles-v1', forCode: (code) => ({ label: code === '050000' ? '餐饮服务' : '购物服务', styleKey: `amap-l1-${code}` }) } } }, console };
  vm.runInNewContext(fs.readFileSync(new URL('./panmap-input-snapshot.js', import.meta.url), 'utf8'), context);
  return context.window.PanmapApp.panmapInputSnapshot;
}

const reachability = { center: { lon: 114.3, lat: 30.5, label: '武汉·黄鹤楼' }, rangesMinutes: [10, 20, 30] };
const pois = [
  { poiId: 'a', name: '甲餐厅', location: { lon: 114.31, lat: 30.51 }, providerCategory: { level1Code: '050000', level1Label: '餐饮服务' }, categoryStyleKey: 'amap-l1-050000', source: 'amap' },
  { poiId: 'b', name: '乙商店', location: { lon: 114.32, lat: 30.52 }, providerCategory: { level1Code: '060000', level1Label: '购物服务' }, categoryStyleKey: 'amap-l1-060000', source: 'amap' },
];
const poiResult = { poiQueryId: 'poi-1', analysisFingerprint: 'reach-1', profile: 'foot-walking', pois, metadata: { reachabilityFingerprint: 'reach-1', poiQueryFingerprint: 'poi-fp-1' } };
const minuteResult = { minuteAccessibilityId: 'minute-1', analysisFingerprint: 'reach-1', poiQueryId: 'poi-1', assignments: [
  { poiId: 'a', travelTimeMinuteEstimate: 7 }, { poiId: 'b', travelTimeMinuteEstimate: 17 },
] };

test('buildPanmapInputSnapshot freezes current real workflow into exclusive rings', () => {
  const api = load();
  const snapshot = api.buildPanmapInputSnapshot(reachability, poiResult, minuteResult);
  assert.equal(snapshot.pois.length, 2);
  assert.deepEqual([...snapshot.pois.map((poi) => poi.displayRingId)], ['ring-0-10', 'ring-10-20']);
  assert.equal(new Set(snapshot.pois.map((poi) => poi.displayRingId)).size, 2);
  assert.equal(snapshot.pois[0].travelTimeMinuteEstimate, 7);
  assert.equal(snapshot.pois[0].categoryStyleKey, 'amap-l1-050000');
  assert.equal(snapshot.metadata.providerCallCount, 0);
  assert.equal(Object.isFrozen(snapshot), true);
});

test('snapshot identity is deterministic for same workflow data', () => {
  const api = load();
  const first = api.buildPanmapInputSnapshot(reachability, poiResult, minuteResult);
  const second = api.buildPanmapInputSnapshot(reachability, poiResult, minuteResult);
  assert.equal(first.snapshotId, second.snapshotId);
});

test('exclusive ring boundary assigns every eligible POI exactly once', () => {
  const api = load();
  const rings = api.exclusiveRings([30, 10, 20]);
  assert.equal(api.ringForMinute(10, rings).ringId, 'ring-0-10');
  assert.equal(api.ringForMinute(11, rings).ringId, 'ring-10-20');
  assert.equal(api.ringForMinute(30, rings).ringId, 'ring-20-30');
  assert.equal(api.ringForMinute(31, rings), null);
});
