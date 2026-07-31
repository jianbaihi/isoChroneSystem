# 第 5 阶段补充执行文档：确认默认中心后的 ORS 真实闭环验收

状态：待执行  
适用基线：`11-stage-5-ors-first-execution.md` 已执行，`12-stage-5-ors-first-implementation-report.md` 状态为“部分完成”  
本次性质：补齐第 5 阶段真实服务验收，不是新阶段  
执行完成后：生成第 14 号报告并强制停止，不进入第 6 阶段

## 0. 给 Codex 的直接指令

继续当前项目第 5 阶段。用户已经明确确认以下研究输入，并授权将这些坐标及由其生成的查询几何发送给已经配置的 ORS Isochrones 与公共 OpenPOIService，用于真实验收：

- 武汉默认中心：黄鹤楼；
- 巴黎默认中心：埃菲尔铁塔；
- 交通方式：`driving-car`；
- 时间范围：10、20、30 分钟；
- 等时圈和开发阶段 POI 均使用在线 ORS/HeiGIT 公共 API；
- 地图瓦片与当前 MapLibre 底图保持不变。

本次只完成：

```text
确认中心配置
→ 基线回归
→ 武汉真实 POI 小范围冒烟
→ 武汉真实 10/20/30 分钟等时圈
→ 30 分钟外圈完整 POI 分块查询
→ 相同参数缓存零网络复跑
→ 浏览器交互与出图验收
→ 巴黎非阻塞跨城市冒烟
→ 最终回归与第 14 号报告
→ 强制停止
```

优先复用第 11 号文档已经实现的 Provider、缓存、网格、去重、分类和错误模型。不要重新设计系统，不要重写泛地图布局算法。只有真实验收暴露出明确缺陷时，才进行最小修复并补测试。

可以修改当前仓库内与本次验收直接相关的中心配置、业务代码、测试、配置示例和文档。不得提交、推送或创建 PR，不得连接或修改课题组服务器，不得读取或打印密钥值，不得下载 OSM、Overture、全国数据或离线瓦片。

## 1. 本文与第 11、12 号文档的关系

本文是第 11 号执行文档的补充验收单，不覆盖其架构和数据契约。

第 12 号报告已经确认以下代码工作完成，本次不得无理由重做：

- `ors_remote` Isochrones 与 POI Provider；
- ORS 请求缓存；
- UTM 投影、等时圈网格化、求交和面积检查；
- OpenPOIService 解析、稳定 OSM 身份、名称处理和类别目录；
- 多 cell 合并、去重、上游 limit 递归细分；
- 互斥圈层归属、统计与统一 metadata；
- Overture 本地 Provider 兼容路径；
- 前端 ORS 数据源、两级类别树和 `datasetId=null` 兼容；
- 后端 34 项与前端 12 项离线回归。

第 12 号报告不得被改写成“已完成”。完成本次执行后新增：

```text
docs/ors-migration/13-stage-5-ors-live-validation-execution.md
docs/ors-migration/14-stage-5-ors-live-validation-report.md
```

若本文从仓库外下发，先将本文原样保存为第 13 号文档。若目标路径已经存在且包含用户或其他任务的不同内容，不得覆盖，先报告冲突。

## 2. 已确认且冻结的中心

### 2.1 固定坐标

统一采用 WGS84（EPSG:4326），所有请求和 GeoJSON 坐标顺序固定为 `[longitude, latitude]`。

| ID | 显示标签 | 经度 | 纬度 | 请求数组 | 用途 |
|---|---|---:|---:|---|---|
| `wuhan-huanghelou` | `武汉·黄鹤楼` | `114.296944` | `30.546944` | `[114.296944, 30.546944]` | 默认中心、阻塞性完整验收 |
| `paris-eiffel-tower` | `巴黎·埃菲尔铁塔` | `2.294478` | `48.858297` | `[2.294478, 48.858297]` | 已确认的国外中心、非阻塞跨城市冒烟 |

坐标来源记录：

- 黄鹤楼：Wikidata `Q462372`，坐标 `30°32′49″N, 114°17′49″E`；
- 埃菲尔铁塔：Wikidata `Q243`，坐标 `48°51′29.87″N, 2°17′40.12″E`，其坐标声明引用法国官方地图。

