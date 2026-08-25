from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from statistics import median
from typing import Any

from app.adapters.ors_matrix import MatrixComputation, OrsMatrixAdapter
from app.config import Settings
from app.errors import InvalidProviderParameterError
from app.models import AnalysisResult, MatrixAccessibilityRequest
from app.services.quota import QuotaObserver, empty_quota_service
from app.services.published_result_normalization import enrich_pois_with_matrix


def _visible_matrix_bands(ranges_minutes: list[int]) -> tuple[str, ...]:
    return tuple(f"ring-{previous}-{current}" for previous, current in zip([0, *ranges_minutes], ranges_minutes))


def _percentile_90(values: list[float]) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * 0.9) - 1)
    return ordered[index]


def _distribution(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"min": None, "median": None, "p90": None, "max": None}
    return {
        "min": round(min(values), 3),
        "median": round(float(median(values)), 3),
        "p90": round(_percentile_90(values), 3),
        "max": round(max(values), 3),
    }


def _validate_request(request: MatrixAccessibilityRequest) -> AnalysisResult:
    result = request.baseResult
    if not result.nameCloud:
        raise InvalidProviderParameterError("baseResult.nameCloud", "matrix_requires_poi_query_result")
    if not result.pois:
        raise InvalidProviderParameterError("baseResult.pois", "matrix_stage_requires_pois")
    poi_ids = [poi.poiId for poi in result.pois]
    if len(poi_ids) != len(set(poi_ids)):
        raise InvalidProviderParameterError("baseResult.pois", "duplicate_poi_id")
    return result


def _migration_matrix(accessibility) -> dict[str, dict[str, int]]:
    rows: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for item in accessibility:
        destination = item.matrixBandId or f"matrix-{item.matrixStatus}"
        rows[item.spatialBandId][destination] += 1
    return {
        source: dict(sorted(destinations.items()))
        for source, destinations in sorted(rows.items())
    }


def _result_fingerprint(accessibility) -> str:
    values = [
        [
            item.poiId,
            item.travelTimeSeconds,
            item.networkDistanceMeters,
            item.matrixBandId,
            item.matrixStatus,
        ]
        for item in accessibility
    ]
    encoded = json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _summary(computation: MatrixComputation, ranges_minutes: list[int]) -> dict[str, Any]:
    accessibility = computation.accessibility
    null_count = sum(item.matrixStatus == "unreachable" for item in accessibility)
    invalid_count = sum(item.matrixStatus == "invalid" for item in accessibility)
    ok_items = [item for item in accessibility if item.matrixStatus == "ok"]
    visible_bands = _visible_matrix_bands(ranges_minutes)
    within_items = [item for item in ok_items if item.matrixBandId in visible_bands]
    out_items = [item for item in ok_items if item.matrixBandId == "matrix-out-of-range"]
    durations = [float(item.travelTimeSeconds) for item in ok_items if item.travelTimeSeconds is not None]
    distances = [float(item.networkDistanceMeters) for item in ok_items if item.networkDistanceMeters is not None]
    mismatch_count = sum(
        item.matrixStatus == "ok" and item.spatialBandId != item.matrixBandId
        for item in accessibility
    )
    return {
        "requestedPoiCount": len(accessibility),
        "matrixOkCount": len(ok_items),
        "matrixNullCount": null_count,
        "matrixInvalidCount": invalid_count,
        "matrixOutOfRangeCount": len(out_items),
        "matrixWithinRangeCount": len(within_items),
        "spatialVsMatrixMismatchCount": mismatch_count,
        "matrixBandCounts": dict(Counter(item.matrixBandId for item in within_items)),
        "migrationMatrix": _migration_matrix(accessibility),
        "durationSeconds": _distribution(durations),
        "distanceMeters": _distribution(distances),
        "resultFingerprint": _result_fingerprint(accessibility),
    }


