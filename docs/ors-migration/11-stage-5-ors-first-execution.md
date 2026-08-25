# 第 5 阶段变更执行文档：ORS 在线 API 优先跑通

状态：待执行  
适用基线：`09-stage-5-contract-addendum.md` 与 `10-stage-5-implementation-report.md` 完成后的当前项目  
本阶段定位：论文原型端到端闭环、服务器部署就绪  
执行完成后：强制停止，不进入第 6 阶段

## 0. 给 Codex 的直接指令

继续当前项目第 5 阶段。用户已经改变本阶段的数据接入优先级：

- 等时圈继续使用 ORS 在线 API；
- 开发阶段 POI 改为 ORS 公共 POI API；
- 地图瓦片和当前 MapLibre 底图保持不变；
- 已完成的 Overture importer、SQLite/R-Tree、Repository、契约和测试全部保留，作为后续正式数据比较与切换能力；
- 当前第一优先级是让真实 ORS 数据驱动的完整系统稳定运行、能够交互、能够出图。

你可以修改当前仓库中的业务代码、配置示例、测试和项目文档。不得连接或修改课题组服务器，不得下载全国数据，不得提交、推送或创建 PR，不得读取、打印、记录或提交任何 Key/Token。

先执行只读审计，再按本文顺序实施。不要重新设计整个系统，不要重写已经通过测试的泛地图布局算法。

## 1. 本文与既有第 5 阶段文档的关系

本文是第 5 阶段的运行策略变更单。

它只覆盖既有文档中的一项决定：

> 当前默认 POI 运行时由 `local Overture SQLite` 改为 `ORS remote POI`。

以下既有成果继续有效，不得删除或降级：

- Overture release manifest、importer 和质量统计；
- SQLite、R-Tree 和本地 POI Repository；
- Overture 主分类路径、alternates 隔离和数据集 ready 语义；
- `AnalysisRequest`、`AnalysisResult`、`Poi`、`CategoryNode` 的现有字段；
- 互斥圈层、`covers` 边界归属、统计先于限量；
- Panmap 多级下钻、面包屑返回、Store 状态保持；
- 单一 MapLibre 实例、POI GeoJSON 图层和双视图联动；
- OSM/天地图当前切换逻辑及安全边界；
- 当前全部后端和前端回归测试。

不得篡改 `09`、`10` 号文档来掩盖历史决定。实现完成后新增本阶段实施报告。

## 2. 冻结范围

### 2.1 本阶段必须实现

1. 后端通过 ORS 在线 API 一次请求获得 `driving-car` 的 10、20、30 分钟累计等时圈。
2. 后端通过 ORS 公共 POI API 获取最大等时圈覆盖范围内的 POI。
3. ORS POI 转换为当前系统统一的 `Poi`、`CategoryNode` 和 metadata，不让前端直接依赖 ORS 原始结构。
4. POI 按现有互斥圈层规则归入 10、20、30 分钟圈层。
5. 保持当前泛地图、传统地图、分类下钻、返回、选择、高亮和联动流程可用。
6. 增加磁盘缓存、请求预算、并发限制、错误映射和配额信息记录。
7. 先完成小范围真实 API 冒烟，再完成最大等时圈分块覆盖。
8. 完成自动测试、真实浏览器验收和实施报告。
9. 所有服务地址和数据目录仍可通过环境变量配置，为以后迁移到课题组 Linux 服务器保留条件。

### 2.2 本阶段明确不做

- 不下载 OSM `.osm.pbf`；
- 不部署本地 ORS 或 OpenPOIService；
- 不下载或导入新的 Overture 原始数据；
- 不删除、重构或废弃现有 Overture 本地数据链路；
- 不生成本地地图瓦片，不更换当前底图；
- 不接入 Yelp、高德、Overpass 或其他 POI 数据源；
- 不调用 Matrix、Directions、Geocoding、PostGIS；
- 不计算逐 POI 精确通行时间，`travelTimeSeconds` 继续为 `null`；
- 不增加登录、后台管理、多用户、Kubernetes、高可用或全国数据；
- 不在本阶段开展 ORS 与 Overture 的论文质量比较；
- 不修改标签碰撞、候选点、KDE、包络线等核心布局算法，除非现有回归测试证明适配层存在明确缺陷。

