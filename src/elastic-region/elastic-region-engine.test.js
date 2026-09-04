import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const files = [
  'core/contracts.js',
  'geometry/polygon.js',
  'geometry/power-cell.js',
  'constraints/minimum-share.js',
  'solver/target-shares.js',
  'metrics/region-metrics.js',
  'solver/elastic-region-solver.js',
  'adapters/isotagmap/category-cluster-adapter.js',
];

function loadEngine() {
  const context = { window: { performance }, console };
  for (const file of files) vm.runInNewContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context, { filename: file });
  return context.window.PanmapApp.elasticRegion;
}

function fixture() {
  const nodes = [
    ['a', 34, [160, 120]], ['b', 18, [400, 120]], ['c', 13, [650, 120]],
    ['d', 11, [160, 350]], ['e', 9, [400, 350]], ['f', 7, [650, 350]],
    ['g', 5, [280, 520]], ['h', 3, [560, 520]],
  ].map(([id, baseWeight, anchor]) => ({ id, baseWeight, targetWeight: baseWeight, anchor, minShare: 0.035, focus: 0 }));
  return { container: { id: 'container', polygon: [[0, 0], [800, 0], [800, 600], [0, 600]] }, nodes, previousState: null };
}

test('power cells form a complete shared partition inside the container', () => {
  const engine = loadEngine();
  const result = engine.solver.solve(fixture());
  assert.equal(result.regions.length, 8);
  assert.ok(result.regions.every((region) => region.polygon.length >= 3 && region.polygon.flat().every(Number.isFinite)));
  assert.ok(result.regions.every((region) => region.polygon.every((point) => engine.polygon.pointInConvexPolygon(point, fixture().container.polygon))));
  assert.ok(result.metrics.gapRatio < 0.005, `gap ${result.metrics.gapRatio}`);
  assert.ok(result.metrics.overlapRatio < 0.005, `overlap ${result.metrics.overlapRatio}`);
});

test('focus alpha expands the target and compresses context without erasing it', () => {
  const engine = loadEngine();
  const baseline = engine.solver.solve(fixture(), { focusId: 'a', focusAlpha: 0 });
  const focused = engine.solver.solve({ ...fixture(), previousState: baseline }, { focusId: 'a', focusAlpha: 1 });
  const before = new Map(baseline.regions.map((region) => [region.id, region.areaShare]));
  const after = new Map(focused.regions.map((region) => [region.id, region.areaShare]));
  assert.ok(after.get('a') > before.get('a'));
  assert.ok([...after].some(([id, share]) => id !== 'a' && share < before.get(id)));
  assert.ok([...after].filter(([id]) => id !== 'a').every(([, share]) => share >= 0.03));
  assert.ok(focused.metrics.maxAreaError < 0.015, `${focused.metrics.maxAreaError}`);
});

test('warm start reuses prior sites and weights and adjacent alpha remains continuous', () => {
  const engine = loadEngine();
  const alpha40 = engine.solver.solve(fixture(), { focusId: 'a', focusAlpha: 0.4 });
  const alpha50 = engine.solver.solve({ ...fixture(), previousState: alpha40 }, { focusId: 'a', focusAlpha: 0.5, iterations: 12 });
  assert.equal(alpha50.metrics.warmStartUsed, true);
  assert.deepEqual([...alpha50.solverState.sites.map((site) => site.point)], [...alpha40.solverState.sites.map((site) => site.point)]);
  assert.ok(alpha50.metrics.maxCentroidDisplacementPerFrame < 80);
  assert.ok(alpha50.metrics.maxAreaDeltaPerFrame < 0.05);
});

test('same input is deterministic and alpha 0 → 1 → 0 returns within tolerance', () => {
  const engine = loadEngine();
  const first = engine.solver.solve(fixture());
  const second = engine.solver.solve(fixture());
  assert.equal(JSON.stringify(first.regions), JSON.stringify(second.regions));
  const focused = engine.solver.solve({ ...fixture(), previousState: first }, { focusId: 'a', focusAlpha: 1 });
  const returned = engine.solver.solve({ ...fixture(), previousState: focused }, { focusId: 'a', focusAlpha: 0, iterations: 120 });
  const firstById = new Map(first.regions.map((region) => [region.id, region]));
  assert.ok(returned.regions.every((region) => Math.abs(region.areaShare - firstById.get(region.id).areaShare) < 0.01));
  assert.ok(returned.regions.every((region) => Math.hypot(region.centroid[0] - firstById.get(region.id).centroid[0], region.centroid[1] - firstById.get(region.id).centroid[1]) < 35));
});

test('ten-node solve records truthful bounded performance and no business concepts leak into core', () => {
  const engine = loadEngine();
  const input = fixture();
  input.nodes.push({ id: 'i', baseWeight: 4, targetWeight: 4, anchor: [90, 510], minShare: 0.035, focus: 0 });
  input.nodes.push({ id: 'j', baseWeight: 4, targetWeight: 4, anchor: [710, 510], minShare: 0.035, focus: 0 });
  const result = engine.solver.solve(input);
  assert.equal(result.metrics.nodeCount, 10);
  assert.ok(Number.isFinite(result.metrics.solveMs));
  const coreSource = ['core/contracts.js', 'geometry/polygon.js', 'geometry/power-cell.js', 'constraints/minimum-share.js', 'solver/target-shares.js', 'metrics/region-metrics.js', 'solver/elastic-region-solver.js']
    .map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n').toLowerCase();
  for (const forbidden of ['amap', '\\bpoi\\b', '黄鹤楼', '餐饮服务', '20min']) assert.doesNotMatch(coreSource, new RegExp(forbidden));
});
