(function initNaturalBoundaryInterpolation(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;

  function easeInOutCubic(value) {
    const t = Math.max(0, Math.min(1, Number(value) || 0));
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function lerp(from, to, amount) { return from + (to - from) * amount; }

  natural.interpolation = Object.freeze({ easeInOutCubic, lerp });
})(window);
