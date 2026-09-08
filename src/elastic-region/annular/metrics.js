(function initAnnularMetrics(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const annular = elastic.annular = elastic.annular || {};

  function compute(input, regions, targetShares, geometryBuildMs) {
    const annulusArea = Math.PI * (input.outerRadius ** 2 - input.innerRadius ** 2);
    const analyticArea = regions.reduce((sum, region) => sum + region.angleShare * annulusArea, 0);
    const gapArea = Math.max(0, annulusArea - analyticArea);
    const overlapArea = Math.max(0, analyticArea - annulusArea);
    const errors = regions.map((region, index) => Math.abs(region.angleShare - targetShares[index]));
    const previous = input.previousState?.regions || [];
    const previousOrder = previous.map((region) => region.id).join('|');
    const currentOrder = regions.map((region) => region.id).join('|');
    const previousInput = input.previousState?.input || null;
    return {
      regionCount: regions.length,
      annulusArea,
      sumRegionArea: analyticArea,
      gapArea,
      overlapArea,
      coverageRatio: Math.min(1, analyticArea / annulusArea),
      gapRatio: gapArea / annulusArea,
      overlapRatio: overlapArea / annulusArea,
      meanAreaError: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      maxAreaError: Math.max(...errors),
      orderChangeCount: previous.length && previousOrder !== currentOrder ? 1 : 0,
      centerDelta: previousInput ? Math.hypot(input.center[0] - previousInput.center[0], input.center[1] - previousInput.center[1]) : 0,
      innerRadiusDelta: previousInput ? Math.abs(input.innerRadius - previousInput.innerRadius) : 0,
      outerRadiusDelta: previousInput ? Math.abs(input.outerRadius - previousInput.outerRadius) : 0,
      geometryBuildMs,
      sampledCoverageRatio: regions.reduce((sum, region) => sum + region.polygonArea, 0) / annulusArea,
    };
  }

  annular.metrics = Object.freeze({ compute });
})(window);
