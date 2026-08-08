# 第 37 号执行记录：紧凑环带标签布局

本文件记录工作区对 `/Users/zhangzhihan/Downloads/37-stage-7-compact-annular-label-layout-execution.md` 的实际执行范围。规范原文保持只读；本次仅实现紧凑环带标签本体、四算法对比、结构化指标和浏览器证据。

## 冻结范围

- 数据：黄鹤楼 `foot-walking` 本地缓存，`total=282`、`eligible=252`、`outOfRange=30`，逐圈 `39/83/130`。
- 只读基线：第 33 号地理方位布局 `fnv1a-c715b7de`，逻辑画布 `2324×2324`。
- 不修改 Matrix 时间、`ringId`、`poiId`、文本、字号语义或旋转角度。
- 骑行冻结；驾车保持 `awaiting-approval`；巴黎不进入本阶段。
- 第 35 号自然包络质量问题冻结；自然包络与 D3 density 均不执行。
- 业务上游预算：Isochrones、OpenPOIService、Matrix、Geocoder 均为 0。

## 实际执行项

- [x] 旧径向只读基线指标。
- [x] 费马候选场紧凑布局。
- [x] 泊松盘候选场紧凑布局。
- [x] 前沿接触式地理匹配。
- [x] 前沿接触式固定种子随机匹配；随机只影响标签与受约束槽位的匹配。
- [x] 精确矩形径向边界、中心/时间标注/标签碰撞核验。
- [x] 全景预览与阅读视图 transform-only 契约。
- [x] 结构化 JSON、真实浏览器 PNG、SHA-256、零 API 账本。
- [x] 第 38 号报告。

## 停止边界

未执行自然包络补充、类别聚类、渐进展开、评分热度或任何后续阶段。

