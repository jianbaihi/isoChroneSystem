const MAPLIBRE_VERSION = '5.24.0';

if (window.maplibregl) {
  window.dispatchEvent(new CustomEvent('panmap:maplibre-ready', {
    detail: { version: MAPLIBRE_VERSION },
  }));
} else {
  window.dispatchEvent(new CustomEvent('panmap:maplibre-error', {
    detail: { version: MAPLIBRE_VERSION, message: 'MapLibre 资源加载失败。' },
  }));
}
