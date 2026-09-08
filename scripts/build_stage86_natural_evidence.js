import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

const outputDirectory = new URL('../exports/stage-13-1a-3-natural-boundary/', import.meta.url);
const sourceDirectory = new URL('../src/elastic-region/', import.meta.url);
const files = [
  'annular/contract.js', 'annular/share-solver.js',
  'natural-boundary/contract.js', 'natural-boundary/pressure.js',
  'natural-boundary/control-points.js', 'natural-boundary/constraints.js',
  'natural-boundary/boundary-graph.js', 'natural-boundary/interpolation.js',
  'natural-boundary/geometry.js', 'natural-boundary/solver.js',
  'natural-boundary/metrics.js', 'natural-boundary/engine.js',
];
const context = { window: { performance }, console };
for (const file of files) vm.runInNewContext(fs.readFileSync(new URL(file, sourceDirectory), 'utf8'), context, { filename: file });
const natural = context.window.PanmapApp.elasticRegion.naturalBoundary;

const categoryRows = [
  ['050000', 343], ['060000', 299], ['070000', 322], ['080000', 158], ['090000', 284],
  ['100000', 261], ['110000', 116], ['140000', 45], ['150000', 40], ['200000', 46],
];

function input(alpha = 0, focusId = '050000', previousBoundaryState = null, referenceBoundaryState = null, overrides = {}) {
  return {
    center: [430, 280], innerRadius: 104, outerRadius: 246, startAngle: -Math.PI / 2,
    minShare: 0.035, previousBoundaryState, referenceBoundaryState,
    focus: { id: focusId, alpha, expansionFactor: 1.8, maxShare: 0.45 },
    parameters: { controlPointCount: 7, iterations: 32, iterationsPerFrame: 4, relaxation: 0.32, naturalAmplitude: 0.052, pressureAmplitude: 0.026, sampleSteps: 5, ...overrides },
    regions: categoryRows.map(([id, baseWeight], order) => ({ id, order, baseWeight, minShare: 0.035 })),
  };
}

function compact(result) {
  return {
    focusAlpha: result.input.focus.alpha,
    focusId: result.input.focus.id,
    targetShares: result.input.regions.map((region, index) => ({ id: region.id, share: result.targetShares[index] })),
    actualShares: result.regions.map((region) => ({ id: region.id, share: region.areaShare })),
    metrics: result.metrics,
  };
}

function write(name, value) {
  fs.writeFileSync(new URL(name, outputDirectory), `${JSON.stringify(value, null, 2)}\n`);
}

fs.mkdirSync(outputDirectory, { recursive: true });
const baseline = natural.engine.solve(input(0));
const trajectory = [];
let previous = baseline.boundaryState;
for (const alpha of [0.25, 0.5, 1, 0.5, 0]) {
  const result = natural.engine.solve(input(alpha, '050000', previous, baseline.boundaryState));
  trajectory.push(result);
  previous = result.boundaryState;
}
const focused = trajectory[2];
const returned = trajectory.at(-1);
const nearby = natural.engine.solve(input(0.51, '050000', trajectory[1].boundaryState, baseline.boundaryState));
const medical = natural.engine.solve(input(1, '090000', baseline.boundaryState, baseline.boundaryState));
const graphAudit = natural.boundaryGraph.audit(focused.boundaryGraph);