## 3. 固定运行参数

本阶段默认值冻结为：

| 参数 | 值 |
|---|---|
| Isochrone provider | `ors_remote` |
| POI provider | `ors_remote` |
| Profile | `driving-car` |
| Range type | `time` |
| Ranges | `600,1200,1800` 秒 |
| 圈层 | `10/20/30 min` |
| POI 正式查询范围 | 最外层 30 分钟累计等时圈 |
| POI 最大最终返回量 | 沿用当前 `POI_MAX_RESULTS=600` |
| POI 标签通行时间 | `null` |
| 地图 | 沿用当前 MapLibre 与现有底图配置 |

第一条完整真实验收只要求当前项目已有的武汉默认中心点通过。用户已将国外实验城市确定为巴黎，但本阶段不得猜测巴黎中心坐标：若仓库已有经过确认的巴黎中心预设，则追加一次跨城市冒烟；若没有，在报告中记为待确认，不阻塞武汉闭环。

## 4. 官方接口边界

实现以执行时的 ORS 官方文档和真实响应为准：

- Isochrones 支持一次提交多个精确 range，响应为 GeoJSON：  
  https://giscience.github.io/openrouteservice/api-reference/endpoints/isochrones/
- ORS 公共 POI 实际由独立的 OpenPOIService 提供，本地 ORS 实例不会自动提供该端点：  
  https://giscience.github.io/openrouteservice/api-reference/endpoints/poi/
- 当前公共限制包括：POI polygon 最大面积 50 km²、Point 最大半径 2 km；driving isochrone 最大 1 小时：  
  https://openrouteservice.org/restrictions/
- API Key 必须只在服务端使用；每日配额按首次请求起的滚动 24 小时重置，分钟配额是滑动窗口：  
  https://giscience.github.io/openrouteservice/frequently-asked-questions.html#when-and-how-does-my-quota-reset

不要把文档中的示例响应结构当作唯一真值。第一次真实冒烟时只保存去密后的最小 schema 观察结果，随后让解析器与真实响应一致。

## 5. 阶段 A：只读审计

实施前只读检查当前仓库，并在工作记录中列出：

1. 当前 ORS isochrone Adapter、请求入口和配置字段；
2. `AnalysisRequest → analysis service → POI selection → AnalysisResult` 的实际调用链；
3. `local_poi.py` 被直接依赖的位置；
4. `poiDatasetId` 在后端、Store 和 UI 中的使用位置；
5. 当前 `Poi`、`CategoryNode`、metadata 的校验器与测试；
6. 当前缓存、HTTP client、重试和错误处理中可复用的实现；
7. 当前 `.env.example`、Git ignore、Docker/部署配置；
8. 当前前后端基线测试命令及结果；
9. 工作树中用户已有改动，确保后续不覆盖无关内容。

审计后再实施。若实际仓库结构与 `10-stage-5-implementation-report.md` 不一致，以代码为准，并在最终报告说明差异。

## 6. 目标调用链

```text
AnalysisRequest
→ ORS Isochrones（一次请求返回 10/20/30 分钟累计面）
→ 既有累计面规范化与互斥 rings
→ 最外层 30 分钟几何
→ ORS POI 安全分块
→ 分块响应缓存、合并、稳定去重
→ ORS POI 统一领域模型
→ 既有 covers 圈层归属
→ 完整统计
→ 既有稳定限量
→ AnalysisResult
→ Store
→ Panmap + 单一 MapLibre 实例
```

`includePois=false` 时不得调用 ORS POI。分类下钻、返回、视图切换、标签/地图高亮不得重新调用 ORS。

## 7. Provider 边界

### 7.1 不要在 `analysis.py` 中堆叠条件分支

为 POI 建立最小 Provider 接口，具体命名服从当前项目风格。接口至少表达：

```text
fetch_candidates(context) -> provider POI candidates + provider metadata
normalize(candidate) -> unified Poi candidate
build_category_nodes(...) -> unified CategoryNode[]
```

建议结构，但不要为了匹配本文而无意义搬文件：

