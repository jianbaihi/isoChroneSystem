from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from shapely.geometry import shape

from app.adapters.ors import IsochronesProvider, OrsAdapter
from app.config import Settings
from app.errors import InvalidProviderParameterError, PoiCoverageAreaExceededError, PoiUpstreamTruncatedError
from app.models import AnalysisMetadata, AnalysisRequest, AnalysisResult, NameCloudRequest, Ring, RingStatistics
from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.repositories.local_poi import LocalPoiRepository
from app.services.geometry import build_exclusive_rings, geodesic_area_km2
from app.services.mock_analysis import create_mock_analysis
from app.services.poi_selection import select_local_overture_pois
from app.services.quota import QuotaObserver


def _generated_at() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def create_analysis(
    request: AnalysisRequest,
    request_id: str,
    settings: Settings,
    ors_adapter: IsochronesProvider | None = None,
    poi_provider: Any | None = None,
    quota_observer: QuotaObserver | None = None,
) -> AnalysisResult:
    if settings.analysis_provider == "mock":
        return create_mock_analysis(request, request_id)

    provider = ors_adapter or OrsAdapter(settings, quota_observer=quota_observer)
    cumulative_isochrones = await provider.create_isochrones(request)
    ring_geometries = build_exclusive_rings(cumulative_isochrones)
    categories = []
    selection: dict = {"pois": [], "categories": [], "ringCounts": {}, "matchedCount": 0, "returnedCount": 0, "truncated": False}
    pois_source = "none"
    dataset_meta = None
    warnings = ["等时圈几何来自真实 ORS。"]
    if settings.poi_provider == "ors_remote" and request.poiDatasetId:
        raise InvalidProviderParameterError("poiDatasetId", "ors_remote_does_not_use_dataset")
    if request.options.includePois and settings.poi_provider in {"local", "overture_local"}:
        with LocalPoiRepository(settings.poi_database_path, read_only=True) as repository:
            selection = select_local_overture_pois(
                request, ring_geometries, repository, settings.poi_max_results, settings.poi_max_candidates
            )
            dataset_meta = repository._dataset_public(repository.get_dataset(request.poiDatasetId or "") or {})
        categories = selection["categories"]
        pois_source = "local-overture"
        warnings.extend([
            "POI 来自本地 Overture Places SQLite 数据集。",
            "POI 圈层归属来自等时圈面内 covers，未计算逐点 Matrix 时间。",
        ])
    elif request.options.includePois and settings.poi_provider == "ors_remote":
        remote_provider = poi_provider or OrsRemotePoiProvider(settings, quota_observer=quota_observer)
        selection = await remote_provider.fetch(request, shape(cumulative_isochrones[-1].geometry), ring_geometries)
        categories = selection["categories"]
        pois_source = "ors-openpoiservice"
        warnings.extend([
            "POI 来自 ORS OpenPOIService，查询范围为 30 分钟累计等时圈。",
            "POI 圈层归属来自等时圈面内 covers，未计算逐点 Matrix 时间。",
        ])
        if selection.get("diagnostics"):
            warnings.append("部分上游 POI 因缺少稳定 OSM 标识、名称或类别而被安全排除。")
    elif request.options.includePois:
        raise InvalidProviderParameterError("POI_PROVIDER", "online_analysis_does_not_fallback_to_mock")

    rings = [
        Ring(
            ringId=ring["ringId"],
            innerRangeMinutes=ring["innerRangeMinutes"],
            outerRangeMinutes=ring["outerRangeMinutes"],
            geometry=ring["geometry"],
            statistics=RingStatistics(poiCount=selection["ringCounts"].get(ring["ringId"], 0)),
        )
        for ring in ring_geometries
    ]
    if not request.options.includePois:
        warnings.append("本次未请求 POI 数据。")

    return AnalysisResult(
        analysisId=f"analysis-ors-{uuid4()}",
        center=request.center,
        profile=request.profile,
        rangesMinutes=list(request.rangesMinutes),
        cumulativeIsochrones=cumulative_isochrones,
        rings=rings,
        pois=selection["pois"],
        categories=categories,
        metadata=AnalysisMetadata(
            source="mixed" if request.options.includePois else "ors",
            sources={"isochrones": "ors-public-api" if settings.poi_provider == "ors_remote" else "ors", "pois": pois_source},
            generatedAt=_generated_at(),
            requestId=request_id,
            warnings=warnings,
            poiDataset=dataset_meta,
            poiSelection={
                "matchedCount": selection["matchedCount"], "returnedCount": selection["returnedCount"],
                "truncated": selection["truncated"],
                "strategy": selection.get("coverage", {}).get("strategy", "deterministic-per-ring-top-category") if request.options.includePois else "none",
                "spatialMethod": "rtree-bbox-and-ring-covers" if request.options.includePois and settings.poi_provider in {"local", "overture_local"} else ("utm-grid-and-ring-covers" if settings.poi_provider == "ors_remote" else "fixture"),
                "travelTimesCalculated": False,
                "diagnostics": selection.get("diagnostics", {}),
            },
            taxonomy={
                "family": "OPC" if request.options.includePois and settings.poi_provider in {"local", "overture_local"} else ("ORS-OpenPOIService" if settings.poi_provider == "ors_remote" else "mock"),
                "hierarchyField": "taxonomy.hierarchy" if settings.poi_provider in {"local", "overture_local"} else ("properties.category_ids" if settings.poi_provider == "ors_remote" else None),
                "basicCategoryField": "basic_category" if settings.poi_provider in {"local", "overture_local"} else None,
                "placementUsesAlternates": False,
            },
            poiProvider="ors_remote" if settings.poi_provider == "ors_remote" else None,
            poiCoverage=selection.get("coverage") if settings.poi_provider == "ors_remote" else None,
            rateLimit=selection.get("rateLimit") if settings.poi_provider == "ors_remote" else None,
            attribution=selection.get("attribution") if settings.poi_provider == "ors_remote" else None,
            isochroneProvider="ors-public-api",
            isLive=True,
            cacheHit=bool(getattr(provider, "last_cache_hit", False)),
            featureCount=len(cumulative_isochrones),
            profile=request.profile,
            rangesSeconds=[value * 60 for value in request.rangesMinutes],
            apiQuota=quota_observer.snapshot() if quota_observer else None,
        ),
    )


