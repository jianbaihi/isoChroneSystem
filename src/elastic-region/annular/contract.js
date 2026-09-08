(function initAnnularContract(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const annular = elastic.annular = elastic.annular || {};
  const TAU = Math.PI * 2;

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalize(input = {}) {
    const center = Array.isArray(input.center) ? input.center.map(Number) : [0, 0];
    const innerRadius = finite(input.innerRadius, 80);
    const outerRadius = finite(input.outerRadius, 180);
    const minShare = Math.max(0, finite(input.minShare, 0.035));
    const regions = (input.regions || []).map((region, index) => ({
      id: String(region.id ?? index),
      order: finite(region.order, index),
      baseWeight: Math.max(0, finite(region.baseWeight, 0)),
      minShare: Math.max(0, finite(region.minShare, minShare)),
      metadata: region.metadata || null,
    })).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
    if (center.length !== 2 || center.some((value) => !Number.isFinite(value))) throw new TypeError('center must contain two finite coordinates');
    if (!(innerRadius > 0 && outerRadius > innerRadius)) throw new RangeError('outerRadius must be greater than innerRadius');
    if (regions.length < 2) throw new RangeError('at least two ordered regions are required');
    if (regions.reduce((sum, region) => sum + region.minShare, 0) >= 1) throw new RangeError('minimum shares must leave distributable area');
    return {
      schemaVersion: 'annular-elastic-input-v1',
      center,
      innerRadius,
      outerRadius,
      startAngle: finite(input.startAngle, -Math.PI / 2),
      minShare,
      regions,
      focus: input.focus ? {
        id: String(input.focus.id || ''),
        alpha: Math.max(0, Math.min(1, finite(input.focus.alpha, 0))),
        expansionFactor: Math.max(1, finite(input.focus.expansionFactor, 1.8)),
        maxShare: Math.max(minShare, Math.min(0.95, finite(input.focus.maxShare, 0.45))),
      } : null,
      previousState: input.previousState || null,
      arcStepRadians: Math.max(Math.PI / 720, Math.min(Math.PI / 60, finite(input.arcStepRadians, Math.PI / 180))),
    };
  }

  annular.contract = Object.freeze({ TAU, normalize });
})(window);
