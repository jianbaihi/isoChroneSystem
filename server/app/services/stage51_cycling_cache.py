from __future__ import annotations

import hashlib
import json
from collections import Counter
from copy import deepcopy
from pathlib import Path
from typing import Any

from app.errors import InvalidProviderParameterError, InvalidMatrixResponseError
from app.models import AnalysisResult, MatrixAccessibilityRequest, NameCloudRequest
from app.services.published_result_normalization import enrich_pois_with_matrix


ARCHIVE_PATH = (
    Path(__file__).resolve().parents[3]
    / "exports/stage-6-integrated-live/stage29-cycling-complete.json"
)
FROZEN_PROFILE = "cycling-regular"
FROZEN_CENTER = (114.296944, 30.546944)
FROZEN_RANGES = [10, 20, 30]
POI_CACHE_PIECES = 10
MATRIX_CACHE_BATCHES = 5
VISIBLE_BANDS = ("ring-0-10", "ring-10-20", "ring-20-30")
CACHE_IDENTITY_VERSION = "stage51-profile-cache-v1"


def profile_cache_identity(
    *, center: Any, profile: str, ranges: list[int], outer_geometry: dict[str, Any],
    destination_ids: list[str] | None = None,
) -> dict[str, Any]:
    outer_hash = hashlib.sha256(
        json.dumps(outer_geometry, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    destination_fingerprint = hashlib.sha256(
        json.dumps(destination_ids or [], separators=(",", ":")).encode()
    ).hexdigest()
    identity = {
        "version": CACHE_IDENTITY_VERSION,
        "center": [round(float(center.lon), 6), round(float(center.lat), 6)],
        "profile": profile,
        "rangesSeconds": [int(value) * 60 for value in ranges],
        "rangeType": "time",
        "poiProvider": "openpoiservice",
        "outerGeometryHash": outer_hash,
        "matrixSource": "wuhan-huanghelou",
        "matrixDestinationFingerprint": destination_fingerprint,
    }
    identity["cacheFingerprint"] = hashlib.sha256(
        json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return identity


def _archive_payload() -> dict[str, Any]:
    try:
        payload = json.loads(ARCHIVE_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise InvalidProviderParameterError("cyclingCache", "stage29_archive_unavailable") from exc
    if payload.get("profile") != FROZEN_PROFILE or len(payload.get("pois", [])) != 2413:
        raise InvalidProviderParameterError("cyclingCache", "stage29_archive_contract_mismatch")
    return payload


def _validate_common(center: Any, profile: str, ranges: list[int]) -> None:
    if profile != FROZEN_PROFILE:
        raise InvalidProviderParameterError("profile", "stage51_requires_cycling_regular")
    if list(ranges) != FROZEN_RANGES:
        raise InvalidProviderParameterError("rangesMinutes", "stage51_requires_10_20_30")
    if abs(float(center.lon) - FROZEN_CENTER[0]) > 1e-6 or abs(float(center.lat) - FROZEN_CENTER[1]) > 1e-6:
        raise InvalidProviderParameterError("center", "stage51_requires_wuhan_huanghelou")


def _analysis_id(payload: dict[str, Any]) -> str:
    matrix = payload.get("metadata", {}).get("matrix", {})
    identity = {
        "center": list(FROZEN_CENTER),
        "profile": FROZEN_PROFILE,
        "rangesMinutes": FROZEN_RANGES,
        "poiCount": len(payload.get("pois", [])),
        "matrixFingerprint": matrix.get("resultFingerprint"),
        "stage": 51,
    }
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return f"analysis-stage51-cycling-{digest[:24]}"


def build_cached_name_cloud(request: NameCloudRequest, request_id: str) -> AnalysisResult:
    _validate_common(request.center, request.profile, request.rangesMinutes)
    if len(request.cumulativeIsochrones) != 3 or [item.rangeMinutes for item in request.cumulativeIsochrones] != FROZEN_RANGES:
        raise InvalidProviderParameterError("cumulativeIsochrones", "stage51_requires_three_cycling_isochrones")
    payload = deepcopy(_archive_payload())
    payload["analysisId"] = _analysis_id(payload)
    payload["cumulativeIsochrones"] = [item.model_dump(mode="json") for item in request.cumulativeIsochrones]

    spatial_by_id = {
        item["poiId"]: item.get("spatialBandId")
        for item in payload.get("accessibility", [])
        if item.get("poiId") and item.get("spatialBandId")
    }
    for poi in payload.get("pois", []):
        poi["ringId"] = spatial_by_id.get(poi.get("poiId"), poi.get("ringId"))
        poi["travelTimeSeconds"] = None
    payload["accessibility"] = []
    spatial_counts = Counter(poi.get("ringId") for poi in payload.get("pois", []))
    for ring in payload.get("rings", []):
        ring.setdefault("statistics", {})["poiCount"] = int(spatial_counts.get(ring.get("ringId"), 0))

    metadata = payload.setdefault("metadata", {})
    metadata["requestId"] = request_id
    metadata["cacheHit"] = True
    metadata["matrix"] = None
    metadata["profile"] = FROZEN_PROFILE
    metadata["sources"] = {"isochrones": "ors-public-api", "pois": "ors-openpoiservice"}
    coverage = metadata.setdefault("poiCoverage", {})
    cache_identity = profile_cache_identity(
        center=request.center, profile=request.profile, ranges=request.rangesMinutes,
        outer_geometry=request.cumulativeIsochrones[-1].geometry,
    )
    coverage.update({
        "mode": "stage51-validated-real-cache-replay",
        "strategy": "stage-6-spatial-batch-v1",
        "requests": POI_CACHE_PIECES,
        "cacheHits": POI_CACHE_PIECES,
        "upstreamRequestCount": 0,
        "resultTruncated": False,
        "fullyCovered": True,
        "complete": True,
        "spatiallyCovered": True,
        "cacheIdentity": cache_identity,
    })
    metadata["warnings"] = [
        "骑行 POI 来自 2026-08-01 第29号已验收真实 OpenPOIService 缓存；本次未重新请求上游。",
        "查询几何为骑行30分钟累计等时圈外圈 Polygon，未使用固定半径预览。",
        "POI 标签云不按 taxonomy 分类；字号不表示 POI 重要性。",
    ]
    name_cloud = payload.setdefault("nameCloud", {"mode": "unclassified-poi-name-cloud"})
    stats = name_cloud.setdefault("stats", {})
    stats["bandCounts"] = {band: int(spatial_counts.get(band, 0)) for band in VISIBLE_BANDS}
    stats["placedCount"] = 0
    stats["unplacedCount"] = len(payload.get("pois", []))
    name_cloud["bands"] = [
        {
            "ringId": band,
            "label": label,
            "poiIds": [poi["poiId"] for poi in payload.get("pois", []) if poi.get("ringId") == band],
        }
        for band, label in zip(VISIBLE_BANDS, ("0–10 分钟", "10–20 分钟", "20–30 分钟"))
    ]
    return AnalysisResult.model_validate(payload)


def complete_cached_matrix(request: MatrixAccessibilityRequest) -> AnalysisResult:
    base = request.baseResult
    _validate_common(base.center, base.profile, base.rangesMinutes)
    if len(base.pois) != 2413 or base.analysisId != _analysis_id(_archive_payload()):
        raise InvalidProviderParameterError("baseResult", "stage51_cycling_base_result_mismatch")

    payload = deepcopy(_archive_payload())
    payload["analysisId"] = base.analysisId
    payload["cumulativeIsochrones"] = [item.model_dump(mode="json") for item in base.cumulativeIsochrones]
    for item in payload.get("accessibility", []):
        item["analysisRunId"] = base.analysisId
    matrix = payload.setdefault("metadata", {}).setdefault("matrix", {})
    cache_identity = profile_cache_identity(
        center=base.center, profile=base.profile, ranges=base.rangesMinutes,
        outer_geometry=base.cumulativeIsochrones[-1].geometry,
        destination_ids=[poi.poiId for poi in base.pois],
    )
    matrix.update({
        "profile": FROZEN_PROFILE,
        "batchCount": MATRIX_CACHE_BATCHES,
        "cacheHits": MATRIX_CACHE_BATCHES,
        "cache": "hit",
        "upstreamRequestCount": 0,
        "retries": 0,
        "cacheIdentity": cache_identity,
    })
    payload["metadata"]["cacheHit"] = True
    payload["metadata"]["requestId"] = base.metadata.requestId
    coverage = payload["metadata"].setdefault("poiCoverage", {})
    coverage.update({"requests": POI_CACHE_PIECES, "cacheHits": POI_CACHE_PIECES, "upstreamRequestCount": 0})
    payload["metadata"]["warnings"] = [
        "骑行 POI 与 Matrix 均来自第29号已验收真实缓存；第51号当前点击链路上游请求为0。",
        "POI 圈层按 ORS Matrix 路网精确时间判定；不是实时交通真值。",
        "驾车本轮未进入，巴黎、类别聚类、评分热度和部署任务均未执行。",
    ]

    # Stage-29 is a v1 archive.  Publish a v2-shaped in-memory result without
    # rewriting that historical archive on disk.
    result = enrich_pois_with_matrix(AnalysisResult.model_validate(payload))
    matrix_summary = result.metadata.matrix or {}
    conserved = (
        int(matrix_summary.get("matrixWithinRangeCount", 0))
        + int(matrix_summary.get("matrixOutOfRangeCount", 0))
        + int(matrix_summary.get("matrixNullCount", 0))
        + int(matrix_summary.get("matrixInvalidCount", 0))
        == len(result.pois)
    )
    if not conserved or len(result.accessibility) != len(result.pois):
        raise InvalidMatrixResponseError("stage51_cached_matrix_conservation_failed")
    return result
