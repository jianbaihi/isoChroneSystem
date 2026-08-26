# 分钟补齐调用链审计

## 基线问题

`matrixButton → runSpatialTimeAccessibility → analysisClient.createMinuteAccessibility → POST /api/v1/minute-accessibility → calculate_minute_accessibility → planner → OrsAdapter/cache → calculate_spatial_time_accessibility → full AnalysisResult → store.setResult → map rebuild`

旧链把 Reachability、POI 和分钟结果重新合并为完整 AnalysisResult，会覆盖独立 PoiResult 并把分钟几何相关载荷带入前端发布。

## Stage 12.4 链路

`matrixButton → runSpatialTimeAccessibility(workflow.poiResult) → analysisClient.createMinuteAccessibility → POST /api/v1/minute-accessibility → identity validation → dynamic planner → OrsAdapter batch cache → prepared geometry + covers classification → MinuteAccessibilityResult(assignments only) → store.setMinuteResult → minuteAssignmentByPoiId → buildPoiDetailViewModel(poiId)`

独立性：POI Query 0、Matrix 0、Panmap layout 0、传统地图 rebuild 0、POI render 0。

