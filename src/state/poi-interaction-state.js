(function initPoiInteractionState(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  function createPoiInteractionState() {
    const state = { hoveredPoiId: null, selectedPoiId: null, hoverCardVisible: false, detailCardVisible: false, hoverSuppressed: false, viewportBeforeDetail: null };
    return Object.assign(state, {
      hover(poiId) { if (state.hoverSuppressed) return state; state.hoveredPoiId = poiId || null; state.hoverCardVisible = Boolean(poiId); return state; },
      leave() { state.hoveredPoiId = null; state.hoverCardVisible = false; return state; },
      select(poiId) { state.hoveredPoiId = null; state.hoverCardVisible = false; state.selectedPoiId = poiId || null; state.detailCardVisible = Boolean(poiId); state.hoverSuppressed = Boolean(poiId); return state; },
      close() { state.selectedPoiId = null; state.detailCardVisible = false; state.hoverSuppressed = false; return state; },
    });
  }
  app.createPoiInteractionState = createPoiInteractionState;
})(window);
