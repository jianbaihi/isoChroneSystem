# 第65号项目更新文档：Stage 12.2 POI 查询通用化

## 结论

Stage 12.2 的核心架构与性能目标已实现：普通 POI 点击链已从 `/name-clouds` 拆到 `/api/v1/poi-query`，使用独立 PoiResult、严格分析指纹、后端分片/并发/缓存/去重/Polygon covers 过滤和 MapLibre 分帧更新。分钟补齐没有在本阶段被自动执行。

真实验收完成了 walking、cycling 和非标准 7/13/18 分钟组合。当前位置、搜索、地图选点的 POI 完整在线复验未在本次有界请求内全部完成，因此报告状态为 `implemented and partially live-verified`，不虚标全量 completed。

## 逐项回答

1. 已从泛地图 API 解耦：是，正式入口为 `/api/v1/poi-query`。
2. 会触发泛地图布局：否，结果元数据和后端日志均为 0。
3. 会触发分钟 Isochrone：否，0。
4. 会触发 Matrix：否，0。
5. 三种中心方式都完成 POI 查询：本次未全部复验；中心切换能力为既有 PASS，Stage 12.2 只在线复验 preset。
6. 切中心旧 POI 失效：代码和 Store 测试 PASS；完整在线复验待补。
7. 切交通方式旧 POI 失效：PASS，walking → cycling 可见验证。
8. walking：真实 PASS，141/284 POI 两个场景。
9. cycling：真实 PASS，600 POI，供应商结果截断已披露。
10. driving：未执行真实 POI；小范围门禁路径已实现。
11. 任意阈值：PASS，7/13/18。
12. 当前最大累计 Isochrone：是，请求必须携带与 max(range) 相同的 outerIsochrone，否则 409。
13. 固定 30min 业务逻辑：新 POI 正常链没有；历史实验/缓存仍保留固定 30。
14. 分片针对任意 Polygon：是，仅消费当前 outer Polygon。
15. 去重：是，OSM/provider ID，缺失时 feature ID 或规范化名称+六位坐标。
16. 严格 covers：是，边界保留、外部移除。
17. 相同请求缓存：PASS，10/20/30 步行重查上游 0。
18. 陈旧响应覆盖：不会；Abort 后仍以 analysisFingerprint 二次校验，Store 拒绝不匹配结果。
19. 请求期间地图交互：缩放与键盘平移 PASS；侧栏滚动自动化接口未提供对应方法，未做数值化证明。
20. 几百 POI 流畅：PASS，600 点 96.70ms 分帧发布。
21. 最大 Long Task：真实捕获为 N/A；观察器已加入，已有验收不伪造数值。
22. renderDuration：141 点 27.40ms；600 点 96.70ms。
23. 429/5xx：本次无。
24. Mock fallback：无，health 为 ready、mode=ors。

## 基线与新增

- 基线提交：`b5cc946cb8ff90e410d385af0d6a3fb75d092ad5`，工作树执行前干净。
- 新增 PoiQueryRequest/PoiQueryResult、ANALYSIS_STALE、统一 FNV-1a 分析指纹、独立 workflow 三阶段状态。
- 新增后端 `/poi-query` 服务；普通 POI 结果禁止携带 nameCloud、分钟和 Matrix 字段。
- 参数中心/交通/阈值变化使 reachability 与 POI stale；类别变化只使 POI/minute stale。
- 新增 AbortController 和响应指纹防陈旧覆盖。
- 新增每帧100点的 POI 渲染调度，不重新初始化地图、不对 POI 自动 fitBounds。
- 新增性能 marks 与开发环境 Long Task observer。

## 测试与已知限制

- 前端：122/122 通过，包括50/250/500/1000点批渲染。
- 后端 Stage 12.2 定向测试通过；全量历史测试仍有 Stage 59 缺失忽略缓存 JSON 的既有导入错误。
- 当前 POI provider 在超过硬上游限额时返回截断结果并显式标记，而不是声称完整覆盖。
- 当前位置在线 POI 复验需要用户在浏览器中批准精确定位及其向 ORS 的传输；本次未代替用户批准。

完整证据：`exports/stage-12-2-poi-generalization/`。
