from __future__ import annotations

from uuid import uuid4

from shapely.geometry import shape

from app.config import Settings
from app.errors import AnalysisStaleError, InvalidProviderParameterError
from app.models import AnalysisRequest, PoiQueryRequest, PoiQueryResult
from app.providers.poi.base import PoiProviderAdapter
from app.services.analysis import build_exclusive_rings, geodesic_area_km2
from app.services.quota import QuotaObserver
from app.providers.poi.capabilities import CAPABILITIES
from app.providers.poi.coordinate_policy import VERSION as COORDINATE_POLICY_VERSION
from app.providers.poi.registry import build_provider
from app.providers.poi.router import resolve_provider
from app.services.poi_region_resolver import resolve_region
from app.providers.poi.category_mapping import CATEGORY_MAPPING_VERSION
from app.services.poi_query_planner import build_provider_query_plan


def analysis_fingerprint(center, profile: str, ranges: list[int], category_ids: list[str]) -> str:
    text = "|".join([
        "v1",
        f"{float(center.lon):.6f}",
        f"{float(center.lat):.6f}",
        profile,
        ",".join(str(value) for value in ranges),
        ",".join(sorted(set(category_ids))),
    ])
    value = 2166136261
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * 16777619) & 0xFFFFFFFF
    return f"fnv1a-{value:08x}"


async def query_pois(
    request: PoiQueryRequest,
    settings: Settings,
    poi_provider: PoiProviderAdapter | None = None,
    quota_observer: QuotaObserver | None = None,
) -> PoiQueryResult:
    ranges = list(request.rangesMinutes)
    contour_ranges = [item.rangeMinutes for item in request.cumulativeIsochrones]
    if contour_ranges != ranges:
        raise AnalysisStaleError("ranges_do_not_match_cumulative_isochrones")
    if request.outerIsochrone.rangeMinutes != max(ranges):
        raise AnalysisStaleError("outer_range_not_current_maximum")
    if request.outerIsochrone.geometry != request.cumulativeIsochrones[-1].geometry:
        raise AnalysisStaleError("outer_geometry_not_current_maximum")
    expected = analysis_fingerprint(request.center, request.profile, ranges, request.categoryIds)
    if request.analysisFingerprint != expected:
        raise AnalysisStaleError("fingerprint_mismatch")

    outer_geometry = shape(request.outerIsochrone.geometry)
    if not outer_geometry.is_valid or outer_geometry.is_empty:
        raise InvalidProviderParameterError("outerIsochrone", "invalid_geometry")
    rings = build_exclusive_rings(request.cumulativeIsochrones)
    provider_request = AnalysisRequest(
        center=request.center,
        profile=request.profile,
        rangesMinutes=ranges,
        categoryIds=request.categoryIds,
        options={"includePois": True, "calculateTravelTimes": False},
    )
    region_result = resolve_region(request.center.lon, request.center.lat)
    provider_id = getattr(poi_provider, "provider_id", None)
    if poi_provider is None:
        provider_id = resolve_provider(region_result["region"], settings, request.providerOverride)
        poi_provider = build_provider(provider_id, settings, quota_observer)
    provider_id = provider_id or "ors_remote"
    provider_plan = build_provider_query_plan(provider_id, outer_geometry)
    selection = await poi_provider.fetch(
        provider_request,
        outer_geometry,
        rings,
        single_polygon=False,
        approved=request.approved,
    )
    coverage = {
        **selection.get("coverage", {}),
        "areaKm2": round(geodesic_area_km2(outer_geometry), 6),
        "outerRangeMinutes": max(ranges),
        "candidatePoiCount": selection.get("coverage", {}).get("deduplicated", 0)
            + selection.get("diagnostics", {}).get("outside_outer_isochrone", 0),
        "insideOuterIsochroneCount": selection.get("matchedCount", 0),
        "outsideRemovedCount": selection.get("diagnostics", {}).get("outside_outer_isochrone", 0),
        "duplicateRemovedCount": max(0, selection.get("coverage", {}).get("parsedPoiCount", 0)
            - selection.get("coverage", {}).get("deduplicatedPoiCount", 0)),
        "uniquePoiCount": selection.get("coverage", {}).get("deduplicatedPoiCount", 0),
    }
    return PoiQueryResult(
        poiQueryId=f"poi-query-{uuid4()}",
        analysisFingerprint=expected,
        center=request.center,
        profile=request.profile,
        rangesMinutes=ranges,
        categoryIds=request.categoryIds,
        outerRangeMinutes=max(ranges),
        pois=selection["pois"],
        categories=selection.get("categories", []),
        ringStatistics={ring_id: {"poiCount": count} for ring_id, count in selection.get("ringCounts", {}).items()},
        coverage=coverage,
        metadata={
            "region": region_result["region"],
            "regionResolution": region_result,
            "provider": provider_id,
            "providerLabel": CAPABILITIES.get(provider_id, {}).get("label", provider_id),
            "providerRequestCount": int(coverage.get("requests", 0)),
            "providerCacheHitCount": int(coverage.get("cacheHits", 0)),
            "truncated": bool(coverage.get("truncated")),
            "providerAdapterVersion": CAPABILITIES.get(provider_id, {}).get("adapterVersion", "legacy"),
            "coordinatePolicy": COORDINATE_POLICY_VERSION if provider_id == "amap" else "wgs84-identity-v1",
            "categoryMappingVersion": CATEGORY_MAPPING_VERSION,
            "cacheIdentity": f"{region_result['region']}:{provider_id}:{CAPABILITIES.get(provider_id, {}).get('adapterVersion', 'legacy')}:{COORDINATE_POLICY_VERSION if provider_id == 'amap' else 'wgs84-identity-v1'}:{CATEGORY_MAPPING_VERSION}",
            "timings": selection.get("timings", {}),
            "providerQueryPlan": provider_plan,
            "cacheHit": bool(coverage.get("cacheHits")),
            "upstreamRequestCount": max(0, int(coverage.get("requests", 0)) - int(coverage.get("cacheHits", 0))),
            "tileCount": int(coverage.get("estimatedTileCount", coverage.get("cells", 0))),
            "apiQuota": quota_observer.snapshot() if quota_observer else None,
            "attribution": selection.get("attribution", []),
            "minuteUpstreamRequestCount": 0,
            "matrixUpstreamRequestCount": 0,
            "panmapLayoutCallCount": 0,
        },
    )
