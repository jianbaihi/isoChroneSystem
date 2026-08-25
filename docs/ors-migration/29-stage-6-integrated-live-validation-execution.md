# 第 6 阶段第 6 步：三交通方式在线集成计划与批准后验收执行文档

状态：待执行

直接基线：

- `docs/ors-migration/28-stage-6-online-startup-report.md` 已完成；
- 正常启动默认真实 Provider，但页面初始加载不调用业务 API；
- POI 与 Matrix 已支持计划、预算、缓存、分批和断点续跑。

执行报告：

```text
docs/ors-migration/30-stage-6-integrated-live-validation-report.md
```

本文强制采用“两次交付”：

1. 第一次只生成真实请求计划并把报告状态写成 `awaiting-approval`，然后停止；
2. 用户明确批准与计划 fingerprint 绑定的预算后，第二次只续跑已批准部分，更新同一第 30 号报告。

不得在第一次执行中直接跑完整步行、骑行、驾车任务。

## 0. 给 Codex 的直接指令

先使用当前真实在线配置和已有缓存，为黄鹤楼 10/20/30 分钟的三种 profile 生成精确请求计划：

```text
foot-walking
cycling-regular
driving-car
```

第一次执行只允许：

- 读取已有真实缓存；
- 对缺失的 outer isochrone 每 profile 至多请求 1 次；
- 生成 POI dry-run plan；
- 根据计划 POI 数估算 Matrix batch；
- 汇总缓存命中、最小请求数、预留请求数和 quota 最近观测；
- 输出 plan fingerprint 和批准模板；
- 停止。

第一次不得执行新的 POI piece 和 Matrix batch。用户批准后才能继续。

## 1. 冻结场景

| 参数 | 值 |
| --- | --- |
| 中心 | 武汉·黄鹤楼 |
| 坐标 | `[114.296944, 30.546944]` |
| profiles | `foot-walking`、`cycling-regular`、`driving-car` |
| ranges | `[600,1200,1800]` 秒 |
| POI provider | OpenPOIService |
| Matrix provider | ORS |
| 标签云 | 第 22 号精确时间 D3-style 版本 |

同一组阈值用于跨方式实验可比性，但不同 profile 的等时圈面积、POI 集合和 Matrix 时间独立。

## 2. 第一次执行：只做真实计划

### 2.1 请求预算

第一次允许的最大上游：

| 服务 | 最大次数 |
| --- | ---: |
| Isochrones | 每个缺失 profile 1 次，总计不超过 3 |
| Geocoder | 0 |
| POI | 0 |
| Matrix | 0 |

若三 profile outer geometry 均有可信缓存，则 Isochrones 也必须为 0。

### 2.2 计划内容

每个 profile 输出：

```text
outer geometry cache/live
outer area km²
initial POI piece count
minimum POI requests
adaptive reserve
cached POI pieces
remaining POI requests
expected POI request upper bound
known POI count（若已有完整缓存）
estimated Matrix destinations（范围或确定值）
Matrix batch size
minimum Matrix requests
cached Matrix batches
remaining Matrix requests
quota status/remaining/observedAt
plan fingerprint
```

若 POI 尚未获取，Matrix 批次数只能给范围或公式，不能伪造精确数量。

### 2.3 总预算摘要

报告使用表格：

| profile | ISO 新请求 | POI 最小 | POI 上界 | Matrix 估计 | 缓存复用 | 状态 |
| --- | ---: | ---: | ---: | ---: | --- | --- |

已知驾车旧计划约 94 cell，但必须用当前规划器重新计算，不直接沿用旧数字。若计划超过可接受范围，如实显示。

### 2.4 批准模板

第 30 号报告末尾生成可复制模板：

```json
{
  "centerId": "wuhan-huanghelou",
  "rangesSeconds": [600,1200,1800],
  "profiles": {
    "foot-walking": {
      "planFingerprint": "...",
      "approvedPoiRequests": 0,
      "approvedMatrixRequests": 0
    },
    "cycling-regular": {
      "planFingerprint": "...",
      "approvedPoiRequests": 0,
      "approvedMatrixRequests": 0
    },
    "driving-car": {
      "planFingerprint": "...",
      "approvedPoiRequests": 0,
      "approvedMatrixRequests": 0
    }
  },
  "stopOnProfileFailure": true,
  "createdAt": "..."
}
```

Codex 不得自行填写批准数字或代替用户批准。

## 3. 第二次执行的批准校验

用户提供批准后，继续前必须验证：

- center/profile/ranges 与计划一致；
- 每个 planFingerprint 一致；
- 计划未因 provider limit、几何或代码版本变化而过期；
- quota 最近观测与批准预算不明显冲突；
- 每个服务保留至少 20% 最近观测余量，除非用户明确调整；
- 批准数字覆盖预期最小值；
- 任何变化都重新 dry-run 并停止，不能沿用旧批准。

## 4. 批准后的执行顺序

固定顺序：

```text
1. foot-walking
2. cycling-regular
3. driving-car
```

每个 profile 内：

```text
读取/生成 outer isochrone
→ 执行 pending POI leaf pieces
→ 每片 checkpoint
→ 截断片有限细分
→ merge/dedupe/coverage
→ 生成 Matrix batch plan
→ 执行 pending Matrix batches
→ Matrix 重新分圈
→ 生成精确时间标签云
→ 浏览器验收
→ profile 标记 complete
```

当前 profile 失败：

- 默认暂停全部队列；
- 保存所有 completed pieces/batches；
- 不自动进入更大的下一个 profile；
- 报告断点和剩余批准预算；
- 等待用户决定。

## 5. 请求执行规则

### 5.1 POI

