from __future__ import annotations

import asyncio
import time
from collections import Counter
import logging
import httpx

from app.errors import PoiProviderError
from app.providers.poi.amap_cache import AmapQueryCache
from app.providers.poi.amap_query_planner import area_km2, build_category_jobs, cache_identity, load_query_mapping, split_job
from app.providers.poi.category_mapping import LABELS, amap_category, category_payload
from app.providers.poi.coordinate_policy import gcj02_to_wgs84, geometry_wgs84_to_gcj02
from app.providers.poi.normalize import assign_provider_pois

logger = logging.getLogger(__name__)


class AmapPoiAdapter:
    provider_id = "amap"

    def __init__(self, settings, client: httpx.AsyncClient | None = None, cache=None):
        self.settings, self.client = settings, client
        self.cache = cache or AmapQueryCache(None if settings.app_env == "test" else settings.ors_cache_dir)
        self._last_upstream_started = 0.0

    async def _respect_request_interval(self):
        interval = 0.0 if self.settings.app_env == "test" else self.settings.amap_poi_min_request_interval_seconds
        remaining = interval - (time.monotonic() - self._last_upstream_started)
        if remaining > 0:
            await asyncio.sleep(remaining)
        self._last_upstream_started = time.monotonic()

    @staticmethod
    def _polygon_text(wgs_geometry) -> str:
        geometry = geometry_wgs84_to_gcj02(wgs_geometry)
        polygon = geometry if geometry.geom_type == "Polygon" else max(geometry.geoms, key=lambda item: item.area)
        coords = list(polygon.exterior.coords)
        step = max(1, len(coords) // 80)
        selected = coords[::step]
        if selected[-1] != coords[-1]:
            selected.append(coords[-1])
        return "|".join(f"{lon:.6f},{lat:.6f}" for lon, lat in selected)

    async def fetch(self, request, outer_geometry, rings, *, single_polygon=False, approved=False):
        started = time.perf_counter()
        mapping = load_query_mapping()
        jobs = build_category_jobs(list(request.categoryIds), outer_geometry)
        if not jobs:
            raise PoiProviderError("POI_PROVIDER_INVALID_RESPONSE", "没有可执行的高德 POI 类别任务。", 422, "categories_empty")
        page_size = 25
        budget = self.settings.amap_poi_auto_request_limit * (2 if approved else 1)
        used_requests = cache_hits = raw_count = split_count = 0
        records: list[dict] = []
        completeness: dict[str, dict] = {job.category_id: {"status": "planned", "requests": 0, "cacheHits": 0, "rawCount": 0, "splitCount": 0} for job in jobs}
        endpoint = f"{self.settings.amap_poi_base_url}/polygon"

        async def query_job(job, allow_split=False):
            nonlocal used_requests, cache_hits, raw_count, split_count
            state = completeness[job.category_id]
            state["status"] = "running"
            saturated = False
            for page in range(1, self.settings.amap_poi_max_pages_per_job + 1):
                identity = cache_identity(job, page, page_size)
                payload = self.cache.read(identity)
                if payload is not None:
                    cache_hits += 1
                    state["cacheHits"] += 1
                else:
                    if used_requests >= budget:
                        state["status"] = "blocked-budget"
                        return
                    params = {"key": self.settings.amap_web_service_key, "polygon": self._polygon_text(job.geometry), "types": "|".join(job.types), "page_size": page_size, "page_num": page, "show_fields": "business,photos"}
                    await self._respect_request_interval()
                    response = await self._get(endpoint, params)
                    used_requests += 1
                    state["requests"] += 1
                    payload = self._payload(response)
                    self.cache.write(identity, payload)
                pois = payload.get("pois") or []
                raw_count += len(pois)
                state["rawCount"] += len(pois)
                for item in pois:
                    record = self._record(item, job.category_id)
                    if record is not None:
                        records.append(record)
                if len(pois) < page_size:
                    state["status"] = "complete"
                    return
                saturated = page == self.settings.amap_poi_max_pages_per_job
            if not saturated:
                state["status"] = "complete"
                return
            state["status"] = "saturated"
            if not allow_split:
                return
            can_split = job.depth < self.settings.amap_poi_max_split_depth and area_km2(job.geometry) >= self.settings.amap_poi_min_cell_area_km2
            if not can_split:
                return
            if used_requests >= budget:
                state["status"] = "blocked-budget"
                return
            children = split_job(job)
            split_count += 1
            state["splitCount"] += 1
            state["status"] = "splitting"
            for child in children:
                await query_job(child, True)
                if state["status"] == "blocked-budget":
                    return
            if state["status"] not in {"blocked-budget", "saturated"}:
                state["status"] = "complete"

        for index, job in enumerate(jobs):
            await query_job(job, False)
            if used_requests >= budget and completeness[job.category_id]["status"] == "blocked-budget":
                for pending in jobs[index + 1:]:
                    completeness[pending.category_id]["status"] = "blocked-budget"
                break

        for job in jobs:
            if completeness[job.category_id]["status"] != "saturated" or used_requests >= budget:
                continue
            state = completeness[job.category_id]
            if job.depth >= self.settings.amap_poi_max_split_depth or area_km2(job.geometry) < self.settings.amap_poi_min_cell_area_km2:
                continue
            split_count += 1
            state["splitCount"] += 1
            state["status"] = "splitting"
            for child in split_job(job):
                await query_job(child, True)
                if state["status"] == "blocked-budget":
                    break

        precedence = {category: index for index, category in enumerate(mapping["precedence"])}
        deduped: dict[str, dict] = {}
        for record in records:
            current = deduped.get(record["providerPoiId"])
            if current is None or precedence.get(record["category"]["id"], 999) < precedence.get(current["category"]["id"], 999):
                deduped[record["providerPoiId"]] = record
        statuses = [item["status"] for item in completeness.values()]
        overall = "complete" if statuses and all(status == "complete" for status in statuses) else "partial"
        fetch_ms = (time.perf_counter() - started) * 1000
        result = assign_provider_pois(list(deduped.values()), outer_geometry, rings, "amap", ["高德地图"], raw_count, used_requests + cache_hits, overall != "complete", {"providerFetchMs": fetch_ms, "coordinatePolicyVersion": "wgs84-gcj02-v1"})
        result["coverage"].update({"cacheHits": cache_hits, "upstreamRequests": used_requests, "categoryJobs": len(jobs), "splitCount": split_count})
        result["completeness"] = {"status": overall, "categories": completeness, "completeCategories": sum(v["status"] == "complete" for v in completeness.values()), "partialCategories": sum(v["status"] in {"saturated", "splitting"} for v in completeness.values()), "blockedCategories": sum(v["status"] == "blocked-budget" for v in completeness.values()), "usedRequests": used_requests, "approvedBudget": budget}
        result["byCategory"] = dict(sorted(Counter(p.categoryId for p in result["pois"]).items()))
        return result

    def _payload(self, response):
        if response.status_code in (401, 403):
            raise PoiProviderError("POI_PROVIDER_AUTH_FAILED", "高德 POI 认证失败。", 502)
        if response.status_code == 429:
            raise PoiProviderError("POI_PROVIDER_RATE_LIMITED", "高德 POI 请求达到频率限制。", 429)
        try:
            payload = response.json()
        except ValueError as exc:
            raise PoiProviderError("POI_PROVIDER_INVALID_RESPONSE", "高德 POI 返回无效响应。") from exc
        if payload.get("status") != "1":
            code = str(payload.get("infocode", ""))
            logger.warning("provider=amap endpoint=/polygon status=provider-error infocode=%s", code or "unknown")
            if code in {"10021", "10004", "10003"}:
                raise PoiProviderError("POI_PROVIDER_RATE_LIMITED", "高德 POI 查询频率受限，请稍后重试。", 429, code)
            mapped = "POI_PROVIDER_AUTH_FAILED" if code.startswith("100") else "POI_PROVIDER_UNAVAILABLE"
            raise PoiProviderError(mapped, "高德 POI 查询失败。", 502, code or "provider_error")
        if not isinstance(payload.get("pois"), list):
            raise PoiProviderError("POI_PROVIDER_INVALID_RESPONSE", "高德 POI 返回无效响应。")
        return payload

    @staticmethod
    def _record(item, requested_category):
        try:
            source_lon, source_lat = (float(value) for value in str(item.get("location", "")).split(",", 1))
        except (TypeError, ValueError):
            return None
        source_category, source_code = item.get("type"), item.get("typecode")
        actual_category = amap_category(source_code, source_category)
        if requested_category == "attraction" and actual_category == "nature":
            return None
        mapping = load_query_mapping()["categories"]
        requested = mapping.get(requested_category, {})
        is_level1 = requested_category.isdigit() and len(requested_category) == 6
        category = requested_category if is_level1 else ("nature" if actual_category == "nature" else requested_category)
        semantic_id = requested.get("semanticId", actual_category)
        category_data = {"id": category, "label": requested.get("label", category), "sourceCategory": source_category, "sourceCategoryCode": source_code}
        lon, lat = gcj02_to_wgs84(source_lon, source_lat)
        business = item.get("business") if isinstance(item.get("business"), dict) else {}
        return {"providerPoiId": str(item.get("id") or f"{item.get('name')}:{source_lon}:{source_lat}"), "name": str(item.get("name") or "未命名地点"), "location": {"lon": lon, "lat": lat, "crs": "EPSG:4326"}, "sourceLocation": {"lon": source_lon, "lat": source_lat, "crs": "GCJ-02"}, "category": category_data if is_level1 else category_payload(category, source_category, source_code), "providerCategory": {"provider":"amap","level1Code": requested_category if is_level1 else f"{(source_code or '000000')[:2]}0000","level1Label": requested.get("label", source_category or category),"typecode":source_code,"typeLabel":source_category}, "semanticCategory": {"id":semantic_id,"label": LABELS.get(semantic_id, semantic_id)}, "categoryStyleKey": f"amap-l1-{requested_category}" if is_level1 else f"semantic-{semantic_id}", "address": item.get("address") or business.get("business_area"), "rating": business.get("rating"), "phone": business.get("tel"), "openingHours": business.get("opentime_today")}

    async def _get(self, endpoint, params):
        try:
            if self.client:
                return await self.client.get(endpoint, params=params, timeout=30)
            async with httpx.AsyncClient(timeout=30) as client:
                return await client.get(endpoint, params=params)
        except httpx.TimeoutException as exc:
            raise PoiProviderError("POI_PROVIDER_TIMEOUT", "高德 POI 查询超时。", 504) from exc
        except httpx.RequestError as exc:
            raise PoiProviderError("POI_PROVIDER_UNAVAILABLE", "高德 POI 服务暂不可用。", 502) from exc
