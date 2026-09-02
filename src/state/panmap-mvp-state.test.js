import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { window: { PanmapApp: {} } };
vm.runInNewContext(fs.readFileSync(new URL('./panmap-mvp-state.js', import.meta.url), 'utf8'), context);
const api = context.window.PanmapApp.panmapMvpState;

test('four-state interaction and breadcrumb back path is deterministic', () => {
  let state = api.initialState();
  state = api.transition(state, { type: 'FOCUS_RING', ringId: 'ring-10-20' });
  assert.equal(state.mode, 'ring-focused');
  state = api.transition(state, { type: 'FOCUS_CATEGORY', categoryCode: '050000' });
  assert.equal(state.mode, 'category-focused');
  state = api.transition(state, { type: 'SELECT_POI', poiId: 'poi-1' });
  assert.equal(state.mode, 'poi-selected');
  state = api.transition(state, { type: 'BACK_CATEGORY' });
  assert.equal(JSON.stringify(state), JSON.stringify({ mode: 'category-focused', focusedRingId: 'ring-10-20', focusedCategoryCode: '050000', selectedPoiId: null }));
  state = api.transition(state, { type: 'BACK_RING' });
  assert.equal(state.mode, 'ring-focused');
  state = api.transition(state, { type: 'OVERVIEW' });
  assert.equal(JSON.stringify(state), JSON.stringify(api.initialState()));
});
