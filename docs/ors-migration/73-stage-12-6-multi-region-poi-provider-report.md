# 第 73 号执行报告：Stage 12.6 多区域 POI Provider

## 阶段状态

- implementation: completed
- automatedVerification: completed
- wuhanAmapVerification: completed
- parisFoursquareVerification: blocked by upstream HTTP 429
- githubBackup: blocked because no Git remote is configured
- overall: `completed-needs-foursquare-and-github-sync`

本阶段已完成中国大陆高德 + 海外 Foursquare 的统一 Provider 架构、坐标与类别适配、自动路由、缓存身份、统一错误和前端来源状态。武汉真实链通过；巴黎正确路由但上游限流，系统按可复现实验原则明确失败且不回退。

## 基线与新增修改

基线：`92fba6bf8faf483fc7d10d99a0fefede5c459ea3`（Stage 12.5）。新增本地版本化大陆边界、Provider capability/registry/router、capability-driven planner、WGS84↔GCJ‑02 policy、Amap/Foursquare adapters、统一 normalizer、Provider-aware POI cache identity、前端自动来源状态与统一详情来源标签。

## 国内真实验收

黄鹤楼、步行、5/10 分钟：自动解析 `cn-mainland` 并选择 Amap，真实返回并渲染 94 个圈内 POI，分钟补齐 94/94，详情卡显示高德来源。地图抽查未发现系统性坐标偏移，未使用 Mock 或旧 Provider fallback。

## 海外真实验收

埃菲尔铁塔、步行、5/10 分钟：自动解析 `global` 并选择 Foursquare。ORS 等时圈成功，但 Foursquare Search 返回 HTTP 429，映射为 `POI_PROVIDER_RATE_LIMITED`。因此海外 POI、详情和分钟链无法诚实标为 PASS；系统未静默切换 OpenPOIService。

## 三十项回答

1. 中国大陆是否自动路由到 Amap？是，武汉实测 PASS。
2. 海外是否自动路由到 Foursquare？是，巴黎实测请求确实到达 Foursquare。
3. 前端 `/api/v1/poi-query` 是否保持不变？是。
4. 前端是否接触任何 Provider Key？否。
5. 日志是否泄露 Key？否；日志只含本地入口和状态码。
6. RegionResolver 是否使用真实边界而非粗糙 bbox？是，使用本地版本化 polygon 与 point-in-polygon。
7. 高德 Query 是否正确转换为 GCJ-02？是。
8. 高德 Result 是否转换回 Canonical WGS84？是。
9. Foursquare 是否保持 WGS84？是，Adapter 与自动测试均为 identity。
10. 是否存在混合 CRS 直接做 covers？否；先转 Canonical WGS84。
11. 武汉 POI 是否存在明显系统性坐标偏移？未观察到。
12. Amap 是否完成分页 / 分片 / 去重？完成 polygon 分页、稳定 ID 去重；小范围无需额外分片。
13. Foursquare 是否完成区域规划 / 去重？完成 capability-driven 小范围 radius 规划与稳定 ID 去重；真实数据因 429 未返回。
14. 两个平台是否都输出同一 NormalizedPoi？是，自动测试 PASS。
15. 两个平台是否都映射到同一 NormalizedCategory？是。
16. Detail Card 是否零 Provider-specific 分支？是；仅通用 provider label 映射。
17. Hover Card 是否零 Provider-specific 分支？是。
18. Minute Accessibility 是否兼容 Amap PoiResult？是，94/94 实测。
19. Minute Accessibility 是否兼容 Foursquare PoiResult？契约与自动测试兼容，真实链因 429 未验证。
20. 更换 POI Provider 后 Minute Geometry Cache 是否可以复用？是，geometry cache identity 不含 POI Provider。
21. Provider 是否进入 POI Cache identity？是。
22. coordinatePolicyVersion 是否进入 Cache identity？是。
23. Provider 失败是否存在未记录静默 fallback？否。
24. 武汉真实在线链是否 PASS？是。
25. 巴黎真实在线链是否 PASS？否，阻塞于 Foursquare HTTP 429。
26. 国内/海外连续切换是否 PASS？路由与状态切换 PASS；海外数据完成态受 429 阻塞。
27. 是否发生 401 / 403 / 429 / 5xx？发生 Foursquare 429；未观察到 401/403/5xx。
28. 是否发生 Mock fallback？否。
29. `.env` 是否完全未进入 Git？是，已 ignore 且未 staged。
30. GitHub 是否已成功同步？否，仓库没有配置 remote。

## 测试

- 后端重点回归：23/23 PASS。
- 前端：60/60 PASS。
- Python compile 与 `git diff --check`：PASS。
- 全量历史测试扫描另有一个非本阶段失败：Stage 5 测试引用的冻结缓存文件不在当前 checkout 中，导致模块加载失败。

## GitHub 同步状态

- Repository: local workspace（未配置 remote）
- Branch: `main`
- Local HEAD: Stage 12.6 本地提交后更新
- Remote HEAD: unavailable
- Push: `BLOCKED_NO_REMOTE`
- Working Tree: 提交后目标为 clean
- Secret Audit: PASS

本阶段不能标记 `COMPLETED AND BACKED UP`。需要用户提供或配置正确的 GitHub remote，并在 Foursquare 限额恢复/Key 计划可用后补做巴黎真实链，方可关闭两项硬门槛。