这些坐标是本项目本轮确认的工程研究中心，不是测绘控制点。不要在运行时重新地理编码，不要用浏览器地图点击结果、搜索结果或近似城市中心覆盖它们。

### 2.2 中心与研究范围的关系

本次不预先填写武汉或巴黎研究 bbox。

```text
固定中心
→ ORS 真实 30 分钟累计等时圈
→ 该几何的 bbox 仅用于生成候选网格
→ 网格与真实等时圈求交
→ 相交面作为 POI 查询范围
```

不得把等时圈 bbox 本身当作最终研究范围，也不得用圆形、中心 2 km 或手工矩形冒充 30 分钟可达范围。

### 2.3 路网吸附边界

- 应先提交上表中的精确坐标；
- 保留“用户请求中心”作为应用中心点和结果 metadata；
- 允许 ORS 按公共服务的正常规则在路网内吸附；
- 不得在代码中静默改成景区入口、停车场或附近道路；
- 若 ORS 返回无法找到可路由点，记录脱敏错误并停止武汉真实验收；
- 只有用户另行确认新的驾车起点后，才允许更换研究中心。

## 3. 冻结运行参数

| 参数 | 固定值 |
|---|---|
| Analysis provider | 当前项目 ORS 真实分析路径 |
| Isochrone provider | `ors_remote` |
| POI provider | `ors_remote` |
| ORS profile | `driving-car` |
| Range type | `time` |
| Ranges | `[600, 1200, 1800]` 秒 |
| 互斥圈层 | `0–10`、`10–20`、`20–30` 分钟 |
| `includePois` | `true` |
| `poiDatasetId` | `null` 或省略 |
| POI 完整范围 | 30 分钟累计等时圈 |
| 单查询面安全上限 | 沿用 `45 km²` |
| 本次初始请求预算 | 沿用 `40` 个 POI cell 请求/analysis |
| 最大并发 | 沿用 `2` |
| 最终 POI 返回上限 | 沿用 `POI_MAX_RESULTS=600` |
| `travelTimeSeconds` | `null` |
| 地图 | 现有 MapLibre 与当前底图 |

不得为了让结果“更好看”临时改变中心、交通方式、时间圈层、类别、POI 最大返回量或布局随机种子。

## 4. 本次明确不做

- 不下载或构建本地 ORS 路网；
- 不部署 OpenPOIService；
- 不下载、导入或比较 Overture 正式数据；
- 不建立武汉或巴黎人工 bbox manifest；
- 不生成或替换地图瓦片；
- 不调用 Matrix、Directions、Geocoding 或其他新增 API；
- 不计算逐 POI 精确通行时间；
- 不接入 Yelp、高德、Overpass 或其他 POI 数据源；
- 不新增账号、后台、多用户、Kubernetes 或高可用；
- 不部署到课题组域名或服务器；
- 不扩展到全国、省级或其他交通方式；
- 不修改标签碰撞、候选点、KDE、包络线算法；
- 不开始 ORS 与 Overture 的正式论文对比实验；
- 不开始第 6 阶段。

## 5. 密钥、外部请求与隐私边界

### 5.1 本次允许的外部信息

仅允许向已配置的 ORS/HeiGIT 端点发送：

- 上述两个已确认中心坐标；
- `driving-car` 与 600/1200/1800 秒参数；
- 由真实 30 分钟等时圈确定性生成的 POI 查询 Polygon；
- OpenPOIService 所需的类别、limit 等非敏感参数；
- 服务端认证信息。

### 5.2 密钥要求

- API Key 只允许由服务端进程加载和使用；
- 执行器可以检查“是否配置”，不得输出值、长度、前缀、后缀或完整请求头；
- 不得用 `cat`、`grep`、`env`、shell trace 或调试日志显示 `.env` 内容；
- 不得把 Key 写入命令行参数、源码、前端、缓存键、测试 fixture、截图、报告或 Git；
- 不持久修改用户的真实 `.env`；使用进程级非敏感覆盖切换 Provider 和参数；
- 若当前应用不会自动加载 `.env`，通过项目已有的安全配置加载方式把凭据注入服务端进程，不复制到新文件；
- 浏览器只能请求本地后端，不得直接请求带 Key 的 ORS；
- 认证失败时报告统一错误码，不附上游完整 body。

