"""Stage 59 offline OpenPOIService payload and MultiPolygon contract gate.

The helpers intentionally use the production provider's body constructor.  They
do not send requests unless a caller explicitly invokes the narrowly scoped
canary runner after the independent quota gate has passed.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union

from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.providers.poi.ors_client import OrsPoiClient
from app.services.poi_batch_planner import geometry_hash
from app.services.poi_tiling import PoiCell
from app.services.projection import UTMProjector


STAGE59_CANARY_LIMIT = 3
STAGE59_MINIMUM_QUOTA = 10
STAGE59_LIMIT = 2000
CANARY_POLYGON_ID = "stage59-canary-polygon-control"
CANARY_MULTIPOLYGON_TWO_ID = "v2-piece-017-6ea053fb7b6b71ce"
CANARY_MULTIPOLYGON_FIVE_ID = "v2-piece-007-34f5a73d000034ed"


def isolated_stage59_canary_client(settings: Any, quota_observer: Any | None = None) -> OrsPoiClient:
    """Build a client whose response cache cannot touch formal driving POI caches."""
    isolated = replace(
        settings,
        ors_cache_dir=str(Path(settings.ors_cache_dir) / "provider-contract-canary" / "stage59"),
        # A stale formal response must never turn an availability error into a
        # misleading contract success.  The isolated directory begins empty.
        ors_cache_stale_if_error=False,
    )
    return OrsPoiClient(isolated, quota_observer=quota_observer)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _vertex_count(geometry: Any) -> int:
    parts = list(getattr(geometry, "geoms", [geometry]))
    return sum(len(part.exterior.coords) + sum(len(ring.coords) for ring in part.interiors) for part in parts)


def _projector(geometry: Any) -> UTMProjector:
    point = geometry.representative_point()
    return UTMProjector.for_lon_lat(float(point.x), float(point.y))


def _area_km2(geometry: Any, projector: UTMProjector | None = None) -> float:
    active = projector or _projector(geometry)
    return float(active.project(geometry).area) / 1_000_000


def payload_for_piece(piece: dict[str, Any]) -> dict[str, Any]:
    """Return exactly the current production unfiltered OpenPOI body shape."""
    geometry = piece.get("geometry")
    parsed = shape(geometry)
    if parsed.geom_type not in {"Polygon", "MultiPolygon"} or parsed.is_empty or not parsed.is_valid:
        raise ValueError("piece must contain valid Polygon or MultiPolygon geometry")
    cell = PoiCell(cell_id=str(piece["pieceId"]), geometry=geometry, area_km2=_area_km2(parsed))
    # This calls OrsRemotePoiProvider._body rather than a parallel Stage59 schema.
    return OrsRemotePoiProvider._body(cell, STAGE59_LIMIT)


def validate_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    geometry = payload.get("geometry", {}).get("geojson") if isinstance(payload.get("geometry"), dict) else None
    valid_geometry = isinstance(geometry, dict) and geometry.get("type") in {"Polygon", "MultiPolygon"}
    parsed = shape(geometry) if valid_geometry else None
    schema_valid = bool(
        payload.get("request") == "pois"
        and payload.get("limit") == STAGE59_LIMIT
        and payload.get("sortby") == "category"
        and parsed is not None and not parsed.is_empty and parsed.is_valid
    )
    return {
        "schemaValid": schema_valid,
        "usesProductionUnfilteredContract": "filters" not in payload,
        "geometryType": geometry.get("type") if isinstance(geometry, dict) else None,
        "featureCollectionExpected": True,
        "authorizationPresent": False,
        "keyPresent": False,
    }


def payload_manifest(pieces: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    manifest: list[dict[str, Any]] = []
    multi_redacted: list[dict[str, Any]] = []
    for piece in pieces:
        payload = payload_for_piece(piece)
        geometry = shape(piece["geometry"])
        validation = validate_provider_payload(payload)
        record = {
            "pieceId": piece["pieceId"], "geometryType": geometry.geom_type,
            "partCount": len(getattr(geometry, "geoms", [geometry])), "areaKm2": piece["areaKm2"],
            "vertexCount": _vertex_count(geometry), "geometryBytes": len(canonical_json(piece["geometry"]).encode("utf-8")),
            "payloadBytes": len(canonical_json(payload).encode("utf-8")), "payloadSha256": sha256(payload),
            "schemaValid": validation["schemaValid"], "withinAreaLimit": float(piece["areaKm2"]) <= 45.0,
            "withinComplexityLimit": _vertex_count(geometry) <= 500 and len(canonical_json(piece["geometry"]).encode("utf-8")) <= 100_000,
            "usesProductionUnfilteredContract": validation["usesProductionUnfilteredContract"],
        }
        manifest.append(record)
        if geometry.geom_type == "MultiPolygon":
            multi_redacted.append({
                **record,
                "geometry": {"type": "MultiPolygon", "coordinateCount": _vertex_count(geometry)},
                "payload": {"request": payload["request"], "geometry": {"geojson": {"type": "MultiPolygon", "coordinates": "<redacted-coordinate-array>"}}, "limit": payload["limit"], "sortby": payload["sortby"]},
            })
    return manifest, multi_redacted


def split_multipolygon_fallback(pieces: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    children: list[dict[str, Any]] = []
    polygon_units = 0
    multipolygon_units = 0
    components = 0
    for piece in pieces:
        parsed = shape(piece["geometry"])
        if parsed.geom_type == "Polygon":
            polygon_units += 1
            children.append({"pieceId": piece["pieceId"], "parentPieceId": None, "componentIndex": None, "geometry": piece["geometry"], "geometryHash": geometry_hash(parsed), "areaKm2": round(_area_km2(parsed), 12), "vertexCount": _vertex_count(parsed)})
            continue
        if parsed.geom_type != "MultiPolygon":
            raise ValueError("selected V2 geometry must be Polygon or MultiPolygon")
        multipolygon_units += 1
        parts = list(parsed.geoms)
        components += len(parts)
        parent_projector = _projector(parsed)
        parent_area = _area_km2(parsed, parent_projector)
        component_area = sum(_area_km2(part, parent_projector) for part in parts)
        if abs(parent_area - component_area) > 1e-8:
            raise ValueError("MultiPolygon component area is not conserved")
        if not unary_union(parts).equals(parsed):
            raise ValueError("MultiPolygon components do not reconstruct parent")
        for index, part in enumerate(parts, start=1):
            geojson = json.loads(json.dumps(mapping(part)))
            children.append({"pieceId": f"{piece['pieceId']}--component-{index:02d}", "parentPieceId": piece["pieceId"], "componentIndex": index, "geometry": geojson, "geometryHash": geometry_hash(part), "areaKm2": round(_area_km2(part, parent_projector), 12), "vertexCount": _vertex_count(part)})
    children.sort(key=lambda item: item["pieceId"])
    summary = {
        "originalRequestUnits": len(pieces), "polygonUnits": polygon_units,
        "multiPolygonUnits": multipolygon_units, "multiPolygonComponentTotal": components,
        "fallbackRequestUnits": len(children), "additionalRequestsIfSplit": len(children) - len(pieces),
    }
    return children, summary


def coverage_audit(outer_geometry: dict[str, Any], pieces: list[dict[str, Any]], *, layer: str, coordinate_decimals: int | None = None) -> dict[str, Any]:
    outer = shape(outer_geometry)
    projector = _projector(outer)
    projected_outer = projector.project(outer)
    projected_pieces = [projector.project(shape(item["geometry"])) for item in pieces]
    union = unary_union(projected_pieces)
    outer_area = projected_outer.area / 1_000_000
    planned_area = sum(item.area for item in projected_pieces) / 1_000_000
    uncovered = projected_outer.difference(union).area / 1_000_000
    outside = union.difference(projected_outer).area / 1_000_000
    overlap = max(0.0, planned_area - union.area / 1_000_000)
    tolerance = max(0.01, outer_area * 0.001)
    return {
        "auditLayer": layer, "coordinateDecimals": coordinate_decimals,
        "outerAreaKm2": outer_area, "plannedAreaKm2": planned_area,
        "uncoveredAreaKm2": uncovered, "outsideAreaKm2": outside,
        "overlapAreaKm2": overlap, "areaDifferenceKm2": planned_area - outer_area,
        "toleranceKm2": tolerance,
        "withinTolerance": bool(abs(planned_area - outer_area) <= tolerance and uncovered <= tolerance and outside <= tolerance and overlap <= tolerance),
    }


def roundtrip_pieces(pieces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**piece, "geometry": json.loads(json.dumps(piece["geometry"], ensure_ascii=False, separators=(",", ":")))} for piece in pieces]


def canary_quota_gate(quota: dict[str, Any] | None) -> dict[str, Any]:
    remaining = (quota or {}).get("remaining")
    if not isinstance(remaining, int):
        return {"allowed": False, "reason": "poi_quota_unknown_cannot_confirm_minimum_10", "remaining": remaining}
    return {"allowed": remaining >= STAGE59_MINIMUM_QUOTA, "reason": "within-minimum" if remaining >= STAGE59_MINIMUM_QUOTA else "poi_quota_below_minimum_10", "remaining": remaining}


@dataclass
class Stage59CanaryRunner:
    """A no-retry request limiter; actual invocation is only for an approved Canary."""

    client: Any
    attempts: int = 0

    async def run(self, piece: dict[str, Any], quota_before: dict[str, Any] | None) -> dict[str, Any]:
        gate = canary_quota_gate(quota_before)
        if not gate["allowed"]:
            return {"pieceId": piece["pieceId"], "attempted": False, "cacheWritten": False, "errorCategory": gate["reason"], "remainingQuotaBefore": gate["remaining"]}
        if self.attempts >= STAGE59_CANARY_LIMIT:
            return {"pieceId": piece["pieceId"], "attempted": False, "cacheWritten": False, "errorCategory": "canary_request_budget_exhausted", "remainingQuotaBefore": gate["remaining"]}
        self.attempts += 1
        payload = payload_for_piece(piece)
        # Deliberately one call: no retry, no alternate piece, no recursion.
        response, metadata = await self.client.query(payload)
        features = response.get("features") if isinstance(response, dict) else None
        return {
            "pieceId": piece["pieceId"], "geometryType": piece["geometryType"], "partCount": piece["partCount"],
            "payloadSha256": sha256(payload), "attempted": True, "httpStatus": metadata.get("status"),
            "responseContentType": "FeatureCollection" if isinstance(features, list) else None,
            "featureCount": len(features) if isinstance(features, list) else None,
            "resultTruncated": len(features) >= STAGE59_LIMIT if isinstance(features, list) else None,
            "providerAcceptedGeometry": bool(isinstance(features, list)), "errorCategory": None,
            "responseBodyExcerptSanitized": "FeatureCollection response intentionally not archived as formal POI cache",
            "remainingQuotaBefore": gate["remaining"], "remainingQuotaAfter": (metadata.get("apiQuota") or {}).get("remaining"),
            "cacheWritten": metadata.get("cache") == "miss",
        }
