import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const files = [
  'annular/contract.js',
  'annular/share-solver.js',
  'annular/interpolation.js',
  'annular/geometry.js',
  'annular/metrics.js',
  'annular/engine.js',
];

function loadEngine() {
  const context = { window: { performance }, console };
  for (const file of files) vm.runInNewContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context, { filename: file });
  return context.window.PanmapApp.elasticRegion.annular;
}

function fixture(alpha = 0, focusId = 'c4', previousState = null) {
  return {
    center: [430, 280], innerRadius: 104, outerRadius: 246, startAngle: -Math.PI / 2,
    minShare: 0.035, previousState,
    focus: { id: focusId, alpha, expansionFactor: 1.8, maxShare: 0.45 },
    regions: [34, 22, 16, 12, 9, 7, 6, 5, 4, 3].map((baseWeight, index) => ({
      id: `c${index}`, order: index, baseWeight, minShare: 0.035,
    })),
  };
}

test('water filling preserves total and minimum shares under extreme weights', () => {
  const engine = loadEngine();
  const input = fixture();
  input.regions[0].baseWeight = 1000000;
  input.regions.slice(1).forEach((region) => { region.baseWeight = 0; });
  const result = engine.engine.solve(input);
  assert.ok(Math.abs(result.shares.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.ok(result.shares.every((share) => share >= 0.035 - 1e-12));
});

test('annular sectors share boundaries, close at two pi and leave the center empty', () => {
  const engine = loadEngine();
  const result = engine.engine.solve(fixture());
  assert.equal(result.regions.length, 10);
  assert.ok(Math.abs(result.regions[0].startAngle + Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(result.regions.at(-1).endAngle - (result.regions[0].startAngle + Math.PI * 2)) < 1e-12);
  result.regions.slice(1).forEach((region, index) => assert.ok(Math.abs(region.startAngle - result.regions[index].endAngle) < 1e-12));
  result.regions.forEach((region) => region.polygon.forEach((point) => {
    const radius = Math.hypot(point[0] - 430, point[1] - 280);
    assert.ok(radius >= 104 - 1e-8 && radius <= 246 + 1e-8);
  }));
  assert.ok(result.metrics.coverageRatio >= 0.999);
  assert.ok(result.metrics.gapRatio <= 0.001);
  assert.ok(result.metrics.overlapRatio <= 0.001);
  assert.ok(result.metrics.sampledCoverageRatio >= 0.999);
  assert.deepEqual([...result.center], [430, 280]);
  assert.equal(result.innerRadius, 104);
  assert.equal(result.outerRadius, 246);
  assert.ok(result.regions.every((region) => region.angularShare === region.areaShare && region.areaShare === region.angleShare));
  assert.ok(result.metrics.annulusArea > 0 && result.metrics.sumRegionArea > 0);
  assert.equal(result.metrics.gapArea, 0);
  assert.equal(result.metrics.overlapArea, 0);
});

test('stable order survives wrap-around and focus expansion is monotonic', () => {
  const engine = loadEngine();
  const samples = [0, 0.25, 0.5, 0.75, 1].map((alpha) => engine.engine.solve(fixture(alpha)));
  const ids = samples[0].regions.map((region) => region.id);
  samples.forEach((result) => {
    assert.deepEqual([...result.regions.map((region) => region.id)], ids);
    assert.equal(result.metrics.orderChangeCount, 0);
  });
  const focusShares = samples.map((result) => result.regions.find((region) => region.id === 'c4').angleShare);
  focusShares.slice(1).forEach((share, index) => assert.ok(share >= focusShares[index] - 1e-12));
});

test('alpha zero to one to zero returns exactly while center and radii stay fixed', () => {
  const engine = loadEngine();
  const baseline = engine.engine.solve(fixture(0));
  const focused = engine.engine.solve(fixture(1, 'c4', baseline.previousState));
  const returned = engine.engine.solve(fixture(0, 'c4', focused.previousState));
  assert.deepEqual([...returned.shares], [...baseline.shares]);
  assert.deepEqual([...returned.regions.map((region) => [region.startAngle, region.endAngle])], [...baseline.regions.map((region) => [region.startAngle, region.endAngle])]);
  assert.equal(focused.metrics.centerDelta, 0);
  assert.equal(focused.metrics.innerRadiusDelta, 0);
  assert.equal(focused.metrics.outerRadiusDelta, 0);
});

test('area error is bounded and ten-category geometry stays below the two millisecond budget', () => {
  const engine = loadEngine();
  const measurements = Array.from({ length: 100 }, () => engine.engine.solve(fixture()).metrics.geometryBuildMs).slice(10);
  const median = measurements.sort((a, b) => a - b)[Math.floor(measurements.length / 2)];
  const result = engine.engine.solve(fixture(1));
  assert.ok(result.metrics.meanAreaError < 0.005);
  assert.ok(result.metrics.maxAreaError < 0.01);
  assert.ok(median < 2, `median geometry build ${median}ms`);
});

test('generic annular core contains no provider, place, category or threshold concepts', () => {
  const source = files.map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  for (const forbidden of ['\\bPOI\\b', '\\bAMap\\b', '黄鹤楼', '餐饮', '武汉', '10分钟', '20分钟']) assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
});
