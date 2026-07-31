# ORS 迁移第 5 阶段：统一 Overture Places 契约补充

状态：已冻结（区域真实数据导入待项目指定国外实验城市）

## 1. 数据源与版本

国内研究区和国外研究区都只使用同一 Overture Places release：`2026-07-22.0`。
内部主分类直接使用 OPC ID：`taxonomy.hierarchy` 是唯一主路径，`taxonomy.primary` 是路径末项，`basic_category` 作为独立的认知层字段，`taxonomy.alternates` 只用于审计和后续辅助筛选，不进入主布局。

本阶段不读取在线 POI 服务。应用运行时只读取本地 SQLite；ORS、OSM 和天地图仍是在线外部服务。

## 2. 区域 manifest

区域 manifest 使用 `[west, south, east, north]` WGS84 bbox、固定 release、相对 sourceFile、默认中心点和统一 eligibility 配置。两个区域必须完全相同地执行：

- Point 几何、有效 WGS84 坐标、bbox 内；
- 确定性名称本地化回退；
- 非空且无重复的 hierarchy，primary 等于末项；
- permanently closed 排除；
- confidence 只做可选质量门槛，不进入排序或视觉重要性；
- basic 缺失保留为空并计数，不能改写为 primary。

武汉实际研究 bbox 和国外实验城市必须由项目资料或用户明确指定。未指定时不创建 ready dataset、不下载数据、不猜测城市。

## 3. SQLite 领域表

`poi_dataset` 保存数据集版本、区域、bbox、哈希、质量率和 ready 状态；`poi` 保存稳定 `overture:<GERS id>`、名称、坐标、OPC 主类别、basic、primary、confidence 和地址；`category_node` 保存主路径父子关系；`dataset_category_stats` 保存区域级计数；`poi_primary_path` 支持祖先查询；`poi_alternate_category` 保存不参与布局的附加类别；`poi_rtree` 提供 bbox 粗筛。

dataset 替换在单事务内执行，重复的 datasetId + release + SHA-256 是 no-op；其他哈希必须显式 `--replace`。失败必须回滚，R-Tree 行与主表保持一致。

## 4. AnalysisRequest 扩展

保持 `schemaVersion: "1.0"`，新增可选 `poiDatasetId`。`includePois=false` 不访问 POI Repository；`includePois=true` 且 `POI_PROVIDER=local` 必须指定 ready dataset。`categoryIds=[]` 表示该数据集全部 eligible POI；非空数组匹配 `poi_primary_path` 的任意节点，不匹配 alternates。

## 5. AnalysisResult 扩展

`Poi` 包含 `datasetId`、`source`、`nameLocale`、`category.topLevelId/basicCategoryId/primaryCategoryId/hierarchy/alternateIds`、`ringId`、`confidence`、`address`，并固定 `travelTimeSeconds: null`。不返回 rating、reviewCount、联系方式或原始 source record。

`CategoryNode` 来自主 hierarchy，包含 `childCategoryIds`、`matchedPoiCount`、`returnedPoiCount` 和每个 ring 的计数。祖先节点计数，但每个 POI 只沿唯一 primary path 在叶节点/标签层摆放一次。

`metadata` 增加 `sources.pois: "local-overture"`、dataset release/region/署名、matched/returned/truncated/strategy、空间筛选方式和 taxonomy 字段。ORS 或数据库失败不返回“旧圈层 + 新 POI”半成品。

## 6. 圈层与限量

先取得 ORS 累计等时圈，再用已有互斥 rings；R-Tree 做最外层 bbox 候选，Shapely `covers` 从内到外选择最小 `outerRangeMinutes`，边界点计入。统计先于截断；截断使用 ring + 顶层类别分层、稳定 hierarchy/poiId 排序，不用 confidence 作为评分。

配置：`POI_MAX_RESULTS=600`、`POI_MAX_CANDIDATES=50000`、`POI_MIN_CONFIDENCE` 可空，国内外一致。

## 7. 前端交互

Store 保留参数草稿、提交快照和最近成功结果，并增加 `selectedPoiId`、`hoveredPoiId`、`activeCategoryId`、`hoveredCategoryId`、`categoryFocusPath`、`visibleTopLevelCategoryIds`、`activeBasemapId`。下钻/返回/当前结果显隐不发请求；参数草稿中的 `categoryIds` 只影响下一次查询。

Panmap 仅按主 hierarchy 逐级显示：ring → L0 → 子类 → primary → POI 标签；alternates 不产生节点。MapLibre 只有一个实例，POI 使用 GeoJSON source/layer，地图和 Panmap 通过 poiId/categoryId/ringId 与 Store 联动。

OSM 和天地图矢量底图通过同一实例的 visibility 切换；天地图 Token 只来自被忽略的 runtime local config，缺失时入口禁用，切换不 setStyle、不 fitBounds、不触发分析。

## 8. 错误与停点

数据集未就绪返回 `POI_DATASET_NOT_READY`；未知类别返回明确校验错误；合法空结果成功返回空 POI；无 ORS 几何时不得查询或伪造本地 POI。真实武汉和国外数据、跨区域报告和浏览器双区域验收在国外城市明确且文件准备好后完成。本阶段完成后不开始 Matrix、PostGIS、Geocoding、自建 ORS 或离线瓦片。
