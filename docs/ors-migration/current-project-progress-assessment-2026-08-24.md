# ORS 泛地图项目当前进度评估与下一步方案制定依据

更新日期：2026-08-24（Asia/Shanghai）  
评估工作区：`/Users/zhangzhihan/isoChroneSystem-main`  
当前结论：**已执行至第 11 阶段、第 60 号交付；状态为 `blocked-needs-decision`，尚未进入第 12 阶段。**

## 1. 文档目的

本文基于当前工作区中的源代码、阶段报告、测试记录和结构化导出证据，对项目已完成能力、未完成事项、当前阻塞和下一步可选路线进行汇总，供后续方案评审、请求预算审批和实施排期使用。

本文不会把“代码存在”“离线测试通过”“Provider 配置就绪”和“真实上游闭环完成”混为同一进度。涉及 ORS/OpenPOIService 的结论按以下四级口径记录：

1. 已实现；
2. 已离线验证；
3. 已真实上游验证；
4. 已完成浏览器端到端验收。

## 2. 执行摘要

项目已经从早期静态泛地图演进为一套前后端分离的 ORS 分析系统，具备等时圈、POI、Matrix 精确时间归类、传统地图/泛地图联动、普通/研究模式、布局实验和缓存复跑能力。

目前已经完成：

- FastAPI 后端、统一内部数据契约和 Provider 隔离；
- ORS Isochrones、Matrix、Geocoder 与 OpenPOIService 接入；
- 步行真实端到端闭环；
- 骑行真实端到端闭环及发布字段归一化；
- 泛地图统一工作台、传统地图、地图选点、普通/研究模式；
- 多种径向/环形布局、自然包络、方向保持与研究评估能力；
- 驾车 30 分钟大范围的 V2 POI 分片算法、生产 Payload 和 MultiPolygon 回退方案的离线验证。

目前尚未完成：

- 驾车模式的真实 POI 获取；
- 驾车 POI 对应的 Matrix 批处理；
- 驾车完整 Analysis Result 发布；
- 驾车普通/研究模式浏览器验收与缓存零上游复跑；
- 巴黎等其他城市、类别聚类、评分热度、正式部署等后续范围。

当前阻塞不是几何算法或测试失败，而是 OpenPOIService POI 配额快照为 `remaining=null`，无法满足既定的“Canary 前确认剩余量不少于 10”门禁。因此，第 60 号报告没有发送 Canary，也没有开始完整 POI 抓取。

## 3. 阶段进度总览

| 阶段 | 主要目标 | 当前状态 | 可信度/证据口径 |
| --- | --- | --- | --- |
| 第 1–4 阶段 | 现状审计、内部契约、后端骨架、地图接入 | 已完成 | 代码、测试、阶段报告 |
| 第 5–6 阶段 | ORS 在线接入、POI、Matrix、配额、批处理、多交通方式编排 | 已完成基础能力 | 代码、离线测试、部分真实请求报告 |
| 第 7–8 阶段 | 泛地图控制、双径向布局、自然包络、研究模式和方向保持 | 已完成 | 前端实现、截图和自动测试 |
| 第 9 阶段 | 步行真实点击链路、统一工作台、UI 收口和地图选点 | 已完成 | 真实上游与浏览器端到端验收 |
| 第 10 阶段 | 骑行真实点击链路和 POI 精确时间字段归一化 | 已完成 | 真实缓存、浏览器验收、发布契约测试 |
| 第 11 阶段 | 驾车真实链路、大范围 POI 分片与 Provider 契约验证 | 部分完成、当前阻塞 | Isochrone 缓存真实；分片/Payload 离线完成；POI/Matrix 未执行 |
| 第 12 阶段及以后 | 尚无已执行交付 | 未开始 | 当前工作区没有对应完成报告 |

## 4. 已完成的产品与技术能力

### 4.1 后端与数据边界

- 浏览器只调用本地 FastAPI，不直接持有 ORS Key。
- ORS 和 OpenPOIService 原始响应在后端 Adapter/Provider 层转换，不渗透到前端视图契约。
- 支持 `foot-walking`、`cycling-regular` 和 `driving-car` 三种 profile。
- 支持 10/20/30 分钟累计等时圈，并转换为前端需要的互斥圈层。
- 支持 POI 空间查询、Matrix 单源多目标精确时间计算和按路网时间重新归圈。
- 具备请求账本、缓存、过期缓存策略、配额状态、失败关闭和发布结果归一化。
- 相同参数缓存复跑可以避免重复上游请求；步行和骑行已有相应验收证据。

