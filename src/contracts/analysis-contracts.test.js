const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/analysis-contracts.js`, 'utf8'));
const contracts = window.PanmapApp.contracts;

test('normalizes unordered duplicate draft thresholds and rejects invalid counts', () => {
  assert.deepEqual(contracts.normalizeDraftRanges([30, 5, 15, 15]), [5, 15, 30]);
  assert.throws(() => contracts.normalizeDraftRanges([]));
  assert.throws(() => contracts.normalizeDraftRanges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
  assert.throws(() => contracts.normalizeDraftRanges([0, 10]));
});
