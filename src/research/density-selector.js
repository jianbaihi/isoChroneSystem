(function initDensitySelector(global) {
  'use strict';
  const app = global.PanmapApp = global.PanmapApp || {};
  const presetsApi = app.densityPresets;
  if (!presetsApi) throw new Error('density-presets must load before density-selector');
  const { RINGS, PRESETS } = presetsApi;

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function scoreOf(item) {
    for (const field of ['rating', 'importance', 'score']) {
      const rawValue = item?.[field];
      if (rawValue === null || rawValue === undefined || rawValue === '') continue;
      const value = Number(rawValue);
      if (Number.isFinite(value)) return value;
    }
    return Number.NEGATIVE_INFINITY;
  }

  function compareStable(left, right) {
    const leftScore = scoreOf(left);
    const rightScore = scoreOf(right);
    if (leftScore !== rightScore) return rightScore > leftScore ? 1 : -1;
    const timeDelta = Number(left.travelTimeSeconds) - Number(right.travelTimeSeconds);
    if (timeDelta !== 0) return timeDelta;
    return String(left.poiId).localeCompare(String(right.poiId));
  }

  function normalizeQuotas(presetId, customRingQuotas) {
    const preset = PRESETS[presetId];
    if (!preset && !customRingQuotas) throw new RangeError(`unknown density preset: ${presetId}`);
    const source = customRingQuotas || preset.quotas;
    return Object.fromEntries(RINGS.map((ringId) => {
      const value = Number(source[ringId]);
      if (!Number.isInteger(value) || value < 0) throw new RangeError(`invalid quota for ${ringId}`);
      return [ringId, value];
    }));
  }

  function validateInput(eligible) {
    if (!Array.isArray(eligible)) throw new TypeError('eligible must be an array');
    const seen = new Set();
    eligible.forEach((item, index) => {
      if (!item?.poiId || !RINGS.includes(item.ringId) || !Number.isFinite(Number(item.travelTimeSeconds))) {
        throw new TypeError(`invalid mutually-exclusive eligible POI at index ${index}`);
      }
      if (seen.has(item.poiId)) throw new Error(`duplicate poiId is not allowed: ${item.poiId}`);
      seen.add(item.poiId);
    });
  }

  function select(eligible, options = {}) {
    validateInput(eligible);
    const presetId = options.presetId || 'standard';
    const quotas = normalizeQuotas(presetId, options.customRingQuotas || null);
    const selected = [];
    const quotaHidden = [];
    const rings = RINGS.map((ringId) => {
      const source = eligible.filter((item) => item.ringId === ringId).sort(compareStable);
      const quota = Math.min(quotas[ringId], source.length);
      selected.push(...source.slice(0, quota));
      quotaHidden.push(...source.slice(quota));
      return { ringId, sourceCount: source.length, quota: quotas[ringId], selectedCount: quota, quotaHiddenCount: source.length - quota };
    });
    const selectedPoiIds = selected.map((item) => String(item.poiId));
    const quotaHiddenPoiIds = quotaHidden.map((item) => String(item.poiId));
    const requestedTotalCap = RINGS.reduce((sum, ringId) => sum + quotas[ringId], 0);
    const fingerprintPayload = { presetId: options.customRingQuotas ? 'custom' : presetId, quotas, selectedPoiIds, quotaHiddenPoiIds };
    return {
      schemaVersion: 'panmap-density-selection/v1',
      presetId: options.customRingQuotas ? 'custom' : presetId,
      requestedTotalCap,
      selectedCount: selected.length,
      quotaHiddenCount: quotaHidden.length,
      rings,
      selected,
      quotaHidden,
      selectedPoiIds,
      quotaHiddenPoiIds,
      selectionFingerprint: fnv1a(JSON.stringify(fingerprintPayload)),
      sorting: { scoreFields: ['rating', 'importance', 'score'], scoreDirection: 'descending', nullScore: 'last', then: ['travelTimeSeconds:ascending', 'poiId:ascending'] },
    };
  }

  app.densitySelector = Object.freeze({ VERSION: 'stage43-density-selector-v1', select, compareStable, scoreOf, fnv1a });
})(typeof window === 'undefined' ? globalThis : window);