### 4.2 前端与交互

- 传统地图和泛地图消费同一份分析结果。
- 支持中心点预设、地图选点、交通方式切换和 10/20/30 分钟圈层展示。
- 普通模式和研究模式共用一个工作台、一个 SVG 画布和同一份在线结果。
- 支持双径向、紧凑环形、平衡环形、方向保持布局和自然包络。
- 研究模式具备布局算法、密度和评估信息，但不会因视觉切换重新调用 ORS。
- 已实现分析状态机与失败保留策略，避免 POI 或 Matrix 中途失败覆盖上一次完整结果。

### 4.3 步行真实链路

第 46 号报告状态为 `completed`。黄鹤楼步行 10/20/30 分钟链路已经完成：

`Isochrones → 外圈 Polygon POI → Matrix → 精确时间圈层 → 传统地图/泛地图发布`

该阶段记录的首次新增上游请求为 Isochrones 0（缓存）、OpenPOIService 1、Matrix 1；相同参数复跑五类上游请求均为 0。报告记录 284 个总 POI、254 个 eligible POI，以及 39/85/130 的三个 Matrix 圈层。

### 4.4 骑行真实链路

第 52 和第 54 号报告状态均为 `completed`。已完成：

- `cycling-regular` 的真实点击链路；
- 2413 个 POI 与 Matrix 记录的唯一 `poiId` Join；
- 1800 个 eligible、613 个 out-of-range；
- 127/433/1240 的三个精确时间圈层；
- `publishedResultSchemaVersion: 2.0`；
- POI 顶层 `travelTimeSeconds`、`networkDistanceMeters`、Matrix 状态和空间审计字段归一化；
- 普通/研究模式切换、视图状态保持及零上游缓存复跑。

### 4.5 驾车已完成部分

驾车 10/20/30 分钟真实 ORS Isochrone 缓存可以解析，面积分别约为：

| 阈值 | 面积 |
| --- | ---: |
| 10 分钟 | 79.968867 km² |
| 20 分钟 | 614.277845 km² |
| 30 分钟 | 1903.245963 km² |

V1 固定网格方案需要 93 个 POI 单元，超过原 48 次请求门禁。第 58 号报告随后完成 V2 平衡递归分片：

- 理论最小片数：`ceil(1903.245963 / 45) = 43`；
- 实际片数：43；
- 每片约 44.261534 km²，均不超过 45 km²；
- 0 个小于 1 km² 的碎片；
- 连续运行 5 次，片数、ID、Geometry Hash、指纹和排序一致；
- 冻结计划指纹：`633aa700d21cc7582b77dea610a5e43a2bf35c7b382df6bbb48a6b90a941efd0`。

第 60 号报告进一步完成：

- 43 个生产 Payload 的离线 Schema、面积和复杂度校验；
- 38 个 Polygon、5 个 MultiPolygon 的真实计划结构审计；
- 5 个 MultiPolygon 共 15 个 component；
- Provider 不支持 MultiPolygon 时的 53 个 Polygon 回退计划；
- Canonical 几何与 WGS84 JSON round-trip 两层覆盖审计；
- Payload 清单不包含 Key 或 Authorization。

这些结果证明驾车 POI 查询在几何和请求载荷层面已经具备执行条件，但不代表真实 POI 查询已经完成。

## 5. 当前阻塞与未完成链路

### 5.1 直接阻塞

当前 `/api/v1/quota` 的历史证据中，POI 配额为：

```text
pois.remaining = null
status = unknown
```

第 59/60 号任务要求每次 Canary 前确认 `remaining >= 10`。由于无法从现有配额接口得到合规余量，三项 Canary 均未发送：

1. 控制 Polygon；
2. 两部件 MultiPolygon；
3. 五部件 MultiPolygon。

因此仍不能确认 OpenPOIService 当前是否接受 MultiPolygon，也不能在 52 请求预算和 64 请求预算之间做最终选择。

### 5.2 尚未执行的真实工作

