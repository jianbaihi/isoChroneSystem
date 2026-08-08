"""Offline, deterministic Stage 57 Polygon partitioning for large driving isochrones.

This module deliberately has no provider client imports.  It plans request-shaped
geometry only; sending POI or Matrix requests remains a separately approved step.
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, asdict
from typing import Any, Iterable

from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union

from app.services.poi_batch_planner import geometry_hash, normalize_outer_geometry
from app.services.projection import UTMProjector


PARTITIONER_VERSION = "stage-11-balanced-polygon-partitioner-v2"
EPSILON_SQ_M = 0.01
AREA_EPSILON_KM2 = 0.000001


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()


def _polygonal_parts(value: Any) -> list[Polygon]:
    if value.is_empty:
        return []
    if value.geom_type == "Polygon":
        # This helper is used for both projected metres and WGS84 degrees.  A
        # projected-square-metre threshold would incorrectly erase a valid WGS84
        # polygon during serialization, so only reject exact zero-area parts here.
        return [value] if value.area > 0 else []
    if value.geom_type == "MultiPolygon":
        return [item for item in value.geoms if item.area > 0]
    result: list[Polygon] = []
    for item in getattr(value, "geoms", []):
        result.extend(_polygonal_parts(item))
    return result


def _as_polygonal(value: Any) -> Polygon | MultiPolygon:
    parts = _polygonal_parts(value)
    if not parts:
        raise ValueError("partition operation produced no polygonal geometry")
    result = parts[0] if len(parts) == 1 else MultiPolygon(parts)
    if not result.is_valid:
        result = unary_union(parts)
        parts = _polygonal_parts(result)
        result = parts[0] if len(parts) == 1 else MultiPolygon(parts)
    if result.is_empty or not result.is_valid:
        raise ValueError("partition operation produced invalid geometry")
    return result


def _vertex_count(value: Any) -> int:
    return sum(len(part.exterior.coords) + sum(len(ring.coords) for ring in part.interiors) for part in _polygonal_parts(value))


def _perimeter(value: Any) -> float:
    return float(sum(part.length for part in _polygonal_parts(value)))


def _compactness(value: Any) -> float:
    perimeter = _perimeter(value)
    return 0.0 if perimeter <= 0 else float(4.0 * math.pi * value.area / (perimeter * perimeter))


def _bbox_utilization(value: Any) -> float:
    west, south, east, north = value.bounds
    bbox_area = max(0.0, (east - west) * (north - south))
    return 0.0 if bbox_area <= 0 else float(value.area / bbox_area)


def _geometry_geojson(value: Any) -> dict[str, Any]:
    payload = mapping(value)
    return json.loads(json.dumps(payload))


def _quantile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    low, high = math.floor(position), math.ceil(position)
    if low == high:
        return float(ordered[low])
    return float(ordered[low] + (ordered[high] - ordered[low]) * (position - low))


@dataclass(frozen=True)
class PartitionerConfig:
    max_area_km2: float = 45.0
    max_vertices: int = 500
    max_geometry_bytes: int = 100_000
    simplification_tolerance_meters: float = 0.0
    area_imbalance_weight: float = 1.0
    compactness_penalty_weight: float = 0.35
    boundary_complexity_penalty_weight: float = 0.10
    multi_part_penalty_weight: float = 0.25
    tiny_component_penalty_weight: float = 0.50

    def __post_init__(self) -> None:
        if not 0 < self.max_area_km2 <= 45.0:
            raise ValueError("max_area_km2 must be in (0, 45]")
        if self.max_vertices < 4 or self.max_geometry_bytes < 100:
            raise ValueError("geometry complexity constraints are invalid")
        if self.simplification_tolerance_meters < 0:
            raise ValueError("simplification tolerance cannot be negative")


def _side_for_cut(geometry: Polygon | MultiPolygon, axis: str, coordinate: float, first: bool) -> Polygon | MultiPolygon:
    west, south, east, north = geometry.bounds
    margin = max(east - west, north - south, 1.0) + 1.0
    if axis == "x":
        cutter = box(west - margin, south - margin, coordinate, north + margin) if first else box(coordinate, south - margin, east + margin, north + margin)
    else:
        cutter = box(west - margin, south - margin, east + margin, coordinate) if first else box(west - margin, coordinate, east + margin, north + margin)
    return _as_polygonal(geometry.intersection(cutter))


def _balanced_cut(geometry: Polygon | MultiPolygon, axis: str, desired_ratio: float) -> tuple[Polygon | MultiPolygon, Polygon | MultiPolygon] | None:
    west, south, east, north = geometry.bounds
    lower, upper = (west, east) if axis == "x" else (south, north)
    target = float(geometry.area) * desired_ratio
    if upper - lower <= 1e-7:
        return None
    lo, hi = lower, upper
    candidate: tuple[Polygon | MultiPolygon, Polygon | MultiPolygon] | None = None
    for _ in range(70):
        middle = (lo + hi) / 2.0
        try:
            first = _side_for_cut(geometry, axis, middle, True)
            second = _side_for_cut(geometry, axis, middle, False)
        except ValueError:
            if middle <= (lower + upper) / 2:
                lo = middle
            else:
                hi = middle
            continue
        candidate = (first, second)
        if first.area < target:
            lo = middle
        else:
            hi = middle
    return candidate


def _candidate_score(first: Polygon | MultiPolygon, second: Polygon | MultiPolygon, desired_ratio: float, config: PartitionerConfig) -> float:
    total = first.area + second.area
    if total <= 0:
        return float("inf")
    imbalance = abs(first.area / total - desired_ratio)
    compactness_penalty = (1.0 - _compactness(first)) + (1.0 - _compactness(second))
    complexity_penalty = (_vertex_count(first) + _vertex_count(second)) / max(1.0, _vertex_count(first.union(second)))
    multiparts = max(0, len(_polygonal_parts(first)) - 1) + max(0, len(_polygonal_parts(second)) - 1)
    smallest = min(part.area for part in _polygonal_parts(first) + _polygonal_parts(second))
    tiny_penalty = 1.0 if smallest < 100_000 else 0.0
    return (
        config.area_imbalance_weight * imbalance
        + config.compactness_penalty_weight * compactness_penalty
        + config.boundary_complexity_penalty_weight * complexity_penalty
        + config.multi_part_penalty_weight * multiparts
        + config.tiny_component_penalty_weight * tiny_penalty
    )


def _split_balanced(geometry: Polygon | MultiPolygon, left_count: int, right_count: int, config: PartitionerConfig) -> tuple[Polygon | MultiPolygon, Polygon | MultiPolygon]:
    desired_ratio = left_count / (left_count + right_count)
    candidates: list[tuple[float, int, Polygon | MultiPolygon, Polygon | MultiPolygon]] = []
    for priority, axis in enumerate(("x", "y")):
        candidate = _balanced_cut(geometry, axis, desired_ratio)
        if candidate is None:
            continue
        first, second = candidate
        candidates.append((_candidate_score(first, second, desired_ratio, config), priority, first, second))
    if not candidates:
        raise ValueError("unable to produce a valid balanced bisection")
    candidates.sort(key=lambda item: (round(item[0], 14), item[1]))
    return candidates[0][2], candidates[0][3]


def _recursive_partition(geometry: Polygon | MultiPolygon, leaves: int, config: PartitionerConfig) -> list[Polygon | MultiPolygon]:
    if leaves <= 1:
        return [geometry]
    left_count = leaves // 2
    right_count = leaves - left_count
    first, second = _split_balanced(geometry, left_count, right_count, config)
    return _recursive_partition(first, left_count, config) + _recursive_partition(second, right_count, config)


def _projected_clean(outer_geometry: dict[str, Any], config: PartitionerConfig) -> tuple[Polygon | MultiPolygon, UTMProjector, Polygon | MultiPolygon]:
    normalized = normalize_outer_geometry(outer_geometry)
    representative = normalized.representative_point()
    projector = UTMProjector.for_lon_lat(float(representative.x), float(representative.y))
    original = _as_polygonal(projector.project(normalized))
    cleaned = original
    if config.simplification_tolerance_meters > 0:
        candidate = _as_polygonal(original.simplify(config.simplification_tolerance_meters, preserve_topology=True))
        area_error = abs(candidate.area - original.area) / original.area
        if area_error > 0.001:
            raise ValueError("topology preserving simplification exceeds 0.1% area error")
        cleaned = candidate
    return cleaned, projector, original


def _piece_record(geometry: Polygon | MultiPolygon, projector: UTMProjector, outer_projected: Polygon | MultiPolygon, index: int, config: PartitionerConfig) -> dict[str, Any]:
    geographic = _as_polygonal(projector.unproject(geometry))
    geojson = _geometry_geojson(geographic)
    before = _vertex_count(geometry)
    geometry_bytes = len(_canonical(geojson).encode("utf-8"))
    area_km2 = float(geometry.area) / 1_000_000
    error_ratio = abs(geometry.area - projector.project(geographic).area) / max(geometry.area, 1.0)
    if area_km2 > config.max_area_km2 + AREA_EPSILON_KM2:
        raise ValueError("balanced partition leaf exceeds max area")
    if geometry_bytes > config.max_geometry_bytes:
        raise ValueError("partition leaf geometry exceeds request size constraint")
    if before > config.max_vertices:
        raise ValueError("partition leaf vertex count exceeds complexity constraint")
    outside = geometry.difference(outer_projected).area
    if outside > EPSILON_SQ_M:
        raise ValueError("partition leaf lies outside outer geometry")
    geometry_digest = geometry_hash(geographic)
    return {
        "pieceId": f"v2-piece-{index:03d}-{geometry_digest[:16]}",
        "geometryHash": geometry_digest,
        "geometry": geojson,
        "geometryType": geojson["type"],
        "areaKm2": round(area_km2, 6),
        "vertexCountBefore": before,
        "vertexCountAfter": before,
        "geometryBytes": geometry_bytes,
        "compactness": round(_compactness(geometry), 9),
        "bboxUtilization": round(_bbox_utilization(geometry), 9),
        "simplificationToleranceMeters": config.simplification_tolerance_meters,
        "areaErrorRatio": round(error_ratio, 12),
        "partCount": len(_polygonal_parts(geometry)),
        "holeCount": sum(len(part.interiors) for part in _polygonal_parts(geometry)),
        "valid": bool(geometry.is_valid),
        "perimeterMeters": round(_perimeter(geometry), 6),
    }


def _coverage(outer: Polygon | MultiPolygon, pieces: Iterable[Polygon | MultiPolygon]) -> dict[str, Any]:
    items = list(pieces)
    union = unary_union(items)
    outer_area = outer.area / 1_000_000
    planned = sum(item.area for item in items) / 1_000_000
    uncovered = outer.difference(union).area / 1_000_000
    outside = union.difference(outer).area / 1_000_000
    overlap = max(0.0, planned - union.area / 1_000_000)
    tolerance = max(0.01, outer_area * 0.001)
    return {
        "outerAreaKm2": round(outer_area, 6), "plannedAreaKm2": round(planned, 6),
        "areaDifferenceKm2": round(planned - outer_area, 9),
        "uncoveredAreaKm2": round(uncovered, 9), "outsideAreaKm2": round(outside, 9),
        "overlapAreaKm2": round(overlap, 9), "toleranceKm2": round(tolerance, 6),
        "areaConserved": abs(planned - outer_area) <= tolerance and uncovered <= tolerance and outside <= tolerance and overlap <= tolerance,
    }


def _identity(outer_hash: str, profile: str, ranges: list[int], config: PartitionerConfig, pieces: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "plannerVersion": PARTITIONER_VERSION, "outerGeometryHash": outer_hash,
        "profile": profile, "rangesSeconds": [int(item) for item in ranges],
        "config": asdict(config), "pieceGeometryHashes": [item["geometryHash"] for item in pieces],
    }


def build_balanced_partition_plan(payload: dict[str, Any]) -> dict[str, Any]:
    """Build an offline V2 plan; no client, cache, or network side effects."""
    profile = str(payload.get("profile") or "")
    if profile != "driving-car":
        raise ValueError("stage57 V2 partitioner supports driving-car only")
    ranges = [int(value) for value in payload.get("rangesSeconds") or []]
    if ranges != [600, 1200, 1800]:
        raise ValueError("Stage57 requires 600/1200/1800 second cumulative ranges")
    center = payload.get("center") or {}
    config = PartitionerConfig(**(payload.get("config") or {}))
    cleaned, projector, original = _projected_clean(payload["outerGeometry"], config)
    target_leaves = math.ceil((cleaned.area / 1_000_000) / config.max_area_km2)
    pieces_projected = _recursive_partition(cleaned, target_leaves, config)
    records = [_piece_record(item, projector, original, index + 1, config) for index, item in enumerate(pieces_projected)]
    records.sort(key=lambda item: (item["geometryHash"], item["pieceId"]))
    for index, record in enumerate(records, start=1):
        record["pieceId"] = f"v2-piece-{index:03d}-{record['geometryHash'][:16]}"
    coverage = _coverage(original, pieces_projected)
    outer_hash = geometry_hash(normalize_outer_geometry(payload["outerGeometry"]))
    fingerprint = _hash(_identity(outer_hash, profile, ranges, config, records))
    return {
        "planId": f"stage57-v2-{fingerprint[:24]}", "planFingerprint": fingerprint,
        "plannerVersion": PARTITIONER_VERSION, "strategy": "balanced_recursive_bisection",
        "profile": profile, "center": {"longitude": float(center["longitude"]), "latitude": float(center["latitude"])},
        "rangesSeconds": ranges, "outerGeometryHash": outer_hash,
        "outerAreaKm2": round(original.area / 1_000_000, 6),
        "theoreticalLowerBound": target_leaves, "pieceCount": len(records),
        "config": asdict(config), "coverage": coverage, "pieces": records,
        "upstreamRequestCount": 0,
    }


def canonical_full_precision_coverage_audit(payload: dict[str, Any]) -> dict[str, Any]:
    """Audit the internal projected leaves before WGS84 GeoJSON serialization."""
    config = PartitionerConfig(**(payload.get("config") or {}))
    cleaned, _projector, original = _projected_clean(payload["outerGeometry"], config)
    count = math.ceil((cleaned.area / 1_000_000) / config.max_area_km2)
    pieces = _recursive_partition(cleaned, count, config)
    union = unary_union(pieces)
    outer_area = original.area / 1_000_000
    planned_area = sum(piece.area for piece in pieces) / 1_000_000
    uncovered = original.difference(union).area / 1_000_000
    outside = union.difference(original).area / 1_000_000
    overlap = max(0.0, planned_area - union.area / 1_000_000)
    tolerance = max(0.01, outer_area * 0.001)
    return {
        "auditLayer": "canonical-projected-full-precision",
        "coordinateDecimals": None,
        "outerAreaKm2": outer_area,
        "plannedAreaKm2": planned_area,
        "uncoveredAreaKm2": uncovered,
        "outsideAreaKm2": outside,
        "overlapAreaKm2": overlap,
        "areaDifferenceKm2": planned_area - outer_area,
        "toleranceKm2": tolerance,
        "withinTolerance": bool(abs(planned_area - outer_area) <= tolerance and uncovered <= tolerance and outside <= tolerance and overlap <= tolerance),
    }


def _shared_boundary_meters(first: Any, second: Any) -> float:
    return float(first.boundary.intersection(second.boundary).length)


def adjacency_constrained_merge(pieces: list[dict[str, Any]], *, max_area_km2: float = 45.0, epsilon_meters: float = 0.01) -> list[dict[str, Any]]:
    """Greedily merge genuine shared-boundary neighbours without exceeding 45 km².

    It is intentionally deterministic and returns geometry-bearing records only; this
    operation is for the V1 comparison candidate, never a request executor.
    """
    working = [{**item, "geometry": item["geometry"]} for item in pieces]
    if not working:
        return []
    first_geometry = shape(working[0]["geometry"])
    representative = first_geometry.representative_point()
    projector = UTMProjector.for_lon_lat(float(representative.x), float(representative.y))
    while True:
        candidates: list[tuple[float, float, int, int, Any]] = []
        # Public plan geometry is WGS84, so all safety measurements must be made
        # after projection.  Degree-area would silently allow an oversized union.
        parsed = [_as_polygonal(projector.project(shape(item["geometry"]))) for item in working]
        for left in range(len(working)):
            for right in range(left + 1, len(working)):
                shared = _shared_boundary_meters(parsed[left], parsed[right])
                if shared <= epsilon_meters:
                    continue
                union = _as_polygonal(parsed[left].union(parsed[right]))
                if union.area / 1_000_000 > max_area_km2 + AREA_EPSILON_KM2 or not union.is_valid:
                    continue
                if len(_polygonal_parts(union)) > 1:
                    continue
                improvement = _compactness(union) - min(_compactness(parsed[left]), _compactness(parsed[right]))
                candidates.append((min(parsed[left].area, parsed[right].area), -shared, -improvement, left, right, union))
        if not candidates:
            break
        candidates.sort(key=lambda item: (item[0], item[1], item[2], item[3], item[4]))
        _, _, _, left, right, union = candidates[0]
        merged = {"geometry": _geometry_geojson(_as_polygonal(projector.unproject(union))), "sourcePieceIds": sorted([working[left].get("pieceId", str(left)), working[right].get("pieceId", str(right))])}
        working = [item for index, item in enumerate(working) if index not in {left, right}] + [merged]
        working.sort(key=lambda item: _canonical(item["geometry"]))
    return working


def fragmentation_audit(pieces: list[dict[str, Any]], outer_geometry: dict[str, Any]) -> dict[str, Any]:
    outer_wgs84 = normalize_outer_geometry(outer_geometry)
    representative = outer_wgs84.representative_point()
    projector = UTMProjector.for_lon_lat(float(representative.x), float(representative.y))
    outer = _as_polygonal(projector.project(outer_wgs84))
    geometries = [_as_polygonal(projector.project(shape(item["geometry"]))) for item in pieces]
    areas = [item.area / 1_000_000 for item in geometries]
    vertices = [_vertex_count(item) for item in geometries]
    perimeters = [_perimeter(item) for item in geometries]
    compactness = [_compactness(item) for item in geometries]
    utilization = [_bbox_utilization(item) for item in geometries]
    adjacency: list[dict[str, Any]] = []
    for left in range(len(geometries)):
        for right in range(left + 1, len(geometries)):
            shared = _shared_boundary_meters(geometries[left], geometries[right])
            if shared > 0.01:
                union = _as_polygonal(geometries[left].union(geometries[right]))
                adjacency.append({
                    "leftPieceId": pieces[left].get("pieceId", str(left)), "rightPieceId": pieces[right].get("pieceId", str(right)),
                    "sharedBoundaryMeters": round(shared, 6),
                    "unionAreaKm2": round(union.area / 1_000_000, 6),
                    "mergeAllowedAt45Km2": union.area / 1_000_000 <= 45.0 + AREA_EPSILON_KM2 and len(_polygonal_parts(union)) == 1,
                })
    coverage = _coverage(outer, geometries)
    return {
        "pieceCount": len(pieces), "areaSumKm2": round(sum(areas), 6),
        "areaKm2": {"min": round(min(areas), 6), "max": round(max(areas), 6), "median": round(_quantile(areas, 0.5), 6), "p10": round(_quantile(areas, 0.1), 6), "p90": round(_quantile(areas, 0.9), 6)},
        "areaThresholdCounts": {"lt0_1": sum(area < 0.1 for area in areas), "lt1": sum(area < 1 for area in areas), "lt5": sum(area < 5 for area in areas), "gt40": sum(area > 40 for area in areas)},
        "vertexCount": {"min": min(vertices), "max": max(vertices), "median": round(_quantile([float(value) for value in vertices], 0.5), 3)},
        "perimeterMeters": {"min": round(min(perimeters), 6), "max": round(max(perimeters), 6), "median": round(_quantile(perimeters, 0.5), 6)},
        "compactness": {"min": round(min(compactness), 9), "max": round(max(compactness), 9), "median": round(_quantile(compactness, 0.5), 9)},
        "bboxUtilization": {"min": round(min(utilization), 9), "max": round(max(utilization), 9), "median": round(_quantile(utilization, 0.5), 9)},
        "adjacency": {"sharedBoundaryPairs": len(adjacency), "mergeablePairsAt45Km2": sum(item["mergeAllowedAt45Km2"] for item in adjacency), "pairs": adjacency},
        "validPieceCount": sum(item.is_valid for item in geometries), "invalidPieceCount": sum(not item.is_valid for item in geometries),
        "holePieceCount": sum(bool(_polygonal_parts(item)[0].interiors) for item in geometries if len(_polygonal_parts(item)) == 1),
        "multiPolygonPieceCount": sum(item.geom_type == "MultiPolygon" for item in geometries), "coverage": coverage,
    }
