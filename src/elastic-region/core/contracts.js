(function initElasticRegionContracts(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const INPUT_VERSION = 'region-layout-input-v0';
  const RESULT_VERSION = 'region-layout-result-v0';

  function finitePoint(point) {
    return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
  }

  function normalizeInput(input) {
    if (!input?.container?.id || !Array.isArray(input.container.polygon) || input.container.polygon.length < 3) {
      throw new Error('RegionLayoutInput requires a valid container polygon.');
    }
    const polygon = input.container.polygon.map((point) => {
      if (!finitePoint(point)) throw new Error('Container polygon contains an invalid point.');
      return [Number(point[0]), Number(point[1])];
    });
    if (!Array.isArray(input.nodes) || input.nodes.length < 2 || input.nodes.length > 20) {
      throw new Error('RegionLayoutInput supports 2–20 nodes.');
    }
    const ids = new Set();
    const nodes = input.nodes.map((node) => {
      if (!node?.id || ids.has(node.id) || !finitePoint(node.anchor)) throw new Error('Region node identity or anchor is invalid.');
      ids.add(node.id);
      const baseWeight = Number(node.baseWeight);
      const targetWeight = Number(node.targetWeight ?? node.baseWeight);
      const minShare = Number(node.minShare ?? 0);
      const focus = Number(node.focus ?? 0);
      if (![baseWeight, targetWeight].every((value) => Number.isFinite(value) && value > 0)
        || !Number.isFinite(minShare) || minShare < 0 || minShare >= 1
        || !Number.isFinite(focus) || focus < 0 || focus > 1) throw new Error('Region node weights, minShare or focus are invalid.');
      return { id: String(node.id), baseWeight, targetWeight, anchor: [Number(node.anchor[0]), Number(node.anchor[1])], minShare, focus };
    });
    return {
      schemaVersion: INPUT_VERSION,
      container: { id: String(input.container.id), polygon },
      nodes,
      previousState: input.previousState || null,
      options: { ...(input.options || {}) },
    };
  }

  elastic.contracts = Object.freeze({ INPUT_VERSION, RESULT_VERSION, finitePoint, normalizeInput });
})(window);
