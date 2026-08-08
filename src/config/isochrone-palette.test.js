const assert = require('node:assert/strict');
const test = require('node:test');

require('./isochrone-palette.js');
const palette = globalThis.PanmapApp.isochronePalette;

test('palette sorts and deduplicates thresholds before assigning stable adjacent colors', () => {
  const items = palette.paletteForRanges([30, 10, 20, 15, 20]);
  assert.deepEqual(items.map((item) => item.rangeMinutes), [10, 15, 20, 30]);
  assert.deepEqual(items.map((item) => item.id), ['green', 'blue', 'purple', 'orange']);
  assert.deepEqual(items.map((item) => item.stroke), ['#1e9152', '#2670e1', '#8b57be', '#e88926']);
});

test('deleting a middle threshold reassigns the remaining colors by sorted order', () => {
  const items = palette.paletteForRanges([10, 15, 30]);
  assert.deepEqual(items.map(({ rangeMinutes, id }) => [rangeMinutes, id]), [[10, 'green'], [15, 'blue'], [30, 'purple']]);
});

test('MapLibre expression maps feature outerRangeMinutes to the same palette', () => {
  assert.deepEqual(palette.maplibreMatchExpression([10, 20, 30]), [
    'match', ['to-number', ['get', 'outerRangeMinutes']],
    10, '#1e9152', 20, '#2670e1', 30, '#8b57be', '#8b57be',
  ]);
});
