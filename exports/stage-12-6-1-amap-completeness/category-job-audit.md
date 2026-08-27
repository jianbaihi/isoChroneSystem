# CategoryJob 与完整度审计

- UI 固定 12 个一级归一化类别；默认五类为景点、公园、餐饮、酒店、交通。
- `categoryIds` 始终显式提交；全选不会再折叠为空数组。
- `amap-query-v1.json` 将每个内部类别映射到非空 `types`，景点排除公园优先码，公园使用 `110100`。
- 每个类别建立独立 CategoryJob、独立分页、独立 complete/saturated/blocked-budget 状态。
- 页长 25，默认每 Job 最多 4 页；满页到顶即 saturated，绝不标记 complete。
- 只对 saturated 类别沿最长轴二分；最大深度 3，最小 cell 面积 0.25 km²。
- 自动滚动预算 20，用户确认后 40；达到预算立即停止并保留部分结果。
- 缓存键包含 provider/category/typesVersion/geometryHash/page/pageSize/coordinatePolicyVersion/adapterVersion。
- 全局按 providerPoiId 去重，类别 precedence 为 nature 优先于 attraction。
- 高德调用采用最小 1.05 秒请求间隔，避免账号侧 QPS 突发限制。

