# ORS 迁移第 4 阶段：地图与交互契约补充

## 1. 兼容范围与职责分离

本补充建立在 `schemaVersion: "1.0"` 和第 3 阶段 `AnalysisResult` 之上，不改变后端协议版本。

本阶段有两个不同的外部职责：

- HeiGIT openrouteservice API：只由后端提供真实等时圈分析；浏览器不直接访问、不持有 Key。
- MapLibre GL JS + OSM Standard 栅格瓦片：只负责传统地图底图和内部 GeoJSON 图层渲染；OSM 底图不是 ORS 底图。

浏览器只消费内部 `AnalysisResult`、`MapRingFeature` 和 `MapCenterFeature`，不消费 ORS Feature、`value`、`group_index`、原始错误正文或请求头。

## 2. `MapRingFeature`

每个 `Ring` 的非空几何转换为一个 GeoJSON Feature：

```json
{
  "type": "Feature",
  "id": "ring-0-10",
  "properties": {
    "ringId": "ring-0-10",
    "innerRangeMinutes": 0,
    "outerRangeMinutes": 10
  },
  "geometry": {
    "type": "Polygon",
    "coordinates": []
  }
}
```

约束：

- `Feature.id` 和 `properties.ringId` 都必须使用内部稳定 `ringId`。
- 只接受 `Polygon` 或 `MultiPolygon`；不接受前端自行生成的圆形、凸包或包络框。
- 不保留 ORS 特有字段，不把颜色、透明度或选中状态写回后端。
- `geometry: null` 的 mock ring 不进入圈层 source。
- 单项转换失败时返回明确错误或无效结果；不得用伪造几何覆盖最近一次有效地图。

## 3. `MapCenterFeature`

从 `AnalysisResult.center` 转换为单要素 FeatureCollection：

```json
{
  "type": "Feature",
  "id": "analysis-center",
  "properties": {
    "label": "望京广场"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [116.4815, 39.9906]
  }
}
```

中心点固定使用 WGS84 / `EPSG:4326` 和 `[longitude, latitude]`；前端不做 GCJ-02 偏移，不交换经纬度，不调用 Geocoding 或反向地理编码。

## 4. 参数草稿、请求快照和结果状态

`AnalysisStore` 是参数与结果的唯一状态权威，至少区分：

```js
parameterDraft = {
  center: {
    lon: 116.4815,
    lat: 39.9906,
    crs: "EPSG:4326",
    label: "望京广场"
  },
  centerSource: "preset", // "preset" | "map"
  profile: "foot-walking",
  rangesMinutes: [10, 20, 30],
  categoryIds: [],
  options: {
    includePois: true,
    calculateTravelTimes: false
  }
}
```

以及：

```text
lastSubmittedRequest
lastSuccessfulResult
requestStatus
activeRingId
hoveredRingId
isMapPickMode
```

语义规则：

- `parameterDraft` 是当前可编辑值；它可以不同于最近一次成功分析。
- 点击“生成可达域”时，从同一个 `parameterDraft` 校验并生成不可变 `lastSubmittedRequest` 快照。
- 只有该入口调用 Analysis Client；切换地点、profile 或阈值只更新草稿，不自动请求。
- 成功响应更新 `lastSuccessfulResult`，同时驱动 Traditional Map Adapter 和 Panmap Adapter。
- 失败响应不覆盖 `lastSuccessfulResult`、地图相机或泛地图；草稿和待分析中心点继续可编辑、可重试。
- 请求期间应避免重复提交；过期响应不能覆盖较新的成功结果。
- `rangesMinutes` 提交前必须是 1—10 个、正整数、升序且无重复值。

## 5. 地图选点与视觉状态

地图选点是显式的一次性模式：

