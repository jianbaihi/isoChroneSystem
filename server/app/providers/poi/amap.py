from __future__ import annotations

import time
import httpx
from shapely.geometry import mapping

from app.errors import PoiProviderError
from app.providers.poi.category_mapping import amap_category, category_payload
from app.providers.poi.coordinate_policy import gcj02_to_wgs84, geometry_wgs84_to_gcj02
from app.providers.poi.normalize import assign_provider_pois


class AmapPoiAdapter:
    provider_id = "amap"

    def __init__(self, settings, client: httpx.AsyncClient | None = None):
        self.settings, self.client = settings, client

    async def fetch(self, request, outer_geometry, rings, *, single_polygon=False, approved=False):
        started = time.perf_counter()
        gcj_geometry = geometry_wgs84_to_gcj02(outer_geometry)
        coords = list(gcj_geometry.exterior.coords) if gcj_geometry.geom_type == "Polygon" else list(max(gcj_geometry.geoms, key=lambda g: g.area).exterior.coords)
        step = max(1, len(coords) // 80)
        polygon = "|".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coords[::step])
        if coords[-1] != coords[0]:
            polygon += f"|{coords[0][0]:.6f},{coords[0][1]:.6f}"
        records, raw_count, request_count, truncated = [], 0, 0, False
        endpoint = f"{self.settings.amap_poi_base_url}/polygon"
        for page in range(1, 9):
            params = {"key": self.settings.amap_web_service_key, "polygon": polygon, "page_size": 25, "page_num": page, "show_fields": "business,photos"}
            response = await self._get(endpoint, params)
            request_count += 1
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
                mapped = "POI_PROVIDER_AUTH_FAILED" if code.startswith("100") else "POI_PROVIDER_UNAVAILABLE"
                raise PoiProviderError(mapped, "高德 POI 查询失败。", 502, code or "provider_error")
            pois = payload.get("pois") or []
            if not isinstance(pois, list):
                raise PoiProviderError("POI_PROVIDER_INVALID_RESPONSE", "高德 POI 返回无效响应。")
            raw_count += len(pois)
            for item in pois:
                try:
                    source_lon, source_lat = (float(v) for v in str(item.get("location", "")).split(",", 1))
                except (TypeError, ValueError):
                    continue
                lon, lat = gcj02_to_wgs84(source_lon, source_lat)
                business = item.get("business") if isinstance(item.get("business"), dict) else {}
                source_category, source_code = item.get("type"), item.get("typecode")
                category = amap_category(source_code, source_category)
                records.append({"providerPoiId": str(item.get("id") or f"{item.get('name')}:{source_lon}:{source_lat}"), "name": str(item.get("name") or "未命名地点"), "location": {"lon": lon, "lat": lat, "crs": "EPSG:4326"}, "sourceLocation": {"lon": source_lon, "lat": source_lat, "crs": "GCJ-02"}, "category": category_payload(category, source_category, source_code), "address": item.get("address") or business.get("business_area"), "rating": business.get("rating"), "phone": business.get("tel"), "openingHours": business.get("opentime_today")})
            if len(pois) < 25:
                break
        else:
            truncated = True
        fetch_ms = (time.perf_counter() - started) * 1000
        return assign_provider_pois(records, outer_geometry, rings, "amap", ["高德地图"], raw_count, request_count, truncated, {"providerFetchMs": fetch_ms, "coordinatePolicyVersion": "wgs84-gcj02-v1"})

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
