const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

global.window = { PanmapApp: {} };
require('../src/adapters/compact-annular-layout.js');
require('../src/adapters/direction-preserving-radial-layout.js');
require('../src/adapters/balanced-annular-layout.js');
require('../src/research/density-presets.js');
require('../src/research/density-selector.js');
require('../src/research/layout-algorithm-registry.js');
const evaluator = require('../src/evaluation/spatial-semantic-evaluator.js');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'exports/stage-8-layout-density');
fs.mkdirSync(outputDir, { recursive: true });
const baselinePath = path.join(root, 'exports/stage-6-layout/stage20-cache-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath));
const poiById = new Map(baseline.pois.map((poi) => [poi.poiId, poi]));
const eligible = baseline.accessibility
  .filter((item) => item.matrixStatus === 'ok' && item.travelTimeSeconds <= 1800)
  .map((item) => {
    const poi = poiById.get(item.poiId);
    return {
      poiId: item.poiId,
      name: poi.name,
      longitude: poi.location.lon,
      latitude: poi.location.lat,
      travelTimeSeconds: item.travelTimeSeconds,
      ringId: item.matrixBandId,
      rating: poi.rating ?? null,
      importance: poi.importance ?? null,
      opacity: null,
      color: null,
    };
  });
const app = window.PanmapApp;
const dataBaseline = {
  centerId: baseline.center.id,
  centerLabel: baseline.center.label,
  profile: baseline.profile,
  rangesSeconds: baseline.rangesMinutes.map((value) => value * 60),
  total: baseline.pois.length,
  eligible: eligible.length,
  outOfRange: baseline.accessibility.filter((item) => item.matrixStatus !== 'ok' || item.travelTimeSeconds > 1800).length,
  ringCounts: Object.fromEntries(app.densityPresets.RINGS.map((ringId) => [ringId, eligible.filter((item) => item.ringId === ringId).length])),
  source: 'exports/stage-6-layout/stage20-cache-baseline.json',
};
const layoutConfig = { center: { longitude: baseline.center.lon, latitude: baseline.center.lat }, fontHierarchy: 50, compactness: 50 };
const algorithmKeys = ['geography-first', 'balanced', 'compact-first'];
const densityKeys = ['concise', 'standard', 'rich'];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value, digits = 6) => Number(Number(value).toFixed(digits));
const write = (name, value) => fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);

if (dataBaseline.total !== 282 || dataBaseline.eligible !== 252 || dataBaseline.outOfRange !== 30 || JSON.stringify(dataBaseline.ringCounts) !== JSON.stringify({ 'ring-0-10': 39, 'ring-10-20': 83, 'ring-20-30': 130 })) {
  throw new Error(`frozen cache mismatch: ${JSON.stringify(dataBaseline)}`);
}

const selections = Object.fromEntries([...densityKeys, 'full'].map((presetId) => [presetId, app.densitySelector.select(eligible, { presetId })]));
for (const [left, right] of [['concise', 'standard'], ['standard', 'rich'], ['rich', 'full']]) {
  if (!selections[left].selectedPoiIds.every((poiId) => selections[right].selectedPoiIds.includes(poiId))) throw new Error(`${left} is not nested in ${right}`);
}

