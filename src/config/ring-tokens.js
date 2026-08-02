(function initRingTokens(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  app.ringTokens = Object.freeze({
    'ring-0-10': Object.freeze({ time: 10, rgb: '30 145 82', color: '#1e9152', text: '#063b20', fill: '#eef8f1', lightAlphaNear: 1, lightAlphaFar: 0.72, darkAlphaNear: 1, darkAlphaFar: 0.76 }),
    'ring-10-20': Object.freeze({ time: 20, rgb: '38 112 225', color: '#2670e1', text: '#082d6b', fill: '#f0f5ff', lightAlphaNear: 1, lightAlphaFar: 0.72, darkAlphaNear: 1, darkAlphaFar: 0.76 }),
    'ring-20-30': Object.freeze({ time: 30, rgb: '139 87 190', color: '#8b57be', text: '#3f1767', fill: '#f8f2fc', lightAlphaNear: 1, lightAlphaFar: 0.72, darkAlphaNear: 1, darkAlphaFar: 0.76 }),
  });
})(window);
