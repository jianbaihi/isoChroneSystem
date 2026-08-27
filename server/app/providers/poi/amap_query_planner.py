from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path

from shapely.geometry import box

MAPPING_PATH = Path(__file__).with_name("category_maps") / "amap-query-v1.json"


def load_query_mapping() -> dict:
    return json.loads(MAPPING_PATH.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class AmapCategoryJob:
    category_id: str
    types: tuple[str, ...]
    geometry: object
    depth: int = 0


def build_category_jobs(category_ids: list[str], geometry) -> list[AmapCategoryJob]:
    mapping = load_query_mapping()
    selected = list(dict.fromkeys(category_ids)) or list(mapping["categories"])
    jobs = []
    for category_id in selected:
        item = mapping["categories"].get(category_id)
        if item:
            jobs.append(AmapCategoryJob(category_id, tuple(item["types"]), geometry, 0))
    return jobs


def area_km2(geometry) -> float:
    latitude = geometry.centroid.y
    return float(geometry.area) * 111.32 * 111.32 * max(0.1, math.cos(math.radians(latitude)))


def split_job(job: AmapCategoryJob) -> list[AmapCategoryJob]:
    minx, miny, maxx, maxy = job.geometry.bounds
    if maxx - minx >= maxy - miny:
        middle = (minx + maxx) / 2
        halves = (box(minx, miny, middle, maxy), box(middle, miny, maxx, maxy))
    else:
        middle = (miny + maxy) / 2
        halves = (box(minx, miny, maxx, middle), box(minx, middle, maxx, maxy))
    return [AmapCategoryJob(job.category_id, job.types, part, job.depth + 1) for half in halves if not (part := job.geometry.intersection(half)).is_empty]


def geometry_hash(geometry) -> str:
    return hashlib.sha256(geometry.wkb).hexdigest()


def cache_identity(job: AmapCategoryJob, page: int, page_size: int) -> dict:
    return {"provider": "amap", "categoryId": job.category_id, "typesVersion": "amap-query-v1", "geometryHash": geometry_hash(job.geometry), "pageNumber": page, "pageSize": page_size, "coordinatePolicyVersion": "wgs84-gcj02-v1", "providerAdapterVersion": "amap-v2"}