本次授权允许应用进程使用已经配置的 Key 发出真实请求，但不授权执行器查看或披露 Key。

## 6. 阶段 A：只读预检与基线

按顺序完成：

1. 阅读第 11、12 号文档和当前代码，不凭报告猜测文件结构；
2. 检查工作树并记录用户已有改动，不覆盖无关文件；
3. 查找当前用户可见默认中心、分析请求默认中心和地图初始中心；
4. 明确“北京·望京中心区 / 望京广场”来自哪些文件；
5. 检查 ORS Provider、缓存、live flag、请求计数和错误映射的实际入口；
6. 检查缓存与真实响应目录是否被 Git 忽略；
7. 通过安全诊断确认 Key 仅为“已配置/未配置”；
8. 确认当前非敏感运行配置仍是 mock 或 ORS；
9. 运行完整离线基线回归；
10. 基线失败时先定位并只修复与本阶段有关的问题，不得开始真实请求。

至少运行：

```bash
cd server
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python -m compileall -q app tests
```

前端运行当前仓库的完整 Node 测试集合和全部 JavaScript 语法检查。报告中记录实际命令和测试数量，不得只写“测试通过”。

普通测试和 CI 必须继续默认零公网请求。真实请求必须由显式 live flag 开启。

## 7. 阶段 B：落实中心预设

### 7.1 默认中心

将用户可见和新分析请求的默认中心从北京望京改为：

```json
{
  "id": "wuhan-huanghelou",
  "label": "武汉·黄鹤楼",
  "longitude": 114.296944,
  "latitude": 30.546944
}
```

同时保存巴黎预设：

```json
{
  "id": "paris-eiffel-tower",
  "label": "巴黎·埃菲尔铁塔",
  "longitude": 2.294478,
  "latitude": 48.858297
}
```

要求：

- 只建立一个中心配置事实源，前端默认值、请求构造和测试从同一配置读取；
- 若现有架构前后端必须分别声明，增加一致性测试；
- 存储字段可以分为 longitude/latitude，但发送 ORS 时必须组装为 `[lon, lat]`；
- 不增加新的“城市管理”功能；
- 若已有中心选择器，只增加两个确认预设；
- 若没有中心选择器，武汉作为默认，巴黎只供 live harness 或现有参数入口使用；
- 北京望京不得继续作为用户默认值；
- 北京样本若是与本阶段无关的历史测试 fixture，可以保留，但必须明确不进入生产默认配置；
- 更改中心不得触发底图替换或第二个 MapLibre 实例。

### 7.2 中心测试

至少新增或更新测试：

- 默认 ID 为 `wuhan-huanghelou`；
- 武汉坐标精确为 `[114.296944, 30.546944]`；
- 巴黎坐标精确为 `[2.294478, 48.858297]`；
- 前端显示标签与请求中心一致；
- ORS 请求坐标顺序为 `[lon, lat]`；
- `poiDatasetId` 在 `ors_remote` 下为空；
- 切换或设置中心不会把经纬度互换；
- 用户默认配置中不存在望京标签或望京坐标。

## 8. 阶段 C：建立可审计的 live 验证运行

优先使用现有后端分析 API 完成端到端验证，而不是只用临时 `curl` 绕过业务代码。

若当前项目没有可复用的 live 验证入口，可以增加一个最小 harness，但必须满足：

- 默认不执行公网请求；
- 只有显式 `RUN_ORS_LIVE_TESTS=1` 或等价开关才运行；
- 通过当前 Settings、Provider、Analysis Service 和缓存实现执行；
- 不把 Key 作为参数；
- 输出只包含状态、计数、耗时、非敏感错误码和相对证据路径；
- 不输出完整请求/响应、POI 明细、请求头或绝对路径；
- 不把大批真实响应加入测试 fixture；
- 不把 live 测试加入默认 CI。

为本次验收使用新的、Git 忽略的缓存命名空间，不删除或覆盖用户已有缓存。例如：

