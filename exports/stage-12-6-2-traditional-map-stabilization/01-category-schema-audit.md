# 类别 Schema 审计

执行前使用 12 个项目自定义 semantic category，UI label、chip color、MapLibre marker color 和卡片 badge 分散维护。高德 types 已进入请求，但 Provider 原始一级类没有成为普通 UI 主分类。

执行后中国大陆普通 UI 从 `data/provider-taxonomy/amap/level1.json` 加载 20 个高德一级类；常用区展示 10 类，可展开全部。请求直接提交六位一级 code。POI 同时保留：

- `providerCategory.level1Code/level1Label/typecode/typeLabel`
- `semanticCategory.id/label`
- `categoryStyleKey`

视觉唯一来源为 `category-style-registry`。GeoJSON 使用 `categoryLevel1Code/categoryStyleKey`，不依赖数组顺序。