```text
server/app/
├── clients/
│   └── ors_poi.py
├── providers/poi/
│   ├── base.py
│   ├── ors_remote.py
│   └── overture_local.py
└── services/
    ├── analysis.py
    ├── poi_selection.py
    └── poi_tiling.py
```

要求：

- `ors_remote` 不访问 SQLite POI Repository；
- `overture_local` 继续复用现有 Repository；
- 保留现有 `POI_PROVIDER=local` 的兼容语义，若引入 `overture_local` 新名称，应提供兼容别名并测试；
- Provider 差异止于后端适配层，前端不出现解析 ORS 原始字段的代码。

### 7.2 `poiDatasetId` 语义

- `POI_PROVIDER=ors_remote` 时，分析不需要数据集；
- 前端不得因没有 ready Overture dataset 而阻塞 ORS 分析；
- 如果请求在 ORS 模式下携带非空 `poiDatasetId`，应明确拒绝或明确忽略并记录诊断，二者择一后固定测试；推荐返回参数校验错误，避免用户误以为使用了本地数据；
- `GET /api/v1/poi-datasets` 和本地数据集能力继续保留，供切回 Overture 使用。

## 8. 配置与密钥

先复用现有配置命名；仅在缺少能力时新增。目标配置等价于：

```env
POI_PROVIDER=ors_remote
ORS_BASE_URL=https://api.openrouteservice.org
ORS_POI_PATH=/pois
ORS_API_KEY=

ORS_PROFILE=driving-car
ORS_ISOCHRONE_RANGES_SECONDS=600,1200,1800

ORS_POI_QUERY_STRATEGY=outer-isochrone-grid
ORS_POI_GRID_SIZE_METERS=6000
ORS_POI_MAX_CELL_AREA_KM2=45
ORS_POI_LIMIT_PER_CELL=2000
ORS_POI_MAX_REQUESTS_PER_ANALYSIS=40
ORS_POI_MAX_CONCURRENCY=2
ORS_POI_TIMEOUT_SECONDS=30

ORS_CACHE_DIR=data/generated/ors-cache
ORS_CACHE_TTL_SECONDS=604800
ORS_CACHE_STALE_IF_ERROR=true
```

安全要求：

- `ORS_API_KEY` 只存在于后端运行环境；
- `.env.example` 只放空占位符；
- `.env`、缓存和真实响应不得提交；
- 前端构建产物、runtime config 和浏览器网络请求中不得出现 Key；
- HTTP 日志、异常、测试快照和实施报告不得包含 `Authorization`、Key 或完整请求头；
- Key 缺失检查只能输出“已配置/未配置”，不能输出长度、前后缀或原值；
- `ORS_BASE_URL` 与 POI path 可配置，以后路由和 POI 服务拆分时无需改业务代码。

## 9. ORS Isochrones

保持现有 ORS 等时圈实现，只补齐本阶段验收所需行为：

```http
POST /v2/isochrones/driving-car
Authorization: <server-side key>
Content-Type: application/json
```

```json
{
  "locations": [[0.0, 0.0]],
  "range": [600, 1200, 1800],
  "range_type": "time"
}
```

上例坐标只是结构占位，不得作为真实中心。必须使用 `[longitude, latitude]`。

要求：

- 三个 range 一次请求完成；
- 校验返回恰好包含可识别的 600、1200、1800 秒累计面；
- 沿用既有互斥 ring 生成；
- 无有效最外层几何时不得继续请求 POI；
- 不用 bbox 或圆形伪造等时圈；
- ORS 失败时不得将上一次等时圈与本次 POI 混合。

## 10. ORS POI：先冒烟，再覆盖最大等时圈

### 10.1 Checkpoint 1：真实小范围冒烟

在所有单元测试使用 fake transport 通过后，才允许用现有 Key 执行一次小范围真实调用：

- 使用当前已确认中心；
- Point buffer 使用 500 米，不超过 2 km；
- `request="pois"`；
- `limit` 使用较小安全值；
- 不预设一定存在某个名称或类别；
- 只验证 HTTP、鉴权、响应类型、坐标、OSM identity、名称和类别字段的真实形态；
- 保存去密、去具体业务内容的 schema 观察记录，不保存请求头。

