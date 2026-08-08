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

  store.setDraftCenter({ lon: 116.4, lat: 39.9, crs: 'EPSG:4326', label: '地图选点' }, 'map');
  store.setParameterDraft({ profile: 'cycling-regular', rangesMinutes: [5, 15, 30] });
  const draft = store.getState().data.parameterDraft;
  assert.equal(draft.centerSource, 'map-pick');
  assert.equal(draft.profile, 'cycling-regular');
  assert.deepEqual(draft.rangesMinutes, [5, 15, 30]);
});

test('changing the center marks an existing result stale and a matching result clears it', () => {
  const store = createStore();
  const base = {
    analysisId: 'analysis-1', status: 'completed', profile: 'foot-walking',
    center: { lon: 114.296944, lat: 30.546944 }, rings: [], pois: [], categories: [],
  };
  store.setResult(base);
  assert.equal(store.getState().data.resultStale, false);
  store.setDraftCenter({ lon: 114.31, lat: 30.55, label: '地图选点' }, 'map-pick');
  assert.equal(store.getState().data.resultStale, true);
  assert.equal(store.getState().data.staleReason, 'center-changed');
  store.setResult({ ...base, analysisId: 'analysis-2', center: { lon: 114.31, lat: 30.55 } });
  assert.equal(store.getState().data.resultStale, false);
  assert.equal(store.getState().data.staleReason, null);
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

function profileResult(profile, id, poiIds = []) {
  return {
    analysisId: id, status: 'completed', profile,
    rings: [], categories: [], pois: poiIds.map((poiId) => ({ poiId })),
  };
}

test('keeps results and jobs isolated by profile and switching never calls a network client', () => {
  const store = createStore();
  let networkCalls = 0;
  global.fetch = () => { networkCalls += 1; throw new Error('network forbidden'); };
  store.setActiveProfile('foot-walking');
  store.setResult(profileResult('foot-walking', 'walk-result', ['walk-poi']));
  store.setProfileJob('driving-car', { jobId: 'drive-job', profile: 'driving-car', status: 'partial' });
  store.setActiveProfile('driving-car');
  let state = store.getState();
  assert.equal(state.data.lastSuccessfulResult.analysisId, 'walk-result');
  assert.equal(state.data.resultStale, true);
  assert.equal(state.data.staleReason, 'profile-changed');
  assert.equal(state.data.status, 'partial');
  store.setActiveProfile('foot-walking');
  state = store.getState();
  assert.equal(state.data.lastSuccessfulResult.analysisId, 'walk-result');
  assert.equal(state.data.resultsByProfile['driving-car'], undefined);
  assert.equal(networkCalls, 0);
});

test('stale job response cannot overwrite current job and partial cannot publish', () => {
  const store = createStore();
  store.setActiveProfile('cycling-regular');
  store.setProfileJob('cycling-regular', { jobId: 'new-job', profile: 'cycling-regular', status: 'fetching-matrix' });
  store.updateProfileJob('cycling-regular', 'old-job', { status: 'layout-ready' });
  assert.equal(store.getState().data.jobsByProfile['cycling-regular'].status, 'fetching-matrix');
  store.publishProfileResult('cycling-regular', 'new-job', profileResult('cycling-regular', 'partial'));
  assert.equal(store.getState().data.resultsByProfile['cycling-regular'], undefined);
  store.updateProfileJob('cycling-regular', 'new-job', { status: 'layout-ready' });
  store.publishProfileResult('cycling-regular', 'new-job', profileResult('cycling-regular', 'complete'));
  assert.equal(store.getState().data.resultsByProfile['cycling-regular'].analysisId, 'complete');
});

test('prepare all is plan-only and unsupported modes are disabled', () => {
  const store = createStore();
  store.prepareAllProfiles({
    'foot-walking': { status: 'planned' },
    'cycling-regular': { status: 'N/A', sourceType: 'fixture' },
    'driving-car': { status: 'awaiting-approval', poiRequestUpperBound: 135 },
  });
  const preparation = store.getState().data.multimodePreparation;
  assert.deepEqual(preparation.profileOrder, ['foot-walking', 'cycling-regular', 'driving-car']);
  assert.equal(preparation.executed, false);
  assert.equal(preparation.upstreamRequestCount, 0);
  assert.deepEqual(store.profileAvailability('subway'), { supported: false, profile: 'subway', reason: '当前数据源不支持' });
  assert.throws(() => store.setActiveProfile('subway'), /当前数据源不支持/);
});
