# 第75号执行报告：Stage 12.6.1 高德完整度增强与 GitHub 安全备份

## 结论

Stage 12.6.1 已完成实现、自动测试与真实高德验收。国内 POI 查询已由“宽泛单请求”升级为显式类别映射、CategoryJob 独立分页、饱和识别、仅饱和类别空间细分、滚动预算、细粒度缓存和稳定去重。真实五分类返回 546 个 POI，真实全选返回 912 个 POI；两者都在预算达到时如实返回 `partial`，未伪装为完整结果。

Git Bundle 和执行前 GitHub 备份已验证。最终代码提交后同步到独立 `backup/stage12-6-1-20260827` 分支，绝不改写远程 main。Foursquare 维持 Stage 12.6 的真实 429 状态，不重试、不跨 Provider 回退、不使用 Mock。

## 基线与新增修改

基线为 `7d80523ff8a4387359fc7681128801bc9dd978d4`，工作树 clean。新增内容包括：

- 固定 12 个一级 POI 类别和 `amap-query-v1` 映射；默认选择景点、公园、餐饮、酒店、交通。
- 前端全选始终提交 12 个显式 `categoryIds`，页面显示各类别数量与查询摘要。
- 后端每类独立 Job/分页；页长 25、每 Job 最多 4 页，末页仍满即 saturated。
- saturated Job 沿最长轴自适应二分，最大深度 3，最小 cell 0.25 km²。
- 自动预算 20，确认预算 40；达到预算停止分发但保留去重后的部分结果。
- category/cell/page 细粒度磁盘缓存；增量类别查询复用既有缓存。
- providerPoiId 全局去重；nature 优先于 attraction；最终仍执行 WGS84 canonical `covers`。
- 高德请求最小间隔 1.05 秒，`10021/10004/10003` 显式映射为 rate limited。
- 分类完整度、请求数、缓存命中和 split 统计进入 PoiResult metadata/coverage；Minute 与 POI 卡片合同不变。

## 真实验收

武汉黄鹤楼附近约 17.03 km² 审计 Polygon：

| 场景 | POI | upstream | cache hits | split | 完整度 |
|---|---:|---:|---:|---:|---|
| 五分类 | 546 | 20 | 14 | 3 | partial（预算内透明返回） |
| 全选 12 类 | 912 | 20 | 18 | 0 | partial（public/other 被预算阻断） |

五分类计数：景点 216、公园 30、餐饮 100、酒店 100、交通 100。全选计数：景点 87、公园 30、餐饮 100、酒店 100、交通 100、学校 99、医疗 100、购物 100、休闲 98、生活 98；公共设施和其他在自动预算用尽前未发出请求，因此明确标记 `blocked-budget`。

首次复验遇到高德业务码 `10021`，UI/API 正确报告频率受限；加入 1.05 秒请求间隔并冷却后，两次真实验收均成功，最终两轮没有 429 或 5xx。

## 40 项回答

1. GitHub remote 是否成功连接？是，origin 已连接 SSH 地址。
2. Git Bundle 是否创建并验证成功？是，仓库外 Bundle 已 PASS。
3. GitHub backup branch 是否成功推送？是，执行前与 Stage 12.6.1 最终独立备份分支均已成功推送。
4. Local HEAD 是否等于 remote backup HEAD？是，最终 fast-forward 推送后再次严格校验。
5. `.env` 是否继续安全 ignore？是，根目录和 `server/.env` 都被 ignore。
6. 前端类别选择是否真实进入 `categoryIds`？是。
7. `categoryIds` 是否真正映射到 AMap `types`？是，由版本化 JSON 映射。
8. “全选”是否仍存在省略 `types` 的情况？否，12 类均为非空 types Job。
9. 是否按类别建立独立 CategoryJob？是。
10. 每个 CategoryJob 是否独立分页？是。
11. 是否实现 Provider 结果饱和检测？是。
12. saturated 是否不会被误标 complete？是，状态保持可审计。
13. 是否实现自适应空间细分？是。
14. 空间细分是否只针对饱和类别？是。
15. 最大细分深度是多少？3。
16. 是否存在最小 cell 限制？是，0.25 km²。
17. 是否实现 rolling request budget？是。
18. 自动预算是多少？20；用户确认后 40。
19. 达到预算后是否停止继续请求？是。
20. 部分结果是否得到保留？是。
21. 是否实现 category/cell/page 细粒度缓存？是。
22. 类别增量查询是否可以复用已有缓存？是，自动测试和真实 cache hit 均证明。
23. 是否实现全局 provider ID 去重？是。
24. 景点与公园是否仍存在明显重复？没有；公园优先分类且全局去重。
25. 是否建立类别 precedence？是，nature 高于 attraction。
26. 高德候选 POI 是否继续执行 WGS84 canonical covers？是。
27. 新 PoiResult 是否仍兼容 Minute Accessibility？是，合同未变。
28. POI 卡片是否无需 Provider-specific 修改？是。
29. 页面是否显示分类统计？是。
30. 高德小范围五类别查询返回多少 POI？546。
31. 高德全选返回多少 POI？912。
32. 哪些类别触发 saturated？五分类为 food/lodging/transport；全选除 nature 外多个高密类别均 saturated。
33. 哪些类别发生空间 split？五分类的 attraction，3 次；全选轮次因自动预算未进入 split 阶段。
34. 本轮高德真实 upstream request 数是多少？两轮各 20。
35. cache hit 数是多少？五分类 14，全选 18。
36. 是否出现高德 429 / 5xx？冷却前出现一次业务码 10021；最终两轮无 429/5xx。
37. Foursquare 是否仍然正确报告 429？是。
38. Foursquare 是否发生盲目自动重试？否。
39. 是否发生 silent fallback？否。
40. 是否发生 Mock fallback？否。

## 测试与证据

- 后端：14/14 PASS。
- 前端：143/143 PASS。
- Python compile 与 `git diff --check`：PASS。
- 性能 fixture：100/500/1000/2000 POI 均保持单 GeoJSON source，未记录长任务。
- 详细证据位于 `exports/stage-12-6-1-amap-completeness/`，包括真实审计、请求样本、类别映射、性能、GitHub 报告和截图。

## 外部配置说明

正式后端必须通过 `set -a; source server/.env; set +a` 加载本地密钥后启动；密钥没有写入代码、日志、截图、Bundle 或 Git。当前 ORS 配置本身仍报告未完成服务端配置，因此本阶段真实高德验收使用同一业务端点和黄鹤楼审计 Polygon 独立完成，不伪造 ORS 成功状态。
