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
    counts = {ring.ringId: 0 for ring in result.rings}
    within = 0
    outside = 0
    calculated_at = datetime.now(timezone.utc).isoformat()
    for poi in result.pois:
        point = Point(poi.location.lon, poi.location.lat)
        minute = next((value for value, polygon in polygons if polygon.covers(point)), None)
        if minute is None:
            poi.travelTimeSeconds = None
            poi.networkDistanceMeters = None
            poi.ringId = "matrix-out-of-range"
            poi.matrixBandId = "matrix-out-of-range"
            poi.matrixStatus = "unreachable"
            poi.reachable = False
            outside += 1
            continue
        ring_id = _ring_for_minute(result, minute)
        poi.travelTimeSeconds = float(minute * 60)
        poi.networkDistanceMeters = 0
        poi.ringId = ring_id
        poi.matrixBandId = ring_id
        poi.bandAssignmentMethod = "minute-isochrone-spatial"
        poi.matrixStatus = "ok"
        poi.reachable = True
        poi.routingProvider = "ors-public-api"
        poi.calculatedAt = calculated_at
        counts[ring_id] = counts.get(ring_id, 0) + 1
        within += 1

    for ring in result.rings:
        ring.statistics.poiCount = counts.get(ring.ringId, 0)
    if result.nameCloud:
        result.nameCloud.setdefault("stats", {})["eligibleCount"] = within
        result.nameCloud["stats"]["bandCounts"] = counts
    result.accessibility = []
    result.metadata.matrix = None
    result.metadata.spatialTime = {
        "method": "minute-isochrone-spatial",
        "precisionMinutes": 1,
        "requestedPoiCount": len(result.pois),
        "withinRangeCount": within,
        "outOfRangeCount": outside,
        "minuteIsochroneCount": len(minute_isochrones),
        "maxRangeMinutes": max_minute,
        "calculatedAt": calculated_at,
        "upstreamRequestCount": 0,
    }
    selection = result.metadata.poiSelection if isinstance(result.metadata.poiSelection, dict) else {}
    result.metadata.poiSelection = {**selection, "travelTimesCalculated": True, "bandAssignmentMethod": "minute-isochrone-spatial"}
    result.metadata.warnings = [warning for warning in result.metadata.warnings if "Matrix" not in warning]
    result.metadata.warnings.append("POI 时间由 1 分钟累计等时圈的空间包含关系判定，不使用 Matrix。")
    return result