```text
data/generated/ors-cache/stage-5-live-validation/<run-id>/
```

第一次武汉完整分析必须能够证明发生了真实网络请求；第二次完全相同分析使用同一命名空间证明零网络复跑。

## 9. 阶段 D：武汉真实验收

以下检查点必须顺序执行。前一步失败时先停止后续真实请求，避免消耗配额。

### Checkpoint D1：安全配置

确认但不打印：

- Key 已配置；
- Isochrone base URL/path 指向预期公共端点；
- POI base URL/path 指向预期公共端点；
- Provider 为 `ors_remote`；
- profile 为 `driving-car`；
- ranges 为 600/1200/1800；
- POI 请求预算为 40；
- 并发不超过 2；
- 缓存目录是本次新命名空间；
- 前端没有 Key。

任一项不符合，先通过进程级非敏感配置修正。不要改写真实密钥文件。

### Checkpoint D2：武汉小范围 POI 冒烟

通过现有 `OrsPoiClient`/Provider 使用武汉中心：

1. 先请求 500 米 Point buffer；
2. 合法空结果时扩大到 1000 米；
3. 仍为空时最多扩大到 2000 米；
4. 一旦获得合法非空或确认合法完整空响应即停止；
5. 不得超过三次，不得无限重试。

验证：

- HTTP 与认证成功；
- 响应为解析器支持的真实 GeoJSON/JSON 结构；
- 坐标有效；
- 稳定 OSM identity、名称和类别字段按真实响应解析；
- 无名称或无稳定身份按现有规则计入 diagnostics；
- 未知类别不导致崩溃；
- 可用时记录脱敏的 rate-limit remaining/reset；
- 日志、缓存键和报告中没有 Key。

若 2000 米仍为合法空结果，不把 mock 当真实结果。记录该数据事实后仍可继续等时圈和完整覆盖验证，但最终交互验收必须如实说明数据限制。

### Checkpoint D3：武汉真实等时圈

使用：

```json
{
  "locations": [[114.296944, 30.546944]],
  "range": [600, 1200, 1800],
  "range_type": "time"
}
```

通过当前 ORS Adapter 一次请求完成，并验证：

- 只发生 1 次 isochrone 上游请求；
- 返回 GeoJSON 至少能明确对应 600、1200、1800 秒三个累计面；
- 所有几何有效且非空；
- 30 分钟面包含或覆盖较短时间面应有的可达结构；
- 当前互斥圈层生成逻辑得到 0–10、10–20、20–30 分钟 rings；
- 不使用 bbox 或圆形替代；
- 中心 metadata 仍是用户确认的黄鹤楼坐标；
- 若服务拒绝该驾车起点，不静默换点。

### Checkpoint D4：请求前完整覆盖计划

在发出完整 POI cell 请求前先生成整个计划，并记录：

- 外圈 geometry type；
- 外圈 geodesic/投影面积；
- 外圈 bbox，仅作审计和网格生成；
- 使用的 UTM CRS；
- 初始格网数量；
- 与外圈相交后的查询面数量；
- 最大/最小/总查询面积；
- 每个查询面是否 `<=45 km²`；
- 预计初始 POI 请求数；
- 当前最大预算；
- 预计请求数是否在预算内。

若初始计划超过 40：

- 不发任何完整覆盖 POI 请求；
- 返回并记录 `POI_REQUEST_BUDGET_EXCEEDED`；
- 不临时减少 30 分钟范围；
- 不增大单面至超过 45 km²；
- 不擅自提高预算或消耗更多配额；
- 将阶段标记为真实验收阻塞，等待用户决定。

### Checkpoint D5：武汉完整 POI 覆盖

只有 D4 通过后才执行：

```text
每个相交查询面
→ 公共 POI API
→ cell 独立缓存
→ limit 命中时按既有规则确定性细分
→ 合并
→ 稳定 OSM identity 去重
→ 原始 30 分钟面 covers 复核
→ 互斥 ring 归属
→ 完整统计
→ 稳定限量
```

通过条件：

