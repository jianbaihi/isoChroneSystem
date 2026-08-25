(function attachResearchEvaluationContract(global) {
  'use strict';

  function isRatio(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  }

  function isNotApplicable(value) {
    return value && value.status === 'notApplicable' && typeof value.reason === 'string' && value.reason.length > 0;
  }

  function validate(result) {
    const errors = [];
    if (!result || result.schemaVersion !== 'research-evaluation/v1') errors.push('schemaVersion');
    if (!result?.evaluationFingerprint?.startsWith('fnv1a-')) errors.push('evaluationFingerprint');
    const completeness = result?.metrics?.completeness;
    if (!completeness) errors.push('metrics.completeness');
    else {
      if (completeness.placedCount + completeness.unplacedCount !== completeness.inputCount) errors.push('placed+unplaced=inputCount');
      if (!isRatio(completeness.placementRate)) errors.push('placementRate');
      if (Object.values(completeness.placedByRing || {}).reduce((sum, value) => sum + Number(value), 0) !== completeness.placedCount) errors.push('placedByRing');
    }
    const constraints = result?.metrics?.constraints;
    for (const key of ['overlapRate', 'outsideOwnRingRate']) if (!isRatio(constraints?.[key])) errors.push(key);
    const direction = result?.metrics?.direction;
    if (direction && !isNotApplicable(direction)) {
      for (const key of ['meanAngularErrorDeg', 'medianAngularErrorDeg', 'p95AngularErrorDeg', 'maxAngularErrorDeg']) {
        if (!(typeof direction[key] === 'number' && direction[key] >= 0 && direction[key] <= 180)) errors.push(key);
      }
      for (const key of ['eastWestFlipRate', 'northSouthFlipRate', 'sectorRetentionRate4', 'sectorRetentionRate8', 'sectorRetentionRate12']) {
        if (!isRatio(direction[key]) && !isNotApplicable(direction[key])) errors.push(key);
      }
    }
    const pairwise = result?.metrics?.pairwiseRelations;
    for (const key of ['pairwiseLeftRightRetentionRate', 'pairwiseUpDownRetentionRate']) {
      if (!isRatio(pairwise?.[key]) && !isNotApplicable(pairwise?.[key])) errors.push(key);
    }
    const serialized = JSON.stringify(result || {});
    if (/api[_-]?key|ors[_-]?key|tianditu[_-]?key/i.test(serialized)) errors.push('secret-like-key-name');
    return { valid: errors.length === 0, errors };
  }

  const api = { validate };
  global.PanmapApp = global.PanmapApp || {};
  global.PanmapApp.researchEvaluationContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

