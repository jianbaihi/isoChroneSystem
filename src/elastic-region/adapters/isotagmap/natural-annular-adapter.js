(function initNaturalAnnularAdapter(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function buildInput(snapshot, options = {}) {
    const adapted = elastic.annularCategoryAdapter?.buildInput?.(snapshot, options);
    if (!adapted) return null;
    return {
      ring: adapted.ring,
      input: {
        ...adapted.input,
        previousBoundaryState: options.previousBoundaryState || null,
        referenceBoundaryState: options.referenceBoundaryState || null,
        parameters: {
          controlPointCount: 7,
          iterations: 32,
          iterationsPerFrame: 4,
          relaxation: 0.32,
          naturalAmplitude: 0.052,
          pressureAmplitude: 0.026,
          sampleSteps: 5,
          ...(options.parameters || {}),
        },
      },
    };
  }

  elastic.naturalAnnularAdapter = Object.freeze({ buildInput });
})(window);
