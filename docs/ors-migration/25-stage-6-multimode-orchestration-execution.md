# 第 6 阶段第 4 步：多交通方式 POI 与 Matrix 分批编排执行文档

状态：待执行

直接基线：

- `docs/ors-migration/20-stage-6-matrix-exact-time-report.md`：单 profile Matrix 已完成；
- `docs/ors-migration/22-stage-6-d3-time-label-cloud-report.md`：精确时间标签云已完成；
- `docs/ors-migration/24-stage-6-poi-spatial-batch-planner-report.md`：POI 分片、预算、缓存和续跑已完成。

执行完成后新增：

```text
docs/ors-migration/25-stage-6-multimode-orchestration-execution.md
docs/ors-migration/26-stage-6-multimode-orchestration-report.md
```

完成第 26 号报告后强制停止。本任务完成编排能力，但默认不执行新的全量真实请求。

## 0. 给 Codex 的直接指令

把现有等时圈、POI 分片和 Matrix 能力组织成同一套“按交通方式运行”的可恢复作业。支持：

```text
foot-walking
cycling-regular
driving-car
```

每个 profile 的数据链必须独立：

```text
profile-specific isochrone
→ profile-specific outer geometry
→ POI query plan
→ POI leaf-piece acquisition and merge
→ same-profile Matrix one-to-many batches
→ matrix-based rings
→ time-encoded POI label cloud
```

主验收使用 fixture 和已有缓存，上游预算为 0。不得自动请求缺失的骑行/驾车数据；不得在本次执行三种交通方式的大范围 live run。

## 1. 支持范围与不支持范围

### 1.1 当前支持

| UI | profile | 等时圈 | POI | Matrix |
| --- | --- | --- | --- | --- |
| 步行 | `foot-walking` | ORS | outer geometry 内 OpenPOIService | `foot-walking` |
| 骑行 | `cycling-regular` | ORS | outer geometry 内 OpenPOIService | `cycling-regular` |
| 驾车 | `driving-car` | ORS | outer geometry 内 OpenPOIService | `driving-car` |

### 1.2 当前不支持

