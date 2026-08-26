from __future__ import annotations

from time import perf_counter
from typing import Any
from uuid import uuid4

from shapely.geometry import Point, shape
from shapely.prepared import prep

from app.adapters.ors import OrsAdapter
from app.config import Settings
from app.errors import AnalysisStaleError, ApprovalRequiredError
from app.models import (
    AnalysisOptions, AnalysisRequest, MinuteAccessibilityAssignment,
    MinuteAccessibilityRequest, MinuteAccessibilityResult,
)
from app.services.analysis import geodesic_area_km2
from app.services.minute_isochrone_planner import build_minute_isochrone_plan
from app.services.poi_query import analysis_fingerprint
from app.services.quota import QuotaObserver


def classify_minute_accessibility(request: MinuteAccessibilityRequest, minute_isochrones):
    parse_started = perf_counter()
    polygons = []
    nesting_audit: list[dict[str, Any]] = []
    for contour in sorted(minute_isochrones, key=lambda item: item.rangeMinutes):
        geometry = shape(contour.geometry)
        polygons.append((contour.rangeMinutes, geometry, prep(geometry)))
    geometry_parse_ms = (perf_counter() - parse_started) * 1000
    for index in range(1, len(polygons)):
        minute_a, geometry_a, _ = polygons[index - 1]
        minute_b, geometry_b, _ = polygons[index]
        nested = geometry_b.covers(geometry_a)
        nesting_audit.append({
            "minuteA": minute_a, "minuteB": minute_b, "pairNested": nested,
            "differenceAreaKm2": 0.0 if nested else round(geodesic_area_km2(geometry_a.difference(geometry_b)), 6),
        })

    classify_started = perf_counter()
    points = {item["poiId"]: Point(item["location"]["lon"], item["location"]["lat"]) for item in request.pois}
    unresolved = set(points)
    assignments: dict[str, MinuteAccessibilityAssignment] = {}
    boundary_count = 0
    for minute, geometry, prepared in polygons:
        matched = [poi_id for poi_id in unresolved if prepared.covers(points[poi_id])]
        for poi_id in matched:
            if geometry.boundary.covers(points[poi_id]):
                boundary_count += 1
            assignments[poi_id] = MinuteAccessibilityAssignment(
                poiId=poi_id, travelTimeMinuteEstimate=minute,
                travelTimeBand={"lowerExclusiveMinutes": minute - 1, "upperInclusiveMinutes": minute},
                status="classified",
            )
        unresolved.difference_update(matched)
        if not unresolved:
            break
    for poi_id in unresolved:
        assignments[poi_id] = MinuteAccessibilityAssignment(
            poiId=poi_id, status="unassigned", reason="not-covered-by-minute-contours",
        )
    classification_ms = (perf_counter() - classify_started) * 1000
    ordered = [assignments[item["poiId"]] for item in request.pois]
    stats = {
        "totalPoiCount": len(points), "classifiedPoiCount": len(points) - len(unresolved),
        "unassignedPoiCount": len(unresolved), "boundaryPoiCount": boundary_count,
        "nonNestedContourPairCount": sum(1 for item in nesting_audit if not item["pairNested"]),
        "geometryParseDurationMs": round(geometry_parse_ms, 3),
        "classificationDurationMs": round(classification_ms, 3),
    }
    return ordered, stats, nesting_audit


async def calculate_minute_accessibility(
    request: MinuteAccessibilityRequest,
    settings: Settings,
    *, adapter: OrsAdapter | None = None,
    quota_observer: QuotaObserver | None = None,
) -> MinuteAccessibilityResult:
    total_started = perf_counter()
    expected_fingerprint = analysis_fingerprint(request.center, request.profile, request.rangesMinutes, request.categoryIds)
    if request.analysisFingerprint != expected_fingerprint:
        raise AnalysisStaleError("minute_analysis_fingerprint_mismatch")
    plan = build_minute_isochrone_plan(request.profile, request.maxRangeMinutes)
    if plan.approvalRequired and not request.approved:
        raise ApprovalRequiredError(
            f"分钟级分析需要 {plan.batchCount} 次等时圈请求，超过自动执行上限 {plan.autoRequestLimit}。",
            [{"field": "minuteIsochrones", "reason": "request_budget", "plan": plan.as_dict(),
              "estimatedUpstreamRequests": plan.batchCount}],
        )

    provider = adapter or OrsAdapter(settings, quota_observer=quota_observer)
    minute_isochrones = []
    cache_hits = 0
    upstream_requests = 0
    batch_audit: list[dict[str, Any]] = []
    for index, ranges in enumerate(plan.batches):
        batch_request = AnalysisRequest(
            center=request.center, profile=request.profile, rangesMinutes=ranges, categoryIds=[],
            options=AnalysisOptions(includePois=False, calculateTravelTimes=False),
        )
        batch = await provider.create_isochrones(batch_request)
        cache_hit = bool(provider.last_cache_hit)
        cache_hits += int(cache_hit)
        upstream_requests += int(not cache_hit)
        minute_isochrones.extend(batch)
        batch_audit.append({"batchIndex": index, "rangesMinutes": ranges, "status": "completed",
                            "cacheHit": cache_hit, "upstreamRequestCount": int(not cache_hit)})

    assignments, statistics, nesting_audit = classify_minute_accessibility(request, minute_isochrones)
    statistics["totalDurationMs"] = round((perf_counter() - total_started) * 1000, 3)
    return MinuteAccessibilityResult(
        minuteAccessibilityId=f"minute-accessibility-{uuid4()}",
        analysisFingerprint=request.analysisFingerprint, poiQueryId=request.poiQueryId,
        center=request.center, profile=request.profile, rangesMinutes=request.rangesMinutes,
        maxRangeMinutes=request.maxRangeMinutes, assignments=assignments, statistics=statistics,
        metadata={
            "method": "isochrone-minute-band", "geometryRepair": "off", "minuteGeometryIncluded": False,
            "plan": plan.as_dict(), "batchCount": plan.batchCount, "cacheHitCount": cache_hits,
            "upstreamRequestCount": upstream_requests, "batches": batch_audit, "nestingAudit": nesting_audit,
            "poiQueryUpstreamRequestCount": 0, "matrixUpstreamRequestCount": 0, "panmapLayoutCallCount": 0,
        },
    )
