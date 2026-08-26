# 第 67 号项目更新文档：第 12.3 阶段——传统地图切换稳定化

## 基线

- 基线提交：`ad627782e8b71fb74ef6b47bd0bc29e0b11beb4f`。
- 已有能力：任意中心点、任意阈值、步行/骑行/驾车等时圈、独立 POI 查询、分钟等时圈与泛地图入口。
- 本阶段前问题：交通方式切换同步恢复完整缓存结果，并经 store subscriber 触发传统地图、POI 与泛地图更新；新结果可能继承圈层 focus；POI 数量混在操作状态中，缺少低干扰摘要。

## 新增修改

- 交通方式切换改为轻量状态切换：只更新 profile、stale 状态、交互焦点和 POI 图层可见性。
- 删除切换路径上的 `sessionStorage`/archive payload hydration、API、POI source rewrite 和泛地图 layout。
- `resultsByProfile` 只保存轻量索引；旧结果快照不再携带 POI、类别、可达性和词云大数组。
- POI 隐藏使用 MapLibre layer visibility，复杂度与 POI 数量无关。
- 新结果与跨 profile 切换统一重置 active/hover/focus；stale 圈层不响应 hover/click。
- 生成可达域只更新传统地图，不再自动进入泛地图或选中最大圈层。
- 新增独立 POI 摘要，覆盖 loading、完整、截断、空、stale、idle；按钮保留动作语义。
- 增加 profile-switch 性能埋点与 Stage 12.3 回归测试。

## 根因与性能

主因是 A（eager cache hydration）与 B（store subscriber 全量重绘）的组合，C（POI source rewrite）是其下游放大项；不是 ORS API 或几何本身。基线点击曾超过 10 秒交互期限，旧版没有可分项数值埋点，故不伪造具体耗时。优化后六次切换为 29.9–31.4 ms，其中 store 0.4–0.6 ms、POI visibility 0–0.1 ms，最大 Long Task 0 ms。

## 20 项结论

1. 骑行卡顿来自同步完整缓存恢复及其触发的订阅者全量重绘。
2. 是，与 eager hydration 直接有关。
3. 否，switch 不再读取完整 POI payload。
4. 否，实测与埋点均为 0 API。
5. 否，POI render 为 0；仅切换图层 visibility。
6. 否，panmap layout 为 0。
7. 否，未触发分钟计算。
8. 否，未触发 Matrix。
9. walking→cycling 实测 29.9–30.0 ms。
10. cycling→walking 的对向 walking 切换实测 31.0–31.1 ms。
11. 最大 Long Task 为 0 ms。
12. 是，600 POI 仍由既有分批渲染链路显示；本阶段未删除或缩减查询结果，自动化覆盖 600 条快照及 O(1) 隐藏。
13. 是，缓存键和显式工作流保持；仅解除“点击交通方式即恢复完整 payload”的耦合。
14. 是，新 ReachabilityResult 的 active/hover/focus 均为 null；浏览器图例为 false。
15. 是，Hover 只写 hoveredRingId，离开即清除。
16. 是，Click 才写 activeRingId/focusedRingId，再次点击可取消。
17. 否，profile switch 强制清除旧 focus。
18. 是，完整、空和 stale 状态均有独立摘要；浏览器实测空结果文案正确。
19. 是，截断结果明确显示“本次返回 N 个 POI · 结果已截断”，由自动化测试覆盖。
20. 是，类别、阈值、中心或 profile 改变后旧 PoiResult 被清除，摘要立即进入 stale/idle。

## 验证与边界

- `node --test src/state/*.test.js`：38/38 PASS。
- 真实浏览器：六次切换、骑行重新生成 neutral、POI 空结果、hover/click 均通过。
- 服务：后端 health=`ready`，前端 HTTP 200；全部 provider configured。
- 本阶段未修改 Matrix、分钟算法、泛地图算法、数据源与聚类。

证据目录：`exports/stage-12-3-switch-stabilization/`。
