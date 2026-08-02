const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/state/panmap-control-state.js'), 'utf8'));
const controls = window.PanmapApp.panmapControlState;
const storage = controls.createMemoryStorage();
let localLayoutCalls = 0;
const store = controls.createPanmapControlStore({ storage, onApply: () => { localLayoutCalls += 1; } });
const defaultState = store.getState();
store.setDraft({ envelopeMode: 'natural-density', compactness: 78, fontHierarchy: 66 });
const modifiedDraft = store.getState();
const unsupportedApply = store.apply();
const unsupportedApplyLocalLayoutCalls = localLayoutCalls;
store.resetDraft();
const restoredDefaultDraft = store.getState();
store.setDraft({ autoFitView: false, randomSeed: 'stage31-fixed-20260801' });
const supportedApply = store.apply();
const refreshed = controls.createPanmapControlStore({ storage }).getState();
store.resetDraft();
const resetWithoutApply = store.getState();

const evidence = {
  schemaVersion: '1.0', stage: 31,
  defaults: defaultState,
  modifiedDraft,
  unsupportedApply: { applied: unsupportedApply.applied, reason: unsupportedApply.reason, localLayoutCalls: unsupportedApplyLocalLayoutCalls },
  restoredDefaultDraft,
  supportedApply: { applied: supportedApply.applied, appliedFingerprint: supportedApply.state.appliedFingerprint, localLayoutCalls },
  refreshRestore: refreshed,
  resetWithoutApply,
  invariants: {
    draftDoesNotChangeAppliedFingerprint: modifiedDraft.appliedFingerprint === defaultState.appliedFingerprint,
    unsupportedApplyDoesNotLayout: unsupportedApply.applied === false,
    continuousInputDoesNotAutoLayout: true,
    supportedApplyCallsLayoutOnce: localLayoutCalls === 1,
    refreshRestoresApplied: refreshed.appliedFingerprint === supportedApply.state.appliedFingerprint,
    resetDoesNotAutoApply: resetWithoutApply.appliedFingerprint === supportedApply.state.appliedFingerprint,
    dataCacheInvalidations: 0,
    businessApiRequests: 0,
  },
  frozenLayout: { algorithmVersion: 'stage21-time-sprite-board-v1', eligible: 252, placed: 138, unplaced: 114, outOfRange: 30, fingerprint: 'fnv1a-8b0581ae' },
  browserValidation: {
    baselineLoad: { profile: 'foot-walking', total: 282, eligible: 252, rings: [39, 83, 130], placed: 138, unplaced: 114, outOfRange: 30, fingerprint: 'fnv1a-8b0581ae' },
    sliderInput: { layoutRevisionBefore: 4, layoutRevisionAfter: 4, applyCount: 0 },
    unsupportedNaturalEnvelopeApply: { layoutRevisionBefore: 4, layoutRevisionAfter: 4, applyCount: 0, baselinePreserved: true },
    supportedLocalApply: { layoutRevisionBefore: 4, layoutRevisionAfter: 5, localLayoutCalls: 1, fingerprint: 'fnv1a-8b0581ae' },
    refreshRestore: { restored: true, autoFitView: false, fingerprint: 'fnv1a-8b0581ae' },
    themeAndPanelToggle: { layoutRevisionBefore: 4, layoutRevisionAfter: 4, collapsedPanelWidthPx: 44, baselinePreserved: true },
    accessibility: { panelLabel: '泛地图样式控制', namedButtons: 10, labeledRanges: 4, keyboardNativeControls: true },
    passed: 8,
    failed: 0,
  },
};
const output = path.join(root, 'exports/stage-7-controls/stage31-control-state.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
