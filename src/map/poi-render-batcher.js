(function initPoiRenderBatcher(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const DEFAULT_BATCH_SIZE = 100;

  async function renderFeatures(features, publish, options = {}) {
    const batchSize = Number(options.batchSize || DEFAULT_BATCH_SIZE);
    const requestFrame = options.requestFrame || ((callback) => global.requestAnimationFrame(callback));
    const now = options.now || (() => global.performance?.now?.() ?? Date.now());
    const started = now();
    const collection = { type: 'FeatureCollection', features: [] };
    let frameCount = 0;
    for (let offset = 0; offset < features.length; offset += batchSize) {
      collection.features.push(...features.slice(offset, offset + batchSize));
      publish(collection);
      frameCount += 1;
      await new Promise((resolve) => requestFrame(resolve));
    }
    return { poiCount: features.length, batchSize, frameCount, renderDurationMs: now() - started };
  }

  app.poiRenderBatcher = Object.freeze({ DEFAULT_BATCH_SIZE, renderFeatures });
})(window);
