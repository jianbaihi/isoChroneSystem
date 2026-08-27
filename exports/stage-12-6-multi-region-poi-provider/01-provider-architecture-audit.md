# Provider 架构审计

```text
POST /api/v1/poi-query
  -> PoiRegionResolver (versioned mainland polygon)
  -> PoiProviderRouter (auto / validated override)
  -> capability-driven PoiQueryPlanner
  -> AmapPoiAdapter | FoursquarePoiAdapter | legacy OrsRemotePoiProvider
  -> provider coordinate/category normalizer
  -> canonical WGS84 covers + ring assignment
  -> PoiQueryResult / NormalizedPoi
  -> Map | Minute Accessibility | shared POI cards
```

上层 UI 与分钟链没有 Amap/Foursquare 原始字段分支。失败默认终止，没有静默跨 Provider fallback。
