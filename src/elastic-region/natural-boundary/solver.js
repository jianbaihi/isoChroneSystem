(function initNaturalBoundarySolver(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;

  function relax(input, graph) {
    const amount = input.parameters.relaxation;
    const iterations = input.parameters.iterations;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      graph.boundaries.forEach((boundary) => {
        boundary.controls.forEach((control, index) => {
          const target = boundary.targetControls[index];
          control.angle += (target.angle - control.angle) * amount;
        });
      });
      natural.constraints.enforce(input, graph.boundaries);
    }
    return graph;
  }

  natural.solver = Object.freeze({ relax });
})(window);
