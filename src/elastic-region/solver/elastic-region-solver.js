(function initElasticRegionSolver(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const DEFAULTS = Object.freeze({
    focusExpansionFactor: 1.8,
    maxFocusShare: 0.45,
    solverStep: 0.5,
    solverIterations: 72,
    tolerance: 0.0025,
  });

  function now() { return global.performance?.now?.() ?? Date.now(); }

  function initialSites(nodes, previousState) {
    const previous = new Map((previousState?.solverState?.sites || []).map((site) => [site.id, site]));
    return nodes.map((node) => {
      const old = previous.get(node.id);
      return { id: node.id, point: old?.point ? [...old.point] : [...node.anchor], anchor: [...node.anchor], weight: Number(old?.weight || 0) };
    });
  }

  function solve(rawInput, context = {}) {
    const started = now();
    const input = elastic.contracts.normalizeInput(rawInput);
    const options = { ...DEFAULTS, ...input.options, ...(context.options || {}) };
    const focusId = context.focusId || null;
    const focusAlpha = Math.max(0, Math.min(1, Number(context.focusAlpha || 0)));
    const targets = elastic.targetShares.focusedShares(input.nodes, focusId, focusAlpha, options);
    const containerArea = elastic.polygon.area(input.container.polygon);
    const sites = initialSites(input.nodes, input.previousState);
    const iterations = Math.max(1, Math.floor(context.iterations ?? options.solverIterations));
    const effectiveStep = input.previousState ? Math.min(options.solverStep, 0.12) : options.solverStep;
    let cells = [];
    let completedIterations = 0;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      cells = elastic.powerCell.buildPowerCells(input.container.polygon, sites);
      const shares = cells.map((cell) => elastic.polygon.area(cell.polygon) / containerArea);
      const errors = shares.map((share, index) => targets[index] - share);
      const maximumError = Math.max(...errors.map(Math.abs));
      completedIterations = iteration + 1;
      if (maximumError <= options.tolerance) break;
      const averageWeight = sites.reduce((sum, site) => sum + site.weight, 0) / sites.length;
      sites.forEach((site, index) => { site.weight += effectiveStep * errors[index] * containerArea; });
      const nextAverage = sites.reduce((sum, site) => sum + site.weight, 0) / sites.length;
      sites.forEach((site) => { site.weight -= nextAverage - averageWeight; });
    }
    cells = elastic.powerCell.buildPowerCells(input.container.polygon, sites);
    const regions = cells.map((cell) => {
      const cellArea = elastic.polygon.area(cell.polygon);
      return { id: cell.id, polygon: cell.polygon, area: cellArea, areaShare: cellArea / containerArea, centroid: elastic.polygon.centroid(cell.polygon) };
    });
    const solverInfo = { sites, iterations: completedIterations, solveMs: now() - started, warmStartUsed: Boolean(input.previousState) };
    const metrics = elastic.regionMetrics.buildMetrics(input.container.polygon, regions, targets, input.previousState, solverInfo);
    return {
      schemaVersion: elastic.contracts.RESULT_VERSION,
      regions,
      solverState: { sites: sites.map((site) => ({ id: site.id, point: [...site.point], weight: site.weight })), focusId, focusAlpha },
      targetShares: Object.fromEntries(input.nodes.map((node, index) => [node.id, targets[index]])),
      metrics,
    };
  }

  elastic.solver = Object.freeze({ DEFAULTS, solve });
})(window);
