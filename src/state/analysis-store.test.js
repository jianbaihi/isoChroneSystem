const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/analysis-store.js`, 'utf8'));
const createStore = window.PanmapApp.createAnalysisStore;

test('keeps a parameter draft separate from submitted and successful result state', () => {
  const store = createStore();
  const initial = store.getState();
  assert.deepEqual(initial.data.parameterDraft.rangesMinutes, [10, 20, 30]);
  assert.equal(initial.data.parameterDraft.center.crs, 'EPSG:4326');
  assert.deepEqual([initial.data.parameterDraft.center.lon, initial.data.parameterDraft.center.lat], [114.296944, 30.546944]);
  assert.equal(initial.data.parameterDraft.center.label, '武汉·黄鹤楼');

  store.setDraftCenter({ lon: 116.4, lat: 39.9, crs: 'EPSG:4326', label: '地图选点（116.4, 39.9）' }, 'map');
  store.setParameterDraft({ profile: 'cycling-regular', rangesMinutes: [5, 15, 30] });
  const draft = store.getState().data.parameterDraft;
  assert.equal(draft.centerSource, 'map-click');
  assert.equal(draft.profile, 'cycling-regular');
  assert.deepEqual(draft.rangesMinutes, [5, 15, 30]);
});

test('failure keeps the last successful result and active ring is shared by ID', () => {
  const store = createStore();
  const result = { analysisId: 'analysis-1', rings: [{ ringId: 'ring-0-10' }] };
  store.setResult(result);
  store.setActiveRingId('ring-0-10');
  store.setRequest({ profile: 'foot-walking', rangesMinutes: [10] });
  store.setError({ code: 'UPSTREAM_UNAVAILABLE' });
  const state = store.getState();
  assert.equal(state.data.status, 'error');
  assert.equal(state.data.lastSuccessfulResult.analysisId, 'analysis-1');
  assert.equal(state.interaction.activeRingId, 'ring-0-10');
});

test('map pick mode is explicit and unknown ring IDs are ignored', () => {
  const store = createStore();
  store.setResult({ analysisId: 'analysis-1', rings: [{ ringId: 'ring-0-10' }] });
  store.setMapPickMode(true);
  assert.equal(store.getState().interaction.isMapPickMode, true);
  store.setActiveRingId('not-in-result');
  assert.equal(store.getState().interaction.activeRingId, null);
  store.setMapPickMode(false);
  assert.equal(store.getState().interaction.isMapPickMode, false);
});
