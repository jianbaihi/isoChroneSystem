import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('adapter reuses the annular category input without provider work', () => {
  const source = fs.readFileSync(new URL('natural-annular-adapter.js', import.meta.url), 'utf8');
  const annularInput = { center: [430, 280], regions: [{ id: '050000' }] };
  const context = { window: { PanmapApp: { elasticRegion: { annularCategoryAdapter: { buildInput: () => ({ ring: { ringId: 'ring-10-20' }, input: annularInput }) } } } } };
  vm.runInNewContext(source, context);
  const result = context.window.PanmapApp.elasticRegion.naturalAnnularAdapter.buildInput({}, { parameters: { iterations: 24 } });
  assert.equal(result.ring.ringId, 'ring-10-20');
  assert.deepEqual([...result.input.center], [430, 280]);
  assert.equal(result.input.parameters.controlPointCount, 7);
  assert.equal(result.input.parameters.iterations, 24);
  assert.equal(result.input.previousBoundaryState, null);
});
