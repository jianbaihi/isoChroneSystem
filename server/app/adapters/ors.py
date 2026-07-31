from __future__ import annotations

import math
import re
from typing import Any, Protocol

import httpx

from app.config import Settings
from app.errors import (
    ApiError,
    InvalidProviderResponseError,
    ProviderNotConfiguredError,
    UpstreamAuthError,
    UpstreamRateLimitedError,
    UpstreamRequestRejectedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from app.models import AnalysisRequest, CumulativeIsochrone
from app.services.geometry import normalize_geojson_geometry
from app.services.ors_cache import JsonResponseCache
from app.services.quota import QuotaObserver


ORS_PROFILE_MAP = {
    "foot-walking": "foot-walking",
    "cycling-regular": "cycling-regular",
    "driving-car": "driving-car",
}


class IsochronesProvider(Protocol):
    async def create_isochrones(self, request: AnalysisRequest) -> list[CumulativeIsochrone]:
        ...


def _safe_retry_after(value: str | None) -> str | None:
    if value is None:
        return None
    candidate = value.strip()
    if re.fullmatch(r"\d{1,6}", candidate) and int(candidate) <= 86400:
        return candidate
    return None


class OrsAdapter:
    """Translate the internal request to ORS Isochrones V2 and back."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
        quota_observer: QuotaObserver | None = None,
    ) -> None:
        self.settings = settings
        self.client = client
        self.cache = None if settings.app_env == "test" else JsonResponseCache(settings.ors_cache_dir)
        self.last_cache_hit = False
        self.quota_observer = quota_observer
        self.last_metadata: dict[str, Any] = {}

    def endpoint_for(self, profile: str) -> str:
        mapped_profile = ORS_PROFILE_MAP.get(profile)
        if mapped_profile is None:
            raise InvalidProviderResponseError([{"field": "profile", "reason": "unsupported_profile"}])
        return f"{self.settings.ors_base_url}/v2/isochrones/{mapped_profile}"

    @staticmethod
    def request_body(request: AnalysisRequest) -> dict[str, Any]:
        return {
            "locations": [[request.center.lon, request.center.lat]],
            "range": [minutes * 60 for minutes in request.rangesMinutes],
            "range_type": "time",
            "location_type": "start",
        }

    async def _post(self, endpoint: str, body: dict[str, Any]) -> httpx.Response:
        headers = {
            "Authorization": self.settings.ors_api_key,
            "Content-Type": "application/json",
            "Accept": "application/geo+json, application/json",
        }
        try:
            if self.client is not None:
                return await self.client.post(
                    endpoint,
                    headers=headers,
                    json=body,
                    timeout=self.settings.ors_timeout_seconds,
                )
            async with httpx.AsyncClient(timeout=self.settings.ors_timeout_seconds) as client:
                return await client.post(endpoint, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            raise UpstreamTimeoutError() from exc
        except httpx.RequestError as exc:
            raise UpstreamUnavailableError(type(exc).__name__) from exc

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        status = response.status_code
        if status in (401, 403):
            raise UpstreamAuthError()
        if status == 429:
            raise UpstreamRateLimitedError(_safe_retry_after(response.headers.get("Retry-After")))
        if status in (400, 422):
            raise UpstreamRequestRejectedError()
        if status >= 500:
            raise UpstreamUnavailableError(f"http_{status}")
        if status >= 400:
            raise UpstreamUnavailableError(f"http_{status}")

    @staticmethod
    def _feature_value_seconds(feature: dict[str, Any], expected_field: str) -> int:
        properties = feature.get("properties")
        value = properties.get("value") if isinstance(properties, dict) else None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise InvalidProviderResponseError([{"field": expected_field, "reason": "threshold_missing"}])
        if not math.isfinite(float(value)) or int(value) != value or int(value) <= 0:
            raise InvalidProviderResponseError([{"field": expected_field, "reason": "threshold_invalid"}])
        return int(value)

    def _parse_response(self, payload: Any, request: AnalysisRequest) -> list[CumulativeIsochrone]:
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
            raise InvalidProviderResponseError([{"field": "provider", "reason": "not_feature_collection"}])
        features = payload.get("features")
        if not isinstance(features, list) or len(features) != len(request.rangesMinutes):
            raise InvalidProviderResponseError([{"field": "features", "reason": "count_mismatch"}])

        expected_seconds = {minutes * 60: minutes for minutes in request.rangesMinutes}
        found: dict[int, CumulativeIsochrone] = {}
        for index, feature in enumerate(features):
            if not isinstance(feature, dict):
                raise InvalidProviderResponseError([{"field": f"features[{index}]", "reason": "not_object"}])
            range_seconds = self._feature_value_seconds(feature, f"features[{index}].properties.value")
            if range_seconds not in expected_seconds or range_seconds in found:
                raise InvalidProviderResponseError([{"field": f"features[{index}]", "reason": "threshold_mismatch"}])
            geometry = feature.get("geometry")
            if not isinstance(geometry, dict):
                raise InvalidProviderResponseError([{"field": f"features[{index}].geometry", "reason": "missing"}])
            normalized_geometry = normalize_geojson_geometry(geometry, f"features[{index}].geometry")
            minutes = expected_seconds[range_seconds]
            found[range_seconds] = CumulativeIsochrone(
                isochroneId=f"isochrone-{minutes}",
                rangeMinutes=minutes,
                rangeSeconds=range_seconds,
                geometry=normalized_geometry,
            )

        if set(found) != set(expected_seconds):
            raise InvalidProviderResponseError([{"field": "features", "reason": "threshold_mismatch"}])
        return [found[minutes * 60] for minutes in sorted(request.rangesMinutes)]

    async def create_isochrones(self, request: AnalysisRequest) -> list[CumulativeIsochrone]:
        self.last_cache_hit = False
        self.last_metadata = {}
        if not self.settings.ors_api_key:
            raise ProviderNotConfiguredError()
        endpoint = self.endpoint_for(request.profile)
        body = self.request_body(request)
        if self.cache is not None:
            cached = self.cache.read("isochrone", endpoint, body, self.settings.ors_cache_ttl_seconds)
            if cached is not None:
                self.last_cache_hit = True
                self.last_metadata = {**cached[1], "cache": "hit"}
                return self._parse_response(cached[0], request)
        try:
            response = await self._post(endpoint, body)
            quota = self.quota_observer.observe("isochrones", response.headers, response.status_code) if self.quota_observer else None
            self.last_metadata = {"status": response.status_code, "cache": "miss", "apiQuota": quota or {}}
            self._raise_for_status(response)
        except ApiError:
            if self.cache is not None and self.settings.ors_cache_stale_if_error:
                cached = self.cache.read("isochrone", endpoint, body, self.settings.ors_cache_ttl_seconds, allow_stale=True)
                if cached is not None:
                    self.last_cache_hit = True
                    self.last_metadata = {**cached[1], "cache": "stale-if-error"}
                    return self._parse_response(cached[0], request)
            raise
        try:
            payload = response.json()
        except ValueError as exc:
            raise InvalidProviderResponseError([{"field": "provider", "reason": "invalid_json"}]) from exc
        if self.cache is not None:
            self.cache.write("isochrone", endpoint, body, payload, self.last_metadata)
        return self._parse_response(payload, request)