若小范围合法空结果，扩大到 1000 米再试一次；最多到 2000 米。不得无限重试。

Checkpoint 1 通过后才能实现或启用完整分块查询。

### 10.2 Checkpoint 2：最外层等时圈分块

30 分钟驾车等时圈通常超过 POI polygon 50 km² 限制，不能直接发送整面，也不能悄悄退化为中心 2 km。

实现以下确定性流程：

1. 取得 30 分钟累计等时圈；
2. 根据中心点选择本地 UTM 投影；
3. 将最外层 Polygon/MultiPolygon 投影到米制坐标；
4. 生成 `6000 m × 6000 m` 网格；
5. 每个格网与等时圈求交；
6. 丢弃空交集；
7. 将 MultiPolygon 拆为合法 Polygon；
8. 计算每个查询面的实际面积；
9. 面积大于 `45 km²` 时继续确定性细分；
10. 转回 WGS84 后逐块请求 ORS POI；
11. 合并全部 Feature；
12. 按稳定 OSM identity 去重；
13. 再用原始最外层等时圈 `covers` 复核候选点。

`45 km²` 是相对官方 50 km² 上限的安全阈值。不得只按经纬度度数估算面积。优先复用现有几何依赖；确实缺少投影能力时才增加 `pyproj`，并锁定兼容版本。

### 10.3 请求预算与完整性

- 分块计划在发出请求前完成；
- 预计请求数超过 `ORS_POI_MAX_REQUESTS_PER_ANALYSIS` 时，直接返回 `POI_REQUEST_BUDGET_EXCEEDED`；
- 不得先发一半请求再发现超预算；
- 分块请求最多 2 路并发；
- 每个 cell 使用独立缓存；
- 返回 Feature 数等于 `ORS_POI_LIMIT_PER_CELL` 时视为可能截断，确定性四分该 cell，最多递归 2 层；
- 若请求预算或递归深度不足以消除可能截断，返回 `POI_UPSTREAM_TRUNCATED`；
- 不得把部分 cell 结果伪装成完整分析；
- 合法的完整空结果是成功，不得自动切换假数据。

## 11. 缓存与配额保护

为 isochrone 请求和每个 POI cell 建立磁盘缓存。

缓存键至少包含：

- provider；
- endpoint；
- profile；
- 完整中心坐标；
- ranges；
- range type；
- POI 查询 geometry 的规范化表示；
- category filters；
- limit；
-影响响应的其他参数。

缓存键不得包含 Key。使用 canonical JSON 的 SHA-256，文件写入采用临时文件后原子替换。

缓存记录至少包含：

- 去密请求参数；
- 原始响应 body；
- `retrievedAt`；
- response SHA-256；
- endpoint 类型；
- HTTP status；
- 可用时记录 `x-ratelimit-remaining` 和 `x-ratelimit-reset`；
- attribution。

行为要求：

- 完全相同的第二次分析必须命中缓存，不再发出 ORS 请求；
- `403` 不自动重试；
- `429` 只在存在合理 `Retry-After` 且不超过本次等待上限时重试一次；
- timeout、连接失败、`5xx` 最多指数退避重试 2 次；
- `4xx` 参数错误、鉴权错误不重试；
- `ORS_CACHE_STALE_IF_ERROR=true` 时，只允许使用完全相同 cache key 的过期缓存，并在 metadata 标记 `stale=true`；
- 不允许用邻近中心、不同 range 或不同 profile 的缓存代替；
- 下钻、返回、高亮和切换视图不得改变缓存或产生请求。

## 12. ORS POI 统一模型

### 12.1 稳定身份

优先使用：

```text
poiId = "ors-poi:<osm_type>:<osm_id>"
```

OSM type 的数值或字符串形式必须先规范化。缺少稳定 OSM identity 的 Feature 不得参与跨 cell 去重；推荐排除并计入 diagnostics，禁止用数组下标作为 ID。

### 12.2 名称

从真实响应中按确定性顺序读取可用名称：

1. 当前 locale 对应名称；
2. OSM `name`；
3. `brand`；
4. `operator`。

没有任何确定性可显示名称的 POI 不进入标签布局，但要计入 `unnamedExcludedCount`。不得生成“POI 123”一类伪名称。

