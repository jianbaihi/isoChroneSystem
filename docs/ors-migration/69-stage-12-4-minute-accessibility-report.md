# 第 69 号项目更新文档：Stage 12.4 分钟级通行时间与 Provider 解耦

## 基线与结果

- 基线：`eb8eeff6e9c4600fc82eb7e3628597abde35c08d`，工作区 clean。
- 新数据链：`ReachabilityResult → PoiResult → MinuteAccessibilityResult → PoiDetailViewModel`。
- 分钟 endpoint 保持 `/api/v1/minute-accessibility`，但请求只消费当前 PoiResult 的身份与 POI 坐标，响应只返回 Assignment。
- walking 5/10/15 与 cycling 7/13/18 均完成真实在线验证；前后端保持运行。

## 新增实现

- 动态 Planner 读取统一 Provider capability（每请求最多 10 个显式分钟值），支持任意 maxRange。
- 超过 6 批时先返回 approval-required，批准前上游请求为 0。
- ORS batch cache identity 与 POI 数量、类别和 poiQueryId 解耦。
- 后端使用一次性 Shapely parse/prepared geometry、Point once、unresolved-only 扫描和 `covers` 分类。
- 返回独立 `MinuteAccessibilityResult`，不覆盖 PoiResult、不携带分钟 Polygon、不伪造 Matrix 字段。
- 前端状态支持 planning/running/classifying/ready/approval-required/cancelled/error/stale，参数变化会 Abort。
- 前端仅建立 `minuteAssignmentByPoiId`，不重建地图、POI 或泛地图。
- 建立 `PoiProviderAdapter`、NormalizedPoi、NormalizedCategory 和按需 PoiDetailViewModel builder。

## 文档要求的 36 项回答

1. 是，Minute 按钮调用独立 `/api/v1/minute-accessibility`。
2. 否，分钟操作不重新 Query POI。
3. 否，Matrix 调用为 0。
4. 否，泛地图 layout 为 0。
5. 是，maxRange=`max(rangesMinutes)`。
6. 是，批次按 maxRange 与 capability 动态生成。
7. 18 分钟实际 2 批：1–10、11–18。
8. 30 分钟规划为 3 批。
9. 是，超过自动 6 批先 approval-required，且 upstream=0。
10. 是，分钟 batch 使用 ORS JSON cache。
11. 是，类别不参与 minute geometry cache identity；只重新分类新 PoiResult。
12. 是，profile 在 ORS endpoint/cache identity 中，切换会使用新 cache。
13. 是，center 在请求 body/cache identity 中，改变会使用新 cache。
14. 是，按 minimum covering minute 分类。
15. 是，使用 `covers`；构造边界测试通过。
16. 是，真实 ORS contour 存在非严格嵌套。
17. walking 15 分钟为 5 对；cycling 18 分钟为 8 对。
18. 否，`geometryRepair=off`，未 union/buffer/smooth。
19. walking 为 118；cycling 为 561。
20. walking 为 0；cycling 为 39。
21. 否，Assignment 不包含或伪造 `travelTimeSeconds`。
22. 是，历史 Matrix 字段契约未删除；分钟结果与其独立。
23. 否，浏览器响应 `minuteGeometryIncluded=false`，不含分钟 Polygon。
24. 是，存储于 `workflow.minuteResult`，PoiResult 保持不变。
25. 是，cycling 600 assignments 无冻结，最大 Long Task 0。
26. walking 3.271 ms；cycling 22.055 ms。
27. walking store publish 1.6 ms；cycling 4.5 ms。
28. 是，前后端均建立 NormalizedPoi 转换契约。
29. 否，Provider raw Feature/geometry 不进入上层；只保留 source audit 字段。
30. 是，建立 10 个内部 category id，未知映射为 `other`。
31. 是，OpenPOIService 实现由 `PoiProviderAdapter` Protocol 约束，PoiQueryService 只依赖接口。
32. 是，未来只需新增 Adapter 与 category mapping。
33. 是，`window.buildPoiDetailViewModel(poiId)` 可直接由 PoiResult + MinuteResult 构造。
34. 是，rating/address/openingHours 等均 nullable，真实 ViewModel 已验证为 null。
35. 发生 1 次 walking Reachability 504 timeout，重试成功；未发生 429。
36. 否，health 为真实 ORS mode，`mockFallback=false`。

## 真实验收数据

| 场景 | POI | 批次 | 首轮上游 | 重复缓存命中 | classified | unassigned | non-nested | 分类耗时 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| walking 5/10/15 | 118 | 2 | 2 | 2/2 | 118 | 0 | 5 | 3.271 ms |
| cycling 7/13/18 | 600（截断） | 2 | 2 | 2/2 | 561 | 39 | 8 | 22.055 ms |

## 测试与已知环境项

- 前端 Node：52/52 PASS。
- 后端分钟/Planner：8/8 PASS；POI 标准化/Query：4/4 PASS。
- 全量后端共执行 132 个功能测试，功能失败 0；测试发现阶段仍有 1 个既有环境错误：Stage59 测试引用的历史 cache fixture 文件缺失，与本阶段代码无关。
- JavaScript syntax 与 `git diff --check` PASS。

完整证据位于 `exports/stage-12-4-minute-accessibility/`。
