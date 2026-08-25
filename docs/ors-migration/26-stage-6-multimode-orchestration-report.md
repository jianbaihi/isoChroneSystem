# 第 26 号报告：Stage 6 多交通方式 POI 与 Matrix 分批编排

日期：2026-08-01  
执行范围：仅第 25 号文档  
主验收模式：已有真实缓存 + 明确标记的合成 fixture  
真实上游 API 预算：Isochrones 0、OpenPOIService 0、Matrix 0、Geocoder 0  
真实上游 API 实际请求：Isochrones 0、OpenPOIService 0、Matrix 0、Geocoder 0

## 1. 结论

第 25 阶段已完成。多方式编排能力已实现，新的三方式 live 数据尚未执行。

- `foot-walking`：使用第 20/22 号已有真实缓存派生数据；外圈 9.769486 km²、1 个 POI 分片，282 个已缓存目的地在新的 500 默认下形成 1 个 Matrix 计划批次，未请求上游；
- `cycling-regular`：无匹配真实缓存，真实状态仍为 `N/A`，未联网补取；测试中的骑行 POI/Matrix 只是合成编排 fixture，不是武汉真实数据；
- `driving-car`：使用已有真实缓存外圈做计划引用；外圈 1903.245963 km²、108 片，最小 POI 请求 108、自适应预留 27、审批上界 135，仍为 `approval-required`，一片都未执行；测试中的驾车 Matrix 也只是合成 fixture。
- 第 21 号标签云算法、字号、颜色、透明度、sprite-board 和稳定指纹规则均未改动。

## 2. 冻结基线与官方能力边界

第 24 号验收数据原样保留：

| profile | 真实缓存外圈 | POI 分片 | 真实状态 |
| --- | ---: | ---: | --- |
| `foot-walking` | 9.769486 km² | 1 | 已有缓存 |
| `cycling-regular` | N/A | N/A | 缺少真实缓存，不联网 |
| `driving-car` | 1903.245963 km² | 108 | `approval-required` |

