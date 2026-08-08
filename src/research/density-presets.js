(function initDensityPresets(global) {
  'use strict';
  const app = global.PanmapApp = global.PanmapApp || {};
  const RINGS = Object.freeze(['ring-0-10', 'ring-10-20', 'ring-20-30']);
  const PRESETS = Object.freeze({
    concise: Object.freeze({ presetId: 'concise', uiLabel: '精简', totalCap: 60, quotas: Object.freeze({ 'ring-0-10': 10, 'ring-10-20': 20, 'ring-20-30': 30 }) }),
    standard: Object.freeze({ presetId: 'standard', uiLabel: '标准', totalCap: 120, quotas: Object.freeze({ 'ring-0-10': 20, 'ring-10-20': 40, 'ring-20-30': 60 }) }),
    rich: Object.freeze({ presetId: 'rich', uiLabel: '丰富', totalCap: 180, quotas: Object.freeze({ 'ring-0-10': 30, 'ring-10-20': 60, 'ring-20-30': 90 }) }),
    full: Object.freeze({ presetId: 'full', uiLabel: '全量压力测试', totalCap: 252, quotas: Object.freeze({ 'ring-0-10': 39, 'ring-10-20': 83, 'ring-20-30': 130 }) }),
  });
  app.densityPresets = Object.freeze({ schemaVersion: 'panmap-density-presets/v1', RINGS, PRESETS });
})(typeof window === 'undefined' ? globalThis : window);
