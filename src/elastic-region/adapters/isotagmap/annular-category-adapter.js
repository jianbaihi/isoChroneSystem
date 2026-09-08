(function initAnnularCategoryAdapter(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const taxonomyOrder = Object.freeze([
    '010000', '020000', '030000', '040000', '050000', '060000', '070000', '080000', '090000', '100000',
    '110000', '120000', '130000', '140000', '150000', '160000', '170000', '180000', '190000', '200000', 'other',
  ]);
  const orderIndex = new Map(taxonomyOrder.map((code, index) => [code, index]));

  function selectStableCategories(nodes, limit = 10) {
    const selectedIds = new Set([...nodes]
      .sort((left, right) => right.poiCount - left.poiCount || left.categoryCode.localeCompare(right.categoryCode))
      .slice(0, Math.max(8, Math.min(10, limit)))
      .map((node) => node.categoryCode));
    return nodes.filter((node) => selectedIds.has(node.categoryCode)).sort((left, right) =>
      (orderIndex.get(left.categoryCode) ?? 999) - (orderIndex.get(right.categoryCode) ?? 999)
      || left.categoryCode.localeCompare(right.categoryCode));
  }

  function buildInput(snapshot, options = {}) {
    const aggregated = app.panmapMvpLayout.aggregateCategories(snapshot, 10);
    const target = aggregated.find((item) => item.ring.ringId === 'ring-10-20');
    if (!target) return null;
    const nodes = selectStableCategories(target.nodes, 10);
    return {
      ring: target.ring,
      input: {
        center: options.center || [430, 280],
        innerRadius: Number(options.innerRadius || 104),
        outerRadius: Number(options.outerRadius || 246),
        startAngle: Number(options.startAngle ?? -Math.PI / 2),
        minShare: Number(options.minShare ?? 0.035),
        arcStepRadians: Number(options.arcStepRadians || Math.PI / 180),
        regions: nodes.map((node, index) => ({
          id: node.categoryCode,
          order: index,
          baseWeight: node.poiCount,
          minShare: Number(options.minShare ?? 0.035),
          metadata: {
            categoryLabel: node.categoryLabel,
            count: node.poiCount,
            styleKey: node.styleKey,
          },
        })),
        focus: options.focusId ? {
          id: options.focusId,
          alpha: Number(options.focusAlpha || 0),
          expansionFactor: Number(options.focusExpansionFactor || 1.8),
          maxShare: Number(options.maxFocusShare || 0.45),
        } : null,
        previousState: options.previousState || null,
      },
    };
  }

  elastic.annularCategoryAdapter = Object.freeze({ taxonomyOrder, selectStableCategories, buildInput });
})(window);
