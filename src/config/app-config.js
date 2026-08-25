(function initAppConfig(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const runtimeConfig = global.APP_RUNTIME_CONFIG || global.PanmapAppRuntimeConfig || {};
  app.config = Object.freeze({
    apiBaseUrl: String(runtimeConfig.apiBaseUrl || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, ''),
  });
})(window);