def _merge_quota(base_result: AnalysisResult, computation: MatrixComputation) -> dict[str, Any]:
    current = base_result.metadata.apiQuota if isinstance(base_result.metadata.apiQuota, dict) else {}
    services = current.get("services") if isinstance(current.get("services"), dict) else {}
    merged = {name: dict(value) for name, value in services.items() if isinstance(value, dict)}
    matrix_quota = computation.metadata.get("apiQuota")
    merged["matrix"] = dict(matrix_quota) if isinstance(matrix_quota, dict) and matrix_quota else empty_quota_service("none")
    for service in ("isochrones", "geocoder", "pois"):
        merged.setdefault(service, empty_quota_service("none"))
    return {"services": merged}


def _apply_complete_result(
    base_result: AnalysisResult,
    computation: MatrixComputation,
    summary: dict[str, Any],
) -> AnalysisResult:
    result = base_result.model_copy(deep=True)
    result.accessibility = computation.accessibility

    visible_bands = _visible_matrix_bands(base_result.rangesMinutes)
    band_counts = {band: int(summary["matrixBandCounts"].get(band, 0)) for band in visible_bands}
    for ring in result.rings:
        ring.statistics.poiCount = band_counts.get(ring.ringId, 0)
    if result.nameCloud:
        result.nameCloud["bands"] = [
            {
                "ringId": ring.ringId,
                "label": f"{ring.innerRangeMinutes}–{ring.outerRangeMinutes} 分钟",
                "poiIds": [poi.poiId for poi in result.pois if poi.ringId == ring.ringId],
            }
            for ring in result.rings
        ]
        stats = result.nameCloud.setdefault("stats", {})
        stats["bandCounts"] = band_counts
        stats["placedCount"] = 0
        stats["unplacedCount"] = int(summary["matrixWithinRangeCount"])

    poi_selection = result.metadata.poiSelection if isinstance(result.metadata.poiSelection, dict) else {}
    result.metadata.poiSelection = {**poi_selection, "travelTimesCalculated": True, "bandAssignmentMethod": "matrix-duration"}
    result.metadata.matrix = {
        **summary,
        "provider": "ors-public-api",
        "profile": base_result.profile,
        "metrics": ["duration", "distance"],
        "units": "m",
        "calculatedAt": computation.metadata.get("calculatedAt"),
        "routingGraphDate": computation.metadata.get("routingGraphDate"),
        "matrixBatchId": computation.metadata.get("matrixBatchId"),
        "cache": computation.metadata.get("cache"),
        "upstreamRequestCount": computation.metadata.get("upstreamRequestCount", 0),
    }
    result.metadata.apiQuota = _merge_quota(base_result, computation)
    result.metadata.cacheHit = computation.metadata.get("cache") == "hit"
    result.metadata.warnings = [
        warning for warning in result.metadata.warnings
        if "未计算逐点 Matrix" not in warning
    ]
    if "POI 圈层已按 ORS Matrix 路网估算时间重新判定；不是实时到达时间。" not in result.metadata.warnings:
        result.metadata.warnings.append("POI 圈层已按 ORS Matrix 路网估算时间重新判定；不是实时到达时间。")
    return enrich_pois_with_matrix(result)


async def calculate_matrix_accessibility(
    request: MatrixAccessibilityRequest,
    settings: Settings,
    matrix_adapter: OrsMatrixAdapter | None = None,
    quota_observer: QuotaObserver | None = None,
) -> AnalysisResult:
    base_result = _validate_request(request)
    adapter = matrix_adapter or OrsMatrixAdapter(settings, quota_observer=quota_observer, profile=base_result.profile)
    prior_spatial = {item.poiId: item.spatialBandId for item in base_result.accessibility}
    computation = await adapter.calculate(
        center=base_result.center,
        pois=base_result.pois,
        analysis_run_id=base_result.analysisId,
        spatial_band_by_id=prior_spatial,
        ranges_minutes=base_result.rangesMinutes,
    )
    summary = _summary(computation, base_result.rangesMinutes)
    return _apply_complete_result(base_result, computation, summary)
