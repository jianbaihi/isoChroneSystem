import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./poi-render-batcher.js', import.meta.url), 'utf8');
const context = { window: {}, performance: { now: () => 0 } };
context.window.window = context.window;
vm.runInNewContext(source, context);
const batcher = context.window.PanmapApp.poiRenderBatcher;

for (const count of [50, 250, 500, 1000]) {
  test(`renders ${count} POIs in bounded batches`, async () => {
    let clock = 0;
    const sizes = [];
    const metrics = await batcher.renderFeatures(Array.from({ length: count }, (_, id) => ({ id })),
      (collection) => sizes.push(collection.features.length),
      { now: () => clock, requestFrame: (resolve) => { clock += 4; resolve(); } });
    assert.equal(sizes.at(-1), count);
    assert.ok(sizes.every((size, index) => index === 0 || size - sizes[index - 1] <= 100));
    assert.equal(metrics.frameCount, Math.ceil(count / 100));
    assert.equal(metrics.renderDurationMs, metrics.frameCount * 4);
  });
}
