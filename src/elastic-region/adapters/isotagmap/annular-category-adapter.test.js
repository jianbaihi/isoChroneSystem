import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('annular-category-adapter.js', import.meta.url), 'utf8');

test('adapter selects the exclusive middle ring and emits stable taxonomy order', () => {
  const targetNodes = ['150000', '050000', '090000', '060000', '110000', '080000', '140000', '070000', '100000', '200000']
    .map((categoryCode, index) => ({ categoryCode, categoryLabel: categoryCode, poiCount: 10 - index, styleKey: `key-${categoryCode}` }));
  const context = { window: { PanmapApp: { panmapMvpLayout: { aggregateCategories: () => [
    { ring: { ringId: 'ring-0-10', label: 'first' }, nodes: [] },
    { ring: { ringId: 'ring-10-20', label: 'middle' }, nodes: targetNodes },
  ] } } } };
  vm.runInNewContext(source, context);
  const result = context.window.PanmapApp.elasticRegion.annularCategoryAdapter.buildInput({});
  assert.equal(result.ring.ringId, 'ring-10-20');
  assert.deepEqual([...result.input.regions.map((region) => region.id)], ['050000', '060000', '070000', '080000', '090000', '100000', '110000', '140000', '150000', '200000']);
  assert.deepEqual([...result.input.center], [430, 280]);
  assert.equal(result.input.innerRadius, 104);
  assert.equal(result.input.outerRadius, 246);
});
