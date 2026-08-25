from __future__ import annotations

import math
from typing import Any

from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

from app.errors import InvalidProviderResponseError
from app.models import CumulativeIsochrone
from app.services.projection import UTMProjector


POLYGON_TYPES = {"Polygon", "MultiPolygon"}


def _invalid(field: str, reason: str) -> InvalidProviderResponseError:
    return InvalidProviderResponseError([{"field": field, "reason": reason}])


def _validate_coordinate_tree(value: Any, field: str) -> None:
    if not isinstance(value, (list, tuple)) or not value:
        raise _invalid(field, "coordinates_empty_or_not_array")
    if all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in value):
        if len(value) < 2 or any(not math.isfinite(float(item)) for item in value[:2]):
            raise _invalid(field, "coordinate_not_finite")
        return
    for child in value:
        _validate_coordinate_tree(child, field)


def _polygonal_geometry(geometry: Any, field: str) -> Polygon | MultiPolygon:
    if geometry.is_empty:
        raise _invalid(field, "geometry_empty")
    if geometry.geom_type in POLYGON_TYPES and geometry.is_valid:
        return geometry

    repaired = make_valid(geometry)
    if repaired.is_empty:
        raise _invalid(field, "geometry_repair_empty")
    if repaired.geom_type in POLYGON_TYPES and repaired.is_valid:
        return repaired
    if isinstance(repaired, GeometryCollection):
        polygon_parts = [item for item in repaired.geoms if item.geom_type in POLYGON_TYPES and not item.is_empty]
        if polygon_parts:
            merged = unary_union(polygon_parts)
            if merged.geom_type in POLYGON_TYPES and merged.is_valid and not merged.is_empty:
                return merged
    raise _invalid(field, "geometry_not_valid_polygonal")


def geojson_to_geometry(geometry: dict[str, Any], field: str = "geometry") -> Polygon | MultiPolygon:
    if not isinstance(geometry, dict) or geometry.get("type") not in POLYGON_TYPES:
        raise _invalid(field, "type_must_be_polygon_or_multipolygon")
    coordinates = geometry.get("coordinates")
    _validate_coordinate_tree(coordinates, f"{field}.coordinates")
    try:
        parsed = shape({"type": geometry["type"], "coordinates": coordinates})
    except (TypeError, ValueError, AssertionError) as exc:
        raise _invalid(field, "coordinates_invalid") from exc
    return _polygonal_geometry(parsed, field)


def _to_lists(value: Any) -> Any:
    if isinstance(value, tuple):
        return [_to_lists(item) for item in value]
    if isinstance(value, list):
        return [_to_lists(item) for item in value]
    return value


def geometry_to_geojson(geometry: Polygon | MultiPolygon, field: str = "geometry") -> dict[str, Any]:
    normalized = _polygonal_geometry(geometry, field)
    result = mapping(normalized)
    return {"type": result["type"], "coordinates": _to_lists(result["coordinates"])}


def normalize_geojson_geometry(geometry: dict[str, Any], field: str = "geometry") -> dict[str, Any]:
    return geometry_to_geojson(geojson_to_geometry(geometry, field), field)


def geodesic_area_km2(geometry: Any) -> float:
    """Estimate WGS84 polygon area in a local UTM projection for safety gating."""
    if geometry is None or geometry.is_empty:
        raise _invalid("geometry", "geometry_empty")
    centroid = geometry.centroid
    projector = UTMProjector.for_lon_lat(float(centroid.x), float(centroid.y))
    projected = projector.project(geometry)
    return round(abs(float(projected.area)) / 1_000_000, 4)


def build_exclusive_rings(isochrones: list[CumulativeIsochrone]) -> list[dict[str, Any]]:
    """Create mutually exclusive outer rings from cumulative isochrones."""
    if not isochrones:
        raise _invalid("cumulativeIsochrones", "empty")

    rings: list[dict[str, Any]] = []
    previous_geometry: Polygon | MultiPolygon | None = None
    previous_range = 0
    for isochrone in isochrones:
        current_geometry = geojson_to_geometry(
            isochrone.geometry,
            f"cumulativeIsochrones.{isochrone.isochroneId}.geometry",
        )
        ring_geometry = current_geometry if previous_geometry is None else current_geometry.difference(previous_geometry)
        ring_geometry = _polygonal_geometry(
            ring_geometry,
            f"ring-{previous_range}-{isochrone.rangeMinutes}.geometry",
        )
        rings.append(
            {
                "ringId": f"ring-{previous_range}-{isochrone.rangeMinutes}",
                "innerRangeMinutes": previous_range,
                "outerRangeMinutes": isochrone.rangeMinutes,
                "geometry": geometry_to_geojson(
                    ring_geometry,
                    f"ring-{previous_range}-{isochrone.rangeMinutes}.geometry",
                ),
            }
        )
        previous_geometry = current_geometry
        previous_range = isochrone.rangeMinutes
    return rings
