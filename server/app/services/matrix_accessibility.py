from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from statistics import median
from typing import Any

from app.adapters.ors_matrix import MatrixComputation, OrsMatrixAdapter
from app.config import Settings
from app.errors import InvalidProviderParameterError, MatrixIncompleteError
from app.models import AnalysisResult, MatrixAccessibilityRequest
from app.services.quota import QuotaObserver, empty_quota_service


FROZEN_CENTER = (114.296944, 30.546944)
FROZEN_RANGES = [10, 20, 30]
VISIBLE_MATRIX_BANDS = ("ring-0-10", "ring-10-20", "ring-20-30")


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
    if result.profile != "foot-walking":
        raise InvalidProviderParameterError("baseResult.profile", "matrix_stage_requires_foot_walking")
    if result.rangesMinutes != FROZEN_RANGES:
        raise InvalidProviderParameterError("baseResult.rangesMinutes", "matrix_stage_requires_10_20_30")
    if abs(result.center.lon - FROZEN_CENTER[0]) > 1e-6 or abs(result.center.lat - FROZEN_CENTER[1]) > 1e-6:
        raise InvalidProviderParameterError("baseResult.center", "matrix_stage_requires_wuhan_huanghelou")
    if not result.nameCloud:
        raise InvalidProviderParameterError("baseResult.nameCloud", "matrix_stage_requires_stage_5_name_cloud")
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


def _summary(computation: MatrixComputation) -> dict[str, Any]:
    accessibility = computation.accessibility
    null_count = sum(item.matrixStatus == "unreachable" for item in accessibility)
    invalid_count = sum(item.matrixStatus == "invalid" for item in accessibility)
    ok_items = [item for item in accessibility if item.matrixStatus == "ok"]
    within_items = [item for item in ok_items if item.matrixBandId in VISIBLE_MATRIX_BANDS]
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
    accessibility_by_id = {item.poiId: item for item in computation.accessibility}
    for poi in result.pois:
        poi.ringId = accessibility_by_id[poi.poiId].matrixBandId or "matrix-unreachable-or-invalid"
    result.accessibility = computation.accessibility

    band_counts = {band: int(summary["matrixBandCounts"].get(band, 0)) for band in VISIBLE_MATRIX_BANDS}
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
        "profile": "foot-walking",
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
    return result


async def calculate_matrix_accessibility(
    request: MatrixAccessibilityRequest,
    settings: Settings,
    matrix_adapter: OrsMatrixAdapter | None = None,
    quota_observer: QuotaObserver | None = None,
) -> AnalysisResult:
    base_result = _validate_request(request)
    adapter = matrix_adapter or OrsMatrixAdapter(settings, quota_observer=quota_observer)
    prior_spatial = {item.poiId: item.spatialBandId for item in base_result.accessibility}
    computation = await adapter.calculate(
        center=base_result.center,
        pois=base_result.pois,
        analysis_run_id=base_result.analysisId,
        spatial_band_by_id=prior_spatial,
    )
    summary = _summary(computation)
    if summary["matrixNullCount"] or summary["matrixInvalidCount"]:
        raise MatrixIncompleteError(summary["matrixNullCount"], summary["matrixInvalidCount"])
    return _apply_complete_result(base_result, computation, summary)
