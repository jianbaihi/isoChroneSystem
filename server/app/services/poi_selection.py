from __future__ import annotations

from collections import defaultdict
from typing import Any

from shapely.geometry import Point, shape

from app.errors import InvalidPoiCategoryError
from app.models import AnalysisRequest, Category, Location, Poi
from app.repositories.local_poi import LocalPoiRepository


TOP_LEVEL_LABELS = {
    "services_and_business": "商业与专业服务", "shopping": "购物", "food_and_drink": "餐饮美食",
    "lifestyle_services": "生活服务", "travel_and_transportation": "交通出行", "health_care": "医疗健康",
    "education": "教育", "cultural_and_historic": "文化历史", "sports_and_recreation": "运动休闲",
    "community_and_government": "社区与公共服务", "lodging": "住宿", "arts_and_entertainment": "艺术娱乐",
    "geographic_entities": "自然与地理实体",
}


def _label(category_id: str) -> str:
    return TOP_LEVEL_LABELS.get(category_id) or category_id.replace("_", " ").title()


def _ring_id(ring: Any) -> str:
    return str(ring.get("ringId") if isinstance(ring, dict) else ring.ringId)


def _ring_outer(ring: Any) -> int:
    return int(ring.get("outerRangeMinutes") if isinstance(ring, dict) else ring.outerRangeMinutes)


def _ring_shapes(rings: list[Any]) -> list[tuple[Any, Any]]:
    result = []
    for ring in rings:
        geometry_value = ring.get("geometry") if isinstance(ring, dict) else ring.geometry
        if not geometry_value:
            continue
        geometry = shape(geometry_value)
        if not geometry.is_empty and geometry.is_valid:
            result.append((ring, geometry))
    return result


def _deterministic_limit(matches: list[dict[str, Any]], max_results: int) -> list[dict[str, Any]]:
    if len(matches) <= max_results:
        return matches
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for match in matches:
        groups[(match["ring_id"], match["top_level_category_id"])].append(match)
    ordered_keys = sorted(groups)
    selected: list[dict[str, Any]] = []
    index = 0
    while len(selected) < max_results and ordered_keys:
        key = ordered_keys[index % len(ordered_keys)]
        if groups[key]:
            selected.append(groups[key].pop(0))
        ordered_keys = [candidate for candidate in ordered_keys if groups[candidate]]
        index += 1
    return selected


def select_local_overture_pois(
    request: AnalysisRequest,
    rings: list[Any],
    repository: LocalPoiRepository,
    max_results: int,
    max_candidates: int,
) -> dict[str, Any]:
    dataset_id = request.poiDatasetId
    dataset = repository.get_dataset(dataset_id or "")
    if not dataset:
        from app.errors import PoiDatasetNotReadyError
        raise PoiDatasetNotReadyError(dataset_id)
    known_categories = repository.category_ids(dataset_id)
    unknown = sorted(set(request.categoryIds) - known_categories)
    if unknown:
        raise InvalidPoiCategoryError(unknown)
    ring_shapes = _ring_shapes(rings)
    if not ring_shapes:
        return {"pois": [], "categories": [], "ringCounts": {_ring_id(ring): 0 for ring in rings}, "matchedCount": 0, "returnedCount": 0, "truncated": False}
    min_lon = min(float(geometry.bounds[0]) for _, geometry in ring_shapes)
    min_lat = min(float(geometry.bounds[1]) for _, geometry in ring_shapes)
    max_lon = max(float(geometry.bounds[2]) for _, geometry in ring_shapes)
    max_lat = max(float(geometry.bounds[3]) for _, geometry in ring_shapes)
    candidates = repository.query_candidates(dataset_id, (min_lon, min_lat, max_lon, max_lat), max_candidates)
    matches: list[dict[str, Any]] = []
    for candidate in candidates:
        if request.categoryIds and not (set(candidate["hierarchy"]) & set(request.categoryIds)):
            continue
        point = Point(candidate["lon"], candidate["lat"])
        covered = [(ring, geometry) for ring, geometry in ring_shapes if geometry.covers(point)]
        if not covered:
            continue
        ring = min(covered, key=lambda item: _ring_outer(item[0]))[0]
        candidate = dict(candidate)
        candidate["ring_id"] = _ring_id(ring)
        matches.append(candidate)
    matches.sort(key=lambda item: (item["ring_id"], item["top_level_category_id"], tuple(item["hierarchy"]), item["poi_id"]))
    selected = _deterministic_limit(matches, max_results)
    ring_counts: dict[str, int] = {_ring_id(ring): 0 for ring in rings}
    matched_counts: dict[str, int] = defaultdict(int)
    returned_counts: dict[str, int] = defaultdict(int)
    ring_category_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    category_meta: dict[str, dict[str, Any]] = {}
    for match in matches:
        ring_counts[match["ring_id"]] = ring_counts.get(match["ring_id"], 0) + 1
        for depth, category_id in enumerate(match["hierarchy"]):
            category_meta.setdefault(category_id, {
                "categoryId": category_id,
                "parentCategoryId": match["hierarchy"][depth - 1] if depth else None,
                "topLevelId": match["hierarchy"][0],
                "depth": depth,
                "label": _label(category_id),
                "children": set(),
                "matchedPoiCount": 0,
                "returnedPoiCount": 0,
                "ringCounts": defaultdict(int),
                "isBasicCategory": False,
            })
            category_meta[category_id]["matchedPoiCount"] += 1
            category_meta[category_id]["ringCounts"][match["ring_id"]] += 1
            if depth:
                category_meta[match["hierarchy"][depth - 1]]["children"].add(category_id)
            if category_id == match.get("basic_category_id"):
                category_meta[category_id]["isBasicCategory"] = True
    for match in selected:
        for category_id in match["hierarchy"]:
            category_meta[category_id]["returnedPoiCount"] += 1
    poi_models = []
    for match in selected:
        hierarchy = list(match["hierarchy"])
        poi_models.append(Poi(
            poiId=match["poi_id"], datasetId=dataset_id, source="overture", name=match["name"],
            nameLocale=match["name_locale"], location=Location(lon=match["lon"], lat=match["lat"]),
            categoryId=match["primary_category_id"],
            category={
                "topLevelId": match["top_level_category_id"], "basicCategoryId": match["basic_category_id"],
                "primaryCategoryId": match["primary_category_id"], "hierarchy": hierarchy, "alternateIds": match["alternates"],
            }, ringId=match["ring_id"], confidence=match["confidence"], address=match["address"],
        ))
    categories = []
    for category_id in sorted(category_meta, key=lambda item: (category_meta[item]["depth"], item)):
        item = category_meta[category_id]
        children = sorted(item["children"])
        categories.append(Category(
            categoryId=category_id, parentCategoryId=item["parentCategoryId"], label=item["label"],
            level=item["depth"] + 1, depth=item["depth"], topLevelId=item["topLevelId"],
            isBasicCategory=item["isBasicCategory"], isLeafInResult=not children,
            childCategoryIds=children, matchedPoiCount=item["matchedPoiCount"],
            returnedPoiCount=item["returnedPoiCount"], ringCounts=dict(sorted(item["ringCounts"].items())),
        ))
    return {
        "pois": poi_models, "categories": categories, "ringCounts": ring_counts,
        "matchedCount": len(matches), "returnedCount": len(selected), "truncated": len(selected) < len(matches),
    }
