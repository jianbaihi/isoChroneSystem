(function initMapConfig(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  const runtimeConfig = global.APP_RUNTIME_CONFIG || global.PanmapAppRuntimeConfig || {};
  const tiandituToken = String(runtimeConfig.tiandituToken || '').trim();
  const tiandituTile = (layer) => `https://t0.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(tiandituToken)}`;
  app.mapConfig = Object.freeze({
    defaultBasemapId: 'osm-standard',
    basemaps: Object.freeze({
      'osm-standard': Object.freeze({
        id: 'osm-standard', kind: 'raster', providerId: 'osm-standard',
        tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', tileSize: 256,
        minZoom: 0, maxZoom: 19, attribution: '© OpenStreetMap contributors',
        attributionUrl: 'https://www.openstreetmap.org/copyright', requiresToken: false,
      }),
      'tianditu-vector': Object.freeze({
        id: 'tianditu-vector', kind: 'raster-pair', providerId: 'tianditu-vector',
        baseUrl: tiandituToken ? tiandituTile('vec_w') : '',
        labelUrl: tiandituToken ? tiandituTile('cva_w') : '', tileSize: 256,
        minZoom: 0, maxZoom: 18, attribution: '© 天地图',
        attributionUrl: 'https://www.tianditu.gov.cn/', requiresToken: true,
      }),
    }),
    tiandituTokenAvailable: Boolean(tiandituToken),
    providerId: 'osm-standard',
    tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileSize: 256, minZoom: 0, maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    initialZoom: 12,
  });
})(window);
