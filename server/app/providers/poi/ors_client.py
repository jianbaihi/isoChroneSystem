from __future__ import annotations

import hashlib
from typing import Any

import httpx

from app.config import Settings
from app.errors import (
    InvalidPoiProviderResponseError,
    NetworkDisabledError,
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


class OrsPoiClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None, quota_observer: QuotaObserver | None = None) -> None:
        self.settings = settings
        self.client = client
        self.cache = None if settings.app_env == "test" else JsonResponseCache(settings.ors_cache_dir)
        self.quota_observer = quota_observer

    @property
    def endpoint(self) -> str:
        return f"{self.settings.ors_poi_base_url}{self.settings.ors_poi_path}"

    async def query(self, body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        if not self.settings.ors_api_key:
            raise OrsApiKeyMissingError()
        if self.cache is not None:
            cached = self.cache.read("poi", self.endpoint, body, self.settings.ors_cache_ttl_seconds)
            if cached is not None:
                return cached[0], {**cached[1], "cache": "hit", "cacheStale": cached[2]}
        if not self.settings.allow_network and self.client is None:
            raise NetworkDisabledError()
        headers = {
            "Authorization": self.settings.ors_api_key,
            "Content-Type": "application/json",
            "Accept": "application/geo+json, application/json",
        }
        try:
            if self.client is not None:
                response = await self.client.post(self.endpoint, headers=headers, json=body, timeout=self.settings.ors_poi_timeout_seconds)
            else:
                async with httpx.AsyncClient(timeout=self.settings.ors_poi_timeout_seconds) as client:
                    response = await client.post(self.endpoint, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            stale = self._stale(body)
            if stale is not None:
                return stale
            raise UpstreamTimeoutError() from exc
        except httpx.RequestError as exc:
            stale = self._stale(body)
            if stale is not None:
                return stale
            raise UpstreamUnavailableError(type(exc).__name__) from exc
        quota = self.quota_observer.observe("pois", response.headers, response.status_code) if self.quota_observer else None
        self._raise_for_status(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise InvalidPoiProviderResponseError("invalid_json") from exc
        if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
            raise InvalidPoiProviderResponseError("not_feature_collection")
        metadata = {
            "status": response.status_code,
            "rateLimit": _rate_headers(response.headers),
            "apiQuota": quota or {},
            "responseSha256": hashlib.sha256(response.content).hexdigest(),
            "cache": "miss",
        }
        if self.cache is not None:
            self.cache.write("poi", self.endpoint, body, payload, metadata)
        return payload, metadata

    def _stale(self, body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
        if self.cache is None or not self.settings.ors_cache_stale_if_error:
            return None
        cached = self.cache.read("poi", self.endpoint, body, self.settings.ors_cache_ttl_seconds, allow_stale=True)
        if cached is None:
            return None
        return cached[0], {**cached[1], "cache": "stale-if-error", "cacheStale": True}

    @staticmethod
    def _raise_for_status(response: httpx.Response) -> None:
        if response.status_code in (401, 403):
            raise UpstreamAuthError()
        if response.status_code == 429:
            value = response.headers.get("Retry-After")
            raise UpstreamRateLimitedError(value if value and value.isdigit() and int(value) <= 86400 else None)
        if response.status_code in (400, 422):
            raise UpstreamRequestRejectedError()
        if response.status_code >= 500 or response.status_code >= 400:
            raise UpstreamUnavailableError(f"http_{response.status_code}")
