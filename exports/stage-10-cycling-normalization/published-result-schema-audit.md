# 第53号发布结果字段审计

## 发现

- 第51号v1归档的`pois[]`只有空间阶段遗留的`ringId`，且顶层`travelTimeSeconds`为null。
- 独立`accessibility[]`已拥有Matrix时间、距离、批次、路由提供者、图数据日期、空间审计圈层与Matrix圈层。
- 旧版泛地图布局、传统地图GeoJSON与POI详情存在各自读取独立Matrix数组的路径。

## 校正

- 后端唯一发布join：`app.services.published_result_normalization.enrich_pois_with_matrix`。
- 缓存重放、后端Matrix完成发布都经过该函数；原始v1归档不覆盖。
- 前端唯一迁移join：`PanmapApp.contracts.enrichPoisWithMatrix`，只在网络响应、session恢复或归档恢复的边界执行。
- 普通模式、研究模式、布局、详情和GeoJSON只消费归一化后的`poi`顶层字段；`accessibility[]`保留为审计/导出。

## 圈层真源

`ringId`由Matrix时间边界派生；`spatialBandId`只保留审计，不得覆盖Matrix圈层。
