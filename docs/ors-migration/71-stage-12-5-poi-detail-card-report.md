# 第 71 号执行报告：第 12.5 阶段——POI 悬浮预览与点击详情卡

## 执行结论

本阶段已完成。传统地图现在具备单实例 POI Hover Card 与 Click Detail Card，并统一消费 `PoiDetailViewModel`。真实骑行 600 POI 场景完成浏览器验收：分钟级时间补齐 591/600，卡片开关和 POI 切换无明显卡顿，交互不重建 POI 数据源。

## 基线与新增修改

基线为提交 `056c63bb8e8cb52acc1cf3c7ce99dd55e2b055bd`（Stage 12.4）。基线已有 `NormalizedPoi`、分钟级可达性结果与详情 ViewModel，但地图 POI 没有卡片交互。

本阶段新增：

- 固定一个 `#poiHoverCard` 与一个 `#poiDetailCard`，杜绝逐 POI DOM 节点。
- 新增独立 `poiInteractionState`，覆盖 hover、leave、select、switch、close。
- 详情数据统一通过 `buildPoiDetailViewModel` 获取，扩展交通方式、坐标和来源分类显示字段。
- address、rating、phone、website、openingHours 缺失时整行隐藏。
- MapLibre hover/selected 高亮仅调用 `setFilter`，不调用 `setData`。
- 支持关闭按钮与 Escape；点击其他 POI 时详情卡原位平滑切换。
- 新增性能记录、自动测试、真实浏览器截图和交互证据。

## 真实验收结果

- 场景：黄鹤楼中心、骑行、10/20/30 分钟、600 个真实 POI。
- POI：OpenPOIService 真实缓存命中，未使用 Mock。
- 分钟级结果：591 个获得一分钟精度时间，9 个暂未匹配。
- Hover 打开 2.4–5.3ms，关闭 0–0.1ms。
- Detail 打开 1.3–1.7ms，切换 1.3ms，关闭 0–0.1ms。
- 观测到的最大 Long Task 为 0ms。
- 浏览器可访问树始终只有一个 tooltip 和一个 dialog。

## 二十项逐项回答

1. Hover Card 是否已实现？是。
2. Click Detail Card 是否已实现？是。
3. 两者是否使用不同的信息层级？是；Hover 为摘要，Detail 为完整 ViewModel。
4. 是否只有单个 Hover Card 实例？是。
5. 是否只有单个 Detail Card 实例？是。
6. 详情卡片是否来源于 `PoiDetailViewModel`？是。
7. 是否仍依赖 Provider 原始字段？否；卡片层只读取规范化 ViewModel。
8. 缺失 address / rating / phone / website / openingHours 时是否正常？是；空字段行隐藏。
9. POI 是否有 hover 高亮？是，使用独立 MapLibre filter 图层。
10. POI 是否有 selected 高亮？是，且与圈层选中状态联动。
11. 点击不同 POI 时是否平滑切换内容？是；“迈克尔·杰克逊雕像”切换到“青年路”已验收。
12. 卡片是否与图例 / 控件冲突？否；详情位于右下并限制高度，Hover 会做视口边缘翻转和夹取。
13. cycling 600 POI 场景下是否仍流畅？是。
14. hover 是否触发全图重绘？否，仅更新 hover filter。
15. click 是否触发全量 POI 重建？否，仅更新 selected filter 和单卡文本。
16. Detail Card 是否支持关闭？是。
17. ESC 是否可关闭？是，已真实验证。
18. UI 是否与当前系统风格统一？是；颜色、圆角、阴影和动效沿用现有浅色系统。
19. 未来更换 POI Provider 是否无需重写卡片层？是；新 Provider 只需适配到 `NormalizedPoi`。
20. 是否发生任何 Mock fallback？否。

## 自动验证

`node --test src/state/*.test.js src/contracts/*.test.js`：58/58 通过。JavaScript 语法检查与 `git diff --check` 均通过。

## 交付物

完整契约、状态审计、性能记录、浏览器证据与截图位于 `exports/stage-12-5-poi-detail-card/`。

