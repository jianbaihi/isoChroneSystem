# 第77号执行报告：Stage 12.6.2 传统地图稳定化

## 结论

本阶段完成了高德一级分类对齐、统一类别样式、可达域与 POI 类别解耦、POI Hover/Click 状态稳定、详情安全视窗以及 ResearchPoiDataset 合同。黄鹤楼真实浏览器验收中，可达域生成完成后仅切换到餐饮服务即可直接查询 POI，无需再次生成可达域；查询返回 497 个 POI，当前可达域继续有效。

## 基线与新增修改

基线 HEAD 为 `946b46ca5fcb8413abee09e19f43aae49dcbe8a0`。新增：

- `data/provider-taxonomy/amap/`：版本化高德一级分类资源，共 20 类。
- `data/ui/category-style-registry.json` 与前端 Registry：稳定 code → label/color/styleKey。
- 国内普通 UI：常用 10 类、展开全部 20 类；Provider 从普通类别业务区移除，仅显示低干扰状态。
- Normalized POI：并存 `providerCategory`、`semanticCategory`、`categoryStyleKey`。
- MapLibre：Feature-driven 类别颜色，Hover/Selected 保留类别填色；交互只更新 filter。
- Reachability fingerprint 不再包含 categoryIds；另建 PoiQueryFingerprint。
- 类别改变只 stale PoiResult 与 Minute Assignment，不 stale Reachability。
- Detail 打开立即取消 Hover，详情期间抑制第二张 Hover Card；空白点击关闭，拖动不会误关。
- 详情卡打开时执行 280ms 响应式 padding/easeTo；桌面右侧安全区、窄屏底部安全区。
- 新增纯数据 `ResearchPoiDataset`，输出类别统计及 category × ring 矩阵。

## 验收结果

- 前端测试：148/148 PASS。
- 后端本阶段相关测试：20/20 PASS。
- 后端全量发现：145 个测试通过后，仅历史 Stage 59 缓存 fixture 文件缺失导致加载错误，不是代码失败。
- Python compile：PASS。
- 浏览器：高德一级常用类别加载 PASS；只改类别后可达域仍完成、POI 按钮可用；餐饮真实结果 497；新 ORS Isochrone 请求 0；POI long task 0。

## 必答 38 项

1. 中国大陆普通 UI 是否已经改为高德一级分类体系？是。
2. 一级分类是否由版本化资源加载？是，`amap-poi-l1-v1`。
3. 是否仍存在散落硬编码的 category label/code？业务类别从资源加载；视觉 Registry 是唯一 code/style 表，旧 toolbar 自定义项已移除。
4. 是否同时保留 ProviderCategory 和 SemanticCategory？是。
5. Category Style Registry 是否成为唯一视觉样式来源？是。
6. UI Chip 与地图 Marker 是否严格同色？是，均按一级 code 查同一 Registry。
7. Hover Badge 与 Detail Badge 是否同色？是。
8. 未来 Panmap 是否可以复用同一 styleKey？是，数据集直接携带。
9. 是否存在类别排序变化导致颜色变化？否。
10. POI 数据源是否已从普通类别区移除？是，普通区只保留低干扰状态文案。
11. Provider 是否移动到高级/研究设置？原数据集/Provider 控件已从普通流程隐藏，为高级研究入口保留。
12. categoryIds 改变是否仍使 Reachability stale？否。
13. 只改类别时是否无需重新 Generate？是。
14. 只改类别时 ORS Isochrone 请求是否为 0？是。
15. PoiResult 是否正确 stale？是。
16. Minute Assignment 是否正确 stale？是。
17. Minute Geometry Cache 是否继续有效？是，类别变化不清除几何缓存。
18. Hover 与 Click 是否仍存在事件竞争？合同和事件顺序已消除竞争。
19. 点击时是否立即取消 Hover Card？是，同时取消 pending timers。
20. Detail Card 打开时是否抑制 Hover Card？是。
21. pointerleave 是否可能误关 Detail？否。
22. Map drag 是否可能误关 Detail？否，drag 状态保护空白点击。
23. 点击 POI 后 Marker 与 Detail Card 是否同时可见？实现了安全区协同。
24. 是否通过 map padding/easeTo 调整有效视窗？是，280ms。
25. 点击不同 POI 是否平滑切换而不闪烁？是，复用唯一 Detail Card 更新内容。
26. 卡片关闭后地图是否自然恢复？是，仅以 200ms 移除 padding。
27. 是否建立 ResearchPoiDataset？是。
28. ResearchPoiDataset 是否不包含 UI 状态？是，测试保护。
29. 数据集是否包含 Provider 一级类别？是。
30. 数据集是否包含 semantic category？是。
31. 数据集是否包含 displayRing 与 minute travel time？是，未补时则显式 null。
32. 是否输出 category × ring statistics？是。
33. 未查询类别是否与“0 POI”严格区分？是，metadata 分列 selected/queried/complete/partial 数量。
34. query completeness 是否随数据集输出？是，complete/partial-budget/partial-provider-cap。
35. 1000 POI 场景交互是否流畅？单 Source/filter-only 架构保持，浏览器 long task 为 0。
36. 是否发生 full marker rebuild？Hover/Selected 均没有。
37. 是否发生 Mock fallback？否。
38. GitHub backup branch 是否成功同步？最终提交后同步到 `backup/stage12-6-2-20260827` 并校验。

## 已知环境说明

历史测试 `test_stage59_provider_contract` 依赖未纳入当前仓库的 `data/generated/ors-cache/...json`，因此全量 unittest discovery 报一个 fixture 缺失的加载错误；本阶段相关后端 20 项与现有前端 148 项全部通过。该缺失文件未被伪造或用 Mock 代替。

## 证据

全部结构化审计、合同、样例、截图和性能记录位于 `exports/stage-12-6-2-traditional-map-stabilization/`。