ORS 当前服务页列出 car、bicycle、walking/hiking、wheelchair 和 HGV 等路网 profile，没有与本项目这套等时圈/Matrix 链路对应的公交、地铁、火车、高铁或飞机 profile：[ORS Services](https://openrouteservice.org/services/)。因此项目只启用步行、骑行和驾车；其他方式返回“当前数据源不支持”，不做 profile 替换。

Matrix 能力集中在 `provider_capabilities.py`：官方上限 3500 origin×destination pairs、项目默认 500 destinations/批、并发度 1、超时 60 秒。本阶段不用 dynamic arguments。限制依据：[ORS API Restrictions](https://openrouteservice.org/restrictions/)。

## 3. 三 profile 状态机与数据隔离

每个 profile 独立保存 `job-{profile}.json`、`result-{profile}.json`、jobId、fingerprint、POI piece checkpoint、Matrix batch checkpoint 和 progress；前端对应使用：

```text
resultsByProfile[profile]
jobsByProfile[profile]
activeProfile
```

统一状态链：

```text
draft
→ planning
→ awaiting-approval（需要时）
→ fetching-isochrone
→ fetching-pois
→ merging-pois
→ fetching-matrix
→ assigning-rings
→ layout-ready
→ completed
```

任何执行状态可闭锁进入 `partial/failed/cancelled`，非法跳转立即失败。`completed` 只能由 `layout-ready` 原子发布，并要求：

- result.profile 与 job.profile 相同；
- POI `fullyCovered=true`；
- Matrix 可达/不可达/非法计数守恒；
- 当前 jobId 与响应 jobId 相同。

隔离证据：

- 步行、骑行、驾车的 Matrix plan fingerprint 和 batchId 均包含 profile，同 POI/坐标也不会产生相同 Matrix 身份；
- Matrix adapter endpoint 分别是 `/v2/matrix/foot-walking`、`/cycling-regular`、`/driving-car`；返回 accessibility 带同一 profile；
- Matrix 合并拒绝顺序错位、profile 串用或未完成批次；
- 前端切换 profile 只读该 profile 已完成结果；无结果时清空传统地图分析图层并显示“尚未生成”，不继续显示另一 profile 数据；
- 切换后 selectedPoiId 若不在新 profile 中则清空，不删除其他 profile 缓存。

合成隔离 fixture 只用于验收：骑行 3 个目的地得到 2 ok + 1 unreachable，驾车 3 个目的地得到 3 ok + 1 out-of-range；两者指纹、分圈和 summary 完全独立。这些值不是武汉真实数据。

## 4. 完整编排顺序

单 profile 固定顺序如下，前一步不完整时不得发布后一步：

1. 读取当前 profile 完整 isochrone；
2. 取同 profile 最外层 geometry；
3. 生成或读取 POI query plan，验证 fingerprint 与预算；
4. 预算超限则停在 `awaiting-approval`；本次驾车固定停在此处；
5. 串行处理 pending POI leaf pieces，每片缓存并 checkpoint；
6. 全部 leaf 完成后才合并、去重和 coverage 审计；
7. POI 按 poiId 稳定排序，根据同 profile 生成 Matrix batches；
8. 每批显式 `sources=["0"]`、`destinations=["1", ...]`，严格验证 1×N 维度与 poiId 顺序；
9. 所有 Matrix batch 完成后按 poiId 合并；null 单点标记 unreachable，HTTP/维度失败则整批 failed；
10. 仅使用该 profile Matrix duration 分配 10/20/30 分钟圈、out-of-range 和 unreachable/invalid；
11. 计数守恒后进入 `layout-ready`，标签云读取该 profile 自身的布局缓存；
12. 原子发布为 `completed`。

POI 原始分片缓存仍按 geometry hash 而非 profile 复用；但合并后 inclusion、Matrix accessibility、ring 和 layout 始终按 profile 隔离。

## 5. Matrix 稳定分批结果

公式：

```text
maxDestinations = floor(3500 / sourceCount)
batchSize = min(500, maxDestinations)
batchCount = ceil(destinationCount / batchSize)
```

本项目 `sourceCount=1`，没有将 locations 数量平方。

| 目的地数 | 批次数 | 批次分布 |
| ---: | ---: | --- |
| 0 | 0 | 无请求 |
| 1 | 1 | 1 |
| 499 | 1 | 499 |
| 500 | 1 | 500 |
| 501 | 2 | 500 + 1 |
| 1000 | 2 | 500 + 500 |
| 3501 | 8 | 500 × 7 + 1 |

第 20 号步行基线的 282 个目的地产生 1 个新编排计划批次：

- Matrix plan fingerprint：`29983c70c9055d8d6b90c8c405fb93a45f9ba577fb37ef1736a4607a2012902e`；
- 输入基线 SHA-256：`c1ac3a837cf96bd576ad5ed6ac228be78d88da706c0c5db04d35194f14e4d51b`；
- 新 Matrix 上游请求：0。

## 6. 中止恢复、缓存命中与过期响应

- POI piece 和 Matrix batch 每个完成项均原子 checkpoint；
- 恢复时 `completed/cache-hit` 保留，`running` 转为 `pending`，不重复已完成工作；
- 中止 profile 标记 `partial`，不冒充 `completed`；
- 后到响应必须同时匹配 profile + 当前 jobId；旧 jobId 响应直接忽略，不覆盖当前 job 或已发布结果；
- 页面打开、profile 切换和恢复只读 Store/本地 manifest，测试安装了禁止网络的 fetch 计数器，切换计数为 0；
- 429 与 502/503/504 最多重试 1 次，重试计入批准 Matrix 预算；400/401/403/413 不重试，取消后不重试，预算耗尽不重试。

## 7. “准备全部交通方式”与 UI 行为

低优先级入口“准备全部交通方式”已加入。它只将已有缓存/缺失状态写入本地计划摘要：

| profile | 来源 | 准备结果 |
| --- | --- | --- |
| 步行 | 已有真实缓存 | 1 片，计划摘要，不执行 |
| 骑行 | 无匹配真实缓存 | `N/A`，不联网 |
| 驾车 | 已有真实外圈缓存 | 108/27/135，`approval-required`，不执行 |

准备指纹：`38c29d6093fd81d4e30eb5a289099d3e270f529ad2e58cbde9c28d2331f70d05`。结果固定 `mode=prepare-only`、`approved=false`、`executed=false`、`upstreamRequestCount=0`。

交通方式按钮仍只包含步行/骑行/驾车。公交、地铁、火车、高铁、飞机的能力检查均返回 `enabled=false / 当前数据源不支持`，不显示为可用按钮。

## 8. 零 API 证据与数据来源披露

证据文件：`exports/stage-6-multimode/stage25-zero-api-evidence.json`  
SHA-256：`b78f6d49e7f218016e5179420acc04f1d1599f0c86001aaddf11061181ea69cb`

| 服务 | 预算 | 实际真实请求 |
| --- | ---: | ---: |
| Isochrones | 0 | 0 |
| OpenPOIService | 0 | 0 |
| Matrix | 0 | 0 |
| Geocoder | 0 | 0 |
| 合计 | 0 | 0 |

数据来源必须分开解读：

- 武汉真实缓存派生数据：第 20 号步行基线、第 24 号步行/驾车外圈规划；
- 合成 fixture：骑行/驾车的 3 点 Matrix 状态、批次回复和分圈隔离验收；
- fixture 结果未写成武汉真实数据，未替代骑行 `N/A`，未替代驾车 `approval-required`。

## 9. 验证命令与结果

```text
PYTHONPATH=server server/.venv/bin/python -m unittest \
  server.tests.test_multimode_orchestration \
  server.tests.test_matrix \
  server.tests.test_poi_batch_planner -v
```

结果：32/32 通过。

```text
node --test \
  src/state/analysis-store.test.js \
  src/contracts/analysis-contracts.test.js \
  src/adapters/traditional-map-adapter.test.js
```

结果：10/10 通过。

其他核验：

- `node --check app.js`：通过；
- `py_compile` 新增编排/证据文件：通过；
- 第 25 号归档与 Downloads 原文 `cmp`：通过；
- `git diff --check`：通过。

本次没有运行完整浏览器验收、全量测试、长时间构建或任何真实分片任务。

## 10. 本阶段实际修改/生成文件

- `server/app/provider_capabilities.py`
- `server/app/services/multimode_orchestration.py`
- `server/app/adapters/ors_matrix.py`
- `server/tests/test_multimode_orchestration.py`
- `src/state/analysis-store.js`
- `src/state/analysis-store.test.js`
- `src/adapters/traditional-map-adapter.js`
- `app.js`
- `index.html`
- `scripts/build_stage25_multimode_evidence.py`
- `exports/stage-6-multimode/stage25-zero-api-evidence.json`
- `docs/ors-migration/25-stage-6-multimode-orchestration-execution.md`（原文归档）
- `docs/ors-migration/26-stage-6-multimode-orchestration-report.md`

工作区内第 19–24 号阶段及更早的既有修改均未回退、覆盖或清理。

## 11. 停止状态

- 多方式编排能力已实现；
- 新的三方式 live 数据尚未执行；
- 骑行真实数据仍为 `N/A`；
- 驾车仍为 `approval-required`，108 个分片请求均未发送；
- 第 21 号标签云算法未调整；
- 所有真实上游 API 请求为 0。

第 26 号报告已完成。按第 25 号文档要求立即停止，不执行后续阶段或任何真实 API 请求。
