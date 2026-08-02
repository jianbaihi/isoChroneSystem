from __future__ import annotations

import hashlib
import json
import math
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

from app.errors import InvalidProviderParameterError
from app.services.projection import UTMProjector


PLANNER_VERSION = "stage-6-spatial-batch-v1"
NORMALIZATION_VERSION = "wgs84-polygon-v1"
ADAPTER_VERSION = "openpoiservice-v1"
PROVIDER_MAX_AREA_KM2 = 50.0
SAFE_PIECE_AREA_KM2 = 45.0
DEFAULT_TARGET_PIECE_AREA_KM2 = 35.0
DEFAULT_ADAPTIVE_RESERVE_RATIO = 0.25
DEFAULT_QUOTA_RESERVE_RATIO = 0.20
DEFAULT_CONCURRENCY = 1
AREA_TOLERANCE_RATIO = 0.001
AREA_TOLERANCE_MIN_KM2 = 0.01


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _coordinates_to_lists(value: Any) -> Any:
    if isinstance(value, tuple):
        return [_coordinates_to_lists(item) for item in value]
    if isinstance(value, list):
        return [_coordinates_to_lists(item) for item in value]
    return value


def _validate_wgs84_coordinates(value: Any, field: str = "outerGeometry.coordinates") -> None:
    if not isinstance(value, (list, tuple)) or not value:
        raise InvalidProviderParameterError(field, "coordinates_empty_or_not_array")
    if all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value):
        if len(value) < 2:
            raise InvalidProviderParameterError(field, "coordinate_pair_too_short")
        lon, lat = float(value[0]), float(value[1])
        if not math.isfinite(lon) or not math.isfinite(lat) or not (-180 <= lon <= 180) or not (-90 <= lat <= 90):
            raise InvalidProviderParameterError(field, "coordinate_out_of_wgs84_bounds")
        return
    for child in value:
        _validate_wgs84_coordinates(child, field)


def _normalize_polygon(polygon: Polygon) -> Polygon:
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
        raise InvalidProviderParameterError("outerGeometry", "invalid_or_self_intersecting_polygon")
    return orient(polygon, sign=1.0)


def normalize_outer_geometry(geojson: dict[str, Any]) -> Polygon | MultiPolygon:
    if not isinstance(geojson, dict) or geojson.get("type") not in {"Polygon", "MultiPolygon"}:
        raise InvalidProviderParameterError("outerGeometry.type", "must_be_polygon_or_multipolygon")
    _validate_wgs84_coordinates(geojson.get("coordinates"))
    try:
        parsed = shape(geojson)
    except (TypeError, ValueError, AssertionError) as exc:
        raise InvalidProviderParameterError("outerGeometry", "coordinates_invalid") from exc
    if parsed.geom_type == "Polygon":
        return _normalize_polygon(parsed)
    parts = [_normalize_polygon(part) for part in parsed.geoms if not part.is_empty]
    if not parts:
        raise InvalidProviderParameterError("outerGeometry", "multipolygon_empty")
    normalized = MultiPolygon(parts)
    if not normalized.is_valid:
        raise InvalidProviderParameterError("outerGeometry", "multipolygon_components_overlap")
    return normalized


def geometry_geojson(geometry: Polygon) -> dict[str, Any]:
    normalized = _normalize_polygon(geometry)
    payload = mapping(normalized)
    return {"type": payload["type"], "coordinates": _coordinates_to_lists(payload["coordinates"])}


def geometry_hash(geometry: Polygon | MultiPolygon) -> str:
    normalized = geometry.normalize()
    payload = mapping(normalized)
    return _hash({"normalizationVersion": NORMALIZATION_VERSION, "type": payload["type"], "coordinates": _coordinates_to_lists(payload["coordinates"])})


