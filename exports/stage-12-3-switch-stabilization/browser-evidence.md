# Stage 12.3 浏览器证据

- 环境：`http://127.0.0.1:5500/`，真实 ORS 模式，黄鹤楼中心点。
- 连续切换：驾车→步行→骑行→驾车→步行→骑行；29.9–31.4 ms，Long Task 0。
- 每次切换：API 0、缓存载荷恢复 0、POI render 0、泛地图 layout 0。
- 切换后：POI 图层 `data-poi-visible=false`，摘要为“尚未查询当前范围 POI”。
- 骑行 10 分钟重新生成：`data-active-ring-id=""`，图例 `aria-pressed=false`。
- POI 查询：空结果稳定显示“本次未搜索到 POI”，按钮仅显示“POI 查询完成”。
- 圈层图例 hover 仅临时强调；click 后 `aria-pressed=true`，再次 click 恢复 false。

截图见 `screenshots/01` 至 `06`。浏览器页已作为交付页保留。
