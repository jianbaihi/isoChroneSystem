(function initNaturalBoundaryPressure(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;

  function cyclicDistance(left, right, size) {
    const delta = Math.abs(left - right);
    return Math.min(delta, size - delta);
  }

  function compute(input, baseShares, targetShares) {
    const focusIndex = input.focus ? input.regions.findIndex((region) => region.id === input.focus.id) : -1;
    return input.regions.map((region, index) => ({
      id: region.id,
      order: region.order,
      baseShare: baseShares[index],
      targetShare: targetShares[index],
      delta: targetShares[index] - baseShares[index],
      graphDistance: focusIndex < 0 ? Infinity : cyclicDistance(index, focusIndex, input.regions.length),
      locality: focusIndex < 0 ? 0 : Math.exp(-cyclicDistance(index, focusIndex, input.regions.length) * 1.15),
    }));
  }

  natural.pressure = Object.freeze({ cyclicDistance, compute });
})(window);