@dataclass(frozen=True)
class PlannerConfig:
    target_piece_area_km2: float = DEFAULT_TARGET_PIECE_AREA_KM2
    max_subdivision_depth: int = 4
    min_piece_area_km2: float = 0.1
    request_budget: int = 20
    adaptive_reserve_ratio: float = DEFAULT_ADAPTIVE_RESERVE_RATIO
    safe_piece_area_km2: float = SAFE_PIECE_AREA_KM2

    @classmethod
    def from_payload(cls, payload: dict[str, Any] | None) -> "PlannerConfig":
        raw = payload or {}
        config = cls(
            target_piece_area_km2=float(raw.get("targetPieceAreaKm2", DEFAULT_TARGET_PIECE_AREA_KM2)),
            max_subdivision_depth=int(raw.get("maxSubdivisionDepth", 4)),
            min_piece_area_km2=float(raw.get("minPieceAreaKm2", 0.1)),
            request_budget=int(raw.get("requestBudget", 20)),
            adaptive_reserve_ratio=float(raw.get("adaptiveReserveRatio", DEFAULT_ADAPTIVE_RESERVE_RATIO)),
            safe_piece_area_km2=float(raw.get("safePieceAreaKm2", SAFE_PIECE_AREA_KM2)),
        )
        if not 0.1 <= config.target_piece_area_km2 <= SAFE_PIECE_AREA_KM2:
            raise InvalidProviderParameterError("plannerConfig.targetPieceAreaKm2", "out_of_range")
        if not 0 <= config.max_subdivision_depth <= 12 or not 0 < config.min_piece_area_km2 <= SAFE_PIECE_AREA_KM2:
            raise InvalidProviderParameterError("plannerConfig", "subdivision_limits_invalid")
        if config.request_budget < 1 or not 0 <= config.adaptive_reserve_ratio <= 2:
            raise InvalidProviderParameterError("plannerConfig", "budget_invalid")
        if config.safe_piece_area_km2 != SAFE_PIECE_AREA_KM2:
            raise InvalidProviderParameterError("plannerConfig.safePieceAreaKm2", "project_safety_threshold_is_frozen_at_45")
        return config


def _projector_for(geometry: Polygon | MultiPolygon) -> UTMProjector:
    representative = geometry.representative_point()
    return UTMProjector.for_lon_lat(float(representative.x), float(representative.y))


def _polygon_parts(geometry: Any) -> list[Polygon]:
    if geometry.is_empty:
        return []
    if geometry.geom_type == "Polygon":
        return [geometry]
    if geometry.geom_type == "MultiPolygon":
        return [part for part in geometry.geoms if not part.is_empty]
    parts: list[Polygon] = []
    for item in getattr(geometry, "geoms", []):
        parts.extend(_polygon_parts(item))
    return parts


def _piece_record(geometry: Polygon, projector: UTMProjector, depth: int = 0, parent_piece_id: str | None = None) -> dict[str, Any]:
    normalized = _normalize_polygon(geometry)
    projected = projector.project(normalized)
    digest = geometry_hash(normalized)
    piece_id = f"piece-{_hash({'version': PLANNER_VERSION, 'geometryHash': digest})[:20]}"
    return {
        "pieceId": piece_id,
        "parentPieceId": parent_piece_id,
        "depth": depth,
        "geometry": geometry_geojson(normalized),
        "areaKm2": round(float(projected.area) / 1_000_000, 6),
        "bbox": [round(float(value), 7) for value in normalized.bounds],
        "geometryHash": digest,
        "status": "planned",
        "attemptCount": 0,
        "resultCount": None,
        "resultTruncated": None,
        "cacheHit": False,
    }


def _split_projected(projected: Any) -> list[Any]:
    west, south, east, north = projected.bounds
    mid_x, mid_y = (west + east) / 2, (south + north) / 2
    quadrants = (
        box(west, south, mid_x, mid_y), box(mid_x, south, east, mid_y),
        box(west, mid_y, mid_x, north), box(mid_x, mid_y, east, north),
    )
    return [projected.intersection(quadrant) for quadrant in quadrants]


def _subdivide_to_safe(geometry: Polygon, projector: UTMProjector, config: PlannerConfig, depth: int = 0) -> list[Polygon]:
    projected = projector.project(geometry)
    if round(projected.area / 1_000_000, 6) <= config.safe_piece_area_km2:
        return [geometry]
    if depth >= config.max_subdivision_depth:
        raise InvalidProviderParameterError("outerGeometry", "piece_exceeds_safe_area_at_max_depth")
    children: list[Polygon] = []
    for clipped in _split_projected(projected):
        for part in _polygon_parts(clipped):
            geographic = projector.unproject(part)
            children.extend(_subdivide_to_safe(_normalize_polygon(geographic), projector, config, depth + 1))
    if not children:
        raise InvalidProviderParameterError("outerGeometry", "subdivision_produced_no_polygon")
    return children


