(function initElasticRegionTargetShares(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function baseShares(nodes) {
    const total = nodes.reduce((sum, node) => sum + node.baseWeight, 0);
    return nodes.map((node) => node.baseWeight / total);
  }

  function focusedShares(nodes, focusId, alpha, options = {}) {
    const baseline = baseShares(nodes);
    if (!focusId || alpha <= 0) return elastic.minimumShare.enforceMinimumShares(baseline, nodes.map((node) => node.minShare));
    const focusIndex = nodes.findIndex((node) => node.id === focusId);
    if (focusIndex < 0) return elastic.minimumShare.enforceMinimumShares(baseline, nodes.map((node) => node.minShare));
    const factor = Number(options.focusExpansionFactor ?? 1.8);
    const maximum = Number(options.maxFocusShare ?? 0.45);
    const finalFocus = Math.min(maximum, Math.max(baseline[focusIndex], baseline[focusIndex] * factor));
    const focusShare = baseline[focusIndex] + (finalFocus - baseline[focusIndex]) * Math.max(0, Math.min(1, alpha));
    const remainingBase = Math.max(1e-12, 1 - baseline[focusIndex]);
    const raw = baseline.map((share, index) => index === focusIndex ? focusShare : share / remainingBase * (1 - focusShare));
    return elastic.minimumShare.enforceMinimumShares(raw, nodes.map((node) => node.minShare));
  }

  elastic.targetShares = Object.freeze({ baseShares, focusedShares });
})(window);
