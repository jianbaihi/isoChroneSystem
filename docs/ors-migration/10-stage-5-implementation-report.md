# 第 5 阶段实施报告：统一 Overture Places 重设计

状态：**部分完成**

完成日期：2026-07-28

本阶段完成了与研究区域无关的统一 Overture Places 数据契约、SQLite/R-Tree 管线、后端本地 POI 组合服务、前端 OPC 类别树/POI 图层/双视图联动和 OSM/天地图切换边界。真实区域导入和双区域验收未标记完成：现有项目资料没有明确国外实验城市，也没有两区域的固定 release 官方文件。

## 1. 基线与执行边界

- 分支和用户已有改动均保留；没有执行清理、回退、提交、推送或开 PR。
- 未发现 `AGENTS.md`。
- 第 4 阶段回归基线通过：后端 26 项、前端 7 项。
- 继续执行了区域无关的 schema、importer、Repository、合成测试和 UI 适配；没有自行选择国外城市。
- 未读取、打印或提交 `server/.env`；未创建真实 SQLite、原始 POI 或 Token 文件。

## 2. 固定 Overture release 与官方依据

代码和示例 manifest 冻结 `2026-07-22.0`，不使用 `latest`。Overture 官方 taxonomy 约束了 hierarchy 从一般到具体、primary 等于 hierarchy 末项、alternates 为无序附加类别；官方 release calendar 列出了 2026-07-22 的 `2026-07-22.0` release。

- https://docs.overturemaps.org/schema/reference/places/types/taxonomy/
- https://docs.overturemaps.org/schema/reference/places/place/
- https://docs.overturemaps.org/release-calendar/

## 3. 区域 manifest 与真实数据状态

已新增：

- `data/manifests/overture-release.example.json`
- `data/manifests/cn-wuhan.example.json`
- `data/manifests/foreign-city.example.json`
- `data/category-labels/opc-top-level.zh-CN.json`
- `data/category-labels/opc-observed.zh-CN.json`
- `data/README.md`

武汉示例 manifest 使用非零结构示例，但没有被标记为项目实际研究范围；国外 manifest 明确为待项目指定。两个区域的真实 `read/eligible/inserted` 数、原始文件 SHA-256、taxonomy/basic/name 完整率、13 顶层覆盖、共同 basic/primary 类别和中文/本地语言覆盖均为 **N/A**，因为真实文件尚未获项目提供。

因此没有生成冒充真实数据的区域质量摘要，也没有下载全球 Places 或重新分发上游文件。

## 4. SQLite 与 R-Tree

新增 `server/app/repositories/local_poi.py`，实现以下表和约束：

- `poi_dataset`
- `poi`
- `category_node`
- `dataset_category_stats`
- `poi_primary_path`
- `poi_alternate_category`
- `poi_rtree`

Repository 支持 schema 幂等初始化、dataset 隔离、bbox 候选查询、父类别后代路径查询、R-Tree 数量一致性、同 datasetId + release + SHA-256 no-op、显式 `--replace` 和事务回滚。`ringId`、颜色、字号、选择状态、travel time 均不入库。

## 5. 单一 Overture importer

新增：

- `server/app/importers/overture.py`
- `server/app/cli/import_overture_places.py`

只实现一个 Overture importer，区域差异通过 manifest 参数化。支持 GeoJSON/GeoJSONL；运行环境提供 `pyarrow` 时支持 GeoParquet，并对 WKB/Geo interface 几何做转换。导入器确定性解析 preferredLocales 名称、本地语言回退、Point/bbox、taxonomy、basic、alternates、confidence、operating_status 和 addresses。

旧 `categories` 不作为回退主分类。无效 taxonomy、无名称、bbox 外、永久关闭、confidence 门槛不通过和重复 ID 均计数；confidence 只用于 eligibility/质量，不参与 POI 视觉排序。

CLI 支持 `--release-manifest`、`--region-manifest`、`--database`、`--dry-run`、`--replace`，只输出摘要，不输出源记录、绝对路径或密钥。

## 6. ORS + local Overture 组合

新增 `server/app/services/poi_selection.py` 并扩展 `server/app/services/analysis.py`：

```text
ORS 累计等时圈
→ 既有互斥 rings
→ 最外层几何 bbox
→ SQLite R-Tree 候选
→ primary path 类别筛选
→ Shapely covers 从内到外选择最小 outerRangeMinutes
→ 完整 ring/category 统计
→ ring + top-level category 确定性限量
→ 有限 Poi + CategoryNode + metadata
```

边界点使用 `covers`；alternates 不参与主类别筛选和计数；不计算逐 POI Matrix 时间，`travelTimeSeconds` 固定为 `null`。默认配置为 `POI_MAX_RESULTS=600`、`POI_MAX_CANDIDATES=50000`，并支持统一的 `POI_MIN_CONFIDENCE`。

新增 `GET /api/v1/poi-datasets`，不返回绝对路径、数据库路径、Token、Key 或完整 manifest。dataset 未 ready 返回 `POI_DATASET_NOT_READY`；未知 primary path 类别返回 `INVALID_POI_CATEGORY`；候选超限返回受控错误。ORS 和 Repository 失败不会组装半成品。

## 7. 内部契约

新增 `docs/ors-migration/09-stage-5-contract-addendum.md`。

- `AnalysisRequest` 保持 `schemaVersion: "1.0"`，增加可选 `poiDatasetId`。
- `Poi` 增加 dataset/source/nameLocale、OPC hierarchy/basic/primary/alternates、confidence、address。
- `CategoryNode` 由主 hierarchy 派生，包含 direct children、matched/returned counts 和 ringCounts。
- metadata 区分 `sources.isochrones=ors` 与 `sources.pois=local-overture`，并记录 release、selection strategy、空间方法和 taxonomy 字段。
- `includePois=false` 不读取 Repository；mock 无真实几何时不查询本地 POI。

