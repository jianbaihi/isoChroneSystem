# 第59号 OpenPOIService 生产客户端契约审计

审计对象是当前生产路径，而非独立临时 HTTP 代码：

- URL：`OrsPoiClient.endpoint`，由 `ORS_POI_BASE_URL + ORS_POI_PATH` 组成；当前默认路径为 `/pois`。
- 生产 Payload 构造：`OrsRemotePoiProvider._body(cell, limit)`。
- 生产 HTTP 调用：`OrsPoiClient.query(body)`，`POST` JSON，认证头仅在进程内构造，不进入 payload 或证据。
- 缓存键：`JsonResponseCache.read/write("poi", endpoint, body, ...)`；Stage59 新增 `isolated_stage59_canary_client()`，将 Canary 缓存隔离至 `data/generated/ors-cache/provider-contract-canary/stage59/`，并禁用 stale-if-error。
- 限制与截断：生产限制为 2000；返回 FeatureCollection 的 `features.length >= 2000` 仅可标记 `resultTruncated=true`。第59号 Canary runner 没有递归细分、重试、替换分片或并发逻辑。
- 错误解析：401/403→认证错误、429→限流、400/422→请求拒绝、5xx/其他4xx→不可用，非 FeatureCollection→结构错误。
- 常规网格路径的 Polygon 递归入口为 `split_poi_cell()`；它不适用于第59号 Canary，也没有自动拆分 MultiPolygon 的隐式逻辑。

当前无类别过滤的生产 body 为：

```json
{
  "request": "pois",
  "geometry": {"geojson": {"type": "Polygon 或 MultiPolygon", "coordinates": []}},
  "limit": 2000,
  "sortby": "category"
}
```

它不带 `filters` 字段；这是实际无筛选生产契约，不是错误或 Stage59 私有替代 schema。43 个最终 payload 已均由该生产构造函数离线生成和校验。Provider 是否真正接受 MultiPolygon 尚未得到实测结论，因为配额门禁阻止 Canary。
