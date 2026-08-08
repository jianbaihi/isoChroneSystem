(function initRingTokens(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const palette = app.isochronePalette?.paletteForRanges([10, 20, 30]) || [
    { stroke: '#1e9152' }, { stroke: '#2670e1' }, { stroke: '#8b57be' },
  ];
  app.ringTokens = Object.freeze({
    'ring-0-10': Object.freeze({ time: 10, rgb: '30 145 82', color: palette[0].stroke, text: '#063b20', fill: '#eef8f1', lightAlphaNear: 1, lightAlphaFar: 0.72, darkAlphaNear: 1, darkAlphaFar: 0.76 }),
    'ring-10-20': Object.freeze({ time: 20, rgb: '38 112 225', color: palette[1].stroke, text: '#082d6b', fill: '#f0f5ff', lightAlphaNear: 1, lightAlphaFar: 0.72, darkAlphaNear: 1, darkAlphaFar: 0.76 }),
    'ring-20-30': Object.freeze({ time: 30, rgb: '139 87 190', color: palette[2].stroke, text: '#3f1767', fill: '#f8f2fc', lightAlphaNear: 1, lightAlphaFar: 0.72, darkAlphaNear: 1, darkAlphaFar: 0.76 }),
  });
})(window);
