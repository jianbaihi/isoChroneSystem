(function initCategoryLabels(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const topLevel = {
    services_and_business: '商业与专业服务',
    shopping: '购物',
    food_and_drink: '餐饮美食',
    lifestyle_services: '生活服务',
    travel_and_transportation: '交通出行',
    health_care: '医疗健康',
    education: '教育',
    cultural_and_historic: '文化历史',
    sports_and_recreation: '运动休闲',
    community_and_government: '社区与公共服务',
    lodging: '住宿',
    arts_and_entertainment: '艺术娱乐',
    geographic_entities: '自然与地理实体',
  };

  function humanize(categoryId) {
    return String(categoryId || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || '未命名类别';
  }

  app.categoryLabels = Object.freeze({
    labelFor(categoryId, observed = {}) {
      return observed[categoryId] || topLevel[categoryId] || humanize(categoryId);
    },
    topLevel: Object.freeze({ ...topLevel }),
  });
})(window);
