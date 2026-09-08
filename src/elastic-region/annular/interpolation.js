(function initAnnularInterpolation(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const annular = elastic.annular = elastic.annular || {};

  function easeInOutCubic(value) {
    const t = Math.max(0, Math.min(1, Number(value) || 0));
    return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  }

  function lerp(from, to, progress) {
    return from + (to - from) * progress;
  }

  annular.interpolation = Object.freeze({ easeInOutCubic, lerp });
})(window);
