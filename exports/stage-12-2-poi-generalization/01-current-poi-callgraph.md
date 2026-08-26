# Current POI click-chain audit

## Baseline call graph

`#poiQueryButton` → `runNameCloud()` in `app.js` → `analysisClient.createNameCloud()` → `POST /api/v1/name-clouds` → `create_name_cloud_endpoint()` → `services.analysis.create_name_cloud()` → `OrsRemotePoiProvider.fetch()` → tiling/concurrency/OpenPOIService → normalization/deduplication → `outer_geometry.covers(point)` → display-ring assignment → `analysisStore.setResult()` → `applyAnalysisResultToTraditionalMap()` → MapLibre GeoJSON POI source.

## Coupling defects found before modification

- The POI business endpoint is named `/name-clouds` and returns an `AnalysisResult` carrying a `nameCloud` payload and `panmapMode`.
- POI publication overwrites `lastSuccessfulResult`, so reachability, POI and minute stages are not independently represented.
- `applyAnalysisResultToTraditionalMap()` can be followed by ordinary app rendering that observes the combined result; the POI click is therefore not contractually isolated from panmap consumers.
- The click does not directly call Matrix or minute APIs, but this is not protected by dedicated POI-call tests.

This is a `performance coupling defect`. Stage 12.2 replaces the normal click path with `/api/v1/poi-query` and an independent `PoiResult`. The historical `/name-clouds` endpoint remains only for compatibility/research flows.