- 每个实际请求面 `<=45 km²`；
- 最大并发不超过 2；
- 全部 cell 成功或从完全相同 key 的允许缓存成功读取；
- 不存在未解决的 limit 截断；
- `poiCoverage.complete=true`；
- `outerRangeSeconds=1800`；
- `received/deduplicated/unnamed/invalid/matched/returned` 计数可解释；
- `returnedCount <= 600`；
- 每个返回 POI 恰好属于一个互斥 ring 和一条唯一主分类路径；
- `CategoryNode` 的 matched/returned/ring counts 与 POI 一致；
- `travelTimeSeconds/confidence/address` 的空值不导致失败；
- `source` 和 attribution 正确；
- 上游任一 cell 最终失败时整个分析失败，不返回半成品成功结果。

达到上游 cell limit 并递归后仍不能证明完整覆盖时，返回 `POI_UPSTREAM_TRUNCATED`，不得把 `complete` 设为 `true`。

### Checkpoint D6：完全相同参数缓存复跑

保持以下内容逐字节等价：

- 中心；
- profile；
- ranges；
- range type；
- includePois；
- category filters；
- POI limit；
- 分块配置；
- Provider；
- 缓存命名空间。

再次调用完整分析，并验证：

- isochrone 上游网络请求数为 0；
- POI 上游网络请求数为 0；
- 所需条目全部命中精确 cache key；
- 领域结果与第一次一致；
- 比较时允许忽略 `retrievedAt`、执行耗时和 rate-limit 等易变审计字段；
- metadata 明确记录 cache hit；
- 不能只根据“结果相同”推断零网络，应使用 HTTP transport 计数或等价可审计机制。

## 10. 阶段 E：浏览器、交互与出图

使用真实 ORS 配置启动本地后端和前端，通过浏览器实际验收，不得只检查接口 JSON。

### 10.1 页面初始状态

- 用户可见默认中心是“武汉·黄鹤楼”；
- 页面不再显示“北京·望京中心区 / 望京广场”作为默认；
- 交通方式为驾车；
- 时间圈层为 10/20/30 分钟；
- 数据源显示为 ORS 公共等时圈与 OpenPOIService；
- 不要求 ready Overture dataset；
- 地图仍使用当前底图。

### 10.2 真实内容

- 传统地图显示真实 10/20/30 分钟几何；
- 泛地图显示三个互斥圈层；
- 完整非空 POI 结果时显示真实类别树和 POI 标签；
- 合法完整空结果时显示明确空状态，不生成假标签；
- 数据源、缓存状态、覆盖完整性可见或可从结果 metadata 审计；
- 单一 MapLibre canvas/实例约束继续成立。

### 10.3 交互

在有真实 POI 时逐项验证：

- `ring → group → category → POI` 下钻；
- 面包屑逐级返回；
- 返回后中心、等时圈和其他圈层上下文不丢失；
- Panmap 标签与 MapLibre POI 双向 hover/selected；
- 地图、泛地图和分屏切换稳定；
- 底图切换不触发新的分析请求；
- 下钻、返回、hover、select 和视图切换均不触发 ORS 请求；
- 不创建第二个 MapLibre 实例；
- 浏览器 console 无未处理 error/warning；
- Browser Network 中没有 ORS Key。

### 10.4 出图

使用项目现有导出或截图能力至少生成一张真实武汉论文原型图，建议命名：

```text
exports/stage-5-live/wuhan-huanghelou-ors-live-overview.png
```

图中至少包含：

- 武汉·黄鹤楼中心语义；
- 10/20/30 分钟圈层；
- 真实 ORS POI 非空时的类别或标签内容；
- 当前数据源/参数能够在报告中对应。

不得为了填满版面加入 mock POI。若武汉真实 POI 完整结果为空，仍可导出空状态证据图，但不能把它描述为 POI 标签云完成图。

## 11. 阶段 F：巴黎非阻塞跨城市冒烟

武汉 D1–D6 完成后，使用已确认的巴黎中心执行一次同参数跨城市冒烟：

```json
{
  "locations": [[2.294478, 48.858297]],
  "range": [600, 1200, 1800],
  "range_type": "time"
}
```

本次巴黎只要求：

