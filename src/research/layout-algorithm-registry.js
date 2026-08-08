(function initResearchLayoutRegistry(global) {
  'use strict';
  const app = global.PanmapApp = global.PanmapApp || {};
  const definitions = Object.freeze({
    'geography-first': Object.freeze({
      key: 'geography-first', uiLabel: '地理优先', description: '尽量保持 POI 相对中心点的真实方向',
      algorithmId: 'direction-preserving-radial', algorithmVersion: app.directionPreservingRadialLayout?.VERSION,
      engine: app.directionPreservingRadialLayout,
      config: Object.freeze({}), supportsResearchMetrics: true,
    }),
    balanced: Object.freeze({
      key: 'balanced', uiLabel: '均衡模式', description: '兼顾地理方向、标签紧凑度和阅读清晰度',
      algorithmId: 'balanced-annular', algorithmVersion: app.balancedAnnularLayout?.VERSION,
      engine: app.balancedAnnularLayout,
      config: Object.freeze({}), supportsResearchMetrics: true,
    }),
    'compact-first': Object.freeze({
      key: 'compact-first', uiLabel: '紧凑优先', description: '容纳更紧凑，允许一定的位置变形',
      algorithmId: 'frontier-contact', algorithmVersion: app.compactAnnularLayout?.VERSION,
      engine: app.compactAnnularLayout,
      config: Object.freeze({ algorithm: 'frontier-contact', mode: 'geographic' }), supportsResearchMetrics: true,
    }),
  });

  function normalize(definition, result, selected) {
    const labelArea = (result.nodes || []).reduce((sum, node) => sum + Number(node.width || 0) * Number(node.height || 0), 0);
    const canvasArea = Number(result.canvasLogicalWidth || 0) * Number(result.canvasLogicalHeight || 0);
    const capacityHidden = result.unplacedNodes || [];
    return {
      ...result,
      algorithmKey: definition.key,
      algorithmId: definition.algorithmId,
      algorithmVersion: definition.algorithmVersion,
      selectedCount: selected.length,
      placed: Number(result.placed ?? result.nodes?.length ?? 0),
      unplaced: Number(result.unplaced ?? capacityHidden.length),
      capacityHidden,
      capacityHiddenPoiIds: capacityHidden.map((node) => String(node.poiId)),
      effectiveCanvasUtilization: Number(result.effectiveCanvasUtilization ?? (canvasArea ? labelArea / canvasArea : 0)),
      researchReadableScale: Number((10 / Math.max(1, Number(result.semanticFontPx?.min || 10))).toFixed(6)),
      researchMinimumScreenFontPx: 10,
    };
  }

  function run(key, input, config = {}) {
    const definition = definitions[key];
    if (!definition?.engine?.layout) throw new RangeError(`research layout algorithm unavailable: ${key}`);
    const snapshot = JSON.stringify(input);
    const result = definition.engine.layout(input, { ...definition.config, ...config });
    if (JSON.stringify(input) !== snapshot) throw new Error(`${key} mutated standardized input`);
    return normalize(definition, result, input);
  }

  function get(key) { return definitions[key] || null; }
  function list() { return Object.values(definitions).map(({ engine, config, ...definition }) => ({ ...definition, config: { ...config } })); }
  app.researchLayoutRegistry = Object.freeze({ VERSION: 'stage43-layout-registry-v1', definitions, get, list, run });
})(typeof window === 'undefined' ? globalThis : window);
