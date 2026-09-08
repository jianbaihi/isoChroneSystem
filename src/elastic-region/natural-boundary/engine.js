(function initNaturalBoundaryEngine(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;

  function serializeState(input, graph, regions, targetShares) {
    return {
      schemaVersion: 'natural-shared-boundary-state-v2',
      center: [...input.center],
      innerRadius: input.innerRadius,
      outerRadius: input.outerRadius,
      regionOrder: input.regions.map((region) => region.id),
      shares: input.regions.map((region, index) => ({ id: region.id, share: targetShares[index] })),
      boundaries: graph.boundaries.map((boundary) => ({
        id: boundary.id,
        order: boundary.order,
        leftRegionId: boundary.leftRegionId,
        rightRegionId: boundary.rightRegionId,
        controls: boundary.controls.map((control) => ({ radius: control.radius, angle: control.angle, point: [...control.point] })),
      })),
      regions: regions.map((region) => ({ id: region.id, order: region.order, areaShare: region.areaShare, centroid: [...region.centroid] })),
    };
  }

  function solve(rawInput) {
    const input = natural.contract.normalize(rawInput);
    const baseShares = app.elasticRegion.annular.shareSolver.baseShares(input.regions);
    const targetShares = app.elasticRegion.annular.shareSolver.solve(input);
    const pressures = natural.pressure.compute(input, baseShares, targetShares);
    const targetBoundaries = natural.controlPoints.createTarget(input, targetShares, pressures);
    const graph = natural.boundaryGraph.build(input, targetBoundaries);
    const warmStartUsed = Boolean(input.previousBoundaryState?.boundaries?.length);
    const started = global.performance?.now?.() || 0;
    natural.solver.relax(input, graph);
    const regions = natural.geometry.build(input, graph, targetShares);
    const solveMs = (global.performance?.now?.() || 0) - started;
    const boundaryState = serializeState(input, graph, regions, targetShares);
    const metrics = natural.metrics.compute(input, graph, regions, targetShares, solveMs, warmStartUsed);
    return {
      schemaVersion: 'natural-shared-boundary-output-v2',
      input,
      regions,
      boundaryGraph: graph,
      baseShares,
      targetShares,
      pressures,
      metrics,
      boundaryState,
    };
  }

  natural.engine = Object.freeze({ solve, serializeState });
})(window);