| 工作项 | 当前状态 |
| --- | --- |
| 驾车 POI Canary | 0/3，未发送 |
| 43 单元 MultiPolygon 方案 | 未批准、未执行 |
| 53 单元 Polygon 回退方案 | 已离线生成，未批准、未执行 |
| 自适应截断/细分请求 | 仅有条件预算，未执行 |
| 驾车 POI 候选数量 | 未知 |
| 驾车 Matrix 批次 | 未批准、未执行 |
| 驾车 Analysis ID | 未生成 |
| 驾车发布结果 | 未生成 |
| 驾车产品截图和浏览器验收 | 未执行 |
| 驾车相同参数零上游复跑 | 未执行 |

## 6. 测试与证据状态

最新第 60 号报告记录：

- JavaScript 全量测试：114 passed，0 failed；
- Python 全量测试：139 passed，0 failed；
- 第 59 号新增 23 项测试，覆盖生产 Payload、MultiPolygon、Polygon 回退、双层覆盖审计、Canary 上限、无重试、缓存隔离及零 Matrix 副作用；
- 驾车真实 POI/Matrix 的端到端测试未执行，不能由离线测试替代。

主要依据文件：

- `46-stage-9-ors-walking-clickthrough-live-report.md`
- `48-stage-9-panmap-unified-workspace-report.md`
- `50-stage-9-panmap-shell-polish-map-picking-report.md`
- `52-stage-10-ors-cycling-clickthrough-live-report.md`
- `54-stage-10-cycling-published-poi-time-normalization-report.md`
- `56-stage-11-ors-driving-clickthrough-live-report.md`
- `58-stage-11-driving-poi-partitioner-v2-feasibility-report.md`
- `60-stage-11-openpoiservice-multipolygon-contract-gate-report.md`
- `exports/stage-11-openpoiservice-contract-gate/`

## 7. 当前运行环境状态

2026-08-24 本地运行检查确认：

- 前端：`http://127.0.0.1:5500`；
- 后端：`http://127.0.0.1:8000`；
- `environment=development`；
- `mode=ors`；
- Isochrones、Matrix、Geocoder 和 POI 均显示 `configured`；
- `networkAllowed=true`；
- `mockFallback=false`；
- `networkProbePerformed=false`。

该结果只证明本地 `.env` 配置完整、后端准备就绪，不证明当前 Key 的真实配额、OpenPOIService MultiPolygon 契约或完整驾车链路已经成功。

## 8. 风险与工程注意事项

### 8.1 上游配额与成本风险

驾车 30 分钟外圈达到 1903.25 km²，POI 请求规模明显高于步行和骑行。即使基础请求只有 43 或 53 次，若单元返回数量达到 2000 上限，还可能触发截断与递归细分。POI 总候选数未知，因此 Matrix 目的地数量和批次也未知。

### 8.2 Provider 契约风险

MultiPolygon 支持尚未经过真实 Canary 验证。若不支持，需要使用 53 个 Polygon 单元的保守回退方案，并增加请求预算。

### 8.3 数据新鲜度风险

步行、骑行和驾车部分结论依赖历史真实缓存。缓存复跑能够证明输入与处理幂等，但不代表 2026-08-24 的实时路网或 POI 数据没有变化。

### 8.4 工作区与版本控制风险

当前目录不是有效 Git 仓库，无法获得当前 HEAD、分支、Diff 或验证 `.env` 的实际 Git 忽略状态。旧阶段报告中的仓库路径为 `/Users/zhangzhihan/Desktop/项目的UI界面`，与当前工作区路径不同；后续执行前应明确当前目录是否为一次拷贝，以及它与历史仓库的版本关系。

当前还存在 `server/.env.save` 文件。它可能是凭据备份，应确认是否需要保留，并确保权限至少为 `600`；不要将 `.env`、`.env.save`、Key 或 Authorization 内容写入报告、截图、提交或请求缓存。

## 9. 下一步可选方案

### 方案 A：保持严格门禁，先取得配额依据（推荐）

目标：不改变既有安全规则，先从 ORS/OpenPOIService 控制台、官方配额页面或其他可信来源确认 POI 可用余量不少于 10。

随后只执行最多 3 次、无自动重试的 Canary：

1. Polygon 控制请求；
2. 两部件 MultiPolygon 请求；
3. 五部件 MultiPolygon 请求。

根据结果选择：

- 支持 MultiPolygon：批准 43 个基础请求 + 9 个自适应预留，总预算 52；
- 不支持 MultiPolygon：批准 53 个基础请求 + 11 个自适应预留，总预算 64。

