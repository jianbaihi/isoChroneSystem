from __future__ import annotations

from collections import Counter
from shapely.geometry import Point, shape

from app.models import Category, Location, Poi, SourceLocation
from app.providers.poi.category_mapping import LABELS


def assign_provider_pois(records: list[dict], outer_geometry, rings, provider: str, attribution: list[str], raw_count: int, request_count: int, truncated: bool, timings: dict) -> dict:
    ring_shapes = [(r["ringId"], shape(r["geometry"])) if isinstance(r, dict) else (r.ringId, shape(r.geometry)) for r in rings]
    pois, outside, seen, duplicates = [], 0, set(), 0
    counts = Counter()
    for record in records:
        if record["providerPoiId"] in seen:
            duplicates += 1
            continue
        seen.add(record["providerPoiId"])
        point = Point(record["location"]["lon"], record["location"]["lat"])
        if not outer_geometry.covers(point):
            outside += 1
            continue
        ring_id = next((ring_id for ring_id, polygon in ring_shapes if polygon.covers(point)), None)
        if not ring_id:
            outside += 1
            continue
        category_id = record["category"]["id"]
        counts[category_id] += 1
        pois.append(Poi(
            poiId=f"{provider}:{record['providerPoiId']}", providerPoiId=record["providerPoiId"],
            source=provider, name=record["name"], location=Location(**record["location"]),
            sourceLocation=SourceLocation(**record["sourceLocation"]), categoryId=category_id,
            category=record["category"], ringId=ring_id, address=record.get("address"),
            rating=record.get("rating"), phone=record.get("phone"), website=record.get("website"),
            openingHours=record.get("openingHours"), attribution=attribution,
        ))
    categories = [Category(categoryId=k, label=LABELS[k], level=1, matchedPoiCount=v, returnedPoiCount=v) for k, v in sorted(counts.items())]
    return {
        "pois": pois, "categories": categories, "matchedCount": len(pois),
        "ringCounts": Counter(p.ringId for p in pois), "attribution": attribution,
        "coverage": {"requests": request_count, "cacheHits": 0, "rawPoiCount": raw_count, "parsedPoiCount": len(records), "deduplicated": len(seen), "deduplicatedPoiCount": len(seen), "truncated": truncated},
        "diagnostics": {"outside_outer_isochrone": outside, "duplicate": duplicates},
        "timings": timings,
    }