### 12.3 两级分类

ORS POI 的主树固定为：

```text
category group → category → POI
```

内部 ID 必须带 provider namespace：

```text
ors:group:<group_id>
ors:category:<category_id>
```

不得把 ORS 数字 ID 与 Overture OPC ID 混为同一分类体系。

处理规则：

- 保存一份小型、可测试的 ORS category catalog；
- catalog 至少包含 group ID/name、category ID/name 和父 group；
- 不在每次分析时调用 `request="list"`；
- 顶层 group 提供中文显示名；
- 细分类没有中文翻译时使用稳定英文名称，不阻塞本阶段；
- 未知的新 category ID 进入明确的 unknown diagnostics，不导致整个响应崩溃。

若一个 Feature 同时属于多个细分类：

- 将数值最小的合法细分类作为唯一主分类；
- 其所属 group 为 top level；
- 其他细分类进入 `alternateIds`；
- alternates 不产生重复标签，不参与主布局计数；
- 在 metadata 中记录该 deterministic primary rule。

### 12.4 统一 `Poi`

ORS POI 至少映射为：

```json
{
  "poiId": "ors-poi:<type>:<id>",
  "datasetId": null,
  "source": "ors-openpoiservice",
  "name": "<resolved name>",
  "nameLocale": "<resolved locale or und>",
  "longitude": 0.0,
  "latitude": 0.0,
  "category": {
    "topLevelId": "ors:group:<id>",
    "basicCategoryId": null,
    "primaryCategoryId": "ors:category:<id>",
    "hierarchy": [
      "ors:group:<id>",
      "ors:category:<id>"
    ],
    "alternateIds": []
  },
  "ringId": "<existing ring id>",
  "travelTimeSeconds": null,
  "confidence": null,
  "address": null
}
```

示例中的 `0.0` 和 `<id>` 只是结构占位。不得用示例值生成真实结果。

不向前端返回完整 `osm_tags`、原始 Feature、请求头或 Key。

### 12.5 `CategoryNode`

继续复用现有 Category tree Adapter：

- group 是 L0；
- category 是 L1/primary；
- POI 标签只在 category 叶节点下出现；
- `matchedPoiCount` 在截断前统计；
- `returnedPoiCount` 在稳定限量后统计；
- `ringCounts` 与互斥 ring 一致；
- 每个 POI 只沿唯一主路径计数和摆放一次。

## 13. `AnalysisResult.metadata`

在不破坏现有字段的前提下，至少能够表达：

```text
sources.isochrones = "ors-public-api"
sources.pois = "ors-openpoiservice"
poiProvider = "ors_remote"

poiCoverage.strategy = "outer-isochrone-grid"
poiCoverage.complete = true|false
poiCoverage.outerRangeSeconds = 1800
poiCoverage.cellCount
poiCoverage.requestCount
poiCoverage.cacheHitCount
poiCoverage.maxCellAreaKm2
poiCoverage.stale

poiSelection.receivedCount
poiSelection.deduplicatedCount
poiSelection.unnamedExcludedCount
poiSelection.invalidExcludedCount
poiSelection.matchedCount
poiSelection.returnedCount
poiSelection.truncated

taxonomy.system = "ors-openpoiservice"
taxonomy.primaryRule = "smallest-valid-category-id"

rateLimit.remaining
rateLimit.reset
attribution
```

只有全部 cell 成功且没有未解决截断时，`poiCoverage.complete` 才能为 `true`。分析接口继续保持原子语义，不返回“完整等时圈 + 部分 POI”的成功结果。

## 14. 错误模型

至少区分：

| 错误码 | 场景 |
|---|---|
| `ORS_API_KEY_MISSING` | 后端未配置 Key |
| `ORS_AUTH_FAILED` | 认证失败 |
| `ORS_RATE_LIMITED` | 分钟配额触发 |
| `ORS_QUOTA_EXHAUSTED` | 每日配额或禁止访问 |
| `ORS_TIMEOUT` | 上游超时 |
| `ORS_UNAVAILABLE` | 连接失败或上游 5xx |
| `ORS_RESPONSE_INVALID` | 等时圈响应不符合契约 |
| `ORS_POI_RESPONSE_INVALID` | POI 响应无法解析 |
| `POI_REQUEST_BUDGET_EXCEEDED` | 预计算分块超过本地预算 |
| `POI_UPSTREAM_TRUNCATED` | cell 结果可能被 limit 截断且无法继续细分 |
| `INVALID_PROVIDER_PARAMETER` | ORS 模式携带本地数据集等冲突参数 |

