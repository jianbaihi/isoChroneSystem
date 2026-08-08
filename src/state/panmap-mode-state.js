(function initPanmapModeState(global) {
  'use strict';

  const app = global.PanmapApp = global.PanmapApp || {};
  const PANMAP_MODES = Object.freeze({ ORDINARY: 'ordinary', RESEARCH: 'research' });
  const MODE_CAPABILITIES = Object.freeze({
    ordinary: Object.freeze({
      metricsPanel: false,
      comparison: false,
      algorithmParameters: false,
      experimentExport: false,
    }),
    research: Object.freeze({
      metricsPanel: true,
      comparison: true,
      algorithmParameters: true,
      experimentExport: true,
    }),
  });

  function normalizeMode(value) {
    return value === PANMAP_MODES.RESEARCH ? PANMAP_MODES.RESEARCH : PANMAP_MODES.ORDINARY;
  }

  function resolveInitialMode(search = '') {
    const params = new URLSearchParams(search);
    if (params.has('mode')) return normalizeMode(params.get('mode'));
    return params.get('research') === '1' ? PANMAP_MODES.RESEARCH : PANMAP_MODES.ORDINARY;
  }

  function searchForMode(search, mode) {
    const params = new URLSearchParams(search || '');
    const normalized = normalizeMode(mode);
    params.delete('mode');
    if (normalized === PANMAP_MODES.RESEARCH) params.set('research', '1');
    else params.delete('research');
    const next = params.toString();
    return next ? `?${next}` : '';
  }

  function createPanmapModeStore(options = {}) {
    const location = options.location || global.location || { search: '', pathname: '', hash: '' };
    const history = options.history || global.history || null;
    let mode = resolveInitialMode(location.search);
    let switchCount = 0;
    const listeners = new Set();

    function snapshot() {
      return Object.freeze({
        mode,
        switchCount,
        capabilities: MODE_CAPABILITIES[mode],
      });
    }

    function notify() {
      const state = snapshot();
      listeners.forEach((listener) => listener(state));
      return state;
    }

    function syncUrl() {
      if (!history?.replaceState) return;
      const nextSearch = searchForMode(location.search, mode);
      history.replaceState(history.state ?? null, '', `${location.pathname || ''}${nextSearch}${location.hash || ''}`);
    }

    return Object.freeze({
      getState: snapshot,
      setMode(nextMode, setOptions = {}) {
        const normalized = normalizeMode(nextMode);
        if (normalized === mode) return snapshot();
        mode = normalized;
        switchCount += 1;
        if (setOptions.syncUrl !== false) syncUrl();
        return notify();
      },
      subscribe(listener) {
        listeners.add(listener);
        listener(snapshot());
        return () => listeners.delete(listener);
      },
    });
  }

  app.panmapModeState = Object.freeze({
    PANMAP_MODES,
    MODE_CAPABILITIES,
    normalizeMode,
    resolveInitialMode,
    searchForMode,
    createPanmapModeStore,
  });
})(typeof window === 'undefined' ? globalThis : window);
