(function initCenterPresets(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const centers = {
    'wuhan-huanghelou': Object.freeze({ id: 'wuhan-huanghelou', label: '武汉·黄鹤楼', lon: 114.296944, lat: 30.546944, district: '武汉市武昌区' }),
    'paris-eiffel-tower': Object.freeze({ id: 'paris-eiffel-tower', label: '巴黎·埃菲尔铁塔', lon: 2.294478, lat: 48.858297, district: '法国巴黎第七区' }),
    '望京广场': Object.freeze({ id: '望京广场', label: '望京广场', lon: 116.4768, lat: 39.9953, district: '北京市朝阳区', historical: true }),
    '望京 SOHO': Object.freeze({ id: '望京 SOHO', label: '望京 SOHO', lon: 116.4815, lat: 39.9906, district: '北京市朝阳区', historical: true }),
    '望京站': Object.freeze({ id: '望京站', label: '望京站', lon: 116.4692, lat: 39.9984, district: '北京市朝阳区', historical: true }),
  };
  app.centerPresets = Object.freeze(centers);
  app.defaultCenterPresetId = 'wuhan-huanghelou';
  app.centerPreset = (id) => app.centerPresets[id] || app.centerPresets[app.defaultCenterPresetId];
})(window);
