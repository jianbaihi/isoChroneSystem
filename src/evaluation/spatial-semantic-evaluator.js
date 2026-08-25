(function attachSpatialSemanticEvaluator(global) {
  'use strict';

  const VERSION = 'stage39-spatial-semantic-evaluator-v1';
  const DEFAULT_EPSILON = Object.freeze({
    sourceAxisMeters: 1,
    layoutAxisPx: 0.5,
    sectorBoundaryDeg: 0.01,
    pairSourceMeters: 1,
    pairLayoutPx: 0.5,
  });

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
    }
    return value;
  }

  function round(value, digits = 6) {
    return Number(Number(value).toFixed(digits));
  }

  function normalizeAngle(angle) {
    const tau = Math.PI * 2;
    return ((angle % tau) + tau) % tau;
  }

  function shortestAngularDistanceDeg(a, b) {
    const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
    return Math.min(delta, Math.PI * 2 - delta) * 180 / Math.PI;
  }

  function percentile(values, ratio) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * ratio)];
  }

  function projectSource(center, node) {
    if (![center?.longitude, center?.latitude, node?.longitude, node?.latitude].every(Number.isFinite)) return null;
    const latitudeRadians = center.latitude * Math.PI / 180;
    const metersPerDegree = 111320;
    return {
      x: (node.longitude - center.longitude) * Math.cos(latitudeRadians) * metersPerDegree,
      y: -(node.latitude - center.latitude) * metersPerDegree,
    };
  }

  function sourceAngle(center, node) {
    const projected = projectSource(center, node);
    if (!projected || (projected.x === 0 && projected.y === 0)) return null;
    return normalizeAngle(Math.atan2(projected.y, projected.x));
  }

  function layoutAngle(center, node) {
    if (![center?.canvasX, center?.canvasY, node?.x, node?.y].every(Number.isFinite)) return null;
    const dx = node.x - center.canvasX;
    const dy = node.y - center.canvasY;
    if (dx === 0 && dy === 0) return null;
    return normalizeAngle(Math.atan2(dy, dx));
  }

  function signWithEpsilon(value, epsilon) {
    if (Math.abs(value) <= epsilon) return 0;
    return value < 0 ? -1 : 1;
  }

  function sectorIndex(angle, count) {
    const width = Math.PI * 2 / count;
    return Math.floor(normalizeAngle(angle + width / 2) / width) % count;
  }

  function isSectorBoundary(angle, count, toleranceDeg) {
    const width = 360 / count;
    const shifted = ((angle * 180 / Math.PI + width / 2) % width + width) % width;
    return Math.min(shifted, width - shifted) <= toleranceDeg;
  }

  function notApplicable(reason) {
    return { status: 'notApplicable', reason };
  }

  function rate(numerator, denominator) {
    return denominator > 0 ? round(numerator / denominator) : notApplicable('no-clear-relations-after-epsilon');
  }

  function axisFlip(nodes, center, axis, epsilon) {
    let evaluated = 0;
    let flipped = 0;
    let boundaryExcluded = 0;
    for (const node of nodes) {
      const source = projectSource(center, node);
      if (!source) { boundaryExcluded += 1; continue; }
      const sourceSign = signWithEpsilon(source[axis], epsilon.sourceAxisMeters);
      const layoutValue = axis === 'x' ? node.x - center.canvasX : node.y - center.canvasY;
      const layoutSign = signWithEpsilon(layoutValue, epsilon.layoutAxisPx);
      if (!sourceSign || !layoutSign) { boundaryExcluded += 1; continue; }
      evaluated += 1;
      if (sourceSign !== layoutSign) flipped += 1;
    }
    return { rate: rate(flipped, evaluated), flipped, denominator: evaluated, boundaryExcluded };
  }

  function sectorRetention(nodes, center, count, epsilon) {
    let retained = 0;
    let denominator = 0;
    let boundaryExcluded = 0;
    for (const node of nodes) {
      const source = sourceAngle(center, node);
      const layout = layoutAngle(center, node);
      if (source == null || layout == null || isSectorBoundary(source, count, epsilon.sectorBoundaryDeg)) {
        boundaryExcluded += 1;
        continue;
      }
      denominator += 1;
      if (sectorIndex(source, count) === sectorIndex(layout, count)) retained += 1;
    }
    return { rate: rate(retained, denominator), retained, denominator, boundaryExcluded, sectors: count };
  }

  function pairwiseRetention(nodes, center, axis, epsilon) {
    let retained = 0;
    let evaluated = 0;
    let sourceExcluded = 0;
    let layoutExcluded = 0;
    for (let left = 0; left < nodes.length; left += 1) {
      const sourceA = projectSource(center, nodes[left]);
      if (!sourceA) continue;
      for (let right = left + 1; right < nodes.length; right += 1) {
        const sourceB = projectSource(center, nodes[right]);
        if (!sourceB) { sourceExcluded += 1; continue; }
        const sourceSign = signWithEpsilon(sourceA[axis] - sourceB[axis], epsilon.pairSourceMeters);
        if (!sourceSign) { sourceExcluded += 1; continue; }
        const layoutSign = signWithEpsilon(nodes[left][axis] - nodes[right][axis], epsilon.pairLayoutPx);
        if (!layoutSign) { layoutExcluded += 1; continue; }
        evaluated += 1;
        if (sourceSign === layoutSign) retained += 1;
      }
    }
    return { rate: rate(retained, evaluated), retained, denominator: evaluated, sourceExcluded, layoutExcluded };
  }

  function evaluate(layout, context = {}) {
    const started = Date.now();
    if (!layout || !Array.isArray(layout.nodes) || !layout.center) throw new TypeError('layout with nodes and center is required');
    const epsilon = { ...DEFAULT_EPSILON, ...(context.epsilon || {}) };
    const nodes = layout.nodes.filter((node) => node.status !== 'unplaced' && node.placed !== false);
    const inputCount = Number(layout.eligible ?? nodes.length + Number(layout.unplaced || 0));
    const placedCount = Number(layout.placed ?? nodes.length);
    const unplacedCount = Number(layout.unplaced ?? Math.max(0, inputCount - placedCount));
    const constraints = layout.constraints || {};
    const angles = [];
    let angularExcluded = 0;
    for (const node of nodes) {
      const source = sourceAngle(layout.center, node);
      const final = layoutAngle(layout.center, node);
      if (source == null || final == null) angularExcluded += 1;
      else angles.push(shortestAngularDistanceDeg(source, final));
    }
    const eastWest = axisFlip(nodes, layout.center, 'x', epsilon);
    const northSouth = axisFlip(nodes, layout.center, 'y', epsilon);
    const sector4 = sectorRetention(nodes, layout.center, 4, epsilon);
    const sector8 = sectorRetention(nodes, layout.center, 8, epsilon);
    const sector12 = sectorRetention(nodes, layout.center, 12, epsilon);
    const pairLR = pairwiseRetention(nodes, layout.center, 'x', epsilon);
    const pairUD = pairwiseRetention(nodes, layout.center, 'y', epsilon);
    const overlapCount = Number(constraints.overlapCount || 0);
    const pairTotal = placedCount * Math.max(0, placedCount - 1) / 2;
    const metrics = {
      completeness: {
        inputCount, placedCount, unplacedCount,
        placementRate: rate(placedCount, inputCount),
        placedByRing: { ...(layout.placedByRing || {}) },
      },
      constraints: {
        overlapCount,
        overlapRate: pairTotal ? round(overlapCount / pairTotal) : 0,
        outsideOwnRingCount: Number(constraints.outsideOwnRingCount || 0),
        outsideOwnRingRate: placedCount ? round(Number(constraints.outsideOwnRingCount || 0) / placedCount) : 0,
        centerCollisionCount: Number(constraints.centerCollisionCount || 0),
        timeLabelCollisionCount: Number(constraints.timeLabelCollisionCount || 0),
      },
      direction: angles.length ? {
        meanAngularErrorDeg: round(angles.reduce((sum, value) => sum + value, 0) / angles.length),
        medianAngularErrorDeg: round(percentile(angles, 0.5)),
        p95AngularErrorDeg: round(percentile(angles, 0.95)),
        maxAngularErrorDeg: round(Math.max(...angles)),
        angularDenominator: angles.length,
        angularExcluded,
        eastWestFlipRate: eastWest.rate,
        northSouthFlipRate: northSouth.rate,
        sectorRetentionRate4: sector4.rate,
        sectorRetentionRate8: sector8.rate,
        sectorRetentionRate12: sector12.rate,
        denominators: { eastWest, northSouth, sector4, sector8, sector12 },
      } : notApplicable('source-or-layout-bearing-unavailable'),
      pairwiseRelations: {
        pairwiseLeftRightRetentionRate: pairLR.rate,
        pairwiseUpDownRetentionRate: pairUD.rate,
        pairCountEvaluatedLR: pairLR.denominator,
        pairCountEvaluatedUD: pairUD.denominator,
        exclusions: { leftRight: pairLR, upDown: pairUD },
        epsilon: { sourceMeters: epsilon.pairSourceMeters, layoutPx: epsilon.pairLayoutPx },
      },
      performance: {
        layoutDurationMs: Number(layout.layoutDurationMs ?? 0),
        evaluationDurationMs: 0,
        candidateChecks: Number(layout.candidateChecks ?? 0),
        layoutFingerprint: String(layout.layoutFingerprint || ''),
      },
    };
    const stablePayload = {
      evaluatorVersion: VERSION,
      dataRef: context.dataRef || {},
      layout: {
        algorithmId: String(context.algorithmId || layout.algorithm || layout.mode || 'unknown'),
        algorithmVersion: String(layout.algorithmVersion || 'unknown'),
        seed: layout.randomSeed ?? context.seed ?? null,
        fingerprint: String(layout.layoutFingerprint || ''),
      },
      epsilon,
      metrics: {
        ...metrics,
        performance: {
          candidateChecks: metrics.performance.candidateChecks,
          layoutFingerprint: metrics.performance.layoutFingerprint,
        },
      },
    };
    const evaluationFingerprint = `fnv1a-${fnv1a(JSON.stringify(stableValue(stablePayload)))}`;
    metrics.performance.evaluationDurationMs = Date.now() - started;
    metrics.performance.evaluationFingerprint = evaluationFingerprint;
    return {
      schemaVersion: 'research-evaluation/v1',
      runId: String(context.runId || 'local-single-run'),
      generatedAt: String(context.generatedAt || new Date().toISOString()),
      evaluatorVersion: VERSION,
      dataRef: context.dataRef || {},
      layout: stablePayload.layout,
      epsilon,
      metrics,
      evaluationFingerprint,
    };
  }

  const api = { VERSION, DEFAULT_EPSILON, evaluate, shortestAngularDistanceDeg, sectorIndex, isSectorBoundary };
  global.PanmapApp = global.PanmapApp || {};
  global.PanmapApp.spatialSemanticEvaluator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