返回给前端的错误信息应可读，但不得包含上游完整 body、请求头或 Key。浏览器应保留上一次成功结果，同时明确显示本次请求失败，不得把上一次结果标记为本次成功。

## 15. 前端改动边界

原则：尽量不改布局，只让现有前端接受新的统一数据。

必须检查并完成：

1. ORS 模式不要求选择 `poiDatasetId`；
2. 类别标签解析支持 `ors:group:*` 与 `ors:category:*`；
3. group 使用中文显示名，细分类允许英文回退；
4. `datasetId=null` 不导致校验或渲染失败；
5. `confidence=null`、`address=null`、`travelTimeSeconds=null` 正常显示；
6. Panmap 可按 `ring → group → category → POI` 下钻；
7. 面包屑返回时保留中心点、等时圈和其他圈层上下文；
8. Traditional Map 继续使用现有 `analysis-pois` GeoJSON source/layers；
9. 点击和 hover 仍通过 `poiId/categoryId/ringId` 双向联动；
10. 传统地图、泛地图和分屏切换不新建第二个 MapLibre 实例；
11. OSM/天地图切换不触发分析请求；
12. UI 可显示数据源、缓存状态、覆盖是否完整和明确错误；
13. UI 不显示或接触 ORS Key。

不得为 ORS POI 新建 DOM Marker，也不得一 POI 一 layer。

## 16. 测试要求

### 16.1 测试不得默认访问公网

普通单元测试和 CI 使用 fake HTTP transport 与最小合成 fixture。真实 ORS 测试必须显式通过类似 `RUN_ORS_LIVE_TESTS=1` 开启，默认跳过。

fixture 不得包含 Key、请求头或大批真实 POI 数据。

### 16.2 后端新增覆盖

至少测试：

- 10/20/30 分钟只形成一次 isochrone 请求；
- 坐标顺序固定为 `[lon, lat]`；
- `includePois=false` 不调用 ORS POI；
- ORS provider 不访问 local Repository；
- Overture provider 回归仍通过；
- UTM zone 选择、网格生成、求交、面积安全阈值；
- Polygon/MultiPolygon、空交集和细分；
- 发请求前预算检查；
- cell limit 命中后的递归细分与终止；
- 多 cell 合并和 OSM identity 去重；
- 稳定名称回退和无名称排除；
- 多分类唯一主路径和 alternates 隔离；
- 未知类别 diagnostics；
- `covers` 圈层归属和边界点；
- 统计先于 `POI_MAX_RESULTS`；
- 完全相同第二次分析零网络调用；
- 过期缓存失败降级 metadata；
- `403/429/timeout/5xx/invalid JSON/invalid schema` 错误映射；
- 日志和异常中不存在测试 Key；
- ORS 模式非空 `poiDatasetId` 的固定语义；
- 上游部分失败不返回成功半成品。

### 16.3 前端新增覆盖

至少测试：

- `datasetId=null`；
- ORS 两级 category tree；
- group 中文标签与 category 英文回退；
- POI GeoJSON stable id；
- category focus path 下钻和返回；
- Store 在请求失败后保留最近成功结果但不混淆状态；
- 下钻、hover、select、basemap、视图切换不触发 Analysis API；
- 单一 MapLibre 实例。

### 16.4 全量回归

沿用现有命令，并把实际命令和数量写入报告：

```bash
cd server
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app tests
```

前端继续执行全部 JavaScript 语法检查和当前 Node test 集合。若仓库已有统一 test script，优先使用统一命令，但不得只跑新增测试。

## 17. 真实验收顺序

必须按以下顺序执行，任一步失败先修复，不得跳到后面：

### 验收 1：基线

- 后端原有测试通过；
- 前端原有测试通过；
- Overture importer/Repository 回归通过；
- 工作树无无关文件被覆盖。

