"""Build Stage 29 first-delivery evidence with at most one Isochrones call per missing profile.

This script never constructs a POI, Matrix, or Geocoder client. Its only optional
network operation is an ORS Isochrones request for a profile whose exact outer
geometry is absent from the recursive local cache inventory.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

from app.adapters.ors import OrsAdapter
from app.config import Settings
from app.models import AnalysisRequest
from app.services.multimode_orchestration import matrix_batch_count
from app.services.poi_batch_planner import build_poi_query_plan, geometry_hash, normalize_outer_geometry
from app.services.quota import QuotaObserver, empty_quota_service


ROOT = Path(__file__).resolve().parents[1]
CACHE_ROOT = ROOT / "data/generated/ors-cache"
LIVE_CACHE = CACHE_ROOT / "stage-6-integrated-planning-20260801"
BASELINE = ROOT / "exports/stage-6-layout/stage20-cache-baseline.json"
OUTPUT = ROOT / "exports/stage-6-integrated-live/stage29-request-plan.json"
CENTER = {"id": "wuhan-huanghelou", "lon": 114.296944, "lat": 30.546944}
RANGES_SECONDS = [600, 1200, 1800]
PROFILES = ("foot-walking", "cycling-regular", "driving-car")
MAX_ISOCHRONE_REQUESTS = 3


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def records() -> list[tuple[Path, dict[str, Any]]]:
    values = []
    for path in sorted(CACHE_ROOT.rglob("*.json")):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(value, dict):
            values.append((path, value))
    return values


def matching_isochrones(items: list[tuple[Path, dict[str, Any]]]) -> dict[str, tuple[Path, dict[str, Any]]]:
    matches: dict[str, tuple[Path, dict[str, Any]]] = {}
    for path, record in items:
        if record.get("endpointType") != "isochrone":
            continue
        endpoint = str(record.get("endpoint") or "")
        profile = endpoint.rsplit("/", 1)[-1]
        request = record.get("request") or {}
        if profile not in PROFILES:
            continue
        if request.get("locations") != [[CENTER["lon"], CENTER["lat"]]] or request.get("range") != RANGES_SECONDS:
            continue
        if profile not in matches or str(record.get("retrievedAt") or "") > str(matches[profile][1].get("retrievedAt") or ""):
            matches[profile] = (path, record)
    return matches


def outer_geometry(record: dict[str, Any]) -> dict[str, Any]:
    features = record.get("payload", {}).get("features", [])
    feature = max(features, key=lambda item: int((item.get("properties") or {}).get("value", 0)))
    if int(feature.get("properties", {}).get("value", 0)) != 1800:
        raise RuntimeError("outer isochrone 1800 seconds is missing")
    geometry = feature.get("geometry")
    normalize_outer_geometry(geometry)
    return geometry


def request_for(profile: str) -> AnalysisRequest:
    return AnalysisRequest(
        center={"id": CENTER["id"], "lon": CENTER["lon"], "lat": CENTER["lat"], "crs": "EPSG:4326", "label": "武汉·黄鹤楼"},
        profile=profile,
        rangesMinutes=[value // 60 for value in RANGES_SECONDS],
        categoryIds=[],
        poiDatasetId=None,
        options={"includePois": False, "calculateTravelTimes": False},
    )


class IsochronesOnlyClient:
    def __init__(self, allowed_profiles: set[str]) -> None:
        self.allowed_profiles = allowed_profiles
        self.request_count = 0
        self.by_profile = {profile: 0 for profile in PROFILES}
        self._client = httpx.AsyncClient(timeout=45.0)

    async def post(self, url: str, *args: Any, **kwargs: Any) -> httpx.Response:
        profile = url.rstrip("/").rsplit("/", 1)[-1]
        if "/v2/isochrones/" not in url or profile not in self.allowed_profiles:
            raise RuntimeError("stage29 guard rejected a non-approved upstream URL")
        if self.by_profile[profile] >= 1 or self.request_count >= MAX_ISOCHRONE_REQUESTS:
            raise RuntimeError("stage29 isochrone request budget exceeded")
        self.by_profile[profile] += 1
        self.request_count += 1
        return await self._client.post(url, *args, **kwargs)

    async def aclose(self) -> None:
        await self._client.aclose()


def online_settings() -> Settings:
    env_path = ROOT / "server/.env"
    values = {key: value or "" for key, value in dotenv_values(env_path).items()}
    settings = Settings.from_environment(values)
    if not settings.provider_ready or settings.analysis_provider != "ors" or settings.allow_mock_fallback:
        raise RuntimeError("online provider is not ready or mock fallback is enabled")
    return replace(settings, ors_cache_dir=str(LIVE_CACHE), ors_timeout_seconds=min(45.0, settings.ors_timeout_seconds))


async def fetch_missing_profiles(missing: list[str]) -> dict[str, Any]:
    if len(missing) > MAX_ISOCHRONE_REQUESTS:
        raise RuntimeError("stage29 isochrone request budget exceeded before start")
    settings = online_settings()
    observer = QuotaObserver()
    client = IsochronesOnlyClient(set(missing))
    outcomes: dict[str, Any] = {}
    try:
        for profile in missing:
            adapter = OrsAdapter(settings, client=client, quota_observer=observer)
            result = await adapter.create_isochrones(request_for(profile))
            outcomes[profile] = {
                "rangeSeconds": [item.rangeSeconds for item in result],
                "geometryTypes": [item.geometry.get("type") for item in result],
                "cacheHit": adapter.last_cache_hit,
                "metadata": adapter.last_metadata,
            }
    finally:
        await client.aclose()
    return {
        "actualRequests": client.request_count,
        "requestsByProfile": client.by_profile,
        "outcomes": outcomes,
        "quota": observer.snapshot(),
    }


def planner_request(profile: str, geometry: dict[str, Any]) -> dict[str, Any]:
    return {
        "center": {"longitude": CENTER["lon"], "latitude": CENTER["lat"]},
        "profile": profile,
        "rangesSeconds": RANGES_SECONDS,
        "outerGeometry": geometry,
        "poiFilter": None,
        "provider": "openpoiservice",
        "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000},
        "plannerConfig": {
            "targetPieceAreaKm2": 35,
            "maxSubdivisionDepth": 4,
            "minPieceAreaKm2": 0.1,
            "requestBudget": 20,
        },
    }


def polygon_poi_cache(items: list[tuple[Path, dict[str, Any]]]) -> dict[str, dict[str, Any]]:
    matches = {}
    for path, record in items:
        if record.get("endpointType") != "poi":
            continue
        request = record.get("request") or {}
        geojson = (request.get("geometry") or {}).get("geojson")
        if not isinstance(geojson, dict) or geojson.get("type") not in {"Polygon", "MultiPolygon"}:
            continue
        try:
            digest = geometry_hash(normalize_outer_geometry(geojson))
        except Exception:
            continue
        features = (record.get("payload") or {}).get("features")
        matches[digest] = {
            "path": str(path.relative_to(ROOT)),
            "retrievedAt": record.get("retrievedAt"),
            "rawFeatureCount": len(features) if isinstance(features, list) else None,
            "resultTruncated": isinstance(features, list) and len(features) >= int(request.get("limit", 2000)),
        }
    return matches


def latest_quota(items: list[tuple[Path, dict[str, Any]]]) -> dict[str, Any]:
    latest = {service: empty_quota_service("cache-observation") for service in ("isochrones", "pois", "matrix", "geocoder")}
    endpoint_to_service = {"isochrone": "isochrones", "poi": "pois", "matrix": "matrix", "geocoder": "geocoder"}
    for _, record in items:
        service = endpoint_to_service.get(str(record.get("endpointType") or ""))
        if not service:
            continue
        candidate = (record.get("metadata") or {}).get("apiQuota")
        if not isinstance(candidate, dict) or not candidate.get("observedAt"):
            continue
        if str(candidate["observedAt"]) >= str(latest[service].get("observedAt") or ""):
            latest[service] = {key: candidate.get(key) for key in ("status", "remaining", "limit", "resetAt", "observedAt", "freshness", "requestSource")}
    return latest


def build_evidence(fetch_summary: dict[str, Any]) -> dict[str, Any]:
    items = records()
    caches = matching_isochrones(items)
    missing = [profile for profile in PROFILES if profile not in caches]
    if missing:
        raise RuntimeError(f"missing outer isochrone after permitted fetch: {','.join(missing)}")
    poi_cache = polygon_poi_cache(items)
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    profiles = {}
    for profile in PROFILES:
        path, record = caches[profile]
        geometry = outer_geometry(record)
        plan = build_poi_query_plan(planner_request(profile, geometry))
        cached_pieces = [piece for piece in plan["pieces"] if piece["geometryHash"] in poi_cache and not poi_cache[piece["geometryHash"]]["resultTruncated"]]
        known_poi_count = len(baseline.get("pois") or []) if profile == "foot-walking" else None
        if known_poi_count is not None:
            matrix = {
                "destinationCount": known_poi_count,
                "batchSize": 500,
                "minimumRequests": matrix_batch_count(known_poi_count),
                "cachedBatches": 1,
                "remainingRequests": 0,
                "estimate": f"ceil({known_poi_count}/500) = {matrix_batch_count(known_poi_count)}",
            }
        else:
            maximum_destinations = plan["estimatedMaximumApprovedRequests"] * 2000
            matrix = {
                "destinationCount": None,
                "batchSize": 500,
                "minimumRequests": None,
                "cachedBatches": 0,
                "remainingRequests": None,
                "estimate": f"ceil(N/500), 0 <= N <= {maximum_destinations}; therefore 0..{matrix_batch_count(maximum_destinations)} batches",
            }
        all_initial_pieces_cached = len(cached_pieces) == plan["estimatedMinimumPoiRequests"]
        profiles[profile] = {
            "status": "awaiting-approval",
            "outerGeometry": {
                "source": "live" if path.is_relative_to(LIVE_CACHE) and fetch_summary["requestsByProfile"].get(profile) else "cache",
                "cachePath": str(path.relative_to(ROOT)),
                "cacheSha256": sha256(path),
                "retrievedAt": record.get("retrievedAt"),
                "geometryType": geometry.get("type"),
                "areaKm2": plan["outerAreaKm2"],
            },
            "poiPlan": {
                "pieceCount": plan["pieceCount"],
                "minimumRequests": plan["estimatedMinimumPoiRequests"],
                "adaptiveReserve": plan["reservedAdaptiveRequests"],
                "requestUpperBound": plan["estimatedMaximumApprovedRequests"],
                "cachedPieces": len(cached_pieces),
                "cachedPieceSources": [poi_cache[piece["geometryHash"]] for piece in cached_pieces],
                "remainingMinimumRequests": max(0, plan["estimatedMinimumPoiRequests"] - len(cached_pieces)),
                "remainingRequestUpperBound": 0 if all_initial_pieces_cached else max(0, plan["estimatedMaximumApprovedRequests"] - len(cached_pieces)),
                "knownPoiCount": known_poi_count,
                "coverage": plan["coverage"],
                "budgetStatus": plan["budgetStatus"],
            },
            "matrixPlan": matrix,
            "planFingerprint": plan["planFingerprint"],
        }
    quota = latest_quota(items)
    return {
        "schemaVersion": "1.0",
        "stage": 29,
        "delivery": "first-real-request-plan",
        "status": "awaiting-approval",
        "generatedAt": now(),
        "scenario": {"centerId": CENTER["id"], "coordinates": [CENTER["lon"], CENTER["lat"]], "rangesSeconds": RANGES_SECONDS, "profiles": list(PROFILES)},
        "actualUpstreamRequests": {
            "isochrones": fetch_summary["actualRequests"],
            "isochronesByProfile": fetch_summary["requestsByProfile"],
            "pois": 0,
            "matrix": 0,
            "geocoder": 0,
        },
        "profiles": profiles,
        "quotaObservations": quota,
        "approvalTemplate": {
            "centerId": CENTER["id"],
            "rangesSeconds": RANGES_SECONDS,
            "profiles": {
                profile: {
                    "planFingerprint": profiles[profile]["planFingerprint"],
                    "approvedPoiRequests": 0,
                    "approvedMatrixRequests": 0,
                }
                for profile in PROFILES
            },
            "stopOnProfileFailure": True,
            "createdAt": "<由批准者填写 ISO-8601 时间>",
        },
        "approvalGranted": False,
        "poiDataObtainedForUnknownProfiles": False,
    }


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fetch-missing-isochrones", action="store_true")
    args = parser.parse_args()
    before = matching_isochrones(records())
    missing = [profile for profile in PROFILES if profile not in before]
    fetch_summary = {
        "actualRequests": 0,
        "requestsByProfile": {profile: 0 for profile in PROFILES},
        "outcomes": {},
        "quota": {},
    }
    if not missing and OUTPUT.is_file():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
            actual = previous.get("actualUpstreamRequests") or {}
            if previous.get("stage") == 29 and previous.get("status") == "awaiting-approval":
                fetch_summary["actualRequests"] = int(actual.get("isochrones", 0))
                fetch_summary["requestsByProfile"] = {
                    profile: int((actual.get("isochronesByProfile") or {}).get(profile, 0))
                    for profile in PROFILES
                }
        except (OSError, ValueError, TypeError):
            pass
    if missing:
        if not args.fetch_missing_isochrones:
            raise RuntimeError(f"missing outer isochrone: {','.join(missing)}")
        fetch_summary = await fetch_missing_profiles(missing)
    evidence = build_evidence(fetch_summary)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({
        "status": evidence["status"],
        "output": str(OUTPUT.relative_to(ROOT)),
        "isochronesActual": evidence["actualUpstreamRequests"]["isochrones"],
        "poisActual": 0,
        "matrixActual": 0,
        "geocoderActual": 0,
        "profiles": {
            profile: {
                "areaKm2": value["outerGeometry"]["areaKm2"],
                "pieces": value["poiPlan"]["pieceCount"],
                "fingerprint": value["planFingerprint"],
            }
            for profile, value in evidence["profiles"].items()
        },
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
