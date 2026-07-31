import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./panmap-layout-adapter.js', import.meta.url), 'utf8');

function loadAdapter() {
  const context = { window: { PanmapApp: {} } };
  vm.runInNewContext(source, context, { filename: 'panmap-layout-adapter.js' });
  return context.window.PanmapApp.panmapLayoutAdapter;
}

test('taxonomy 为空时按三段互斥圈层生成确定性名称云输入', () => {
  const adapter = loadAdapter();
  const result = {
    metadata: { panmapMode: 'unclassified-poi-name-cloud' },
    nameCloud: { mode: 'unclassified-poi-name-cloud' },
    categories: [],
    rings: [
      { ringId: 'ring-0-10', outerRangeMinutes: 10 },
      { ringId: 'ring-10-20', outerRangeMinutes: 20 },
      { ringId: 'ring-20-30', outerRangeMinutes: 30 },
    ],
    pois: [
      { poiId: 'poi-b', ringId: 'ring-0-10', name: '乙地', category: { hierarchy: [] } },
      { poiId: 'poi-a', ringId: 'ring-0-10', name: '甲地', category: { hierarchy: [] } },
      { poiId: 'poi-c', ringId: 'ring-10-20', name: 'Bridge', category: { hierarchy: [] } },
      { poiId: 'poi-d', ringId: 'ring-20-30', name: '公园', category: { hierarchy: [] } },
    ],
  };

  const first = adapter.buildPanmapLayers(result);
  const second = adapter.buildPanmapLayers(result);

  assert.deepEqual(first, second);
  assert.deepEqual(first.map((layer) => layer.time), [10, 20, 30]);
  assert.deepEqual(Array.from(first[0].labels, (item) => item.poiId), ['poi-a', 'poi-b']);
  assert.deepEqual(first.map((layer) => layer.labels.length), [2, 1, 1]);
  assert.ok(first.every((layer) => layer.mode === 'unclassified-poi-name-cloud'));
  assert.equal(first.reduce((sum, layer) => sum + layer.labels.length, 0), result.pois.length);
});