```text
点击“地图选点”
→ isMapPickMode = true
→ 地图显示选点提示和待分析光标
→ 用户点击地图
→ 读取 MapLibre lngLat，转换为 [lon, lat]
→ 更新 parameterDraft.center，centerSource = "map"
→ 更新待分析中心点标记
→ isMapPickMode = false
→ 不调用 Analysis Client，不调用 ORS，不调用 Geocoding
```

- 可以再次点击入口或按 `Escape` 取消选点；取消不撤销已经写入草稿的中心点。
- 选点模式下地图点击优先解释为中心点选择，不能同时改变 `activeRingId`。
- 普通模式下地图圈层点击才选择 `ringId`；空白点击可清空选择。
- 地图平移和缩放不会修改参数中心点。
- 待分析中心点与最近一次成功分析中心点必须视觉可区分；待分析点不能伪装成已分析结果中心。
- `activeRingId` 是传统地图和泛地图共享的领域选择状态。
- `hoveredRingId` 是短暂视觉状态，不触发分析请求。
- MapLibre feature-state、CSS class 和 SVG class 都只是 Store 状态的渲染结果；MapLibre layer ID 不是领域 ID。

## 6. OSM 底图与 MapLibre 边界

开发/研究原型使用独立配置：

```js
{
  providerId: "osm-standard",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileSize: 256,
  minZoom: 0,
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}
```

- MapLibre GL JS 和 CSS 使用同一个精确版本，不使用 `latest`。
- 瓦片 URL 只在地图配置/style 中出现，不散落到 `app.js` 或业务 Adapter。
- 署名控件始终可见，并链接至 OpenStreetMap 版权说明；不通过 CSS 隐藏或裁切。
- 传统地图只创建一个 MapLibre 实例；泛地图小窗不创建第二个独立实例。
- Adapter 只管理地图生命周期、GeoJSON source/layer、交互回调和相机，不调用 Analysis API、ORS、POI 或 Panmap 内部函数。

## 7. mock 无几何语义

当 `AnalysisResult` 来源为 mock 且所有 `rings[].geometry` 均为 `null`：

- 底图和分析中心点仍显示；
- 传统地图状态区提示“当前为模拟模式，暂无真实等时圈几何”；
- 不生成伪造圆形、凸包或静态旧 SVG 等时圈；
- 泛地图继续按第 3 阶段 mock 数据绘制。

## 8. 双视图联动

联动只通过 Store 和稳定 `ringId`：

```text
传统地图圈层点击
→ Traditional Map Adapter 回调 ringId
→ Store.setActiveRingId(ringId)
→ Traditional Map Adapter 订阅并高亮
→ Panmap Adapter 订阅并聚焦
```

反向流程同理。两个 Adapter 不直接调用彼此的函数，不共享 MapLibre 实例，不把地图对象写入 Store，不实现 POI 级联动。

新结果不包含当前 `activeRingId` 时清空该选择；不存在的 `ringId` 忽略并给出开发提示，不得使页面崩溃。

## 9. 失败和生命周期

- 新有效 `analysisId` 到达时，地图通过 `setData()` 更新 source，并对最外层有效几何执行一次带 padding 的 `fitBounds()`。
- hover、active ring、主题变化和待分析点变化不重复 fit bounds。
- 视图切换、并列分栏、拖动结束、窗口尺寸变化或地图从隐藏变为可见时，调用节流后的 `map.resize()`。
- MapLibre 初始化或底图失败时显示可理解的地图状态提示；不清空 Store、不回退到旧硬编码 SVG，也不误报为 ORS 分析失败。
- Analysis API 失败时保留最近一次成功地图、相机、泛地图和草稿。

## 10. 本阶段明确不做

本阶段不接入真实 POI、Overpass、Matrix、Directions、Geocoding、Snapping、地名搜索、拖拽中心点自动重算、PostGIS、PostgreSQL、Redis、缓存、队列或 MapLibre 以外的前端框架。OSM 标准瓦片只用于正常人工交互式研究原型，不做预抓取、离线下载或批量瓦片处理。
