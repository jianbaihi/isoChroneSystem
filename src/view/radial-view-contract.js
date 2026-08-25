(function initRadialViewContract(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const VERSION = 'stage33-view-contract-v1';
  function finite(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
  function centeredViewBox(center, width, height) { return { x:center.x-width/2, y:center.y-height/2, width, height }; }
  function scaleFor(viewport, viewBox) { return Math.min(viewport.width/viewBox.width, viewport.height/viewBox.height); }
  function create(input = {}) {
    const bounds = { x:finite(input.bounds?.x,0), y:finite(input.bounds?.y,0), width:Math.max(1,finite(input.bounds?.width,1)), height:Math.max(1,finite(input.bounds?.height,1)) };
    const viewport = { width:Math.max(1,finite(input.viewport?.width,1)), height:Math.max(1,finite(input.viewport?.height,1)) };
    const semanticMinimumPx = Math.max(1,finite(input.semanticMinimumPx,8)); const readableMinimumPx = Math.max(1,finite(input.readableMinimumPx,8));
    const center = { x:bounds.x+bounds.width/2, y:bounds.y+bounds.height/2 }; const aspect = viewport.width/viewport.height;
    let overviewWidth = bounds.width; let overviewHeight = bounds.height;
    if (overviewWidth/overviewHeight < aspect) overviewWidth = overviewHeight*aspect; else overviewHeight = overviewWidth/aspect;
    const overview = centeredViewBox(center,overviewWidth,overviewHeight); const overviewScale=scaleFor(viewport,overview);
    const readingScale=Math.max((readableMinimumPx+0.01)/semanticMinimumPx,overviewScale); const reading=centeredViewBox(center,viewport.width/readingScale,viewport.height/readingScale);
    return { schemaVersion:'1.0',version:VERSION,bounds,viewport,semanticMinimumPx,readableMinimumPx,overview:{viewBox:overview,scale:overviewScale,minimumScreenFontPx:semanticMinimumPx*overviewScale,readingState:false},reading:{viewBox:reading,scale:readingScale,minimumScreenFontPx:semanticMinimumPx*readingScale,readingState:true} };
  }
  app.radialViewContract = Object.freeze({ VERSION, create, scaleFor });
})(typeof window === 'undefined' ? globalThis : window);