- concurrency=1；
- 每片面积不超过规划器安全阈值；
- cache hit 不发请求；
- 结果等于 limit 触发已批准预算内的有限细分；
- 细分会超过批准值时暂停，不擅自追加；
- 429 尊重 Retry-After，重试计入预算；
- 所有片完成前不发布 profile。

### 5.2 Matrix

- 显式一个 source；
- 默认每批至多 500 destinations；
- 每请求 OD 对不超过 provider capability；
- concurrency=1；
- completed batch 可恢复；
- null destination 是 POI 级状态；
- HTTP/维度错误是 batch 级失败；
- retry 计入批准值；
- 全批完成后原子发布。

### 5.3 请求计数

报告同时记录：

- local business requests；
- upstream requests；
- cache hits；
- retries；
- 429/5xx；
- 首次与复跑的区别。

不得只看浏览器 Network 推测上游次数。

## 6. 在线结果验收

每个完成 profile 至少验证：

### 6.1 数据

- 3 个真实 ORS Polygon/MultiPolygon；
- POI plan coverage 完成且无截断；
- raw/named/deduplicated 守恒；
- Matrix ok/null/invalid/out-of-range 守恒；
- 三个 Matrix ring 互斥；
- provider、cache、graph date（若有）与 calculatedAt 非敏感可追溯。

### 6.2 泛地图

- 按钮为“生成POI标签云泛地图”；
- 默认标签无胶囊；
- 时间短字号大、时间长字号小；
- 圈内 opacity 单调降低；
- 双视图 ring 色相一致；
- 0 重叠、0 越界；
- placed/unplaced 明示；
- active profile 与数据一致。

### 6.3 交互

- 一个标签 hover 对应地图点；
- 一个地图点 click 对应标签；
- 联动请求为 0；
- profile 切换至已有结果请求为 0；
- 单一 MapLibre canvas；
- resize 可取消旧 layout，不重复数据请求。

### 6.4 缓存复跑

每个已完成 profile 完全相同参数复跑：

```text
Isochrones upstream = 0
POI upstream = 0
Matrix upstream = 0
layout fingerprint = same
```

## 7. 报告结构

第 30 号报告至少包含：

1. 当前状态：`awaiting-approval / partial / completed`；
2. 计划 fingerprint 和批准记录；
3. 每 profile 面积、pieces、POI、Matrix batches；
4. 请求预算、实际消耗、缓存、重试；
5. POI 与 Matrix 计数守恒；
6. 标签布局与性能指标；
7. 双视图联动和截图；
8. 未完成 profile 与断点；
9. 配额最近观测，不包含敏感信息；
10. 不支持的交通方式；
11. 对“估算时间非实时真值”的说明。

## 8. 第一次执行步骤

1. 阅读第 28 号报告和本文；
2. 将本文原样归档到第 29 号路径；
3. 检查工作树并保护未跟踪目录；
4. 在线启动，health ready 且 mock=false；
5. 读取三 profile 缓存；
6. 只对缺失 outer geometry 的 profile 发至多 1 次 Isochrones；
7. 生成三份 POI dry-run plan；
8. 估算 Matrix batches；
9. 汇总 quota、缓存、预算和 fingerprint；
10. 创建状态为 awaiting-approval 的第 30 号报告；
11. 停止所有本次启动进程；
12. 立即停止并等待用户批准。

## 9. 第二次执行步骤

只有用户批准后：

1. 读取第 30 号 awaiting-approval 报告和批准 JSON；
2. 重新计算 fingerprint，任何变化即停止；
3. 按 profile 顺序执行；
4. 每个 piece/batch 后更新 checkpoint；
5. 每完成一个 profile 立即跑短验收并保存证据；
6. 若失败，暂停队列，不消耗下一 profile；
7. 完成后缓存复跑；
8. 更新第 30 号报告；
9. 停止，不进入类别、评分热度、巴黎或部署任务。

## 10. 自动测试与运行时间限制

第一次 planning：

- 单 profile 几何规划最长 30 秒；
- 单 Isochrones 最长 45 秒；
- 总 planning 最长 20 分钟；
- POI/Matrix 上游必须为 0。

第二次 live：

- 单 POI 请求最长 45 秒；
- 单 Matrix 请求最长 60 秒；
- 单 profile 连续运行达到 45 分钟仍未完成时安全检查点并停止；
- 完整队列不得无人看管无限运行；
- 任何重试必须在批准预算内。

继续沿用第 20–28 号全部离线测试。不得为了 live 验收删除或放宽网络禁用测试。

## 11. 立即停止条件

- 第一次执行发生 POI 或 Matrix 上游请求；
- 没有批准或 fingerprint 不一致；
- 计划请求数超过批准值；
- quota remaining 明显不足或 unknown 且批准未覆盖风险；
- 429 重试后仍限流；
- POI piece 反复截断达到最大深度；
- profile partial 却准备发布完整结果；
- Matrix 批次映射无法与 poiId 对齐；
- 当前 profile 失败后调度器仍自动进入下一个；
- 页面显示 Mock 或静默回退；
- Key 出现在页面、日志、报告或截图。

## 12. 完成判据

第一次只需：

- 三 profile 计划真实、可复核；
- POI/Matrix 上游 0；
- 第 30 号报告状态 awaiting-approval；
- 批准模板和 fingerprints 完整；
- 已停止。

批准后的最终完成需：

- 所有获批 profile 按自身等时圈获取 POI；
- 所有获批 profile 按自身 Matrix 补齐时间；
- 分批、缓存、恢复、计数可证明；
- 精确时间标签云与双视图通过；
- 相同参数复跑全部上游为 0；
- 第 30 号报告准确标记 completed/partial；
- 完成后停止。