优点是审计链完整、风险最低；缺点是需要先取得外部配额依据。

### 方案 B：修改 Canary 门禁

由项目负责人明确批准：允许在配额为 `unknown` 时，以最多 3 次、无重试、可立即停止的 Canary 请求探测契约。

该方案必须在新执行文档中明确：

- 为什么允许覆盖原 `remaining >= 10` 门禁；
- 最大请求数为 3；
- 每个请求前后记录非敏感账本；
- 401/403/429/5xx 或异常响应立即停止；
- 不串联完整 POI、Matrix 或发布流程。

优点是可以快速解除 Provider 契约不确定性；缺点是配额未知时仍会消耗请求，且属于对既有门禁的显式变更。

### 方案 C：暂缓驾车，转向不依赖大规模上游请求的工作

可选范围包括：

- 恢复正式 Git 仓库和版本基线；
- 完善本地启动、配置和凭据管理；
- 增加部署方案、监控、日志与缓存运维设计；
- 设计巴黎/其他城市的数据预算与验收门禁，但不实际请求；
- 完善类别聚类、评分热度或研究输出的离线设计；
- 对当前 UI、无障碍、性能和大数据量渲染进行离线审计。

优点是不消耗 POI/Matrix 配额；缺点是驾车核心闭环继续保持未完成。

### 不建议方案

- 用 bbox、固定半径或骑行外圈替代真实驾车 30 分钟 Polygon；
- 放宽 45 km² 单片上限来压缩请求数；
- 静默减少 POI 或以 mock 数据冒充真实驾车完成；
- 在未知配额下直接执行 43/53 个正式 POI 请求；
- 在 POI 数量未知时预先宣称 Matrix 40 批足够；
- 将离线测试通过描述为真实驾车端到端完成。

## 10. 建议的下一阶段执行顺序

如果目标是尽快完成驾车真实闭环，建议按以下顺序制定第 61 号执行文档：

1. 恢复或确认 Git 仓库基线，记录当前代码与历史报告对应关系；
2. 处理 `server/.env.save` 凭据备份风险；
3. 决定采用方案 A 还是方案 B；
4. 冻结 43 单元计划指纹和 53 单元回退计划；
5. 执行最多 3 次 Canary，确认 MultiPolygon 契约；
6. 根据 Canary 结果审批 52 或 64 的 POI 请求预算；
7. 正式 POI 获取，记录截断、去重、缓存、候选数量和实际请求数；
8. POI 成功后再独立规划 Matrix，依据真实候选数审批批次；
9. 完成 Matrix、精确时间归圈和发布结果；
10. 执行普通/研究模式、交通方式往返、错误保留和相同参数零上游复跑验收；
11. 生成结构化账本、截图、哈希和最终报告；
12. 第 11 阶段完成后，再决定是否进入第 12 阶段。

## 11. 方案制定前需要明确的决策

1. 是否坚持 `remaining >= 10` 的 Canary 前置门禁？
2. 若配额仍为 unknown，是否允许最多 3 次无重试 Canary？
3. MultiPolygon 支持时，是否批准 POI 总预算 52？
4. MultiPolygon 不支持时，是否批准 POI 总预算 64？
5. POI 返回数量确定后，Matrix 的单独批次和目的地上限是多少？
6. 是否继续使用黄鹤楼驾车 30 分钟、1903.25 km² 的完整研究范围？
7. 当前工作区是否应恢复为正式 Git 仓库后再执行真实请求？
8. 第 11 阶段完成后的第一优先级是其他城市、类别研究、部署，还是 UI/性能优化？

## 12. 最终判断

当前项目的基础架构、步行链路、骑行链路、泛地图 UI 和研究布局已经形成可运行且有证据支撑的系统。第 11 阶段的驾车问题也已经从“93 个碎片导致不可执行”推进到“43 个理论最小单元、53 个兼容回退单元”的可审批状态。

项目现在最需要的不是继续修改分片算法，而是做出一项明确的上游使用决策：**如何在配额未知的情况下验证 OpenPOIService MultiPolygon 契约，以及批准多少真实 POI/Matrix 请求预算。** 在该决策作出之前，应保持第 11 阶段为部分完成，不进入第 12 阶段，也不把离线证据表述为真实驾车闭环。