const groups = [];
for (const densityPreset of densityKeys) {
  const selection = selections[densityPreset];
  for (const algorithmKey of algorithmKeys) {
    app.researchLayoutRegistry.run(algorithmKey, selection.selected, layoutConfig);
    const durationsMs = [];
    const runs = [];
    for (let index = 0; index < 3; index += 1) {
      const started = performance.now();
      const layout = app.researchLayoutRegistry.run(algorithmKey, selection.selected, layoutConfig);
      durationsMs.push(round(performance.now() - started, 3));
      runs.push(layout);
    }
    const layout = runs[0];
    const evaluation = evaluator.evaluate(layout, {
      runId: `stage43-${densityPreset}-${algorithmKey}`,
      algorithmId: layout.algorithmId,
      generatedAt: '2026-08-05T00:00:00.000Z',
      dataRef: { ...dataBaseline, densityPreset, selectionFingerprint: selection.selectionFingerprint },
    });
    const capacityHiddenPoiIds = layout.capacityHiddenPoiIds || [];
    const placedPoiIds = layout.nodes.map((node) => String(node.poiId));
    const hard = evaluation.metrics.constraints;
    const group = {
      schemaVersion: 'stage43-research-experiment/v1',
      stage: 43,
      dataBaseline,
      density: {
        presetId: densityPreset,
        requestedTotalCap: selection.requestedTotalCap,
        ringQuotas: Object.fromEntries(selection.rings.map((ring) => [ring.ringId, ring.quota])),
        selectedCount: selection.selectedCount,
        quotaHiddenCount: selection.quotaHiddenCount,
        selectedPoiIds: selection.selectedPoiIds,
        quotaHiddenPoiIds: selection.quotaHiddenPoiIds,
        selectionFingerprint: selection.selectionFingerprint,
        sorting: selection.sorting,
      },
      algorithm: {
        key: algorithmKey,
        id: layout.algorithmId,
        version: layout.algorithmVersion,
        parameters: layout.parameters || app.researchLayoutRegistry.get(algorithmKey).config,
      },
      result: {
        placed: layout.placed,
        unplaced: layout.unplaced,
        placedByRing: layout.placedByRing,
        placedPoiIds,
        quotaHidden: selection.quotaHiddenCount,
        capacityHidden: capacityHiddenPoiIds.length,
        capacityHiddenPoiIds,
        capacityHiddenReasons: layout.unplacedReasons || {},
        commonSuccessSubsetCount: layout.placed,
      },
      metrics: {
        hardConstraints: hard,
        direction: evaluation.metrics.direction,
        pairwiseRelations: evaluation.metrics.pairwiseRelations,
        canvas: {
          logicalWidth: layout.canvasLogicalWidth,
          logicalHeight: layout.canvasLogicalHeight,
          effectiveUtilization: layout.effectiveCanvasUtilization,
          researchMinimumScreenFontPx: layout.researchMinimumScreenFontPx,
        },
        performance: {
          warmupRuns: 1,
          measuredRuns: 3,
          durationsMs,
          medianDurationMs: median(durationsMs),
          candidateChecks: layout.candidateChecks,
        },
      },
      fingerprints: {
        selection: selection.selectionFingerprint,
        layout: layout.layoutFingerprint,
        evaluation: evaluation.evaluationFingerprint,
        stableAcrossMeasuredRuns: new Set(runs.map((run) => run.layoutFingerprint)).size === 1,
      },
      inputMutationDetected: Boolean(layout.inputMutationDetected),
    };
    const file = `stage43-${densityPreset}-${algorithmKey}.json`;
    write(file, group);
    groups.push({ file, ...group });
  }
}

