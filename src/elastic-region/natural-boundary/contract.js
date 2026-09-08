(function initNaturalBoundaryContract(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const natural = elastic.naturalBoundary = elastic.naturalBoundary || {};

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalize(input = {}) {
    const source = elastic.annular.contract.normalize(input);
    const parameters = input.parameters || {};
    const controlPointCount = Math.max(5, Math.min(9, Math.round(finite(parameters.controlPointCount, 7))));
    return {
      ...source,
      schemaVersion: 'natural-shared-boundary-input-v2',
      previousBoundaryState: input.previousBoundaryState || null,
      referenceBoundaryState: input.referenceBoundaryState || null,
      parameters: {
        controlPointCount,
        iterations: Math.max(1, Math.round(finite(parameters.iterations, 32))),
        iterationsPerFrame: Math.max(2, Math.min(6, Math.round(finite(parameters.iterationsPerFrame, 4)))),
        relaxation: Math.max(0.05, Math.min(1, finite(parameters.relaxation, 0.32))),
        naturalAmplitude: Math.max(0, Math.min(0.12, finite(parameters.naturalAmplitude, 0.052))),
        pressureAmplitude: Math.max(0, Math.min(0.08, finite(parameters.pressureAmplitude, 0.026))),
        sampleSteps: Math.max(2, Math.round(finite(parameters.sampleSteps, 5))),
        areaWeight: Math.max(0, finite(parameters.areaWeight, 1)),
        smoothWeight: Math.max(0, finite(parameters.smoothWeight, 0.28)),
        temporalWeight: Math.max(0, finite(parameters.temporalWeight, 0.4)),
        endpointWeight: Math.max(0, finite(parameters.endpointWeight, 1)),
        orderWeight: Math.max(0, finite(parameters.orderWeight, 1)),
        localityWeight: Math.max(0, finite(parameters.localityWeight, 0.7)),
      },
    };
  }

  natural.contract = Object.freeze({ normalize });
})(window);