## 8. Panmap 多级类别与唯一主聚簇

新增：

- `src/taxonomy/category-tree.js`
- `src/taxonomy/category-tree.test.js`
- `src/config/category-labels.js`

`Panmap Layout Adapter` 现在按 `categoryFocusPath` 只显示直接子类别，沿 hierarchy 继续到 primary，叶节点显示真实 POI 名称。每个 POI 只通过唯一 primary path 进入一次当前主布局；alternates 不复制节点。面包屑支持返回上级，focus path 无效时回退到仍有效的最深祖先。

既有碰撞、候选点、密度采样、KDE 和包络线核心算法没有重写，只增加了节点元数据和输入适配。

## 9. MapLibre POI 与双视图联动

新增：

- `src/map/analysis-poi-geojson.js`
- `src/map/analysis-poi-geojson.test.js`

Traditional Map Adapter 继续使用单一 MapLibre 实例，并新增：

- source：`analysis-pois`
- layer：`analysis-pois-circle`
- layer：`analysis-pois-hover`
- layer：`analysis-pois-selected`
- layer：`analysis-pois-label`

POI Feature.id 使用稳定 `poiId`；非法坐标跳过并生成诊断；不创建 DOM Marker 或一 POI 一 layer。地图点击 POI 写入 Store，Panmap 通过同一 `poiId` 高亮；反向点击路径同样成立。ringId、categoryId 和 selected/hovered 状态互不混淆。

## 10. OSM/天地图切换

扩展 `src/config/map-config.js`：

- 默认 `osm-standard`；
- 天地图只配置 `vec_w` + `cva_w` raster-pair；
- Token 只从运行时配置读取，`src/config/runtime-config.example.js` 为空，`src/config/runtime-config.local.js` 被 Git 忽略；
- 缺 Token 时天地图按钮禁用；
- 有 Token 时通过同一 MapLibre 实例切换 layer visibility，不调用 `setStyle()`、`fitBounds()` 或 Analysis API；
- 当前页面始终保留 OSM/天地图署名边界。

本阶段没有有效天地图 Token，因此没有进行真实天地图瓦片验收；入口正确保持禁用。

## 11. 自动测试与浏览器验收

后端：

```bash
cd server
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app tests
```

结果：29 项测试全部通过，Python 编译通过。新增合成测试覆盖 manifest/release、bbox/name/taxonomy/closed/duplicate、SQLite/R-Tree、幂等、replace、事务边界、父类别筛选、alternates 隔离、covers 圈层归属、统计和 ORS + local Overture 原子组合。

前端：

```bash
node --check <全部 JavaScript 文件>
node --test src/map/analysis-map-geojson.test.js src/map/analysis-poi-geojson.test.js src/taxonomy/category-tree.test.js src/state/analysis-store.test.js src/contracts/analysis-contracts.test.js
```

结果：12 项测试全部通过；全部 JavaScript 语法检查通过。

浏览器 mock 回归：

- `success` 状态；
- 10/20/30 三个 ring；
- 27 个 mock 类别；
- mock 无 geometry 时显示“暂无真实等时圈几何”，没有伪造真实 POI 地理点；
- 浏览器页面本地错误/警告日志为空；
- 传统地图、泛地图和分屏切换后 MapLibre canvas 数量始终为 1；
- 旧 mini SVG 被移除；
- 当前 OSM 署名可见，天地图因无 Token 保持禁用。

由于国外城市和真实文件未确定，武汉/国外真实 Overture 浏览器验收、两区跨城市比较、真实坐标抽样和天地图有效 Token 验收未完成。

## 12. 安全与 Git 忽略

已验证：

- `data/raw/**`、`data/generated/**`、SQLite `-wal/-shm`、`src/config/runtime-config.local.js`、`server/.env` 均被忽略；
- manifest、源码、测试和报告没有真实 ORS Key、天地图 Token、原始 POI 或数据库；
- 浏览器业务代码没有 Yelp、高德、OpenPOIService、Overpass 或 Overture 云端 POI 请求；
- ORS 仍只由后端 Adapter 调用；
- 没有引入 PostGIS、Matrix、Geocoding、自建 ORS、离线瓦片或第二个 MapLibre 实例。

## 13. 已知限制与阻塞

1. 国外实验城市未由项目明确指定；按执行文档不得自行选择，因此国外 manifest 仍是 example，双区域真实导入无法执行。
2. 武汉实际研究 bbox 也未在现有材料中确认；武汉 example bbox 未作为真实项目范围使用。
3. 没有两区域官方 `2026-07-22.0` GeoParquet/GeoJSON 文件，因此没有真实 SHA-256、质量分布、共同类别覆盖或真实抽样结果。
4. 没有有效天地图 Token，因此只验收了缺 Token 禁用语义。
5. 浏览器已验收 mock 和单实例/状态边界；真实 ORS + local Overture 浏览器闭环待数据与国外城市条件满足后执行。

## 14. 下一阶段建议（未执行）

先由项目明确国外实验城市、两个实际 bbox 和同一 release 的官方文件，再完成两区导入、质量报告、真实 ORS + local Overture 浏览器验收和天地图 Token 验收。后续不应在本阶段报告完成后自动开始 Matrix、PostGIS、自建 ORS、离线瓦片、Geocoding 或其他阶段。

本报告完成后按执行文档强制停止。