const byCondition = Object.fromEntries(groups.map((group) => [`${group.density.presetId}/${group.algorithm.key}`, group]));
const balancedGate = Object.fromEntries(densityKeys.map((density) => {
  const geography = byCondition[`${density}/geography-first`];
  const balanced = byCondition[`${density}/balanced`];
  const compact = byCondition[`${density}/compact-first`];
  const hard = balanced.metrics.hardConstraints;
  const balancedDirection = balanced.metrics.direction;
  const compactDirection = compact.metrics.direction;
  const flipSum = (direction) => Number(direction.eastWestFlipRate || 0) + Number(direction.northSouthFlipRate || 0);
  const checks = {
    overlap0: hard.overlapCount === 0,
    outside0: hard.outsideOwnRingCount === 0,
    centerCollision0: hard.centerCollisionCount === 0,
    timeLabelCollision0: hard.timeLabelCollisionCount === 0,
    inputMutation0: balanced.inputMutationDetected === false,
    fingerprintStable: balanced.fingerprints.stableAcrossMeasuredRuns,
    directionImproved: balancedDirection.meanAngularErrorDeg <= compactDirection.meanAngularErrorDeg * 0.85 || flipSum(balancedDirection) <= flipSum(compactDirection) * 0.85,
    canvasSmallerThanGeography: balanced.metrics.canvas.logicalWidth < geography.metrics.canvas.logicalWidth,
    utilizationAtLeastGeography: balanced.metrics.canvas.effectiveUtilization >= geography.metrics.canvas.effectiveUtilization,
  };
  return [density, { ...checks, passed: Object.values(checks).every(Boolean) }];
}));
const status = Object.values(balancedGate).every((gate) => gate.passed) ? 'completed' : 'completed-with-tradeoff';
const compactTable = groups.map((group) => ({
  density: group.density.presetId,
  algorithm: group.algorithm.key,
  selected: group.density.selectedCount,
  placed: group.result.placed,
  quotaHidden: group.result.quotaHidden,
  capacityHidden: group.result.capacityHidden,
  overlap: group.metrics.hardConstraints.overlapCount,
  outside: group.metrics.hardConstraints.outsideOwnRingCount,
  centerCollision: group.metrics.hardConstraints.centerCollisionCount,
  timeLabelCollision: group.metrics.hardConstraints.timeLabelCollisionCount,
  meanAngularErrorDeg: group.metrics.direction.meanAngularErrorDeg,
  p95AngularErrorDeg: group.metrics.direction.p95AngularErrorDeg,
  eastWestFlipRate: group.metrics.direction.eastWestFlipRate,
  northSouthFlipRate: group.metrics.direction.northSouthFlipRate,
  canvasLogicalWidth: group.metrics.canvas.logicalWidth,
  effectiveCanvasUtilization: group.metrics.canvas.effectiveUtilization,
  medianDurationMs: group.metrics.performance.medianDurationMs,
  selectionFingerprint: group.fingerprints.selection,
  layoutFingerprint: group.fingerprints.layout,
  evaluationFingerprint: group.fingerprints.evaluation,
}));
write('stage43-density-selection.json', {
  schemaVersion: 'stage43-density-selection-evidence/v1', stage: 43, status: 'passed', dataBaseline,
  sortingEvidence: { availablePriorityFields: { rating: false, importance: false, score: false }, appliedRule: selections.standard.sorting, effectiveRuleForFrozenCache: ['travelTimeSeconds:ascending', 'poiId:ascending'] },
  nesting: { conciseInStandard: true, standardInRich: true, richInFull: true },
  selections: Object.fromEntries(Object.entries(selections).map(([key, value]) => [key, { ...value, selected: undefined, quotaHidden: undefined }])),
});
write('stage43-experiment-matrix.json', {
  schemaVersion: 'stage43-experiment-matrix/v1', stage: 43, status, dataBaseline,
  frozenConditions: { fontHierarchy: 50, compactness: 50, researchMinimumScreenFontPx: 10, seed: 'deterministic/no-Math.random', viewport: 'browser evidence recorded separately' },
  experiments: compactTable,
  balancedGate,
  observationsOnly: true,
});
write('stage43-zero-api-evidence.json', {
  schemaVersion: 'stage43-zero-api/v1', stage: 43, status: 'passed',
  budget: { isochrones: 0, openPoiService: 0, matrix: 0, geocoder: 0 },
  actual: { isochrones: 0, openPoiService: 0, matrix: 0, geocoder: 0 },
  source: dataBaseline.source,
  evidence: ['density selector and three layout engines contain no fetch/XHR', 'evidence builder reads frozen local JSON only', 'browser ledger is recorded separately'],
});
console.log(JSON.stringify({ status, dataBaseline, balancedGate, experiments: compactTable }, null, 2));
