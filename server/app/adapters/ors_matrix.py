from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import Settings
from app.errors import (
    InvalidMatrixResponseError,
    NetworkDisabledError,
    OrsApiKeyMissingError,
    UpstreamAuthError,
    UpstreamRateLimitedError,
    UpstreamRequestRejectedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from app.models import Center, Poi, PoiAccessibility
from app.provider_capabilities import SUPPORTED_PROFILES
from app.services.ors_cache import JsonResponseCache
from app.services.quota import QuotaObserver


MATRIX_ADAPTER_VERSION = "stage-6-v1"
MATRIX_PROVIDER = "ors-public-api"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _finite_number(value: Any, *, minimum: float = 0) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) and number >= minimum else None


def _safe_retry_after(value: str | None) -> str | None:
    if value is None or not value.isdigit():
        return None
    return value if int(value) <= 86400 else None


def matrix_band_id(duration_seconds: float) -> str:
    if duration_seconds <= 600:
        return "ring-0-10"
    if duration_seconds <= 1200:
        return "ring-10-20"
    if duration_seconds <= 1800:
        return "ring-20-30"
    return "matrix-out-of-range"


@dataclass(frozen=True)
class MatrixComputation:
    accessibility: list[PoiAccessibility]
    metadata: dict[str, Any]


class OrsMatrixAdapter:
    """Strict one-to-many ORS Matrix adapter with a credential-free file cache."""

    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
        quota_observer: QuotaObserver | None = None,
        profile: str = "foot-walking",
    ) -> None:
        if profile not in SUPPORTED_PROFILES:
            raise ValueError(f"Unsupported Matrix profile: {profile}")
        self.settings = settings
        self.client = client
        self.quota_observer = quota_observer
        self.profile = profile
        self.cache = None if settings.app_env == "test" else JsonResponseCache(settings.ors_cache_dir)
        self.last_metadata: dict[str, Any] = {}

    @property
    def endpoint(self) -> str:
        return f"{self.settings.ors_base_url}/v2/matrix/{self.profile}"

    @staticmethod
    def request_body(center: Center, pois: list[Poi]) -> dict[str, Any]:
        return {
            "locations": [
                [center.lon, center.lat],
                *[[poi.location.lon, poi.location.lat] for poi in pois],
            ],
            "sources": ["0"],
            "destinations": [str(index) for index in range(1, len(pois) + 1)],
            "metrics": ["duration", "distance"],
            "units": "m",
            "resolve_locations": True,
        }

    def cache_identity(self, center: Center, pois: list[Poi]) -> dict[str, Any]:
        return {
            "provider": MATRIX_PROVIDER,
            "profile": self.profile,
            "center": [center.lon, center.lat],
            "destinations": [
                {"poiId": poi.poiId, "coordinates": [poi.location.lon, poi.location.lat]}
                for poi in pois
            ],
            "metrics": ["duration", "distance"],
            "units": "m",
            "options": {"resolve_locations": True, "sources": ["0"]},
            "adapterVersion": MATRIX_ADAPTER_VERSION,
        }

    @staticmethod
    def batch_id(cache_identity: dict[str, Any]) -> str:
        value = json.dumps(cache_identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
        return f"ors-matrix-{hashlib.sha256(value).hexdigest()[:24]}"

    async def _post(self, body: dict[str, Any]) -> httpx.Response:
        if not self.settings.allow_network and self.client is None:
            raise NetworkDisabledError()
        headers = {
            "Authorization": self.settings.ors_api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        timeout = min(float(self.settings.ors_matrix_timeout_seconds), 60.0)
        try:
            if self.client is not None:
                return await self.client.post(self.endpoint, headers=headers, json=body, timeout=timeout)
            async with httpx.AsyncClient(timeout=timeout) as client:
                return await client.post(self.endpoint, headers=headers, json=body)
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
        if status in (400, 413, 422):
            raise UpstreamRequestRejectedError()
        if status >= 400:
            raise UpstreamUnavailableError(f"http_{status}")

    @staticmethod
    def _resolved_locations(payload: dict[str, Any], field: str, count: int) -> list[Any]:
        value = payload.get(field)
        if value is None:
            return [None] * count
        if not isinstance(value, list) or len(value) != count:
            raise InvalidMatrixResponseError(f"{field}_count_mismatch")
        return value

    @staticmethod
    def _same_resolved_point(source: Any, destination: Any) -> bool:
        if not isinstance(source, dict) or not isinstance(destination, dict):
            return False
        source_location = source.get("location")
        destination_location = destination.get("location")
        if not isinstance(source_location, list) or not isinstance(destination_location, list):
            return False
        if len(source_location) < 2 or len(destination_location) < 2:
            return False
        values = (*source_location[:2], *destination_location[:2])
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) for value in values):
            return False
        source_lon, source_lat, destination_lon, destination_lat = map(float, values)
        if not (-180 <= source_lon <= 180 and -90 <= source_lat <= 90):
            return False
        if not (-180 <= destination_lon <= 180 and -90 <= destination_lat <= 90):
            return False
        return abs(source_lon - destination_lon) <= 1e-8 and abs(source_lat - destination_lat) <= 1e-8

    @staticmethod
    def _routing_graph_date(payload: dict[str, Any]) -> str | None:
        metadata = payload.get("metadata")
        engine = metadata.get("engine") if isinstance(metadata, dict) else None
        if not isinstance(engine, dict):
            return None
        for field in ("graph_date", "build_date"):
            value = engine.get(field)
            if isinstance(value, str) and 0 < len(value) <= 100:
                return value
        return None

    def parse_response(
        self,
        payload: Any,
        *,
        center: Center,
        pois: list[Poi],
        analysis_run_id: str,
        calculated_at: str,
        matrix_batch_id: str,
        spatial_band_by_id: dict[str, str] | None = None,
    ) -> list[PoiAccessibility]:
        if not isinstance(payload, dict):
            raise InvalidMatrixResponseError("not_object")
        durations = payload.get("durations")
        distances = payload.get("distances")
        if not isinstance(durations, list) or len(durations) != 1:
            raise InvalidMatrixResponseError("durations_source_count")
        if not isinstance(distances, list) or len(distances) != 1:
            raise InvalidMatrixResponseError("distances_source_count")
        if not isinstance(durations[0], list) or len(durations[0]) != len(pois):
            raise InvalidMatrixResponseError("durations_destination_count")
        if not isinstance(distances[0], list) or len(distances[0]) != len(pois):
            raise InvalidMatrixResponseError("distances_destination_count")

        sources = self._resolved_locations(payload, "sources", 1)
        destinations = self._resolved_locations(payload, "destinations", len(pois))
        graph_date = self._routing_graph_date(payload)
        result: list[PoiAccessibility] = []
        for index, poi in enumerate(pois):
            raw_duration = durations[0][index]
            raw_distance = distances[0][index]
            duration = _finite_number(raw_duration)
            distance = _finite_number(raw_distance)
            if raw_duration is None or raw_distance is None:
                status = "unreachable"
                duration = None
                distance = None
            elif duration is None or distance is None:
                status = "invalid"
                duration = None
                distance = None
            elif duration == 0 and not self._same_resolved_point(sources[0], destinations[index]):
                status = "invalid"
                duration = None
                distance = None
            else:
                status = "ok"
            matrix_band = matrix_band_id(duration) if status == "ok" and duration is not None else None
            destination = destinations[index] if isinstance(destinations[index], dict) else {}
            snapped_distance = _finite_number(destination.get("snapped_distance"))
            result.append(PoiAccessibility(
                analysisRunId=analysis_run_id,
                poiId=poi.poiId,
                centerId=center.id or "wuhan-huanghelou",
                center=center,
                profile=self.profile,
                travelTimeSeconds=duration,
                networkDistanceMeters=distance,
                reachable=status == "ok",
                matrixBandId=matrix_band,
                spatialBandId=(spatial_band_by_id or {}).get(poi.poiId, poi.ringId),
                routingGraphDate=graph_date,
                calculatedAt=calculated_at,
                snappedDistanceMeters=snapped_distance,
                matrixBatchId=matrix_batch_id,
                matrixStatus=status,
            ))
        return result

    async def calculate(
        self,
        *,
        center: Center,
        pois: list[Poi],
        analysis_run_id: str,
        spatial_band_by_id: dict[str, str] | None = None,
    ) -> MatrixComputation:
        self.last_metadata = {}
        if not self.settings.ors_api_key:
            raise OrsApiKeyMissingError()
        identity = self.cache_identity(center, pois)
        batch_id = self.batch_id(identity)
        if self.cache is not None:
            cached = self.cache.read("matrix", self.endpoint, identity, self.settings.ors_cache_ttl_seconds)
            if cached is not None:
                calculated_at = cached[1].get("calculatedAt")
                if not isinstance(calculated_at, str):
                    raise InvalidMatrixResponseError("cache_calculated_at_missing")
                accessibility = self.parse_response(
                    cached[0], center=center, pois=pois, analysis_run_id=analysis_run_id,
                    calculated_at=calculated_at, matrix_batch_id=batch_id,
                    spatial_band_by_id=spatial_band_by_id,
                )
                self.last_metadata = {
                    **cached[1],
                    "cache": "hit",
                    "cacheStale": cached[2],
                    "upstreamRequestCount": 0,
                    "matrixBatchId": batch_id,
                }
                return MatrixComputation(accessibility, dict(self.last_metadata))

        body = self.request_body(center, pois)
        response = await self._post(body)
        quota = self.quota_observer.observe("matrix", response.headers, response.status_code) if self.quota_observer else None
        self._raise_for_status(response)
        try:
            payload = response.json()
        except ValueError as exc:
            raise InvalidMatrixResponseError("invalid_json") from exc
        calculated_at = _utc_now()
        accessibility = self.parse_response(
            payload, center=center, pois=pois, analysis_run_id=analysis_run_id,
            calculated_at=calculated_at, matrix_batch_id=batch_id,
            spatial_band_by_id=spatial_band_by_id,
        )
        metadata = {
            "status": response.status_code,
            "cache": "miss",
            "calculatedAt": calculated_at,
            "apiQuota": quota or {},
            "responseSha256": hashlib.sha256(response.content).hexdigest(),
            "routingGraphDate": self._routing_graph_date(payload),
            "upstreamRequestCount": 1,
            "matrixBatchId": batch_id,
            "adapterVersion": MATRIX_ADAPTER_VERSION,
        }
        if self.cache is not None:
            self.cache.write("matrix", self.endpoint, identity, payload, metadata)
        self.last_metadata = metadata
        return MatrixComputation(accessibility, dict(metadata))
