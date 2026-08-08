(function initIsochronePalette(global) {
  'use strict';

  const app = global.PanmapApp = global.PanmapApp || {};
  const BASE = Object.freeze([
    Object.freeze({ id: 'green', stroke: '#1e9152', fill: '#1e9152', fillOpacity: 0.18, activeStroke: '#08743b', activeFill: '#1e9152', cssVar: '--isochrone-green' }),
    Object.freeze({ id: 'blue', stroke: '#2670e1', fill: '#2670e1', fillOpacity: 0.17, activeStroke: '#0c56c3', activeFill: '#2670e1', cssVar: '--isochrone-blue' }),
    Object.freeze({ id: 'purple', stroke: '#8b57be', fill: '#8b57be', fillOpacity: 0.16, activeStroke: '#6f35a8', activeFill: '#8b57be', cssVar: '--isochrone-purple' }),
    Object.freeze({ id: 'orange', stroke: '#e88926', fill: '#e88926', fillOpacity: 0.17, activeStroke: '#c96808', activeFill: '#e88926', cssVar: '--isochrone-orange' }),
    Object.freeze({ id: 'cyan', stroke: '#159eaa', fill: '#159eaa', fillOpacity: 0.16, activeStroke: '#087b85', activeFill: '#159eaa', cssVar: '--isochrone-cyan' }),
    Object.freeze({ id: 'magenta', stroke: '#d44d88', fill: '#d44d88', fillOpacity: 0.16, activeStroke: '#b72c6b', activeFill: '#d44d88', cssVar: '--isochrone-magenta' }),
  ]);

  function normalizeRanges(ranges) {
    return [...new Set((ranges || []).map(Number).filter((value) => Number.isFinite(value) && value > 0))]
      .sort((left, right) => left - right);
  }

  function paletteForRanges(ranges) {
    return normalizeRanges(ranges).map((rangeMinutes, index) => Object.freeze({
      ...BASE[index % BASE.length],
      rangeMinutes,
      index,
      rangeId: `range-${rangeMinutes}`,
    }));
  }

  function itemForRange(ranges, rangeMinutes) {
    return paletteForRanges(ranges).find((item) => item.rangeMinutes === Number(rangeMinutes)) || null;
  }

  function maplibreMatchExpression(ranges, property = 'outerRangeMinutes', colorKey = 'stroke') {
    const items = paletteForRanges(ranges);
    const fallback = items.at(-1)?.[colorKey] || BASE[0][colorKey];
    return ['match', ['to-number', ['get', property]], ...items.flatMap((item) => [item.rangeMinutes, item[colorKey]]), fallback];
  }

  app.isochronePalette = Object.freeze({ BASE, normalizeRanges, paletteForRanges, itemForRange, maplibreMatchExpression });
})(typeof window === 'undefined' ? globalThis : window);