- 一次真实 isochrone 请求返回可识别的 10/20/30 分钟累计面；
- 500 米 POI 冒烟；合法空结果时可扩大到 1000、2000 米；
- 复用同一个 ORS Provider、OpenPOIService 解析器和两级分类目录；
- 坐标顺序正确；
- 不出现武汉、北京或中国特定硬编码；
- 不要求完成巴黎 30 分钟全范围 POI 网格；
- 不下载 Overture 巴黎数据；
- 不开展武汉—巴黎数据质量比较；
- 不要求生成巴黎正式论文图。

巴黎冒烟是非阻塞项。若武汉完成后遇到巴黎单独的路网、数据、配额或上游问题，应如实记录，不得反向把武汉改成未完成；也不得为了巴黎扩大本阶段范围。

若武汉真实 POI 为合法完整空结果而巴黎冒烟获得真实非空 POI，可使用巴黎补充验证类别下钻和双视图联动，但报告必须清楚区分：

- 武汉完成了哪些真实服务与覆盖验证；
- 武汉 POI 数据是否为空；
- 巴黎只承担了哪些交互补充验证。

## 12. 最终回归与泄漏检查

完成必要修复和真实验收后，再次执行全部后端、前端回归。

必须检查：

- 默认单元测试零公网；
- 后端完整测试通过；
- 前端完整测试通过；
- JavaScript/Python 语法或编译检查通过；
- Overture importer、SQLite/R-Tree、Repository 和 `overture_local` Provider 回归仍通过；
- mock 路径仍可用于离线测试；
- Git diff 中没有无关改动；
- tracked files、前端产物、报告和导出 metadata 中没有真实 Key；
- 缓存、真实响应、`.env` 和临时证据目录按既有规则被忽略；
- 报告不包含绝对机器路径、完整请求头或大段 POI 原始数据。

泄漏检查不得以“搜索实际 Key”的方式输出 Key。使用现有 secret scanner、tracked-file 审计和非敏感模式检查。

## 13. 错误与停止规则

以下任一情况发生时，不得用 mock 或旧缓存冒充真实完成：

| 情况 | 处理 |
|---|---|
| Key 未配置 | `ORS_API_KEY_MISSING`，停止真实请求 |
| 认证失败 | `ORS_AUTH_FAILED`，不自动重试 |
| 武汉中心无法吸附到驾车路网 | 记录非敏感错误，等待用户确认新起点 |
| 分钟配额触发 | 按第 11 号文档的受控规则处理，禁止请求风暴 |
| 每日配额不足 | `ORS_QUOTA_EXHAUSTED`，停止 |
| 请求前计划超过 40 | `POI_REQUEST_BUDGET_EXCEEDED`，零完整 POI 请求 |
| cell 递归后仍可能截断 | `POI_UPSTREAM_TRUNCATED`，不得 complete |
| 上游部分 cell 失败 | 整体失败，不返回成功半成品 |
| 响应 schema 与实现不兼容 | 最小修复解析器并补 fixture/test |
| 基线或最终回归失败 | 阶段不得标记完成 |
| Key 出现在前端、日志、报告或 tracked files | 立即停止并只报告泄漏位置类别，不回显值 |

允许使用 stale cache 的条件继续严格服从第 11 号文档：只能是完全相同 cache key，并在 metadata 标记 `stale=true`。但 stale 结果不能替代本次至少一次真实武汉网络闭环。

## 14. 完成判定

### 14.1 可标记“第 5 阶段完成”

必须同时满足：

- 默认中心已改为武汉·黄鹤楼，巴黎预设已保存；
- 坐标顺序和固定参数测试通过；
- 武汉真实 POI 小范围冒烟通过；
- 武汉一次真实请求得到 10/20/30 分钟等时圈；
- 武汉 30 分钟外圈 POI 查询通过安全分块完成；
- `poiCoverage.complete=true` 有审计依据；
- 真实 POI 的去重、圈层归属、分类和限量统计一致；
- 完全相同参数第二次运行上游请求数为 0；
- 浏览器真实验收通过；
- 至少生成一张真实武汉证据图；
- Overture 与 mock 回归未破坏；
- 全量测试通过；
- Key 未泄漏；
- 第 14 号报告完成；
- 未进入本次禁止事项。

