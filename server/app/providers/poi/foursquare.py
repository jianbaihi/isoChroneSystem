from __future__ import annotations

import time
import httpx

from app.errors import PoiProviderError
from app.providers.poi.category_mapping import foursquare_category, category_payload
from app.providers.poi.normalize import assign_provider_pois


class FoursquarePoiAdapter:
    provider_id = "foursquare"

    def __init__(self, settings, client: httpx.AsyncClient | None = None):
        self.settings, self.client = settings, client

    async def fetch(self, request, outer_geometry, rings, *, single_polygon=False, approved=False):
        started = time.perf_counter()
        minx, miny, maxx, maxy = outer_geometry.bounds
        center = outer_geometry.centroid
        radius_m = min(100000, max(100, int(max(maxx - minx, maxy - miny) * 111320 / 2 * 1.42)))
        params = {"ll": f"{center.y:.6f},{center.x:.6f}", "radius": radius_m, "limit": 50, "fields": "fsq_place_id,name,latitude,longitude,location,categories,tel,website,rating,hours"}
        headers = {"Authorization": f"Bearer {self.settings.foursquare_service_key}", "X-Places-Api-Version": self.settings.foursquare_places_api_version, "Accept": "application/json"}
        response = await self._get(f"{self.settings.foursquare_poi_base_url}/places/search", params, headers)
        if response.status_code in (401, 403):
            raise PoiProviderError("POI_PROVIDER_AUTH_FAILED", "Foursquare POI 认证失败。", 502)
        if response.status_code == 429:
            raise PoiProviderError("POI_PROVIDER_RATE_LIMITED", "Foursquare POI 请求达到频率限制。", 429)
        if response.status_code >= 400:
            raise PoiProviderError("POI_PROVIDER_UNAVAILABLE", "Foursquare POI 查询失败。", 502, f"http_{response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise PoiProviderError("POI_PROVIDER_INVALID_RESPONSE", "Foursquare POI 返回无效响应。") from exc
        items = payload.get("results") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise PoiProviderError("POI_PROVIDER_INVALID_RESPONSE", "Foursquare POI 返回无效响应。")
        records = []
        for item in items:
            categories = item.get("categories") if isinstance(item.get("categories"), list) else []
            source = categories[0] if categories else {}
            source_code, source_name = source.get("id"), source.get("name")
            category = foursquare_category(source_code, source_name)
            location = item.get("location") if isinstance(item.get("location"), dict) else {}
            try:
                lon, lat = float(item.get("longitude")), float(item.get("latitude"))
            except (TypeError, ValueError):
                continue
            address = location.get("formatted_address") or ", ".join(str(location[k]) for k in ("address", "locality", "country") if location.get(k))
            records.append({"providerPoiId": str(item.get("fsq_place_id") or f"{item.get('name')}:{lon}:{lat}"), "name": str(item.get("name") or "Unnamed place"), "location": {"lon": lon, "lat": lat, "crs": "EPSG:4326"}, "sourceLocation": {"lon": lon, "lat": lat, "crs": "EPSG:4326"}, "category": category_payload(category, source_name, str(source_code) if source_code else None), "address": address or None, "rating": item.get("rating"), "phone": item.get("tel"), "website": item.get("website"), "openingHours": (item.get("hours") or {}).get("display") if isinstance(item.get("hours"), dict) else None})
        fetch_ms = (time.perf_counter() - started) * 1000
        return assign_provider_pois(records, outer_geometry, rings, "foursquare", ["Foursquare"], len(items), 1, len(items) >= 50, {"providerFetchMs": fetch_ms, "coordinatePolicyVersion": "wgs84-identity-v1"})

    async def _get(self, endpoint, params, headers):
        try:
            if self.client:
                return await self.client.get(endpoint, params=params, headers=headers, timeout=30)
            async with httpx.AsyncClient(timeout=30) as client:
                return await client.get(endpoint, params=params, headers=headers)
        except httpx.TimeoutException as exc:
            raise PoiProviderError("POI_PROVIDER_TIMEOUT", "Foursquare POI 查询超时。", 504) from exc
        except httpx.RequestError as exc:
            raise PoiProviderError("POI_PROVIDER_UNAVAILABLE", "Foursquare POI 服务暂不可用。", 502) from exc
