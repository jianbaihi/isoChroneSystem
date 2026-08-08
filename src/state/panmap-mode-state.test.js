const assert = require('node:assert/strict');
const test = require('node:test');

require('./panmap-mode-state.js');

const modeState = globalThis.PanmapApp.panmapModeState;

test('mode initialization defaults to ordinary and keeps research=1 compatibility', () => {
  assert.equal(modeState.resolveInitialMode(''), 'ordinary');
  assert.equal(modeState.resolveInitialMode('?stage45Cache=1'), 'ordinary');
  assert.equal(modeState.resolveInitialMode('?stage45Cache=1&research=1'), 'research');
});

test('explicit valid mode wins and invalid mode falls back to ordinary', () => {
  assert.equal(modeState.resolveInitialMode('?mode=research'), 'research');
  assert.equal(modeState.resolveInitialMode('?mode=ordinary&research=1'), 'ordinary');
  assert.equal(modeState.resolveInitialMode('?mode=invalid&research=1'), 'ordinary');
});

test('URL synchronization preserves unrelated cache parameters', () => {
  assert.equal(modeState.searchForMode('?stage45Cache=1', 'research'), '?stage45Cache=1&research=1');
  assert.equal(modeState.searchForMode('?stage45Cache=1&research=1', 'ordinary'), '?stage45Cache=1');
});

test('store switch is state-only and exposes capability gates', () => {
  const replaced = [];
  const location = { pathname: '/', search: '?stage45Cache=1', hash: '#view' };
  const history = { state: null, replaceState(_state, _title, url) { replaced.push(url); location.search = url.slice(url.indexOf('?'), url.indexOf('#')); } };
  const store = modeState.createPanmapModeStore({ location, history });
  assert.equal(store.getState().mode, 'ordinary');
  assert.equal(store.getState().capabilities.metricsPanel, false);
  store.setMode('research');
  assert.equal(store.getState().mode, 'research');
  assert.equal(store.getState().switchCount, 1);
  assert.equal(store.getState().capabilities.experimentExport, true);
  assert.deepEqual(replaced, ['/?stage45Cache=1&research=1#view']);
});
