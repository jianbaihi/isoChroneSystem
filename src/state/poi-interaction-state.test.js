const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/poi-interaction-state.js`, 'utf8'));

test('hover and leave control only the preview state', () => {
  const state = window.PanmapApp.createPoiInteractionState();
  state.hover('poi-a');
  assert.equal(state.hoveredPoiId, 'poi-a');
  assert.equal(state.hoverCardVisible, true);
  assert.equal(state.detailCardVisible, false);
  state.leave();
  assert.equal(state.hoveredPoiId, null);
  assert.equal(state.hoverCardVisible, false);
});

test('select, switch and close control one persistent detail state', () => {
  const state = window.PanmapApp.createPoiInteractionState();
  state.select('poi-a');
  assert.equal(state.selectedPoiId, 'poi-a');
  assert.equal(state.detailCardVisible, true);
  state.select('poi-b');
  assert.equal(state.selectedPoiId, 'poi-b');
  state.close();
  assert.equal(state.selectedPoiId, null);
  assert.equal(state.detailCardVisible, false);
});
