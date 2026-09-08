(function initAnnularEngine(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const annular = elastic.annular = elastic.annular || {};

  function solve(rawInput) {
    const input = annular.contract.normalize(rawInput);
    const shares = annular.shareSolver.solve(input);
    const started = global.performance?.now?.() || 0;
    const regions = annular.geometry.build(input, shares);
    const geometryBuildMs = (global.performance?.now?.() || 0) - started;
    const metrics = annular.metrics.compute(input, regions, shares, geometryBuildMs);
    const focus = input.focus ? { ...input.focus } : null;
    const previousState = {
      schemaVersion: 'annular-elastic-state-v1',
      input: {
        center: [...input.center], innerRadius: input.innerRadius, outerRadius: input.outerRadius,
        startAngle: input.startAngle,
      },
      shares: regions.map((region) => ({ id: region.id, share: region.angleShare })),
      angles: regions.map((region) => ({ id: region.id, startAngle: region.startAngle, endAngle: region.endAngle })),
      regions: regions.map((region) => ({ id: region.id, order: region.order, startAngle: region.startAngle, endAngle: region.endAngle })),
      focus,
    };
    return {
      schemaVersion: 'annular-elastic-output-v1',
      center: [...input.center],
      innerRadius: input.innerRadius,
      outerRadius: input.outerRadius,
      input,
      regions,
      shares,
      focus,
      metrics,
      previousState,
    };
  }

  annular.engine = Object.freeze({ solve });
})(window);
