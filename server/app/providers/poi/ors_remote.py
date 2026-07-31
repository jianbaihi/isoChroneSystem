from __future__ import annotations

import asyncio
import re
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from shapely.geometry import Point, shape

from app.config import Settings
from app.errors import (
    InvalidProviderParameterError,
    InvalidPoiProviderResponseError,
    PoiCandidateLimitError,
    PoiRequestBudgetExceededError,
    PoiUpstreamTruncatedError,
)
from app.models import AnalysisRequest, Category, Location, Poi
from app.providers.poi.ors_catalog import category_catalog_item, category_filter_groups, category_hierarchy
from app.providers.poi.ors_client import OrsPoiClient
from app.services.poi_tiling import PoiCell, plan_poi_cells, split_poi_cell
from app.services.quota import QuotaObserver


@dataclass
class _NormalizedPoi:
    poi_id: str
    name: str
    name_locale: str | None
    lon: float
    lat: float
    group_id: str | None
    category_id: str | None
    hierarchy: list[str]
    properties: dict[str, Any]


def _string_value(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _clean_name(value: Any) -> str | None:
    candidate = _string_value(value)
    if not candidate:
        return None
    candidate = unicodedata.normalize("NFKC", candidate).strip()
    candidate = re.sub(r"\s+", " ", candidate)
    if not candidate or re.fullmatch(r"https?://\S+|www\.\S+", candidate, flags=re.IGNORECASE):
        return None
    compact = re.sub(r"[\s()+\-./]", "", candidate)
    if compact.isdigit() and len(compact) >= 7:
        return None
    if re.fullmatch(r"(?:osm[_-]?(?:node|way|relation)?[:#-]?)?\d+", candidate, flags=re.IGNORECASE):
        return None
    return candidate


def _name(properties: dict[str, Any]) -> tuple[str | None, str | None]:
    for key, locale in (("name:zh", "zh-CN"), ("name:zh-CN", "zh-CN"), ("name", None), ("name:en", "en")):
        value = properties.get(key)
        if isinstance(value, dict):
            for language in ("zh-CN", "zh", "en", "default"):
                candidate = _clean_name(value.get(language))
                if candidate:
                    return candidate, language
        candidate = _clean_name(value)
        if candidate:
            return candidate, locale
    return None, None


def _stable_id(feature: dict[str, Any], properties: dict[str, Any]) -> str | None:
    osm_type = _string_value(properties.get("osm_type") or properties.get("osmType") or feature.get("osm_type"))
    osm_id = _string_value(properties.get("osm_id") or properties.get("osmId") or feature.get("osm_id"))
    if osm_id:
        return f"ors-poi:{osm_type or 'osm'}:{osm_id}"
    return None


def _normalize_feature(feature: Any) -> tuple[_NormalizedPoi | None, str | None]:
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        return None, "feature_not_object"
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        return None, "point_geometry_missing"
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None, "point_coordinates_missing"
    try:
        lon, lat = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None, "point_coordinates_invalid"
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None, "point_coordinates_out_of_range"
    properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    properties = {**properties, **(properties.get("osm_tags") if isinstance(properties.get("osm_tags"), dict) else {})}
    poi_id = _stable_id(feature, properties)
    if poi_id is None:
        return None, "stable_osm_identity_missing"
    name, locale = _name(properties)
    if not name:
        return None, "name_missing"
    group_id, category_id, hierarchy = category_hierarchy(properties)
    return _NormalizedPoi(poi_id, name, locale, lon, lat, group_id, category_id, hierarchy, properties), None


class OrsRemotePoiProvider:
    """OpenPOIService provider; it never opens the local Overture repository."""

    def __init__(self, settings: Settings, client: OrsPoiClient | None = None, quota_observer: QuotaObserver | None = None) -> None:
        self.settings = settings
        self.client = client or OrsPoiClient(settings, quota_observer=quota_observer)

    def validate_request(self, request: AnalysisRequest) -> None:
        if request.poiDatasetId:
            raise InvalidProviderParameterError("poiDatasetId", "ors_remote_does_not_use_dataset")
        if request.profile != self.settings.ors_profile:
            raise InvalidProviderParameterError("profile", "must_match_ors_profile")
        configured_ranges = tuple(value // 60 for value in self.settings.ors_isochrone_ranges_seconds)
        if tuple(request.rangesMinutes) != configured_ranges:
            raise InvalidProviderParameterError("rangesMinutes", "must_match_ors_isochrone_ranges")

    @staticmethod
    def _body(cell: PoiCell, limit: int) -> dict[str, Any]:
        return {
            "request": "pois",
            "geometry": {"geojson": cell.geometry},
            "limit": limit,
            "sortby": "category",
        }

    async def fetch(
        self,
        request: AnalysisRequest,
        outer_geometry,
        rings: list[Any],
        *,
        single_polygon: bool = False,
    ) -> dict[str, Any]:
        self.validate_request(request)
        cells: list[PoiCell] = []
        projector = None
        if not single_polygon:
            cells, projector = plan_poi_cells(
                outer_geometry,
                self.settings.ors_poi_grid_size_meters,
                self.settings.ors_poi_max_cell_area_km2,
            )
            if len(cells) > self.settings.ors_poi_max_requests_per_analysis:
                raise PoiRequestBudgetExceededError(len(cells), self.settings.ors_poi_max_requests_per_analysis)

        semaphore = asyncio.Semaphore(self.settings.ors_poi_max_concurrency)
        request_count = 0
        cache_hits = 0
        rate_limit: dict[str, Any] = {}
        api_quota: dict[str, Any] = {}
        raw_features: list[Any] = []
        upstream_limit_hit = False

        async def query_cell(cell: PoiCell, depth: int = 0) -> None:
            nonlocal request_count, cache_hits, rate_limit, api_quota
            if request_count >= self.settings.ors_poi_max_requests_per_analysis:
                raise PoiRequestBudgetExceededError(request_count + 1, self.settings.ors_poi_max_requests_per_analysis)
            request_count += 1
            async with semaphore:
                payload, metadata = await self.client.query(self._body(cell, self.settings.ors_poi_limit_per_cell))
            if metadata.get("cache") in {"hit", "stale-if-error"}:
                cache_hits += 1
            if metadata.get("rateLimit"):
                rate_limit = metadata["rateLimit"]
            if metadata.get("apiQuota"):
                api_quota = metadata["apiQuota"]
            features = payload.get("features") if isinstance(payload, dict) else None
            if not isinstance(features, list):
                raise InvalidPoiProviderResponseError("features_missing")
            if len(features) >= self.settings.ors_poi_limit_per_cell:
                if depth >= 2:
                    raise PoiUpstreamTruncatedError()
                children = split_poi_cell(cell, projector)
                if request_count + len(children) > self.settings.ors_poi_max_requests_per_analysis:
                    raise PoiRequestBudgetExceededError(request_count + len(children), self.settings.ors_poi_max_requests_per_analysis)
                await asyncio.gather(*(query_cell(child, depth + 1) for child in children))
            else:
                raw_features.extend(features)

        if single_polygon:
            request_count = 1
            payload, metadata = await self.client.query({
                "request": "pois",
                "geometry": {"geojson": outer_geometry.__geo_interface__},
                "limit": min(self.settings.ors_poi_limit_per_cell, 2000),
                "sortby": "category",
            })
            if metadata.get("cache") in {"hit", "stale-if-error"}:
                cache_hits = 1
            rate_limit = metadata.get("rateLimit", {})
            api_quota = metadata.get("apiQuota", {})
            features = payload.get("features") if isinstance(payload, dict) else None
            if not isinstance(features, list):
                raise InvalidPoiProviderResponseError("features_missing")
            raw_features.extend(features)
            upstream_limit_hit = len(features) >= min(self.settings.ors_poi_limit_per_cell, 2000)
        else:
            await asyncio.gather(*(query_cell(cell) for cell in cells))

        diagnostics: defaultdict[str, int] = defaultdict(int)
        normalized: dict[str, _NormalizedPoi] = {}
        requested_groups = category_filter_groups(request.categoryIds)
        for feature in raw_features:
            item, reason = _normalize_feature(feature)
            if item is None:
                diagnostics[reason or "invalid_feature"] += 1
                continue
            if requested_groups and item.group_id not in requested_groups:
                continue
            if not outer_geometry.covers(Point(item.lon, item.lat)):
                diagnostics["outside_outer_isochrone"] += 1
                continue
            normalized.setdefault(item.poi_id, item)
        matches = sorted(normalized.values(), key=lambda item: (item.group_id or "", item.category_id or "", item.poi_id))
        if len(matches) > self.settings.poi_max_candidates:
            raise PoiCandidateLimitError(self.settings.poi_max_candidates)
        selection_limit = min(self.settings.ors_poi_limit_per_cell, 2000) if single_polygon else self.settings.poi_max_results
        selected = matches[: selection_limit]
        ring_shapes = []
        for ring in rings:
            geometry = ring.get("geometry") if isinstance(ring, dict) else ring.geometry
            if geometry:
                ring_shapes.append((ring, shape(geometry)))
        ring_counts = {_ring_id(ring): 0 for ring in rings}
        category_meta: dict[str, dict[str, Any]] = {}
        for item in matches:
            ring = _assign_ring(item, ring_shapes)
            if ring is None:
                diagnostics["outside_exclusive_rings"] += 1
                continue
            item.properties["ring_id"] = _ring_id(ring)
            for index, category_id in enumerate(item.hierarchy):
                catalog_item = category_catalog_item(item.group_id or "unknown", item.category_id if index else None)[index]
                meta = category_meta.setdefault(category_id, {"categoryId": category_id, "parent": catalog_item["parent"], "label": catalog_item["label"], "level": catalog_item["level"], "children": set(), "matched": 0, "returned": 0, "ringCounts": defaultdict(int)})
                meta["matched"] += 1
                meta["ringCounts"][_ring_id(ring)] += 1
                if index:
                    category_meta[item.hierarchy[index - 1]]["children"].add(category_id)
        pois: list[Poi] = []
        for item in selected:
            ring_id = str(item.properties.get("ring_id") or "")
            if not ring_id:
                continue
            ring_counts[ring_id] = ring_counts.get(ring_id, 0) + 1
            for category_id in item.hierarchy:
                if category_id in category_meta:
                    category_meta[category_id]["returned"] += 1
            pois.append(Poi(
                poiId=item.poi_id,
                source="ors-openpoiservice",
                name=item.name,
                nameLocale=item.name_locale,
                location=Location(lon=item.lon, lat=item.lat),
                categoryId=item.hierarchy[-1] if item.hierarchy else None,
                category={"groupId": f"ors:group:{item.group_id}" if item.group_id else None, "primaryCategoryId": item.hierarchy[-1] if item.hierarchy else None, "hierarchy": item.hierarchy},
                ringId=ring_id,
                travelTimeSeconds=None,
            ))
        categories = [Category(
            categoryId=category_id,
            parentCategoryId=meta["parent"],
            label=meta["label"],
            level=meta["level"],
            depth=meta["level"] - 1,
            topLevelId=category_id.split(":", 2)[-1] if meta["level"] == 1 else (meta["parent"] or category_id),
            isLeafInResult=not meta["children"],
            childCategoryIds=sorted(meta["children"]),
            matchedPoiCount=meta["matched"],
            returnedPoiCount=meta["returned"],
            ringCounts=dict(sorted(meta["ringCounts"].items())),
        ) for category_id, meta in sorted(category_meta.items(), key=lambda pair: (pair[1]["level"], pair[0]))]
        return {
            "pois": pois,
            "categories": categories,
            "ringCounts": ring_counts,
            "matchedCount": len(matches),
            "returnedCount": len(pois),
            "truncated": bool(upstream_limit_hit or len(selected) < len(matches)),
            "diagnostics": dict(sorted(diagnostics.items())),
            "coverage": {
                "strategy": "outer-isochrone-single-polygon" if single_polygon else self.settings.ors_poi_query_strategy,
                "cells": len(cells),
                "requests": request_count,
                "cacheHits": cache_hits,
                "complete": True,
                "fullyCovered": True,
                "outerRangeMinutes": max(request.rangesMinutes),
                "outerRangeSeconds": max(request.rangesMinutes) * 60,
                "received": len(raw_features),
                "deduplicated": len(normalized),
                "unnamed": diagnostics.get("name_missing", 0),
                "invalid": sum(value for key, value in diagnostics.items() if key not in {"name_missing", "stable_osm_identity_missing"}),
                "matched": len(matches),
                "returned": len(pois),
                "rawPoiCount": len(raw_features),
                "parsedPoiCount": len(normalized),
                "namedPoiCount": len(matches),
                "unnamedCount": diagnostics.get("name_missing", 0),
                "deduplicatedPoiCount": len(normalized),
                "resultLimit": selection_limit,
                "resultTruncated": bool(upstream_limit_hit or len(selected) < len(matches)),
            },
            "rateLimit": rate_limit,
            "apiQuota": api_quota,
            "attribution": ["OpenRouteService OpenPOIService", "© OpenStreetMap contributors"],
        }

    async def preview(self, request, radius_meters: int) -> dict[str, Any]:
        """Fetch one user-triggered point-buffer preview without planning an isochrone grid."""
        if request.radiusMeters != radius_meters:
            raise InvalidProviderParameterError("radiusMeters", "preview_radius_mismatch")
        body = {
            "request": "pois",
            "geometry": {
                "geojson": {
                    "type": "Point",
                    "coordinates": [request.center.lon, request.center.lat],
                },
                "buffer": radius_meters,
            },
            "limit": min(self.settings.ors_poi_limit_per_cell, 2000),
            "sortby": "category",
        }
        payload, metadata = await self.client.query(body)
        features = payload.get("features") if isinstance(payload, dict) else None
        if not isinstance(features, list):
            raise InvalidPoiProviderResponseError("features_missing")
        diagnostics: defaultdict[str, int] = defaultdict(int)
        requested_groups = category_filter_groups(request.categoryIds)
        normalized: dict[str, _NormalizedPoi] = {}
        for feature in features:
            item, reason = _normalize_feature(feature)
            if item is None:
                diagnostics[reason or "invalid_feature"] += 1
                continue
            if requested_groups and item.group_id not in requested_groups:
                continue
            normalized.setdefault(item.poi_id, item)
        matches = sorted(normalized.values(), key=lambda item: (item.group_id or "", item.category_id or "", item.poi_id))
        if len(matches) > self.settings.poi_max_candidates:
            raise PoiCandidateLimitError(self.settings.poi_max_candidates)
        selected = matches[: self.settings.poi_max_results]
        preview_ring_id = f"ring-preview-{max(request.rangesMinutes)}"
        category_meta: dict[str, dict[str, Any]] = {}
        pois: list[Poi] = []
        for item in selected:
            for index, category_id in enumerate(item.hierarchy):
                catalog_item = category_catalog_item(item.group_id or "unknown", item.category_id)[index]
                meta = category_meta.setdefault(
                    category_id,
                    {"categoryId": category_id, "parent": catalog_item["parent"], "label": catalog_item["label"],
                     "level": catalog_item["level"], "children": set(), "matched": 0, "returned": 0,
                     "ringCounts": defaultdict(int)},
                )
                meta["matched"] += 1
                meta["returned"] += 1
                meta["ringCounts"][preview_ring_id] += 1
                if index:
                    category_meta[item.hierarchy[index - 1]]["children"].add(category_id)
            pois.append(Poi(
                poiId=item.poi_id,
                source="ors-openpoiservice",
                name=item.name,
                nameLocale=item.name_locale,
                location=Location(lon=item.lon, lat=item.lat),
                categoryId=item.hierarchy[-1] if item.hierarchy else None,
                category={"groupId": f"ors:group:{item.group_id}" if item.group_id else None,
                          "primaryCategoryId": item.hierarchy[-1] if item.hierarchy else None,
                          "hierarchy": item.hierarchy},
                ringId=preview_ring_id,
                travelTimeSeconds=None,
            ))
        categories = [Category(
            categoryId=category_id,
            parentCategoryId=meta["parent"],
            label=meta["label"],
            level=meta["level"],
            depth=meta["level"] - 1,
            topLevelId=category_id.split(":", 2)[-1] if meta["level"] == 1 else (meta["parent"] or category_id),
            isLeafInResult=not meta["children"],
            childCategoryIds=sorted(meta["children"]),
            matchedPoiCount=meta["matched"],
            returnedPoiCount=meta["returned"],
            ringCounts=dict(sorted(meta["ringCounts"].items())),
        ) for category_id, meta in sorted(category_meta.items(), key=lambda pair: (pair[1]["level"], pair[0]))]
        return {
            "pois": pois,
            "categories": categories,
            "ringCounts": {preview_ring_id: len(pois)},
            "matchedCount": len(matches),
            "returnedCount": len(pois),
            "truncated": len(selected) < len(matches),
            "diagnostics": dict(sorted(diagnostics.items())),
            "coverage": {
                "mode": "preview-radius",
                "radiusMeters": radius_meters,
                "complete": False,
                "fullyCovered": False,
                "requests": 1,
                "cacheHits": 1 if metadata.get("cache") in {"hit", "stale-if-error"} else 0,
                "outerRangeMinutes": max(request.rangesMinutes),
                "outerRangeSeconds": max(request.rangesMinutes) * 60,
                "received": len(features),
                "deduplicated": len(normalized),
                "unnamed": diagnostics.get("name_missing", 0),
                "invalid": sum(value for key, value in diagnostics.items() if key not in {"name_missing", "stable_osm_identity_missing"}),
                "matched": len(matches),
                "returned": len(pois),
            },
            "rateLimit": metadata.get("rateLimit", {}),
            "attribution": ["OpenRouteService OpenPOIService", "© OpenStreetMap contributors"],
        }


def _ring_id(ring: Any) -> str:
    return str(ring.get("ringId") if isinstance(ring, dict) else ring.ringId)


def _ring_outer(ring: Any) -> int:
    return int(ring.get("outerRangeMinutes") if isinstance(ring, dict) else ring.outerRangeMinutes)


def _assign_ring(item: _NormalizedPoi, ring_shapes: list[tuple[Any, Any]]) -> Any | None:
    covered = [(ring, geometry) for ring, geometry in ring_shapes if geometry.covers(Point(item.lon, item.lat))]
    return min((ring for ring, _ in covered), key=_ring_outer) if covered else None
