"""Immutable POI--Matrix publication normalization.

The Matrix response stays in ``accessibility`` for audit and export purposes,
but a published AnalysisResult exposes the same authoritative fields directly
on every POI.  This module deliberately has no provider or network imports.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.errors import InvalidMatrixResponseError
from app.models import AnalysisResult, PoiAccessibility


VISIBLE_BANDS = ("ring-0-10", "ring-10-20", "ring-20-30")


def matrix_band_for_duration(seconds: float, ranges_minutes: list[int]) -> str:
    """Return the mutually-exclusive Matrix band for a positive duration."""
    if seconds <= 0:
        raise InvalidMatrixResponseError("matrix_duration_must_be_positive")
    for previous, current in zip([0, *ranges_minutes], ranges_minutes):
        if seconds <= current * 60:
            return f"ring-{previous}-{current}"
    return "matrix-out-of-range"


def _normalized_status(status: str) -> str:
    # ``unreachable`` was the stage-51 wire spelling for a Matrix null.  Keep
    # accepting old archives, while all normalized publications use ``null``.
    return "null" if status == "unreachable" else status


def _matrix_index(accessibility: list[PoiAccessibility], poi_ids: set[str]) -> dict[str, PoiAccessibility]:
    by_id: dict[str, PoiAccessibility] = {}
    for record in accessibility:
        poi_id = record.poiId
        if poi_id in by_id:
            raise InvalidMatrixResponseError("duplicate_matrix_poi_id")
        if poi_id not in poi_ids:
            raise InvalidMatrixResponseError("matrix_record_without_poi")
        by_id[poi_id] = record
    if len(by_id) != len(poi_ids):
        raise InvalidMatrixResponseError("matrix_record_missing_for_poi")
    return by_id


def enrich_pois_with_matrix(result: AnalysisResult) -> AnalysisResult:
    """Return a deep-copied v2 publication with POI-level Matrix fields.

    The function is intentionally the only backend join point for complete
    Matrix publications, cache replay and legacy-cache migration.  It checks
    both directions of the relation before it changes any POI fields.
    """
    normalized = result.model_copy(deep=True)
    if not normalized.accessibility:
        return normalized

    poi_ids = [poi.poiId for poi in normalized.pois]
    if len(poi_ids) != len(set(poi_ids)):
        raise InvalidMatrixResponseError("duplicate_poi_id")
    records = _matrix_index(normalized.accessibility, set(poi_ids))

    normalized_records: list[PoiAccessibility] = []
    band_counts: Counter[str] = Counter()
    for poi in normalized.pois:
        record = records[poi.poiId]
        status = _normalized_status(record.matrixStatus)
        spatial_band = record.spatialBandId or poi.ringId
        if status == "ok":
            if record.travelTimeSeconds is None or record.networkDistanceMeters is None:
                raise InvalidMatrixResponseError("ok_matrix_record_missing_duration_or_distance")
            band = matrix_band_for_duration(float(record.travelTimeSeconds), normalized.rangesMinutes)
            poi.travelTimeSeconds = float(record.travelTimeSeconds)
            poi.networkDistanceMeters = float(record.networkDistanceMeters)
            poi.matrixBandId = band
            poi.ringId = band
            poi.reachable = True
            band_counts[band] += 1
        elif status == "null":
            band = "matrix-null"
            poi.travelTimeSeconds = None
            poi.networkDistanceMeters = None
            poi.matrixBandId = band
            poi.ringId = band
            poi.reachable = False
        elif status == "invalid":
            band = "matrix-invalid"
            poi.travelTimeSeconds = None
            poi.networkDistanceMeters = None
            poi.matrixBandId = band
            poi.ringId = band
            poi.reachable = False
        else:
            raise InvalidMatrixResponseError("unknown_matrix_status")

        poi.spatialBandId = spatial_band
        poi.bandAssignmentMethod = "matrix-duration"
        poi.matrixStatus = status
        poi.routingProvider = record.routingProvider
        poi.routingGraphDate = record.routingGraphDate
        poi.calculatedAt = record.calculatedAt
        poi.snappedDistanceMeters = record.snappedDistanceMeters
        poi.matrixBatchId = record.matrixBatchId

        record_copy = record.model_copy(deep=True)
        record_copy.matrixStatus = status
        record_copy.matrixBandId = band
        record_copy.reachable = poi.reachable
        normalized_records.append(record_copy)

    normalized.accessibility = normalized_records
    visible_bands = tuple(ring.ringId for ring in normalized.rings)
    for ring in normalized.rings:
        ring.statistics.poiCount = int(band_counts[ring.ringId])
    if normalized.nameCloud:
        normalized.nameCloud["bands"] = [
            {
                "ringId": ring.ringId,
                "label": f"{ring.innerRangeMinutes}–{ring.outerRangeMinutes} 分钟",
                "poiIds": [poi.poiId for poi in normalized.pois if poi.ringId == ring.ringId],
            }
            for ring in normalized.rings
        ]
        stats = normalized.nameCloud.setdefault("stats", {})
        stats["bandCounts"] = {band: int(band_counts[band]) for band in visible_bands}
        stats["unplacedCount"] = int(sum(band_counts[band] for band in visible_bands))

    normalized.publishedResultSchemaVersion = "2.0"
    return normalized


def normalization_summary(result: AnalysisResult) -> dict[str, Any]:
    """Small, deterministic evidence summary for an already-normalized result."""
    statuses = Counter(poi.matrixStatus for poi in result.pois)
    bands = Counter(poi.ringId for poi in result.pois)
    visible_bands = tuple(ring.ringId for ring in result.rings)
    return {
        "publishedResultSchemaVersion": result.publishedResultSchemaVersion,
        "poiCount": len(result.pois),
        "accessibilityCount": len(result.accessibility),
        "matrixStatusCounts": dict(sorted(statuses.items())),
        "ringCounts": {band: int(bands[band]) for band in (*visible_bands, "matrix-out-of-range", "matrix-null", "matrix-invalid")},
        "poiMatrixBandMatchesRing": all(poi.ringId == poi.matrixBandId for poi in result.pois),
        "okPoiTimeAndDistancePresent": all(
            poi.matrixStatus != "ok" or (poi.travelTimeSeconds is not None and poi.networkDistanceMeters is not None)
            for poi in result.pois
        ),
    }
