const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/panmap-control-state.js`, 'utf8'));
const controls = window.PanmapApp.panmapControlState;

test('normalizes defaults, clamps numbers, validates enums and migrates schema', () => {
  const warnings = [];
  const value = controls.normalize({ schemaVersion: '0.4', compactness: 999, fontHierarchy: -5, labelOrientation: 'unknown' }, warnings);
  assert.equal(value.schemaVersion, '1.0');
  assert.equal(value.compactness, 100);
  assert.equal(value.fontHierarchy, 0);
  assert.equal(value.labelOrientation, 'legacy-baseline');
  assert.ok(warnings.length >= 3);
});

test('keeps draft and applied fingerprints separate and blocks unimplemented layouts', () => {
  let layouts = 0;
  const store = controls.createPanmapControlStore({ storage: controls.createMemoryStorage(), onApply: () => { layouts += 1; } });
  const baseline = store.getState().appliedFingerprint;
  store.setDraft({ envelopeMode: 'natural-density', compactness: 72 });
  assert.notEqual(store.getState().draftFingerprint, baseline);
  assert.equal(store.getState().appliedFingerprint, baseline);
  assert.equal(store.apply().applied, false);
  assert.equal(layouts, 0);
});

test('persists applied state, restores on refresh and reset does not auto apply', () => {
  const storage = controls.createMemoryStorage();
  let layouts = 0;
  const store = controls.createPanmapControlStore({ storage, onApply: () => { layouts += 1; } });
  store.setDraft({ autoFitView: false, randomSeed: 20260801 });
  assert.equal(store.apply().applied, true);
  assert.equal(layouts, 1);
  const restored = controls.createPanmapControlStore({ storage });
  assert.equal(restored.getState().applied.autoFitView, false);
  assert.equal(restored.getState().applied.randomSeed, 20260801);
  restored.resetDraft();
  assert.equal(restored.getState().applyCount, 0);
  assert.equal(restored.getState().draft.autoFitView, true);
});

test('slider input changes draft repeatedly but formal layout only happens on apply', () => {
  let layouts = 0;
  const store = controls.createPanmapControlStore({ storage: controls.createMemoryStorage(), onApply: () => { layouts += 1; } });
  for (let value = 10; value <= 90; value += 10) store.setDraft({ compactness: value });
  assert.equal(layouts, 0);
  store.resetDraft();
  assert.equal(store.apply().applied, true);
  assert.equal(layouts, 1);
});

test('serialization order and fingerprints are stable without unseeded randomness', () => {
  const a = controls.normalize({ autoFitView: false, randomSeed: 'fixed' });
  const b = controls.normalize({ randomSeed: 'fixed', autoFitView: false });
  assert.equal(controls.stableStringify(a), controls.stableStringify(b));
  assert.equal(controls.fingerprint(a), controls.fingerprint(b));
});

test('direction-preserving layout is a circular-only research draft', () => {
  const store = controls.createPanmapControlStore({ storage: controls.createMemoryStorage() });
  store.setDraft({ labelOrientation: 'direction-preserving-radial', envelopeMode: 'circular', showDensityDebug: false });
  assert.equal(store.apply().applied, true);
  store.setDraft({ envelopeMode: 'natural-density' });
  assert.equal(store.apply().applied, false);
});
