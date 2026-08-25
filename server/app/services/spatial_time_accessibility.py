from copy import deepcopy
from datetime import datetime, timezone

from shapely.geometry import Point, shape

from app.models import AnalysisResult, SpatialTimeAccessibilityRequest


def _ring_for_minute(result: AnalysisResult, minute: int) -> str:
    for ring in sorted(result.rings, key=lambda item: item.outerRangeMinutes):
        if minute <= ring.outerRangeMinutes:
            return ring.ringId
    return "matrix-out-of-range"


def calculate_spatial_time_accessibility(request: SpatialTimeAccessibilityRequest) -> AnalysisResult:
    result = deepcopy(request.baseResult)
    max_minute = max(result.rangesMinutes)
    minute_isochrones = request.minuteIsochrones
    if minute_isochrones[-1].rangeMinutes != max_minute:
        raise ValueError("minuteIsochrones 必须覆盖到当前最大时间阈值。")

    polygons = [(item.rangeMinutes, shape(item.geometry)) for item in minute_isochrones]
    non_nested = sum(1 for index in range(1, len(polygons)) if not polygons[index][1].covers(polygons[index - 1][1]))
    counts = {ring.ringId: 0 for ring in result.rings}
    within = 0
    outside = 0
    boundary = 0
    calculated_at = datetime.now(timezone.utc).isoformat()
    for poi in result.pois:
        point = Point(poi.location.lon, poi.location.lat)
        minute = next((value for value, polygon in polygons if polygon.covers(point)), None)
        if minute is None:
            poi.travelTimeMinuteEstimate = None
            poi.travelTimeBand = None
            poi.travelTimeMethod = None
            outside += 1
            continue
        ring_id = _ring_for_minute(result, minute)
        poi.ringId = ring_id
        poi.travelTimeMinuteEstimate = minute
        poi.travelTimeBand = {"lowerExclusiveMinutes": minute - 1, "upperInclusiveMinutes": minute}
        poi.travelTimeMethod = "isochrone-minute-band"
        poi.bandAssignmentMethod = None
        poi.reachable = True
        poi.routingProvider = "ors-public-api"
        poi.calculatedAt = calculated_at
        if polygons[minute - 1][1].boundary.covers(point):
            boundary += 1
        counts[ring_id] = counts.get(ring_id, 0) + 1
        within += 1

    for ring in result.rings:
        ring.statistics.poiCount = counts.get(ring.ringId, 0)
    if result.nameCloud:
        result.nameCloud.setdefault("stats", {})["eligibleCount"] = within
        result.nameCloud["stats"]["bandCounts"] = counts
    result.metadata.spatialTime = {
        "method": "isochrone-minute-band",
        "precisionMinutes": 1,
        "requestedPoiCount": len(result.pois),
        "withinRangeCount": within,
        "outOfRangeCount": outside,
        "minuteIsochroneCount": len(minute_isochrones),
        "maxRangeMinutes": max_minute,
        "calculatedAt": calculated_at,
        "upstreamRequestCount": 0,
        "cacheHitCount": 0,
        "batchCount": 0,
        "boundaryPoiCount": boundary,
        "nonNestedContourPairCount": non_nested,
    }
    selection = result.metadata.poiSelection if isinstance(result.metadata.poiSelection, dict) else {}
    result.metadata.poiSelection = {**selection, "travelTimesCalculated": True, "bandAssignmentMethod": "isochrone-minute-band"}
    minute_warning = "POI 时间为 1 分钟累计等时圈区间估计；仅本方法产生的结果不填写 Matrix 秒数与距离字段。"
    if minute_warning not in result.metadata.warnings:
        result.metadata.warnings.append(minute_warning)
    return result
