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
    accessibility: [
      { poiId: 'poi-b', matrixStatus: 'ok', matrixBandId: 'ring-0-10', travelTimeSeconds: 599, networkDistanceMeters: 500 },
      { poiId: 'poi-a', matrixStatus: 'ok', matrixBandId: 'ring-0-10', travelTimeSeconds: 120, networkDistanceMeters: 100 },
      { poiId: 'poi-c', matrixStatus: 'ok', matrixBandId: 'ring-10-20', travelTimeSeconds: 1000, networkDistanceMeters: 800 },
      { poiId: 'poi-d', matrixStatus: 'ok', matrixBandId: 'ring-20-30', travelTimeSeconds: 1700, networkDistanceMeters: 1400 },
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

test('视觉模型只编码 Matrix 时间并排除 out-of-range', () => {
  const adapter = loadAdapter();
  const result = {
    pois: [{ poiId: 'near', name: '近点' }, { poiId: 'far', name: '远点' }, { poiId: 'out', name: '审计点' }],
    accessibility: [
      { poiId: 'far', matrixStatus: 'ok', matrixBandId: 'ring-10-20', travelTimeSeconds: 1000, networkDistanceMeters: 900 },
      { poiId: 'near', matrixStatus: 'ok', matrixBandId: 'ring-0-10', travelTimeSeconds: 100, networkDistanceMeters: 90 },
      { poiId: 'out', matrixStatus: 'ok', matrixBandId: 'matrix-out-of-range', travelTimeSeconds: 1900, networkDistanceMeters: 2000 },
    ],
  };
  const model = adapter.buildTimeVisualModel(result);
  assert.deepEqual(Array.from(model, (item) => item.poiId), ['near', 'far']);
  assert.equal(model[0].fontSize, 26);
  assert.equal(model[1].fontSize, 12);
  assert.ok(model.every((item) => item.fontWeight === 600 && item.rotation === 0));
  assert.ok(model.every((item) => !('category' in item) && !('rating' in item) && !('heat' in item)));
});