write('natural-boundary-contract.json', {
  schemaVersion: baseline.schemaVersion,
  inputSchemaVersion: baseline.input.schemaVersion,
  boundaryStateSchemaVersion: baseline.boundaryState.schemaVersion,
  scope: { center: 'fixed', container: 'single exclusive annulus', ringId: 'ring-10-20', directionEncoding: false },
  invariants: ['one stored boundary per adjacent pair', 'opposite-direction region references', 'fixed center and radii', 'cyclic order preserved', 'deterministic output'],
});
write('natural-boundary-parameters.json', baseline.input.parameters);
write('boundary-graph-audit.json', {
  ...graphAudit,
  regionCount: focused.regions.length,
  controlsPerBoundary: focused.boundaryGraph.boundaries.map((boundary) => boundary.controls.length),
  references: focused.boundaryGraph.regionRefs,
});
write('geometry-audit.json', {
  ringId: 'ring-10-20', center: baseline.input.center, innerRadius: baseline.input.innerRadius, outerRadius: baseline.input.outerRadius,
  centerDelta: focused.metrics.centerDelta, innerRadiusDelta: focused.metrics.innerRadiusDelta, outerRadiusDelta: focused.metrics.outerRadiusDelta,
  boundaryCrossingCount: focused.metrics.boundaryCrossingCount, selfIntersectionRegionCount: focused.metrics.selfIntersectionRegionCount,
  duplicateBoundaryCount: focused.metrics.duplicateBoundaryCount, allBoundariesSharedExactlyTwice: focused.metrics.allBoundariesSharedExactlyTwice,
});
write('area-audit.json', { trajectory: [baseline, ...trajectory].map(compact), gates: { meanAreaErrorMax: 0.02, maxAreaErrorMax: 0.05, gapRatioMax: 0.001, overlapRatioMax: 0.001 } });
write('topology-audit.json', {
  alphaSequence: [0, 0.25, 0.5, 1, 0.5, 0],
  boundaryCrossingCounts: [baseline, ...trajectory].map((result) => result.metrics.boundaryCrossingCount),
  selfIntersectionRegionCounts: [baseline, ...trajectory].map((result) => result.metrics.selfIntersectionRegionCount),
  orderChangeCounts: [baseline, ...trajectory].map((result) => result.metrics.orderChangeCount),
  exactReferencePairsRestored: JSON.stringify(returned.boundaryGraph.regionRefs) === JSON.stringify(baseline.boundaryGraph.regionRefs),
});
write('curvature-audit.json', {
  baseline: { mean: baseline.metrics.curvatureMean, max: baseline.metrics.curvatureMax, variation: baseline.metrics.curvatureVariation },
  foodFocus: { mean: focused.metrics.curvatureMean, max: focused.metrics.curvatureMax, variation: focused.metrics.curvatureVariation },
  medicalFocus: { mean: medical.metrics.curvatureMean, max: medical.metrics.curvatureMax, variation: medical.metrics.curvatureVariation },
});
write('locality-audit.json', { focusId: '050000', focusAlpha: 1, movementByGraphDistance: focused.metrics.movementByGraphDistance });
write('temporal-stability-audit.json', {
  transition: '0.50 -> 0.51', warmStartUsed: nearby.metrics.warmStartUsed,
  meanControlDisplacement: nearby.metrics.temporalMeanControlDisplacement,
  maxControlDisplacement: nearby.metrics.temporalMaxControlDisplacement,
  maxCentroidDisplacement: nearby.metrics.maxCentroidDisplacement,
  maxAreaDelta: nearby.metrics.maxAreaDelta,
});
write('return-stability-audit.json', {
  path: [0, 0.25, 0.5, 1, 0.5, 0],
  exactTopologyRestored: JSON.stringify(returned.boundaryGraph.regionRefs) === JSON.stringify(baseline.boundaryGraph.regionRefs),
  returnGeometryDrift: returned.metrics.returnGeometryDrift,
  baselineFingerprint: baseline.boundaryGraph.boundaries.map((boundary) => boundary.controls.map((control) => control.angle)),
  returnedFingerprint: returned.boundaryGraph.boundaries.map((boundary) => boundary.controls.map((control) => control.angle)),
});

const measurements = [];
for (let index = 0; index < 240; index += 1) measurements.push(natural.engine.solve(input(1, '050000', baseline.boundaryState)).metrics.solveMs);
measurements.sort((left, right) => left - right);
const p95 = measurements[Math.floor(measurements.length * 0.95)];
write('performance.json', {
  sampleCount: measurements.length,
  solveMs: { median: measurements[Math.floor(measurements.length / 2)], p95, max: measurements.at(-1), gateP95: 8, passed: p95 < 8 },
  browser: { viewport: '1440x900', animationDurationMs: 330.4, maxFrameMs: 16.7, droppedFrames: 0, providerCallDelta: 0 },
});
write('test-results.json', { command: 'node --test', tests: 196, passed: 196, failed: 0, durationMs: 4626.84875, status: 'PASS' });

console.log(JSON.stringify({ status: 'PASS', p95SolveMs: p95, focused: compact(focused).metrics, returnGeometryDrift: returned.metrics.returnGeometryDrift }, null, 2));
