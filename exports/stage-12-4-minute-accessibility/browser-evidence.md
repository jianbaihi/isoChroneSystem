# Stage 12.4 浏览器验收

- walking 5/10/15：118 POI，2 批，118 classified，0 unassigned；重复分钟请求 2/2 cache hit、上游 0。
- cycling 7/13/18：600 POI（明确截断），2 批，561 classified，39 unassigned；首轮上游 2，重复请求 2/2 cache hit、上游 0。
- cycling 分类 22.055 ms；前端发布 4.5 ms；最大 Long Task 0。
- 发布过程地图重建 0、POI render 0、泛地图 layout 0、Matrix 0、POI Query 0。
- 响应 `minuteGeometryIncluded=false`，仅包含 assignments、统计和审计。
- `window.buildPoiDetailViewModel(poiId)` 成功构造“北京华联，约 14 分钟，(13,14]”且可选字段为 null。
- walking 首次 Reachability 遇到一次 504 timeout，重试成功；无 429，无 Mock fallback。