def _initial_pieces(outer: Polygon | MultiPolygon, projector: UTMProjector, config: PlannerConfig) -> list[Polygon]:
    projected = projector.project(outer)
    outer_area = float(projected.area) / 1_000_000
    if round(outer_area, 6) <= config.safe_piece_area_km2:
        return _polygon_parts(outer)
    grid_size = math.sqrt(config.target_piece_area_km2) * 1000
    west, south, east, north = projected.bounds
    anchor_west = math.floor(west / grid_size) * grid_size
    anchor_south = math.floor(south / grid_size) * grid_size
    pieces: list[Polygon] = []
    y = anchor_south
    while y < north:
        x = anchor_west
        while x < east:
            clipped = projected.intersection(box(x, y, x + grid_size, y + grid_size))
            for part in _polygon_parts(clipped):
                geographic = _normalize_polygon(projector.unproject(part))
                pieces.extend(_subdivide_to_safe(geographic, projector, config))
            x += grid_size
        y += grid_size
    return pieces


def _coverage(outer: Polygon | MultiPolygon, pieces: list[dict[str, Any]], projector: UTMProjector) -> dict[str, Any]:
    outer_projected = projector.project(outer)
    projected_pieces = [projector.project(shape(piece["geometry"])) for piece in pieces]
    union = unary_union(projected_pieces)
    outer_area = float(outer_projected.area) / 1_000_000
    planned_area = sum(float(item.area) for item in projected_pieces) / 1_000_000
    union_area = float(union.area) / 1_000_000
    uncovered = float(outer_projected.difference(union).area) / 1_000_000
    outside = float(union.difference(outer_projected).area) / 1_000_000
    overlap = max(0.0, planned_area - union_area)
    tolerance = max(AREA_TOLERANCE_MIN_KM2, outer_area * AREA_TOLERANCE_RATIO)
    conserved = abs(planned_area - outer_area) <= tolerance and uncovered <= tolerance and outside <= tolerance and overlap <= tolerance
    if not conserved:
        raise InvalidProviderParameterError("outerGeometry", "planned_geometry_failed_area_or_overlap_audit")
    return {
        "outerGeometryValid": True,
        "plannedAreaKm2": round(planned_area, 6),
        "uncoveredAreaKm2": round(uncovered, 9),
        "outsideAreaKm2": round(outside, 9),
        "overlapAreaKm2": round(overlap, 9),
        "areaDifferenceKm2": round(planned_area - outer_area, 9),
        "toleranceKm2": round(tolerance, 6),
        "areaConserved": conserved,
    }


