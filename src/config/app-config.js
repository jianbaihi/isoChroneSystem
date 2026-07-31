(function initAppConfig(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const runtimeConfig = global.APP_RUNTIME_CONFIG || global.PanmapAppRuntimeConfig || {};
  const queryApiBaseUrl = new URLSearchParams(global.location?.search || '').get('apiBaseUrl');

  app.config = Object.freeze({
    apiBaseUrl: String(queryApiBaseUrl || runtimeConfig.apiBaseUrl || 'http://127.0.0.1:8000/api/v1').replace(/\/$/, ''),
  });
})(window);
