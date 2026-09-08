import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const files = [
  'annular/contract.js', 'annular/share-solver.js',
  'natural-boundary/contract.js', 'natural-boundary/pressure.js',
  'natural-boundary/control-points.js', 'natural-boundary/constraints.js',
  'natural-boundary/boundary-graph.js', 'natural-boundary/interpolation.js',
  'natural-boundary/geometry.js', 'natural-boundary/solver.js',
  'natural-boundary/metrics.js', 'natural-boundary/engine.js',
];

function loadEngine() {
  const context = { window: { performance }, console };
  for (const file of files) vm.runInNewContext(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), context, { filename: file });
  return context.window.PanmapApp.elasticRegion.naturalBoundary;
}

function fixture(alpha = 0, focusId = 'c4', previousBoundaryState = null, referenceBoundaryState = null) {
  return {
    center: [430, 280], innerRadius: 104, outerRadius: 246, startAngle: -Math.PI / 2,
    minShare: 0.035, previousBoundaryState, referenceBoundaryState,
    focus: { id: focusId, alpha, expansionFactor: 1.8, maxShare: 0.45 },
    parameters: { iterations: 32, iterationsPerFrame: 4, controlPointCount: 7 },
    regions: [34, 22, 16, 12, 9, 7, 6, 5, 4, 3].map((baseWeight, index) => ({
      id: `c${index}`, order: index, baseWeight, minShare: 0.035,
    })),
  };
}

test('one graph edge is reused by each adjacent pair in opposite directions', () => {
  const natural = loadEngine();
  const result = natural.engine.solve(fixture());
  assert.equal(result.boundaryGraph.boundaries.length, 10);
  assert.equal(result.metrics.duplicateBoundaryCount, 0);
  assert.equal(result.metrics.allBoundariesSharedExactlyTwice, true);
  result.boundaryGraph.regionRefs.forEach((region, index, refs) => {
    assert.equal(region.endBoundaryId, refs[(index + 1) % refs.length].startBoundaryId);
    assert.equal(region.endDirection, -1);
    assert.equal(refs[(index + 1) % refs.length].startDirection, 1);
  });
});

test('endpoints remain projected on the fixed circles and cyclic order is stable', () => {
  const natural = loadEngine();
  for (const alpha of [0, 0.25, 0.5, 1]) {
    const result = natural.engine.solve(fixture(alpha));
    result.boundaryGraph.boundaries.forEach((boundary) => {
      assert.ok(Math.abs(boundary.controls[0].radius - 104) < 1e-12);
      assert.ok(Math.abs(boundary.controls.at(-1).radius - 246) < 1e-12);
    });
    assert.equal(result.metrics.boundaryCrossingCount, 0);
    assert.equal(result.metrics.selfIntersectionRegionCount, 0);
    assert.equal(result.metrics.orderChangeCount, 0);
  }
});

test('focus area responds monotonically with bounded area error and fixed frame', () => {
  const natural = loadEngine();
  const samples = [0, 0.25, 0.5, 1].map((alpha) => natural.engine.solve(fixture(alpha)));
  const shares = samples.map((result) => result.regions.find((region) => region.id === 'c4').areaShare);
  shares.slice(1).forEach((share, index) => assert.ok(share >= shares[index] - 1e-5));
  samples.forEach((result) => {
    assert.ok(result.metrics.meanAreaError <= 0.02, `mean ${result.metrics.meanAreaError}`);
    assert.ok(result.metrics.maxAreaError <= 0.05, `max ${result.metrics.maxAreaError}`);
    assert.ok(result.metrics.gapRatio <= 0.001);
    assert.ok(result.metrics.overlapRatio <= 0.001);
    assert.equal(result.metrics.centerDelta, 0);
    assert.equal(result.metrics.innerRadiusDelta, 0);
    assert.equal(result.metrics.outerRadiusDelta, 0);
  });
});

test('warm start makes adjacent alpha frames local and stable', () => {
  const natural = loadEngine();
  const half = natural.engine.solve(fixture(0.5));
  const nearby = natural.engine.solve(fixture(0.51, 'c4', half.boundaryState));
  assert.equal(nearby.metrics.warmStartUsed, true);
  assert.ok(nearby.metrics.temporalMaxControlDisplacement < 2);
  const nearMoves = nearby.metrics.movementByGraphDistance.filter((entry) => entry.graphDistance <= 1).map((entry) => entry.maxMove);
  const farMoves = nearby.metrics.movementByGraphDistance.filter((entry) => entry.graphDistance >= 3).map((entry) => entry.maxMove);
  assert.ok(Math.max(...farMoves) <= Math.max(...nearMoves) + 0.25);
});

test('zero-focus return restores topology and has negligible geometry drift', () => {
  const natural = loadEngine();
  const baseline = natural.engine.solve(fixture(0));
  let state = baseline.boundaryState;
  for (const alpha of [0.25, 0.5, 1, 0.5, 0]) {
    const result = natural.engine.solve(fixture(alpha, 'c4', state, baseline.boundaryState));
    state = result.boundaryState;
    if (alpha === 0) {
      assert.deepEqual([...result.boundaryGraph.regionRefs.map((item) => [item.startBoundaryId, item.endBoundaryId])], [...baseline.boundaryGraph.regionRefs.map((item) => [item.startBoundaryId, item.endBoundaryId])]);
      assert.ok(result.metrics.returnGeometryDrift < 0.01, `drift ${result.metrics.returnGeometryDrift}`);
    }
  }
});

test('output is deterministic and handles the forty-five-percent extreme', () => {
  const natural = loadEngine();
  const first = natural.engine.solve(fixture(1, 'c0'));
  const second = natural.engine.solve(fixture(1, 'c0'));
  assert.deepEqual(first.targetShares, second.targetShares);
  assert.deepEqual(
    [...first.boundaryGraph.boundaries.map((boundary) => boundary.controls.map((control) => control.angle))],
    [...second.boundaryGraph.boundaries.map((boundary) => boundary.controls.map((control) => control.angle))],
  );
  assert.ok(first.targetShares[0] <= 0.45 + 1e-12);
  assert.ok(first.targetShares.slice(1).every((share) => share >= 0.035 - 1e-12));
});

test('generic core contains no provider, place, category or threshold concepts', () => {
  const coreFiles = files.filter((file) => file.startsWith('natural-boundary/'));
  const source = coreFiles.map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  for (const forbidden of ['\\bPOI\\b', '\\bAMap\\b', '黄鹤楼', '餐饮', '武汉', '20分钟']) assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
});

