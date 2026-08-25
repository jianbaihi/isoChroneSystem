# 第 24 号报告：Stage 6 POI 空间分片规划、预算与断点续跑

日期：2026-08-01  
执行范围：仅第 23 号文档  
执行模式：本地缓存 + 合成 fixture 离线 dry-run  
真实上游 API 预算：Isochrones 0、OpenPOIService 0、Matrix 0、Geocoder 0  
真实上游 API 实际调用：Isochrones 0、OpenPOIService 0、Matrix 0、Geocoder 0

## 1. 结论

第 23 阶段已完成。新增的纯规划器能对严格 WGS84 `Polygon/MultiPolygon` 进行本地投影分片，并在不调用上游的前提下给出稳定分片、面积审计、请求预算、审批门禁和指纹。同时实现了分片级原子缓存、原子 checkpoint、中止恢复、密集分片自适应细分以及不完整任务禁止发布。

- `foot-walking` 真实缓存几何：9.769486 km²，1 片，面积守恒，重叠 0，预算内；
- `driving-car` 真实缓存几何：1903.245963 km²，108 片，面积守恒，重叠 0；最小请求 108 + 自适应预留 27 = 上界 135，超过本地预算 20，状态为 `approval-required`，未执行；
- `cycling-regular` 没有匹配的真实缓存几何，按要求记为 `N/A`，没有联网补取；
- 所有真实上游请求计数为 0，没有执行任何 POI 分片请求。

## 2. 冻结基线与范围保护

第 22 号验收基线未改动：eligible 252，分圈 39/83/130；A 为 106/252；B 为 138/252，B 分圈 12/39、31/83、95/130；重叠 0、越界 0。10 分钟圈摆放率下降仍是已知问题。

本阶段没有修改 `app.js`、`index.html`、`panmap-layout.js`、`styles.css`、圈层 token、地图 adapter 或第 21 号布局/视觉编码；没有加入类别、评分或热度。工作区中进入本阶段前已存在的修改也没有回退、覆盖或清理。

第 23 号原文已归档到 `docs/ors-migration/23-stage-6-poi-spatial-batch-planner-execution.md`，与 Downloads 中原文逐字比对一致。

## 3. 分片策略与硬约束