公交、地铁、火车、高铁、飞机不进入 profile 列表，也不显示为可用按钮。ORS 当前服务面向 car/bicycle/walking/hiking/wheelchair/HGV，不提供这些公共交通方式的同类能力。[ORS Services](https://openrouteservice.org/services/)

若旧 UI 有这些选项，必须隐藏或明确禁用并写“当前数据源不支持”，不能映射到邻近 profile。

## 2. 作业模型

### 2.1 单 profile 作业

建议统一状态：

```text
draft
planning
awaiting-approval
fetching-isochrone
fetching-pois
merging-pois
fetching-matrix
assigning-rings
layout-ready
completed
partial
failed
cancelled
```

任何状态变更都带 `jobId`、`profile`、`updatedAt` 和非敏感 progress。旧 job 响应不得覆盖当前 job。

### 2.2 三 profile 编排

“准备全部交通方式”是显式批处理动作，不是页面默认行为。调度顺序固定：

```text
foot-walking → cycling-regular → driving-car
```

原因：通常由小范围到大范围，先验证完整链路并最大化缓存复用。一个 profile 失败后默认暂停队列，等待用户选择重试、跳过或停止；不得静默继续消耗后续大预算。

### 2.3 原子发布

每个 profile 只有在以下条件全部成立时发布为 `completed`：

- outer isochrone 完整；
- POI 所有必要 leaf pieces 完成且 coverage 未截断；
- 合并与去重通过；
- 所有 Matrix batches 有明确状态；
- Matrix 可达/不可达/超范围计数守恒；
- ring assignment 完成；
- 前端可生成标签云。

某一批失败时可保留检查点，但不能把 profile 标记为完整；另一个已完成 profile 不受影响。

## 3. Profile 结果契约

建议统一为：

```json
{
  "analysisRunId": "...",
  "center": {"id":"...","longitude":0,"latitude":0},
  "profile": "cycling-regular",
  "rangesSeconds": [600,1200,1800],
  "status": "completed",
  "isochrones": {},
  "poiQueryPlan": {
    "planId": "...",
    "planFingerprint": "...",
    "pieceCount": 0,
    "requestsUsed": 0,
    "fullyCovered": true
  },
  "pois": [],
  "accessibility": [],
  "summary": {
    "rawPoiCount": 0,
    "deduplicatedPoiCount": 0,
    "matrixOkCount": 0,
    "matrixUnreachableCount": 0,
    "matrixOutOfRangeCount": 0,
    "ringCounts": {}
  },
  "provenance": {
    "isochroneProvider": "ors-public-api",
    "poiProvider": "openpoiservice",
    "matrixProvider": "ors-public-api",
    "cache": {}
  }
}
```

Store 建议使用：

```text
resultsByProfile[profile]
jobsByProfile[profile]
activeProfile
```

切换 profile 只读相应完整结果；不存在时显示“尚未生成”，不得继续显示另一方式的数据而只改图例文字。

## 4. POI 获取编排

### 4.1 active profile 默认路径

用户选择交通方式后点击：

```text
生成POI标签云泛地图
```

系统只处理当前 profile：

1. 检查当前 draft 与成功 isochrone 参数一致；
2. 生成或读取 POI plan；
3. 计划超预算则停在 `awaiting-approval`；
4. 预算通过后顺序执行 pending leaf pieces；
5. 每片后保存检查点；
6. 合并去重并验证 coverage；
7. 再进入 Matrix。

### 4.2 跨 profile POI 复用

POI 纯查询缓存按 geometry hash，而不是 profile。若两个 profile 恰好产生相同 piece geometry 和 filter，可复用同一缓存；几何只是部分重叠但 hash 不同，不做不可靠的部分缓存拼接。

合并后的 `Poi` 主体可按稳定 ID 共享，但每个 profile 的 inclusion 与 accessibility 独立。

### 4.3 进度

UI 至少显示：

```text
骑行 POI：已完成 4/12 个分片
本次上游请求 3，缓存命中 1
预计剩余 8 个分片
```

取消只停止尚未开始的请求；已完成分片保留，可恢复。

## 5. Matrix 分批策略

### 5.1 官方限制与项目默认值

ORS 公共 Matrix 当前限制为每请求最多 3500 个 origin-destination 对；带 dynamic arguments 时限制更低。[ORS API Restrictions](https://openrouteservice.org/restrictions/)

本项目首版不使用 dynamic arguments 或实时交通参数。始终显式：

```text
sources = [0]
destinations = [1..N]
```

项目使用更保守、可配置的默认值：

```text
MATRIX_MAX_ROUTES_PER_REQUEST = 3500
MATRIX_BATCH_DESTINATIONS = 500
MATRIX_CONCURRENCY = 1
```

`3500` 应集中在 provider capabilities/config 中，不散落硬编码；若上游返回更严格限制，记录并停止，不自动风暴式重切。

### 5.2 批次数计算

单中心：

```text
batchSize = min(MATRIX_BATCH_DESTINATIONS, MATRIX_MAX_ROUTES_PER_REQUEST)
batchCount = ceil(destinationCount / batchSize)
```

通用公式：

```text
maxDestinations = floor(maxRoutes / sourceCount)
```

本项目当前 `sourceCount=1`，但代码不得误把 locations 总数平方。

### 5.3 稳定分批

1. POI 按 `poiId` 稳定排序；
2. 按 batchSize 切分；
3. 每批保存有序 `poiIds[]`、坐标 hash 和 `batchId`；
4. 请求只含中心 + 该批 destinations；
5. 逐批严格校验响应维度；
6. 每批独立缓存和检查点；
7. completed batch 不重复请求；
8. 全部批次结束后按 poiId 合并；
9. null/invalid 是该 POI 的明确状态，不因一个 null 使整批丢失；
10. HTTP/维度级失败使该 batch failed，profile 暂不发布。

### 5.4 超时与重试

- 单 Matrix 请求超时默认 60 秒；
- 400/401/403/413 不重试；
- 429 尊重 `Retry-After`，最多一次受预算约束的重试；
- 502/503/504 最多一次指数退避重试；
- 重试也计入批准的 Matrix 请求预算；
- 用户取消后不重试；
- 页面刷新可从 completed batches 恢复。

### 5.5 Matrix 预算

计划展示：

```text
destinationCount
batchSize
minimumMatrixRequests
approvedMatrixRequests
remaining observed/unknown
```

POI 和 Matrix 使用不同预算。不能用“POI 还有 100 次”推断 Matrix 也有 100 次。

## 6. Matrix 后重新分圈

每个 profile 都按该 profile 的 Matrix duration 分圈。空间 contains 只保留为 `spatialBandId` 审计。

要求：

- 相同 10/20/30 阈值可用于跨方式对比，但三个 profile 独立计算；
- Matrix 时间超过最大阈值的 POI 标记 out-of-range；
- null 标记 unreachable/invalid；
- 不用另一 profile 的时间补空；
- 完成后的标签云使用当前 profile 自己的时间排名、字号和透明度；
- profile 切换不重新布局其他 profile，优先读取其布局缓存。

## 7. 前端交互

### 7.1 当前方式

顶部或控制区清楚显示：

```text
当前：步行 / 骑行 / 驾车
```

按钮保持统一：

```text
生成POI标签云泛地图
```

加载文案带当前方式：

```text
正在规划骑行范围 POI…
正在获取骑行 POI 4/12…
正在计算骑行 Matrix 1/3…
正在生成骑行标签云…
```

### 7.2 Profile 切换

- 有 completed 结果：立即切换至缓存结果，不联网；
- 有 partial job：显示恢复入口，不冒充完成；
- 无结果：显示尚未生成；
- draft 参数变化后旧结果保留但标记与当前参数不一致；
- 传统地图与泛地图同时切换同一 profile；
- selectedPoiId 若不在新 profile 中则清除选择，但不删除 POI 主体缓存。

### 7.3 批处理入口

可以提供低优先级入口：

```text
准备全部交通方式
```

点击后只先生成三份 plan 和总预算。没有用户批准不得执行。它不能成为首页默认主按钮。

## 8. 缓存与版本

作业指纹至少包含：

```text
center
profile
ranges
isochrone options/version
outer geometry hash
poi plan fingerprint
poi normalization version
matrix provider/options/batch version
layout version
```

变更规则：

- 只改主题色：不失效数据或布局；
- 只改标签 hover 样式：不失效；
- 改字号映射 token：只失效布局；
- 改 Matrix profile/options：失效 Matrix、ring 与布局，不必失效同 geometry POI；
- 改 outer range：失效 plan、profile POI 集合、Matrix 集合和布局；
- 改名称规范化：失效 POI merge 和布局，但不必重新请求原始 piece 缓存。

## 9. 分步执行

### 阶段 A：预检

1. 阅读第 20、22、24 号报告和本文；
2. 将本文原样归档到第 25 号路径；
3. 核对三 profile UI 和 Adapter 映射；
4. 核对单 profile Matrix 与 POI planner 可独立调用；
5. 安装主验收上游调用断言，任何真实调用即失败。

### 阶段 B：Job 与 Store

1. 实现 profile job 状态机；
2. 实现 results/jobs by profile；
3. 实现原子发布与旧结果保护；
4. 实现取消、恢复和过期响应隔离；
5. 添加 fixture 测试。

### 阶段 C：POI 编排

1. 串联 plan、approval、piece executor、merge；
2. 实现缓存复用和逐片 checkpoint；
3. 实现 progress；
4. 实现截断/部分失败不发布。

### 阶段 D：Matrix 批处理

1. 实现 500 destination 默认批次；
2. 显式 source/destination；
3. 实现 batch cache/checkpoint/resume；
4. 实现预算、限流、有限重试；
5. 实现合并、分圈和 summary。

### 阶段 E：三 profile UI

1. active profile 生成；
2. profile 切换；
3. 统一按钮与进度文案；
4. 三 profile 结果隔离；
5. `准备全部交通方式` 只生成计划，不自动执行；
6. 禁用不支持交通方式。

### 阶段 F：零 API 集成验收

使用：

- 第 20/22 号真实步行缓存；
- 骑行/驾车 fixture 或已有缓存；
- 合成的 0、1、499、500、501、1000、3501 POI 集合。

验证全链路、批次数、恢复和 profile 切换。不得联网补齐缺失数据。

### 阶段 G：报告并停止

生成第 26 号报告并停止。报告必须写“多方式编排能力已实现，新的三方式 live 数据尚未执行”，不能把 fixture 写成真实武汉结果。

## 10. 自动测试最低要求

- 三 profile 映射准确；
- unsupported mode 不可执行；
- resultsByProfile 不串数据；
- active profile 切换不联网；
- 单 profile 状态机合法转换；
- 旧 job 响应不能覆盖新 job；
- partial POI job 不发布；
- completed piece/batch 恢复不重复请求；
- 0/1/499/500/501/1000/3501 destinations 的批次数；
- 请求始终显式一个 source；
- batch response 与 poiId 顺序一致；
- null destination 与 batch HTTP 失败区分；
- 429/5xx 有限重试计入预算；
- profile Matrix 时间互不复用；
- Matrix band、out-of-range、unreachable 守恒；
- “准备全部”未批准只出计划；
- 所有主验收上游调用为 0。

## 11. 时间盒与停止条件

- 单个测试命令最长 120 秒；
- 单个 fixture 作业最长 30 秒；
- 浏览器验收最长 15 分钟；
- 累计 75 分钟未完成，写断点版第 26 号报告并停止；
- 不运行真实 94-cell 驾车计划来证明编排器。

立即停止：

- 三 profile 数据发生串用；
- 部分 job 被发布为 complete；
- Matrix 请求遗漏 sources/destinations；
- 取消/恢复会重复已完成上游工作；
- 批处理自动绕过预算；
- 页面打开或 profile 切换触发真实请求；
- 任一真实上游调用发生。

## 12. 完成判据

- 步行、骑行、驾车使用同一编排器且数据隔离；
- POI plan、piece、merge、Matrix batch、ring、layout 顺序清晰；
- 大数据可预算、可取消、可恢复；
- Matrix 每批显式 one-to-many 并有稳定映射；
- profile 切换使用自身完整结果；
- 不支持交通方式不伪装；
- 主验收上游调用为 0；
- 第 26 号报告完成并停止。
