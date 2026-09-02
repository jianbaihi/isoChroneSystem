import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: { PanmapApp: {} } };
vm.runInNewContext(fs.readFileSync(new URL('./panmap-mvp-layout.js', import.meta.url), 'utf8'), context);
const api = context.window.PanmapApp.panmapMvpLayout;
const snapshot = {
  rings: [{ ringId: 'ring-0-10', order: 0 }, { ringId: 'ring-10-20', order: 1 }, { ringId: 'ring-20-30', order: 2 }],
  pois: [
    { poiId: '1', name: '甲餐厅', displayRingId: 'ring-10-20', travelTimeMinuteEstimate: 12, providerCategory: { level1Code: '050000', level1Label: '餐饮服务' }, categoryStyleKey: 'amap-l1-050000' },
    { poiId: '2', name: '乙餐厅', displayRingId: 'ring-10-20', travelTimeMinuteEstimate: 15, providerCategory: { level1Code: '050000', level1Label: '餐饮服务' }, categoryStyleKey: 'amap-l1-050000' },
    { poiId: '3', name: '商店', displayRingId: 'ring-10-20', travelTimeMinuteEstimate: 18, providerCategory: { level1Code: '060000', level1Label: '购物服务' }, categoryStyleKey: 'amap-l1-060000' },
    { poiId: '4', name: '公园', displayRingId: 'ring-10-20', travelTimeMinuteEstimate: 19, providerCategory: { level1Code: '110000', level1Label: '风景名胜' }, categoryStyleKey: 'amap-l1-110000' },
  ],
};

test('category aggregation preserves three category cluster counts', () => {
  const ring = api.aggregateCategories(snapshot).find((item) => item.ring.ringId === 'ring-10-20');
  assert.equal(ring.nodes.length, 3);
  assert.equal(ring.nodes.reduce((sum, node) => sum + node.poiCount, 0), 4);
});

test('same snapshot produces byte-identical deterministic layout', () => {
  assert.deepEqual(api.buildOverviewLayout(snapshot), api.buildOverviewLayout(snapshot));
});

test('POI label layout caps at 40 and has zero overlaps', () => {
  const pois = Array.from({ length: 80 }, (_, index) => ({ poiId: String(index), name: `地点${index}`, displayRingId: 'ring-10-20', travelTimeMinuteEstimate: index + 1, providerCategory: { level1Code: '050000' } }));
  const selected = api.selectPoiLabels({ ...snapshot, pois }, 'ring-10-20', '050000');
  const layout = api.layoutPoiLabels(selected);
  assert.equal(selected.length, 40);
  assert.equal(layout.overlapCount, 0);
  assert.equal(layout.visiblePoiCount + layout.hiddenPoiCount, 40);
});