### 14.2 必须标记“代码完成、真实验收阻塞”

出现以下任一情况：

- Key/认证/配额阻塞；
- 武汉中心无法用于 `driving-car`；
- 请求预算超过冻结值；
- 上游持续截断或部分失败；
- 武汉完整结果不能证明 coverage；
- 浏览器或缓存零网络复跑不能证明；
- 测试未全部通过；
- 武汉合法空 POI 导致真实 POI 交互无法完成，且巴黎也无法补充验证。

阻塞报告必须说明已通过和未通过的检查点、统一错误码、非敏感时间、已消耗请求数量和下一步所需决定。不得只写“API 有问题”。

巴黎非阻塞冒烟失败本身不阻止武汉满足完成标准，但必须写入报告。

## 15. 第 14 号报告要求

新增：

```text
docs/ors-migration/14-stage-5-ors-live-validation-report.md
```

报告至少包含：

1. 最终状态：完成或真实验收阻塞；
2. 实际执行日期与代码基线；
3. 中心配置及 `[lon, lat]` 值；
4. 望京默认值的处理结果；
5. 修改文件清单和每个文件职责；
6. Key 安全加载方式，只描述机制；
7. 离线基线测试命令和数量；
8. 武汉小范围 POI 冒烟的半径、请求数与结果状态；
9. 武汉等时圈请求数、geometry 类型、三个 range 验证；
10. 30 分钟外圈面积、bbox、UTM CRS、cell 数和最大 cell 面积；
11. 完整查询真实请求数、递归细分数、cache hit 数；
12. POI received、deduplicated、unnamed、invalid、matched、returned；
13. 各互斥 ring 的返回数量；
14. 顶层 category group 数和主要计数摘要；
15. `poiCoverage.complete` 的证据；
16. 第二次运行零网络请求的证据；
17. 浏览器交互逐项结果；
18. 导出图的仓库相对路径；
19. console、Network 与单 MapLibre 实例结果；
20. 巴黎冒烟是否执行及结果；
21. Overture/mock 回归结果；
22. Key 泄漏检查结果；
23. 已知限制与未完成项；
24. 明确声明未进入第 6 阶段及其他禁止事项。

不得在报告中写入：

- API Key 或其任何片段；
- 完整 Authorization header；
- `.env` 内容；
- 完整上游错误 body；
- 大段真实 POI 原始响应；
- 用户机器绝对路径；
- 无法复核的“全部正常”式结论。

## 16. 官方边界与坐标参考

执行时以最新官方文档和真实响应为准：

- ORS Isochrones：  
  https://giscience.github.io/openrouteservice/api-reference/endpoints/isochrones/
- ORS/OpenPOIService POI：  
  https://giscience.github.io/openrouteservice/api-reference/endpoints/poi/
- 公共 API restrictions：  
  https://openrouteservice.org/restrictions/
- 配额重置与 Key 服务端使用：  
  https://giscience.github.io/openrouteservice/frequently-asked-questions.html
- 黄鹤楼坐标：  
  https://www.wikidata.org/wiki/Q462372
- 埃菲尔铁塔坐标：  
  https://www.wikidata.org/wiki/Q243

已核对的公共边界包括：

- Isochrones 支持多个精确 range；
- driving isochrone 公共上限高于本次 30 分钟；
- POI Polygon 最大面积为 50 km²；
- POI Point 最大半径为 2 km；
- API Key 不应放在客户端；
- ORS/GeoJSON 使用 `[longitude, latitude]`。

若执行时官方限制或真实响应已经变化，应：

1. 记录变化及官方来源；
2. 优先修改适配层和测试；
3. 不放宽密钥和完整性要求；
4. 不悄悄缩小研究范围；
5. 超出本文边界时停止并请用户决定。

## 17. 强制停止

完成第 14 号报告后立即停止。

不要自动开始：

- Overture 正式数据获取、导入或对比；
- Paris 30 分钟完整 POI 获取；
- 本地 ORS/OpenPOIService；
- Matrix 通行时间；
- 天地图或离线瓦片工作；
- 全国数据；
- 课题组服务器部署；
- 第 6 阶段。

等待用户审核第 14 号报告和真实导出图后再继续。
