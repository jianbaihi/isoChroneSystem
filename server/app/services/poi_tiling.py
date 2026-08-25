from __future__ import annotations

import math
from dataclasses import dataclass

from shapely.geometry import box, shape
from shapely.ops import unary_union

from app.services.geometry import geometry_to_geojson
from app.services.projection import UTMProjector


@dataclass(frozen=True)
class PoiCell:
    cell_id: str
    geometry: dict
    area_km2: float


def _polygonal(geometry):
    if geometry.is_empty:
        return None
    if geometry.geom_type == "Polygon":
        return geometry
    if geometry.geom_type == "MultiPolygon":
        return geometry
    parts = [item for item in getattr(geometry, "geoms", []) if item.geom_type in {"Polygon", "MultiPolygon"} and not item.is_empty]
    if not parts:
        return None
    merged = unary_union(parts)
    return merged if merged.geom_type in {"Polygon", "MultiPolygon"} and not merged.is_empty else None


def _cell_from_projected(projected, projector: UTMProjector, cell_id: str) -> PoiCell | None:
    projected = _polygonal(projected)
    if projected is None:
        return None
    # OpenPOIService accepts Polygon query geometries.  An isochrone clipped
    # by a grid cell can become a fragmented MultiPolygon (common for driving
    # around rivers and disconnected road branches).  Its cell-local convex
    # hull is safe because results are filtered against the original outer
    # isochrone after retrieval.
    if projected.geom_type == "MultiPolygon":
        projected = projected.convex_hull
    geographic = _polygonal(projector.unproject(projected))
    if geographic is None:
        return None
    return PoiCell(cell_id=cell_id, geometry=geometry_to_geojson(geographic), area_km2=projected.area / 1_000_000)


def plan_poi_cells(outer_geometry, grid_size_meters: float, max_cell_area_km2: float) -> tuple[list[PoiCell], UTMProjector]:
    if outer_geometry.is_empty:
        return [], UTMProjector.for_lon_lat(0, 0)
    representative = outer_geometry.representative_point()
    projector = UTMProjector.for_lon_lat(representative.x, representative.y)
    projected = projector.project(outer_geometry)
    west, south, east, north = projected.bounds
    west = math.floor(west / grid_size_meters) * grid_size_meters
    south = math.floor(south / grid_size_meters) * grid_size_meters
    east = math.ceil(east / grid_size_meters) * grid_size_meters
    north = math.ceil(north / grid_size_meters) * grid_size_meters
    cells: list[PoiCell] = []
    row = 0
    y = south
    while y < north:
        col = 0
        x = west
        while x < east:
            clipped = projected.intersection(box(x, y, x + grid_size_meters, y + grid_size_meters))
            cell = _cell_from_projected(clipped, projector, f"cell-{row:04d}-{col:04d}")
            if cell is not None and cell.area_km2 > 0:
                cells.extend(_subdivide(cell, projector, max_cell_area_km2, 0))
            x += grid_size_meters
            col += 1
        y += grid_size_meters
        row += 1
    return cells, projector


def _subdivide(cell: PoiCell, projector: UTMProjector, max_cell_area_km2: float, depth: int) -> list[PoiCell]:
    if cell.area_km2 <= max_cell_area_km2:
        return [cell]
    if depth >= 2:
        return [cell]
    projected = projector.project(shape(cell.geometry))
    west, south, east, north = projected.bounds
    mid_x, mid_y = (west + east) / 2, (south + north) / 2
    children: list[PoiCell] = []
    for row, y in enumerate((south, mid_y)):
        for col, x in enumerate((west, mid_x)):
            child = _cell_from_projected(projected.intersection(box(x, y, mid_x if col == 0 else east, mid_y if row == 0 else north)), projector, f"{cell.cell_id}-{row}{col}")
            if child is not None and child.area_km2 > 0:
                children.extend(_subdivide(child, projector, max_cell_area_km2, depth + 1))
    return children or [cell]


def split_poi_cell(cell: PoiCell, projector: UTMProjector) -> list[PoiCell]:
    projected = projector.project(shape(cell.geometry))
    west, south, east, north = projected.bounds
    mid_x, mid_y = (west + east) / 2, (south + north) / 2
    children: list[PoiCell] = []
    for row, y in enumerate((south, mid_y)):
        for col, x in enumerate((west, mid_x)):
            clipped = projected.intersection(box(x, y, mid_x if col == 0 else east, mid_y if row == 0 else north))
            child = _cell_from_projected(clipped, projector, f"{cell.cell_id}-{row}{col}")
            if child is not None and child.area_km2 > 0:
                children.append(child)
    return children
