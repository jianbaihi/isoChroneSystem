const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/spatial-semantic-evaluator.js`, 'utf8'));
vm.runInThisContext(fs.readFileSync(`${__dirname}/../contracts/research-evaluation-contract.js`, 'utf8'));
vm.runInThisContext(fs.readFileSync(`${__dirname}/../adapters/dual-radial-layout.js`, 'utf8'));
vm.runInThisContext(fs.readFileSync(`${__dirname}/../adapters/compact-annular-layout.js`, 'utf8'));
const evaluator = window.PanmapApp.spatialSemanticEvaluator;
const contract = window.PanmapApp.researchEvaluationContract;

function fixture(nodes) {
  return {
    algorithmVersion: 'fixture-v1', mode: 'geographic', eligible: nodes.length, placed: nodes.length, unplaced: 0,
    center: { longitude: 0, latitude: 0, canvasX: 100, canvasY: 100 },
    placedByRing: { 'ring-0-10': nodes.length },
    constraints: { overlapCount: 0, outsideOwnRingCount: 0, centerCollisionCount: 0, timeLabelCollisionCount: 0 },
    layoutDurationMs: 1, candidateChecks: 4, layoutFingerprint: 'fixture-layout',
    nodes: nodes.map((node, index) => ({ poiId: `p${index}`, ringId: 'ring-0-10', width: 10, height: 10, placed: true, status: 'placed', ...node })),
  };
}

test('perfectly retained cardinal directions produce zero error and flip rates', () => {
  const layout = fixture([
    { longitude: 1, latitude: 0, x: 150, y: 100 },
    { longitude: -1, latitude: 0, x: 50, y: 100 },
    { longitude: 0, latitude: 1, x: 100, y: 50 },
    { longitude: 0, latitude: -1, x: 100, y: 150 },
  ]);
  const result = evaluator.evaluate(layout);
  assert.equal(result.metrics.direction.meanAngularErrorDeg, 0);
  assert.equal(result.metrics.direction.eastWestFlipRate, 0);
  assert.equal(result.metrics.direction.northSouthFlipRate, 0);
  assert.equal(result.metrics.direction.sectorRetentionRate4, 1);
  assert.equal(contract.validate(result).valid, true);
});

test('east-west and north-south flips are detected independently', () => {
  const layout = fixture([
    { longitude: 1, latitude: 0.2, x: 50, y: 90 },
    { longitude: 0.2, latitude: 1, x: 110, y: 150 },
  ]);
  const result = evaluator.evaluate(layout);
  assert.equal(result.metrics.direction.denominators.eastWest.flipped, 1);
  assert.equal(result.metrics.direction.denominators.northSouth.flipped, 1);
});

test('the 0/360 boundary uses the shortest angular distance', () => {
  assert.ok(evaluator.shortestAngularDistanceDeg(359 * Math.PI / 180, 1 * Math.PI / 180) - 2 < 1e-9);
});

test('4/8/12 sectors share half-open boundaries and boundary tolerance', () => {
  for (const count of [4, 8, 12]) {
    assert.equal(evaluator.sectorIndex(0, count), 0);
    assert.equal(evaluator.isSectorBoundary(Math.PI / count, count, 0.01), true);
    assert.equal(evaluator.isSectorBoundary(0, count, 0.01), false);
  }
});

test('near-collinear pairs are excluded with explicit denominators', () => {
  const layout = fixture([
    { longitude: 0, latitude: 0.001, x: 90, y: 90 },
    { longitude: 0, latitude: -0.001, x: 90.2, y: 110 },
    { longitude: 0.002, latitude: 0, x: 130, y: 100 },
  ]);
  const result = evaluator.evaluate(layout, { epsilon: { pairSourceMeters: 1, pairLayoutPx: 0.5 } });
  assert.ok(result.metrics.pairwiseRelations.exclusions.leftRight.sourceExcluded > 0);
  assert.ok(result.metrics.pairwiseRelations.exclusions.upDown.layoutExcluded >= 0);
  assert.equal(result.metrics.pairwiseRelations.pairCountEvaluatedLR, result.metrics.pairwiseRelations.exclusions.leftRight.denominator);
});

const baseline = JSON.parse(fs.readFileSync(`${__dirname}/../../exports/stage-6-layout/stage20-cache-baseline.json`));
const poiById = new Map(baseline.pois.map((poi) => [poi.poiId, poi]));
const input = baseline.accessibility.filter((item) => item.matrixStatus === 'ok' && item.travelTimeSeconds <= 1800).map((item) => {
  const poi = poiById.get(item.poiId);
  return { poiId: item.poiId, name: poi.name, longitude: poi.location.lon, latitude: poi.location.lat, travelTimeSeconds: item.travelTimeSeconds, ringId: item.matrixBandId };
});
const center = { longitude: 114.296944, latitude: 30.546944 };

test('fingerprint is stable five times and evaluation never mutates layout coordinates or rings', () => {
  const layout = window.PanmapApp.compactAnnularLayout.layout(input, { center, compactness: 50, fontHierarchy: 50, algorithm: 'frontier-contact', mode: 'geographic' });
  const before = JSON.stringify(layout.nodes.map(({ poiId, x, y, ringId }) => ({ poiId, x, y, ringId })));
  const runs = Array.from({ length: 5 }, () => evaluator.evaluate(layout, { dataRef: { centerId: 'huanghelou', eligibleCount: 252 } }));
  assert.equal(new Set(runs.map((run) => run.evaluationFingerprint)).size, 1);
  assert.equal(JSON.stringify(layout.nodes.map(({ poiId, x, y, ringId }) => ({ poiId, x, y, ringId }))), before);
  assert.ok(runs.every((run) => contract.validate(run).valid));
  assert.equal(evaluator.evaluate({ ...layout, layoutDurationMs: layout.layoutDurationMs + 999 }, { dataRef: { centerId: 'huanghelou', eligibleCount: 252 } }).evaluationFingerprint, runs[0].evaluationFingerprint);
});

test('stage37 geographic baselines reproduce the accepted mean bearing errors', () => {
  const oldLayout = JSON.parse(fs.readFileSync(`${__dirname}/../../exports/stage-7-radial/stage33-geographic-layout.json`));
  const frontier = JSON.parse(fs.readFileSync(`${__dirname}/../../exports/stage-7-compact-annular/stage37-frontier-geographic.json`));
  const oldResult = evaluator.evaluate(oldLayout);
  const frontierResult = evaluator.evaluate(frontier);
  assert.ok(Math.abs(oldResult.metrics.direction.meanAngularErrorDeg - 2.37) <= 0.02);
  assert.ok(Math.abs(frontierResult.metrics.direction.meanAngularErrorDeg - 46.9) <= 0.02);
});

test('evaluation performs no network access', () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
  try {
    const layout = window.PanmapApp.dualRadialLayout.layout(input, { center, mode: 'geographic-radial' });
    evaluator.evaluate(layout);
    assert.equal(calls, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
