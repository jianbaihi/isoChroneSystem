from __future__ import annotations

from typing import Any

import httpx

from app.config import Settings
from app.errors import (
    OrsApiKeyMissingError,
    UpstreamAuthError,
    UpstreamRateLimitedError,
    UpstreamRequestRejectedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from app.services.ors_cache import JsonResponseCache
from app.services.quota import QuotaObserver


def _rate_headers(headers: httpx.Headers) -> dict[str, str]:
    allowed = {"retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"}
    return {key: str(value) for key, value in headers.items() if key.lower() in allowed}


def _minimal_feature(feature: Any) -> dict[str, Any] | None:
    if not isinstance(feature, dict):
        return None
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    coordinates = geometry.get("coordinates")
    if geometry.get("type") != "Point" or not isinstance(coordinates, list) or len(coordinates) < 2:
        return None
    try:
        lon, lat = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    label = properties.get("label") or properties.get("name")
    if not isinstance(label, str) or not label.strip():
        label = ", ".join(str(value) for value in coordinates[:2])
    context = properties.get("context") if isinstance(properties.get("context"), list) else []
    admin: list[str] = []
    for item in context:
        if not isinstance(item, dict):
            continue
        text = item.get("text") or item.get("label")
        if isinstance(text, str) and text.strip():
            admin.append(text.strip())
    return {
        "id": str(feature.get("id") or f"geocoder:{lon:.6f}:{lat:.6f}"),
        "label": label.strip(),
        "lon": lon,
        "lat": lat,
        "admin": admin,
        "source": "ors-geocoder",
    }


class OrsGeocoder:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None, quota_observer: QuotaObserver | None = None) -> None:
        self.settings = settings
        self.client = client
        self.cache = None if settings.app_env == "test" else JsonResponseCache(settings.ors_cache_dir)
        self.quota_observer = quota_observer

    def endpoint(self, operation: str) -> str:
        path = {
            "autocomplete": self.settings.ors_geocoder_autocomplete_path,
            "search": self.settings.ors_geocoder_search_path,
            "reverse": self.settings.ors_geocoder_reverse_path,
        }[operation]
        return f"{self.settings.ors_geocoder_base_url}{path}"

    async def _get(self, operation: str, params: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        if not self.settings.ors_api_key:
            raise OrsApiKeyMissingError()
        endpoint = self.endpoint(operation)
        if self.cache is not None:
            cached = self.cache.read("geocoder", endpoint, params, self.settings.ors_cache_ttl_seconds)
            if cached is not None:
                return cached[0], {**cached[1], "cache": "hit"}
        headers = {
            "Authorization": self.settings.ors_api_key,
            "Accept": "application/json",
        }
        try:
            if self.client is not None:
                response = await self.client.get(endpoint, headers=headers, params=params, timeout=self.settings.ors_geocoder_timeout_seconds)
            else:
                async with httpx.AsyncClient(timeout=self.settings.ors_geocoder_timeout_seconds) as client:
                    response = await client.get(endpoint, headers=headers, params=params)
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError() from exc
        except httpx.RequestError as exc:
            raise UpstreamUnavailableError(type(exc).__name__) from exc
        quota = self.quota_observer.observe("geocoder", response.headers, response.status_code) if self.quota_observer else None
        if response.status_code in (401, 403):
            raise UpstreamAuthError()
        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            raise UpstreamRateLimitedError(retry_after if retry_after and retry_after.isdigit() else None)
        if response.status_code in (400, 422):
            raise UpstreamRequestRejectedError()
        if response.status_code >= 400:
            raise UpstreamUnavailableError(f"http_{response.status_code}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamUnavailableError("invalid_json") from exc
        if not isinstance(payload, dict):
            raise UpstreamUnavailableError("invalid_response")
        metadata = {"status": response.status_code, "cache": "miss", "rateLimit": _rate_headers(response.headers), "apiQuota": quota or {}}
        if self.cache is not None:
            self.cache.write("geocoder", endpoint, params, payload, metadata)
        return payload, metadata

    async def lookup(
        self,
        operation: str,
        *,
        text: str | None = None,
        lon: float | None = None,
        lat: float | None = None,
        size: int = 8,
        focus_lon: float | None = None,
        focus_lat: float | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"size": size}
        if text is not None:
            params["text"] = text
        if lon is not None and lat is not None:
            if operation == "reverse":
                params["point.lon"] = lon
                params["point.lat"] = lat
            else:
                params["focus.point.lon"] = lon
                params["focus.point.lat"] = lat
        if focus_lon is not None and focus_lat is not None and operation != "reverse":
            params["focus.point.lon"] = focus_lon
            params["focus.point.lat"] = focus_lat
        payload, metadata = await self._get(operation, params)
        features = payload.get("features") if isinstance(payload.get("features"), list) else []
        results = [item for feature in features if (item := _minimal_feature(feature)) is not None]
        return {"results": results[:size], "metadata": metadata}
