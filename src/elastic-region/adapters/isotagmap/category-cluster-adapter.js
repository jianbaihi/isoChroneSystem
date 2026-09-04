(function initCategoryClusterElasticAdapter(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function buildInput(clusterNodes, options = {}) {
    const width = Number(options.width || 860);
    const height = Number(options.height || 560);
    const minimum = Number(options.minShare ?? 0.035);
    const ordered = [...clusterNodes].sort((left, right) => right.poiCount - left.poiCount || left.categoryCode.localeCompare(right.categoryCode)).slice(0, 10);
    const columns = Math.ceil(Math.sqrt(ordered.length * width / height));
    const rows = Math.ceil(ordered.length / columns);
    const nodes = ordered.map((cluster, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: cluster.categoryCode,
        baseWeight: cluster.poiCount,
        targetWeight: cluster.poiCount,
        anchor: [width * (column + 0.5) / columns, height * (row + 0.5) / rows],
        minShare: minimum,
        focus: 0,
      };
    });
    return {
      container: { id: options.containerId || 'category-container', polygon: [[0, 0], [width, 0], [width, height], [0, height]] },
      nodes,
      previousState: options.previousState || null,
      options: {
        focusExpansionFactor: Number(options.focusExpansionFactor ?? 1.8),
        maxFocusShare: Number(options.maxFocusShare ?? 0.45),
        solverStep: Number(options.solverStep ?? 0.5),
        solverIterations: Number(options.solverIterations ?? 72),
      },
    };
  }

  elastic.categoryClusterAdapter = Object.freeze({ buildInput });
})(window);