async def create_name_cloud(
    request: NameCloudRequest,
    request_id: str,
    settings: Settings,
    poi_provider: Any | None = None,
    quota_observer: QuotaObserver | None = None,
) -> AnalysisResult:
    if settings.analysis_provider != "ors" or not settings.ors_api_key:
        raise InvalidProviderParameterError("analysis_provider", "name_cloud_requires_live_ors")
    if [item.rangeMinutes for item in request.cumulativeIsochrones] != list(request.rangesMinutes):
        raise InvalidProviderParameterError("cumulativeIsochrones", "ranges_must_match_analysis")

    outer_geometry = shape(request.cumulativeIsochrones[-1].geometry)
    area_km2 = geodesic_area_km2(outer_geometry)
    ring_geometries = build_exclusive_rings(request.cumulativeIsochrones)
    analysis_request = AnalysisRequest(
        center=request.center,
        profile=request.profile,
        rangesMinutes=request.rangesMinutes,
        categoryIds=request.categoryIds,
        options={"includePois": True, "calculateTravelTimes": False},
    )
    remote_provider = poi_provider or OrsRemotePoiProvider(settings, quota_observer=quota_observer)
    selection = await remote_provider.fetch(analysis_request, outer_geometry, ring_geometries, single_polygon=False)
    rings = [
        Ring(
            ringId=ring["ringId"],
            innerRangeMinutes=ring["innerRangeMinutes"],
            outerRangeMinutes=ring["outerRangeMinutes"],
            geometry=ring["geometry"],
            statistics=RingStatistics(poiCount=selection["ringCounts"].get(ring["ringId"], 0)),
        )
        for ring in ring_geometries
    ]
    band_counts = {ring.ringId: ring.statistics.poiCount for ring in rings}
    coverage = {
        **selection.get("coverage", {}),
        "mode": "isochrone-grid",
        "rangeSeconds": max(request.rangesMinutes) * 60,
        "areaKm2": area_km2,
        "spatiallyCovered": True,
        "datasetCompleteness": "unknown",
        "resultLimit": min(settings.ors_poi_limit_per_cell, 2000),
        "resultTruncated": bool(selection.get("truncated")),
        "complete": not bool(selection.get("truncated")),
        "fullyCovered": not bool(selection.get("truncated")),
        "requests": selection.get("coverage", {}).get("requests", 1),
        "cacheHit": bool(selection.get("coverage", {}).get("cacheHits")),
    }
    name_cloud = {
        "mode": "unclassified-poi-name-cloud",
        "stats": {
            "rawPoiCount": coverage.get("rawPoiCount", coverage.get("received", 0)),
            "parsedPoiCount": coverage.get("parsedPoiCount", coverage.get("deduplicated", 0)),
            "namedPoiCount": coverage.get("namedPoiCount", selection.get("matchedCount", 0)),
            "unnamedCount": coverage.get("unnamedCount", coverage.get("unnamed", 0)),
            "deduplicatedPoiCount": coverage.get("deduplicatedPoiCount", coverage.get("deduplicated", 0)),
            "outsideCount": selection.get("diagnostics", {}).get("outside_exclusive_rings", 0),
            "bandCounts": band_counts,
            "placedCount": 0,
            "unplacedCount": 0,
        },
        "bands": [
            {"ringId": ring.ringId, "label": f"{ring.innerRangeMinutes}–{ring.outerRangeMinutes} 分钟", "poiIds": [poi.poiId for poi in selection["pois"] if poi.ringId == ring.ringId]}
            for ring in rings
        ],
        "areaKm2": area_km2,
    }
    return AnalysisResult(
        analysisId=f"analysis-name-cloud-{uuid4()}",
        center=request.center,
        profile=request.profile,
        rangesMinutes=list(request.rangesMinutes),
        cumulativeIsochrones=request.cumulativeIsochrones,
        rings=rings,
        pois=selection["pois"],
        categories=[],
        nameCloud=name_cloud,
        metadata=AnalysisMetadata(
            source="mixed",
            sources={"isochrones": "ors-public-api", "pois": "ors-openpoiservice"},
            generatedAt=_generated_at(),
            requestId=request_id,
            warnings=[
                "等时圈复用当前成功的真实 ORS 结果。",
                f"POI 使用最外层 {max(request.rangesMinutes)} 分钟真实 Polygon 查询。",
                "名称云不按 taxonomy 分类；字号不表示 POI 重要性。",
            ],
            poiSelection={
                "matchedCount": selection["matchedCount"],
                "returnedCount": selection["returnedCount"],
                "truncated": selection["truncated"],
                "strategy": "unclassified-name-cloud",
                "spatialMethod": "outer-isochrone-covers",
                "travelTimesCalculated": False,
                "diagnostics": selection.get("diagnostics", {}),
            },
            poiProvider="ors_remote",
            poiCoverage=coverage,
            rateLimit=selection.get("apiQuota", {}),
            attribution=selection.get("attribution", []),
            isochroneProvider="ors-public-api",
            isLive=True,
            cacheHit=bool(coverage.get("cacheHit")),
            featureCount=len(request.cumulativeIsochrones),
            profile=request.profile,
            rangesSeconds=[item.rangeSeconds for item in request.cumulativeIsochrones],
            apiQuota=quota_observer.snapshot() if quota_observer else None,
            panmapMode="unclassified-poi-name-cloud",
        ),
    )
