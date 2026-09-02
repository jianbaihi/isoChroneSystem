(function initPanmapMvpState(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const MODES = Object.freeze(['overview', 'ring-focused', 'category-focused', 'poi-selected']);
  const initialState = () => ({ mode: 'overview', focusedRingId: null, focusedCategoryCode: null, selectedPoiId: null });

  function transition(state, action) {
    const current = state || initialState();
    switch (action?.type) {
      case 'FOCUS_RING':
        return { mode: 'ring-focused', focusedRingId: action.ringId, focusedCategoryCode: null, selectedPoiId: null };
      case 'FOCUS_CATEGORY':
        if (!current.focusedRingId) return current;
        return { ...current, mode: 'category-focused', focusedCategoryCode: action.categoryCode, selectedPoiId: null };
      case 'SELECT_POI':
        if (!current.focusedRingId || !current.focusedCategoryCode) return current;
        return { ...current, mode: 'poi-selected', selectedPoiId: action.poiId };
      case 'BACK_CATEGORY':
        return current.focusedRingId && current.focusedCategoryCode
          ? { ...current, mode: 'category-focused', selectedPoiId: null }
          : current;
      case 'BACK_RING':
        return current.focusedRingId
          ? { mode: 'ring-focused', focusedRingId: current.focusedRingId, focusedCategoryCode: null, selectedPoiId: null }
          : current;
      case 'OVERVIEW':
      case 'RESET':
        return initialState();
      default:
        return current;
    }
  }

  function createStore() {
    let state = initialState();
    const listeners = new Set();
    return {
      getState: () => ({ ...state }),
      dispatch(action) {
        state = transition(state, action);
        listeners.forEach((listener) => listener({ ...state }));
        return { ...state };
      },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
  }

  app.panmapMvpState = Object.freeze({ MODES, initialState, transition, createStore });
})(window);
