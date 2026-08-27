(function initCategoryStyleRegistry(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const version = 'amap-category-style-v1';
  const entries = {
    '010000':['汽车服务','#B45309'],'020000':['汽车销售','#BE185D'],'030000':['汽车维修','#9A3412'],'040000':['摩托车服务','#A16207'],
    '050000':['餐饮服务','#F97316'],'060000':['购物服务','#DB2777'],'070000':['生活服务','#0D9488'],'080000':['体育休闲服务','#22A35A'],
    '090000':['医疗保健服务','#DC4C4C'],'100000':['住宿服务','#7C3AED'],'110000':['风景名胜','#16803A'],'120000':['商务住宅','#0891B2'],
    '130000':['政府机构及社会团体','#64748B'],'140000':['科教文化服务','#2563EB'],'150000':['交通设施服务','#D97706'],'160000':['金融保险服务','#0E7490'],
    '170000':['公司企业','#4F46E5'],'180000':['道路附属设施','#92400E'],'190000':['地名地址信息','#78716C'],'200000':['公共设施','#0284C7'],
  };
  const styles = Object.fromEntries(Object.entries(entries).map(([code, [label, color]]) => [code, Object.freeze({ code, label, color, markerRadius: 4, styleKey: `amap-l1-${code}` })]));
  function forCode(code) { return styles[String(code)] || Object.freeze({ code: String(code || ''), label: '其他', color: '#64748B', markerRadius: 4, styleKey: 'amap-l1-unknown' }); }
  function maplibreColorExpression() { return ['match', ['get', 'categoryLevel1Code'], ...Object.values(styles).flatMap((item) => [item.code, item.color]), '#64748B']; }
  app.categoryStyleRegistry = Object.freeze({ version, styles: Object.freeze(styles), forCode, maplibreColorExpression });
})(window);