### 验收 2：小范围 ORS POI 冒烟

- Key 只确认存在；
- 500–2000 米内完成一次合法真实调用；
- 响应 schema 被正确解析；
- 不记录 Key；
- 记录调用次数和可用配额 header；
- 空结果按规则处理。

### 验收 3：武汉完整分析

使用项目当前已经确认的武汉中心：

- 一次 isochrone 请求得到 10/20/30 分钟面；
- 预先生成全部 POI cells；
- 全部 cell 在请求预算内完成；
- coverage 为 complete；
- POI 稳定去重并归入互斥 rings；
- CategoryNode 计数与返回 POI 一致；
- 页面显示真实等时圈、真实 POI 和类别树；
- 不要求 Overture dataset ready。

### 验收 4：缓存复跑

对完全相同参数再次分析：

- 结果领域内容一致；
- isochrone 和 POI cell 全部命中缓存；
- 上游网络请求数为 0；
- metadata 明确 cache hit；
- 下钻和视图操作继续为 0 请求。

### 验收 5：交互和出图

- 泛地图概览可见 10/20/30 分钟圈层；
- 可从 group 下钻到 category，再到 POI 标签；
- 返回上级后中心点、圈层和选择上下文不丢失；
- MapLibre POI 与 Panmap 标签双向高亮；
- 地图/泛地图/分屏切换稳定；
- 可用现有导出能力生成至少一张论文原型图；
- 浏览器 console 无未处理错误；
- Network 中无 Key，且交互阶段无多余 ORS 请求。

### 验收 6：巴黎非阻塞冒烟

仅当仓库已有已确认巴黎中心时执行同参数冒烟。没有确认中心时只记录待办，不猜测、不阻塞本阶段武汉完成。

## 18. 完成标准

只有同时满足以下条件，才能把本阶段标记为完成：

- ORS remote isochrone 和 ORS remote POI 均由后端调用；
- 武汉真实 10/20/30 分钟闭环通过；
- 最大等时圈使用安全分块，不是中心 2 km 假覆盖；
- `poiCoverage.complete=true` 有可审计依据；
- 相同分析第二次运行不消耗上游请求；
- ORS POI 已转换为统一领域契约；
- 分类下钻、返回、地图联动和导出可用；
- Overture 本地 provider 与全部旧测试仍可用；
- Key 未进入前端、日志、缓存、测试、报告或 Git；
- 全量测试通过；
- 已生成实施报告；
- 未进入本文禁止事项。

若真实 ORS POI 在研究区持续不可用、响应异常或配额不足，不得用 mock 冒充真实完成。应将阶段标记为“代码完成、真实验收阻塞”，列出错误码、时间、非敏感响应摘要、已用请求数和下一步。

## 19. 输出物

执行结束新增：

```text
docs/ors-migration/11-stage-5-ors-first-execution.md
docs/ors-migration/12-stage-5-ors-first-implementation-report.md
```

若本文是从仓库外下发的，先将本文原样保存为 `11-stage-5-ors-first-execution.md`，不要改写任务边界。

实施报告至少包含：

1. 基线与实际代码结构；
2. 修改文件清单及每个文件职责；
3. Provider 架构；
4. ORS 请求与缓存策略；
5. 等时圈面积、cell 数、真实请求数、cache hit 数；
6. POI received/deduplicated/unnamed/matched/returned 数；
7. ring/category 计数摘要；
8. 错误与配额处理；
9. 全部测试命令和结果；
10. 浏览器真实验收结果；
11. Key 泄漏检查；
12. Overture 回归结果；
13. 巴黎是否执行及原因；
14. 已知限制；
15. 明确声明未执行的后续事项。

不得在报告中放 Key、完整请求头、用户机器绝对路径或大段真实 POI 原始响应。

## 20. 强制停止

本阶段完成并提交实施报告后立即停止。

不要自动开始：

- Overture 正式数据下载或对比实验；
- 本地 ORS；
- 本地 OpenPOIService；
- Matrix 通行时间；
- 全国数据；
- 离线瓦片；
- 课题组服务器部署；
- 第 6 阶段。

等待用户审核真实运行结果和实施报告后再继续。
