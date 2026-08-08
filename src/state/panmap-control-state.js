(function initPanmapControlState(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const SCHEMA_VERSION = '1.0';
  const STORAGE_KEY = 'isotagmap.panmap-controls.v1';
  const ORDER = [
    'schemaVersion', 'labelOrientation', 'compactAlgorithm', 'envelopeMode', 'compactness', 'fontHierarchy',
    'autoExpandRings', 'allEligibleRequired', 'adaptiveCanvas', 'autoFitView',
    'envelopeTightness', 'envelopeSmoothness', 'minEnvelopeGapPx', 'showDensityDebug', 'randomSeed',
  ];
  const DEFAULTS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    labelOrientation: 'legacy-baseline',
    compactAlgorithm: 'frontier-contact',
    envelopeMode: 'circular',
    compactness: 50,
    fontHierarchy: 50,
    autoExpandRings: true,
    allEligibleRequired: true,
    adaptiveCanvas: true,
    autoFitView: true,
    envelopeTightness: 50,
    envelopeSmoothness: 60,
    minEnvelopeGapPx: 12,
    showDensityDebug: false,
    randomSeed: 'stage21-baseline-seed',
  });
  const ENUMS = {
    labelOrientation: new Set(['legacy-baseline', 'geographic-radial', 'random-radial', 'compact-geographic', 'compact-random-match', 'direction-preserving-radial']),
    compactAlgorithm: new Set(['fermat', 'poisson-disc', 'frontier-contact']),
    envelopeMode: new Set(['circular', 'natural-density']),
  };
  const NUMBER_RANGES = {
    compactness: [0, 100], fontHierarchy: [0, 100], envelopeTightness: [0, 100],
    envelopeSmoothness: [0, 100], minEnvelopeGapPx: [4, 48],
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }
  function normalize(input = {}, warnings = []) {
    if (input.schemaVersion && input.schemaVersion !== SCHEMA_VERSION) warnings.push(`schema ${input.schemaVersion} 已安全迁移到 ${SCHEMA_VERSION}`);
    const next = { ...DEFAULTS, ...input, schemaVersion: SCHEMA_VERSION };
    Object.entries(ENUMS).forEach(([key, allowed]) => {
      if (!allowed.has(next[key])) {
        warnings.push(`${key}=${String(next[key])} 未知，已回退默认值`);
        next[key] = DEFAULTS[key];
      }
    });
    Object.entries(NUMBER_RANGES).forEach(([key, [min, max]]) => {
      const normalized = clamp(next[key], min, max, DEFAULTS[key]);
      if (normalized !== Number(next[key])) warnings.push(`${key} 已限制到 ${normalized}`);
      next[key] = normalized;
    });
    ['autoExpandRings', 'allEligibleRequired', 'adaptiveCanvas', 'autoFitView', 'showDensityDebug'].forEach((key) => {
      next[key] = key === 'allEligibleRequired' ? true : Boolean(next[key]);
    });
    if (!(Number.isInteger(next.randomSeed) || (typeof next.randomSeed === 'string' && next.randomSeed.trim()))) {
      warnings.push('randomSeed 无效，已回退稳定默认值');
      next.randomSeed = DEFAULTS.randomSeed;
    }
    return ORDER.reduce((ordered, key) => ({ ...ordered, [key]: next[key] }), {});
  }
  function stableStringify(value) { return JSON.stringify(ORDER.reduce((ordered, key) => ({ ...ordered, [key]: value[key] }), {})); }
  function fingerprint(value) {
    const text = stableStringify(normalize(value));
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }
  function isBaselineCompatible(value) {
    if (value.labelOrientation === 'legacy-baseline') return value.envelopeMode === 'circular' && value.showDensityDebug === false;
    if (['compact-geographic', 'compact-random-match'].includes(value.labelOrientation)) {
      return value.envelopeMode === 'circular' && value.showDensityDebug === false;
    }
    if (value.labelOrientation === 'direction-preserving-radial') return value.envelopeMode === 'circular' && value.showDensityDebug === false;
    return ['geographic-radial', 'random-radial'].includes(value.labelOrientation)
      && ['circular', 'natural-density'].includes(value.envelopeMode);
  }
  function createMemoryStorage(initial = {}) {
    const values = { ...initial };
    return { getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, removeItem: (key) => { delete values[key]; } };
  }
  function createPanmapControlStore(options = {}) {
    const storage = options.storage || global.localStorage || createMemoryStorage();
    const warnings = [];
    let restored = null;
    try { restored = JSON.parse(storage.getItem(STORAGE_KEY) || 'null'); } catch { warnings.push('持久化状态损坏，已安全重置'); }
    let applied = normalize(restored?.applied || DEFAULTS, warnings);
    let draft = clone(applied);
    let applyCount = 0;
    const listeners = new Set();
    function snapshot() { return { schemaVersion: SCHEMA_VERSION, draft: clone(draft), applied: clone(applied), draftFingerprint: fingerprint(draft), appliedFingerprint: fingerprint(applied), applyCount, warnings: [...warnings] }; }
    function notify() { const state = snapshot(); listeners.forEach((listener) => listener(state)); return state; }
    function persist() { storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, applied })); }
    return {
      getState: snapshot,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      setDraft(patch) { draft = normalize({ ...draft, ...clone(patch) }, warnings); return notify(); },
      resetDraft() { draft = clone(DEFAULTS); return notify(); },
      apply() {
        if (!isBaselineCompatible(draft)) {
          const reason = '自然包络仅支持第33号双径向布局；当前布局保持不变。';
          options.onWarning?.(reason);
          return { applied: false, reason, state: snapshot() };
        }
        applied = clone(draft); applyCount += 1; persist();
        options.onApply?.(clone(applied));
        return { applied: true, reason: null, state: notify() };
      },
      pinRandomSeed(seed) { return this.setDraft({ randomSeed: seed ?? DEFAULTS.randomSeed }); },
      exportMetrics(metrics = {}) { return { algorithmVersion: 'stage21-time-sprite-board-v1', baselineFingerprint: 'fnv1a-8b0581ae', controls: snapshot(), metrics: clone(metrics) }; },
    };
  }

  app.panmapControlState = Object.freeze({ SCHEMA_VERSION, STORAGE_KEY, DEFAULTS, normalize, fingerprint, stableStringify, isBaselineCompatible, createMemoryStorage, createPanmapControlStore });
})(typeof window === 'undefined' ? globalThis : window);