def build_poi_query_plan(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise InvalidProviderParameterError("request", "must_be_object")
    profile = str(payload.get("profile") or "")
    if profile not in {"foot-walking", "cycling-regular", "driving-car"}:
        raise InvalidProviderParameterError("profile", "unsupported")
    center = payload.get("center") or {}
    lon = center.get("longitude", center.get("lon"))
    lat = center.get("latitude", center.get("lat"))
    try:
        lon, lat = float(lon), float(lat)
    except (TypeError, ValueError) as exc:
        raise InvalidProviderParameterError("center", "longitude_latitude_required") from exc
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise InvalidProviderParameterError("center", "out_of_wgs84_bounds")
    ranges = [int(value) for value in payload.get("rangesSeconds", [])]
    if not ranges or ranges != sorted(set(ranges)) or any(value <= 0 for value in ranges):
        raise InvalidProviderParameterError("rangesSeconds", "must_be_strictly_increasing_positive_integers")
    provider = str(payload.get("provider") or "openpoiservice")
    if provider != "openpoiservice":
        raise InvalidProviderParameterError("provider", "unsupported")
    limits = payload.get("providerLimits") or {}
    max_area = float(limits.get("maxAreaKm2", PROVIDER_MAX_AREA_KM2))
    request_limit = int(limits.get("requestLimit", 2000))
    if max_area != PROVIDER_MAX_AREA_KM2 or not 1 <= request_limit <= 2000:
        raise InvalidProviderParameterError("providerLimits", "unverified_provider_limit")
    config = PlannerConfig.from_payload(payload.get("plannerConfig"))
    outer = normalize_outer_geometry(payload.get("outerGeometry"))
    projector = _projector_for(outer)
    raw_pieces = _initial_pieces(outer, projector, config)
    records = [_piece_record(piece, projector) for piece in raw_pieces]
    records.sort(key=lambda item: (item["bbox"][1], item["bbox"][0], item["geometryHash"]))
    coverage = _coverage(outer, records, projector)
    minimum = len(records)
    adaptive_reserve = math.ceil(minimum * config.adaptive_reserve_ratio)
    upper = minimum + adaptive_reserve
    budget_status = "within-budget" if upper <= config.request_budget else "approval-required"
    outer_area = float(projector.project(outer).area) / 1_000_000
    identity = {
        "version": PLANNER_VERSION, "normalizationVersion": NORMALIZATION_VERSION,
        "center": [lon, lat], "profile": profile, "rangesSeconds": ranges,
        "provider": provider, "providerLimits": {"maxAreaKm2": max_area, "requestLimit": request_limit},
        "poiFilter": payload.get("poiFilter"),
        "plannerConfig": {
            "targetPieceAreaKm2": config.target_piece_area_km2,
            "maxSubdivisionDepth": config.max_subdivision_depth,
            "minPieceAreaKm2": config.min_piece_area_km2,
            "requestBudget": config.request_budget,
            "adaptiveReserveRatio": config.adaptive_reserve_ratio,
            "safePieceAreaKm2": config.safe_piece_area_km2,
        },
        "outerGeometryHash": geometry_hash(outer),
        "pieceGeometryHashes": [item["geometryHash"] for item in records],
    }
    fingerprint = _hash(identity)
    return {
        "planId": f"poi-plan-{fingerprint[:24]}",
        "planFingerprint": fingerprint,
        "plannerVersion": PLANNER_VERSION,
        "normalizationVersion": NORMALIZATION_VERSION,
        "profile": profile,
        "center": {"longitude": lon, "latitude": lat},
        "rangesSeconds": ranges,
        "outerGeometryHash": identity["outerGeometryHash"],
        "outerAreaKm2": round(outer_area, 6),
        "strategy": "non-overlapping-grid-intersection" if round(outer_area, 6) > config.safe_piece_area_km2 else "single-piece-fast-path",
        "pieceCount": minimum,
        "estimatedMinimumPoiRequests": minimum,
        "reservedAdaptiveRequests": adaptive_reserve,
        "estimatedMaximumApprovedRequests": upper,
        "requestBudget": config.request_budget,
        "budgetStatus": budget_status,
        "provider": provider,
        "providerLimits": {"maxAreaKm2": max_area, "requestLimit": request_limit},
        "plannerConfig": identity["plannerConfig"],
        "poiFilter": payload.get("poiFilter"),
        "pieces": records,
        "coverage": coverage,
        "upstreamRequestCount": 0,
    }


def public_plan(plan: dict[str, Any]) -> dict[str, Any]:
    result = {key: value for key, value in plan.items() if key != "pieces"}
    result["pieces"] = [{
        "pieceId": item["pieceId"], "parentPieceId": item["parentPieceId"], "depth": item["depth"],
        "areaKm2": item["areaKm2"], "bbox": item["bbox"], "geometryHash": item["geometryHash"],
        "status": item["status"], "attemptCount": item["attemptCount"], "resultCount": item["resultCount"],
        "resultTruncated": item["resultTruncated"], "cacheHit": item["cacheHit"],
    } for item in plan["pieces"]]
    return result


def create_plan_approval(plan: dict[str, Any], approved_poi_requests: int, created_at: str, expires_at: str) -> dict[str, Any]:
    if approved_poi_requests < plan["estimatedMinimumPoiRequests"]:
        raise InvalidProviderParameterError("approvedPoiRequests", "below_plan_minimum")
    return {
        "planFingerprint": plan["planFingerprint"], "profile": plan["profile"],
        "center": plan["center"], "rangesSeconds": plan["rangesSeconds"],
        "approvedPoiRequests": int(approved_poi_requests), "createdAt": created_at, "expiresAt": expires_at,
    }


def approval_is_valid(plan: dict[str, Any], approval: dict[str, Any] | None, now: str) -> bool:
    if not approval:
        return False
    expected = (plan["planFingerprint"], plan["profile"], plan["center"], plan["rangesSeconds"])
    actual = (approval.get("planFingerprint"), approval.get("profile"), approval.get("center"), approval.get("rangesSeconds"))
    return expected == actual and str(approval.get("createdAt", "")) <= now < str(approval.get("expiresAt", ""))


def evaluate_execution_gate(
    plan: dict[str, Any], approval: dict[str, Any] | None, quota: dict[str, Any] | None,
    now: str, profile_count: int = 1, quota_reserve_ratio: float = DEFAULT_QUOTA_RESERVE_RATIO,
) -> dict[str, Any]:
    if not approval_is_valid(plan, approval, now):
        return {"allowed": False, "status": "approval-required", "reason": "missing_expired_or_mismatched_approval"}
    approved = int(approval["approvedPoiRequests"])
    if approved > plan["requestBudget"]:
        return {"allowed": False, "status": "budget-exceeded", "reason": "approval_exceeds_plan_budget"}
    quota = quota or {}
    if quota.get("status") in {"rate-limited", "429"}:
        return {"allowed": False, "status": "rate-limited", "retryAfter": quota.get("retryAfter")}
    remaining = quota.get("remaining")
    if remaining is None:
        return {"allowed": profile_count == 1, "status": "explicit-single-profile" if profile_count == 1 else "quota-unknown-multi-profile-blocked"}
    usable = math.floor(int(remaining) * (1 - quota_reserve_ratio))
    return {"allowed": approved <= usable, "status": "within-quota" if approved <= usable else "quota-reserve-insufficient", "usableRemaining": usable}


def piece_cache_key(
    piece: dict[str, Any], poi_filter: Any, request_limit: int,
    adapter_version: str = ADAPTER_VERSION, normalization_version: str = NORMALIZATION_VERSION,
) -> str:
    return _hash({
        "provider": "openpoiservice", "geometryHash": piece["geometryHash"], "poiFilter": poi_filter,
        "requestLimit": request_limit, "adapterVersion": adapter_version, "normalizationVersion": normalization_version,
    })


def adaptive_piece_transition(piece: dict[str, Any], result_count: int, truncated: bool, request_limit: int, config: PlannerConfig) -> dict[str, Any]:
    updated = {**piece, "attemptCount": int(piece.get("attemptCount", 0)) + 1, "resultCount": int(result_count), "resultTruncated": bool(truncated or result_count == request_limit)}
    if result_count < request_limit and not truncated:
        updated["status"] = "completed"
        return {"piece": updated, "children": []}
    if int(piece.get("depth", 0)) >= config.max_subdivision_depth or float(piece["areaKm2"]) <= config.min_piece_area_km2:
        updated["status"] = "incomplete-dense-piece"
        return {"piece": updated, "children": []}
    geometry = normalize_outer_geometry(piece["geometry"])
    projector = _projector_for(geometry)
    children = []
    for clipped in _split_projected(projector.project(geometry)):
        for part in _polygon_parts(clipped):
            child = _piece_record(_normalize_polygon(projector.unproject(part)), projector, int(piece.get("depth", 0)) + 1, piece["pieceId"])
            children.append(child)
    children.sort(key=lambda item: (item["bbox"][1], item["bbox"][0], item["geometryHash"]))
    updated["status"] = "superseded-by-children"
    return {"piece": updated, "children": children}


class PoiBatchJobStore:
    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def _path(self, job_id: str) -> Path:
        return self.directory / f"{job_id}.json"

    def _atomic_write(self, path: Path, payload: dict[str, Any]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=f".{path.stem}.", suffix=".tmp", dir=self.directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass

    def initialize(self, plan: dict[str, Any]) -> dict[str, Any]:
        job_id = f"poi-job-{plan['planFingerprint'][:24]}"
        existing = self.load(job_id)
        if existing:
            return existing
        manifest = {
            "jobId": job_id, "planFingerprint": plan["planFingerprint"], "profile": plan["profile"],
            "status": "planned", "pieces": plan["pieces"], "published": False, "upstreamRequestCount": 0,
        }
        self._atomic_write(self._path(job_id), manifest)
        return manifest

    def load(self, job_id: str) -> dict[str, Any] | None:
        try:
            return json.loads(self._path(job_id).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def checkpoint(self, manifest: dict[str, Any], piece: dict[str, Any]) -> dict[str, Any]:
        updated = json.loads(json.dumps(manifest))
        by_id = {item["pieceId"]: index for index, item in enumerate(updated["pieces"])}
        if piece["pieceId"] in by_id:
            updated["pieces"][by_id[piece["pieceId"]]] = piece
        else:
            updated["pieces"].append(piece)
        updated["status"] = "running"
        self._atomic_write(self._path(updated["jobId"]), updated)
        return updated

    def recover(self, job_id: str, failed_retry_limit: int = 1) -> dict[str, Any]:
        manifest = self.load(job_id)
        if manifest is None:
            raise InvalidProviderParameterError("jobId", "manifest_not_found")
        recovered = json.loads(json.dumps(manifest))
        for piece in recovered["pieces"]:
            if piece["status"] == "running":
                piece["status"] = "pending"
            elif piece["status"] == "failed" and int(piece.get("attemptCount", 0)) <= failed_retry_limit:
                piece["status"] = "pending"
        self._atomic_write(self._path(job_id), recovered)
        return recovered


class PoiPieceCache:
    """Credential-free atomic cache for one normalized piece response."""

    def __init__(self, directory: str | Path) -> None:
        self.directory = Path(directory)

    def _path(self, key: str) -> Path:
        return self.directory / f"{key}.json"

    def write(self, key: str, piece: dict[str, Any], pois: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        record = {
            "cacheKey": key, "geometryHash": piece["geometryHash"], "pois": pois,
            "metadata": metadata, "writtenAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        }
        fd, temporary = tempfile.mkstemp(prefix=f".{key}.", suffix=".tmp", dir=self.directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(record, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, self._path(key))
        finally:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass

    def read(self, key: str, expected_geometry_hash: str) -> dict[str, Any] | None:
        try:
            record = json.loads(self._path(key).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if record.get("cacheKey") != key or record.get("geometryHash") != expected_geometry_hash or not isinstance(record.get("pois"), list):
            return None
        return record


def merge_piece_results(manifest: dict[str, Any], results_by_piece: dict[str, list[dict[str, Any]]], outer_geometry: dict[str, Any]) -> dict[str, Any]:
    leaves = [item for item in manifest.get("pieces", []) if item.get("status") != "superseded-by-children"]
    ready = all(item.get("status") in {"completed", "cache-hit"} and not item.get("resultTruncated") for item in leaves)
    if not ready:
        return {"publishable": False, "fullyCovered": False, "reason": "partial_or_incomplete_leaf_set", "pois": []}
    outer = normalize_outer_geometry(outer_geometry)
    merged: list[dict[str, Any]] = []
    stable_ids: set[tuple[str, str]] = set()
    duplicate_count = 0
    outside_count = 0
    raw_count = 0
    for piece in leaves:
        for poi in results_by_piece.get(piece["pieceId"], []):
            raw_count += 1
            location = poi.get("location") or {}
            try:
                lon, lat = float(location["lon"]), float(location["lat"])
            except (KeyError, TypeError, ValueError):
                outside_count += 1
                continue
            if not outer.covers(shape({"type": "Point", "coordinates": [lon, lat]})):
                outside_count += 1
                continue
            source_id = str(poi.get("sourceId") or poi.get("poiId") or "")
            stable_key = (str(poi.get("source") or ""), source_id)
            if source_id and stable_key in stable_ids:
                duplicate_count += 1
                continue
            if not source_id:
                normalized_name = " ".join(str(poi.get("name") or "").casefold().split())
                duplicate = any(
                    " ".join(str(item.get("name") or "").casefold().split()) == normalized_name
                    and math.hypot((float(item["location"]["lon"]) - lon) * 96_000, (float(item["location"]["lat"]) - lat) * 111_000) <= 5
                    for item in merged
                )
                if duplicate:
                    duplicate_count += 1
                    continue
            if source_id:
                stable_ids.add(stable_key)
            merged.append(poi)
    return {
        "publishable": True, "fullyCovered": True, "pois": merged, "rawCount": raw_count,
        "mergedCount": len(merged), "duplicateCount": duplicate_count, "outsideCount": outside_count,
        "coverageMeaning": "query-geometry-and-plan-complete-not-real-world-poi-completeness",
    }