- 当前 ORS 限制页将 POIs 的 Maximum Area 列为 50 km²；项目冻结更保守的单片安全上限 45 km²，默认目标面积 35 km²。来源：[ORS API Restrictions](https://openrouteservice.org/restrictions/)。
- 输入只接受有效 WGS84 `Polygon/MultiPolygon`；空几何、自交、坐标越界、重叠 MultiPolygon 都立即失败，不回退 bbox、buffer 或其他替代几何。
- 分片在当地 UTM 投影米制平面上完成，规则网格与外圈做 intersection；分片以 bbox 南北/东西顺序和几何 hash 稳定排序。
- `pieceId`、几何 hash、`planId` 和 `planFingerprint` 由标准化输入与冻结版本派生；同输入重复规划的顺序、ID 和指纹一致。
- 面积审计同时计算 `uncovered`、`outside`、`overlap` 和总面积差；超过 `max(0.01 km², outerArea×0.1%)` 容差则闭锁失败。
- 本地业务端点 `POST /api/v1/poi-query-plan` 仅返回 dry-run 规划，删除每片完整几何，并固定响应 `X-Upstream-Request-Count: 0`。

## 4. 真实缓存与合成 fixture 的来源差异

| 数据类型 | 来源 | 用途 | 能否代表新鲜上游结果 |
| --- | --- | --- | --- |
| 真实缓存 | 第 18/20 阶段已持久化的 ORS Isochrones FeatureCollection 外圈 | 黄鹤楼 600/1200/1800 秒真实几何规划 | 否；只代表该缓存的获取时点 |
| 合成 fixture | 本地 UTM 平面构造后反投影的矩形、MultiPolygon 和带孔多边形 | 45 km² 边界、分片、拓扑和面积守恒测试 | 否；不包含任何上游业务数据 |

真实缓存来源：

| profile | 本地缓存 | retrievedAt | SHA-256 |
| --- | --- | --- | --- |
| `foot-walking` | `data/generated/ors-cache/stage-5-name-cloud-resume-20260730/7ac868e340d37b39840472b3bb0108d63e07ee9794a8116e8239365404126e12.json` | `2026-07-30T14:34:00Z` | `3b062476fd772e6902069ab281d1afe7519a56c95b43aa4a63deac5e11e2be00` |
| `cycling-regular` | 无匹配缓存，`N/A` | — | — |
| `driving-car` | `data/generated/ors-cache/stage-5-live-validation/20260730T020216Z-be95b0fa/e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json` | `2026-07-30T02:02:22Z` | `9e82fa716a4036d5257d06b746de87a09e13bad09de751cd67259387fef3db3a` |

## 5. 真实缓存 dry-run 结果

| profile | 外圈面积 km² | 分片 | 最小/最大片 km² | 最小请求 | 自适应预留 | 审批上界 | 预算 | 状态 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `foot-walking` | 9.769486 | 1 | 9.769486 / 9.769486 | 1 | 1 | 2 | 20 | `within-budget` |
| `cycling-regular` | N/A | N/A | N/A | N/A | N/A | N/A | 0 上游 | `N/A` |
| `driving-car` | 1903.245963 | 108 | 0.000365 / 35.000000 | 108 | 27 | 135 | 20 | `approval-required` |

| profile | 计划面积 km² | 面积差 km² | uncovered km² | outside km² | overlap km² | 容差 km² | 守恒 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `foot-walking` | 9.769486 | 0 | 0 | 0 | 0 | 0.010000 | 是 |
| `driving-car` | 1903.245970 | 0.000007209 | 0.000021412 | 0.000028621 | 0 | 1.903246 | 是 |

稳定指纹：

- `foot-walking`：`8e38cc4f5da176d8e55001020b49df2d2ff1a87ec210106e3f013b58b68d2e9c`；
- `driving-car`：`4870cae7fde62285229e22fe35b13af21f794e4d40ed27fdccc7cb8b01030031`。

旧的 Stage 5 6 km 验证网格曾得到 94 个初始单元；本阶段使用冻结的 35 km² 目标面积、稳定投影锚点和严格 polygon intersection，因此产生 108 个可审计分片。这是规划策略差异，不是新的 POI 上游结果。

## 6. 合成 fixture 结果

| fixture | 拓扑 | 外圈 km² | 分片 | 最小/最大片 km² | overlap km² | 面积差 km² | 守恒 | 指纹 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| boundary-45 | Polygon | 45.000000 | 1 | 45.000000 / 45.000000 | 0 | 0 | 是 | `657a7c2ad20806e4b9a75555a9d781cd9372235bfd8ea763d1f1dced5d64c355` |
| boundary-45.1 | Polygon | 45.100000 | 4 | 2.776988 / 25.353834 | 0 | 0.000000164 | 是 | `9e5b6b228bfe39d3978716c1c322fb420bc9394250078fb738c290c9c5347e1a` |
| multipolygon-40 | MultiPolygon | 40.000000 | 2 | 20.000000 / 20.000000 | 0 | 0 | 是 | `ccb7a379b79f72da1209fee9e28e5e89240a0803670aea1050881d40f585446a` |
| complex-hole-115 | Polygon + hole | 115.000000 | 9 | 1.507654 / 30.000000 | 0 | 0.000000419 | 是 | `c16e96e6099274b5f1cd792ccd8f82acbadafad22bf87ac14d66d193448a9ccf` |

定向测试另覆盖 1、44.9、45、45.1、50 km² 边界：1/44.9/45 走单片快速路径，45.1/50 必须分片，所有单片均不超过 45 km²。

## 7. 预算、审批、配额与自适应状态机

- 预算上界 = 初始分片数 + `ceil(初始分片数 × 25%)`；超过请求预算只能返回规划，不能进入执行。
- 审批同时绑定 plan fingerprint、profile、中心点、ranges、最大请求数和有效期；输入或版本改变会使审批失效。
- quota 未知时仅允许已明确批准的单 profile，多 profile 闭锁；已知配额保留 20%；429 立即停止并保留 `Retry-After`；冻结并发度为 1。
- 当分片结果数等于 request limit 或 provider 报 truncated 时，父片转为 `superseded-by-children` 并稳定生成子片；达最大深度或最小面积后仍截断则记为 `incomplete-dense-piece`，不对外宣称完整。

## 8. 分片缓存、checkpoint 与断点续跑

- 缓存键包含 provider、标准化 geometry hash、POI filter、request limit、adapter version 和 normalization version；故意不包含 profile，因为 OpenPOIService 分片查询本身与交通方式无关。
- 每片响应先写同目录临时文件、`flush + fsync`，再以 `os.replace` 原子替换；缓存不保存 API Key 或认证 header。
- manifest 在每片状态变更后原子 checkpoint。恢复时 `completed/cache-hit` 保留，`running` 回到 `pending`，`failed` 最多再试 1 次；已完成分片不重跑。
- 只有所有有效 leaf 都是 `completed/cache-hit` 且未截断时才可发布合并结果。合并先按 source + 稳定 ID 去重，缺 ID 时才用名称 + 5 m 保守近邻；同名远距离 POI 保留，外圈之外 POI 丢弃并计审计数。
- 这里的 `fullyCovered` 只表示查询几何和分片任务完整，不表示现实世界 POI 绝对完整。

## 9. 零 API 证据与验证记录

离线取证脚本只使用 `pathlib/json/hashlib` 读取本地缓存，没有 HTTP client 或上游 adapter。主证据文件：

- `exports/stage-6-batch-planner/stage23-dry-run-plans.json`；
- SHA-256：`f4fde302826f4c8f7a6255fbab84141048465ebd51e8b55eafb1b3c91c02742b`；
- `mode=dry-run-only`；
- `upstreamApiBudget={isochrones:0, pois:0, matrix:0, geocoder:0}`；
- `upstreamRequestCount=0`；
- 每个真实缓存 profile 和合成 fixture 的规划也分别记录 `upstreamRequestCount=0`。

定向验证：

- `PYTHONPATH=server server/.venv/bin/python -m unittest server.tests.test_poi_batch_planner -v`：11/11 通过；
- `PYTHONPATH=server server/.venv/bin/python -m unittest server.tests.test_ors_remote_poi -v`：4/4 通过，使用 mock transport/本地临时缓存，真实 API 调用 0；
- 第 23 号归档与原文 `cmp`：通过；
- `git diff --check`：通过。

测试覆盖 Polygon/MultiPolygon/孔洞/无效几何、面积边界、面积守恒、无重叠、稳定 ID/排序/指纹、预算与审批绑定、quota/429、自适应细分、原子缓存、checkpoint/恢复、不完整禁止发布、保守去重和公开规划端点的零上游 header。没有运行完整浏览器验收、全量测试或长时间构建。

## 10. 本阶段实际修改/生成文件

- `server/app/services/poi_batch_planner.py`
- `server/app/main.py`（仅新增纯 dry-run 规划端点及导入）
- `server/tests/test_poi_batch_planner.py`
- `scripts/build_stage23_dry_run_plans.py`
- `docs/ors-migration/23-stage-6-poi-spatial-batch-planner-execution.md`（原文归档）
- `exports/stage-6-batch-planner/stage23-dry-run-plans.json`
- `docs/ors-migration/24-stage-6-poi-spatial-batch-planner-report.md`

## 11. 已知边界与停止

- 本阶段只创建可审计 dry-run 规划与执行前基础设施，没有开启真实分片执行器；
- `driving-car` 的 108/135 请求规模只是预算估算，没有获得执行批准；
- `cycling-regular` 保持 `N/A`，未以步行或驾车几何代替；
- 真实缓存规划只验证几何与任务完整性，不声称 POI 数据完整或时效；
- 本阶段未执行任何标签云调整。

第 24 号报告已完成。按第 23 号文档要求立即停止，不执行后续阶段或真实 API 请求。
