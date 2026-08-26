(function initPoiInteractionState(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  function createPoiInteractionState() {
    const state = { hoveredPoiId: null, selectedPoiId: null, hoverCardVisible: false, detailCardVisible: false };
    return Object.assign(state, {
      hover(poiId) { state.hoveredPoiId = poiId || null; state.hoverCardVisible = Boolean(poiId); return state; },
      leave() { state.hoveredPoiId = null; state.hoverCardVisible = false; return state; },
      select(poiId) { state.selectedPoiId = poiId || null; state.detailCardVisible = Boolean(poiId); return state; },
      close() { state.selectedPoiId = null; state.detailCardVisible = false; return state; },
    });
  }
  app.createPoiInteractionState = createPoiInteractionState;
})(window);
