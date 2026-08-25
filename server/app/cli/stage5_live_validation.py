"""Explicit Stage 5 live validation harness.

This module is intentionally not named ``test_*.py`` and refuses to run unless
RUN_ORS_LIVE_TESTS=1 is present. It prints only non-sensitive summaries.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from shapely.geometry import Point, shape

from app.adapters.ors import OrsAdapter
from app.centers import CENTER_PRESETS
from app.config import Settings
from app.errors import ApiError
from app.models import AnalysisRequest
from app.providers.poi.ors_catalog import category_hierarchy
from app.providers.poi.ors_remote import OrsRemotePoiProvider, _normalize_feature
from app.providers.poi.ors_client import OrsPoiClient
from app.services.analysis import create_analysis
from app.services.geometry import build_exclusive_rings
from app.services.poi_tiling import plan_poi_cells


ROOT = Path(__file__).resolve().parents[3]
SERVER_DIR = ROOT / "server"


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def _settings(run_cache: Path) -> Settings:
    values = _read_env_file(SERVER_DIR / ".env")
    values.update(os.environ)
    values.update({
        "APP_ENV": "stage-5-live-validation",
        "ANALYSIS_PROVIDER": "ors",
        "POI_PROVIDER": "ors_remote",
        "ORS_PROFILE": "driving-car",
        "ORS_ISOCHRONE_RANGES_SECONDS": "600,1200,1800",
        "ORS_POI_BASE_URL": "https://api.openrouteservice.org",
        "ORS_POI_PATH": "/pois",
        "ORS_POI_MAX_REQUESTS_PER_ANALYSIS": "40",
        "ORS_POI_MAX_CONCURRENCY": "2",
        "ORS_POI_MAX_CELL_AREA_KM2": "45",
        "ORS_POI_LIMIT_PER_CELL": "2000",
        "POI_MAX_RESULTS": "600",
        "ORS_CACHE_DIR": str(run_cache),
    })
    return Settings.from_environment(values)


class CountingClient:
    def __init__(self) -> None:
        self.client = httpx.AsyncClient()
        self.total = 0
        self.isochrone = 0
        self.poi = 0

    async def post(self, url: str, *args: Any, **kwargs: Any) -> httpx.Response:
        self.total += 1
        if "/isochrones/" in url:
            self.isochrone += 1
        elif url.rstrip("/").endswith("/pois"):
            self.poi += 1
        return await self.client.post(url, *args, **kwargs)

    async def aclose(self) -> None:
        await self.client.aclose()


def _request_for(center_id: str) -> AnalysisRequest:
    center = CENTER_PRESETS[center_id]
    return AnalysisRequest(
        center={"lon": center["lon"], "lat": center["lat"], "crs": "EPSG:4326", "label": center["label"]},
        profile="driving-car",
        rangesMinutes=[10, 20, 30],
        categoryIds=[],
        poiDatasetId=None,
        options={"includePois": True, "calculateTravelTimes": False},
    )


def _error(exc: Exception) -> dict[str, Any]:
    if isinstance(exc, ApiError):
        return {"code": exc.code}
    return {"code": type(exc).__name__}


def _request_summary(counters: CountingClient) -> dict[str, int]:
    return {"total": counters.total, "isochrone": counters.isochrone, "poi": counters.poi}


async def _poi_smoke(settings: Settings, request: AnalysisRequest, client: CountingClient) -> dict[str, Any]:
    poi_client = OrsPoiClient(settings, client=client)
    radii = (500, 1000, 2000)
    attempts: list[dict[str, Any]] = []
    diagnostics: dict[str, int] = {}
    for radius in radii:
        body = {
            "request": "pois",
            "geometry": {
                "geojson": {"type": "Point", "coordinates": [request.center.lon, request.center.lat]},
                "buffer": radius,
            },
            "limit": settings.ors_poi_limit_per_cell,
        }
        started = time.monotonic()
        try:
            payload, metadata = await poi_client.query(body)
            features = payload.get("features", [])
            parsed = 0
            for feature in features:
                item, reason = _normalize_feature(feature)
                if item is not None:
                    parsed += 1
                elif reason:
                    diagnostics[reason] = diagnostics.get(reason, 0) + 1
            attempts.append({"radiusMeters": radius, "status": metadata.get("status", 200), "featureCount": len(features), "parsedCount": parsed, "elapsedMs": round((time.monotonic() - started) * 1000)})
            return {"status": "success", "attempts": attempts, "diagnostics": diagnostics, "requestCount": len(attempts)}
        except ApiError as exc:
            attempts.append({"radiusMeters": radius, "status": "error", "error": exc.code, "elapsedMs": round((time.monotonic() - started) * 1000)})
            return {"status": "failure", "attempts": attempts, "diagnostics": diagnostics, "requestCount": len(attempts), "error": exc.code}
    return {"status": "failure", "attempts": attempts, "diagnostics": diagnostics, "requestCount": len(attempts), "error": "POI_SMOKE_EXHAUSTED"}


def _plan_summary(outer_geometry, cells, projector, settings: Settings) -> dict[str, Any]:
    projected = projector.project(outer_geometry)
    areas = [cell.area_km2 for cell in cells]
    return {
        "geometryType": outer_geometry.geom_type,
        "projectedAreaKm2": round(projected.area / 1_000_000, 6),
        "bbox": [round(float(value), 7) for value in outer_geometry.bounds],
        "utmCrs": f"EPSG:{32700 if projector.southern else 32600 + projector.zone}",
        "initialCellCount": len(cells),
        "minCellAreaKm2": round(min(areas), 6) if areas else 0,
        "maxCellAreaKm2": round(max(areas), 6) if areas else 0,
        "totalCellAreaKm2": round(sum(areas), 6),
        "allCellsWithinLimit": all(area <= settings.ors_poi_max_cell_area_km2 for area in areas),
        "plannedRequests": len(cells),
        "maxRequests": settings.ors_poi_max_requests_per_analysis,
        "withinBudget": len(cells) <= settings.ors_poi_max_requests_per_analysis,
    }


def _domain_result(result: Any) -> str:
    payload = result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict()
    comparable = {key: payload.get(key) for key in ("center", "profile", "rangesMinutes", "cumulativeIsochrones", "rings", "pois", "categories")}
    return json.dumps(comparable, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _result_summary(result: Any) -> dict[str, Any]:
    metadata = result.metadata.model_dump(mode="json") if hasattr(result.metadata, "model_dump") else result.metadata.dict()
    coverage = metadata.get("poiCoverage") or {}
    ring_counts = {ring.ringId: ring.statistics.poiCount for ring in result.rings}
    top_groups = {category.categoryId: category.returnedPoiCount for category in result.categories if category.level == 1}
    return {
        "analysisSource": metadata.get("sources"),
        "poiCoverage": coverage,
        "poiSelection": metadata.get("poiSelection"),
        "ringCounts": ring_counts,
        "topLevelCategoryCounts": top_groups,
        "returnedCount": len(result.pois),
        "cumulativeRangesSeconds": [item.rangeSeconds for item in result.cumulativeIsochrones],
        "geometryTypes": [item.geometry.get("type") for item in result.cumulativeIsochrones],
    }


async def _wuhan(run_cache: Path) -> dict[str, Any]:
    settings = _settings(run_cache)
    request = _request_for("wuhan-huanghelou")
    counters = CountingClient()
    result: dict[str, Any] = {
        "center": {"id": "wuhan-huanghelou", "label": request.center.label, "lon": request.center.lon, "lat": request.center.lat},
        "config": {
            "keyConfigured": bool(settings.ors_api_key),
            "analysisProvider": settings.analysis_provider,
            "poiProvider": settings.poi_provider,
            "profile": settings.ors_profile,
            "rangesSeconds": list(settings.ors_isochrone_ranges_seconds),
            "poiBudget": settings.ors_poi_max_requests_per_analysis,
            "concurrency": settings.ors_poi_max_concurrency,
            "maxCellAreaKm2": settings.ors_poi_max_cell_area_km2,
            "cacheNamespace": "stage-5-live-validation",
        },
    }
    try:
        if not settings.ors_api_key:
            result["status"] = "blocked"
            result["error"] = "ORS_API_KEY_MISSING"
            return result
        result["poiSmoke"] = await _poi_smoke(settings, request, counters)
        if result["poiSmoke"]["status"] != "success":
            result["status"] = "blocked"
            result["error"] = result["poiSmoke"].get("error", "POI_SMOKE_FAILED")
            return result

        adapter = OrsAdapter(settings, client=counters)
        started = time.monotonic()
        isochrones = await adapter.create_isochrones(request)
        outer = shape(isochrones[-1].geometry)
        result["isochrone"] = {
            "status": "success",
            "requestCount": counters.isochrone,
            "rangesSeconds": [item.rangeSeconds for item in isochrones],
            "geometryTypes": [item.geometry.get("type") for item in isochrones],
            "validNonEmpty": all(shape(item.geometry).is_valid and not shape(item.geometry).is_empty for item in isochrones),
            "monotonicArea": all(shape(isochrones[index].geometry).area >= shape(isochrones[index - 1].geometry).area for index in range(1, len(isochrones))),
            "elapsedMs": round((time.monotonic() - started) * 1000),
        }
        rings = build_exclusive_rings(isochrones)
        cells, projector = plan_poi_cells(outer, settings.ors_poi_grid_size_meters, settings.ors_poi_max_cell_area_km2)
        result["coveragePlan"] = _plan_summary(outer, cells, projector, settings)
        if not result["coveragePlan"]["withinBudget"]:
            result["status"] = "blocked"
            result["error"] = "POI_REQUEST_BUDGET_EXCEEDED"
            return result

        poi_provider = OrsRemotePoiProvider(settings, client=OrsPoiClient(settings, client=counters))
        first = await create_analysis(request, "stage5-live-wuhan-first", settings, adapter, poi_provider)
        first_network = _request_summary(counters)
        result["firstAnalysis"] = _result_summary(first)
        result["firstNetwork"] = first_network
        if not result["firstAnalysis"]["poiCoverage"].get("complete"):
            result["status"] = "blocked"
            result["error"] = "POI_COVERAGE_INCOMPLETE"
            return result

        before_replay = _request_summary(counters)
        second = await create_analysis(request, "stage5-live-wuhan-replay", settings, adapter, poi_provider)
        after_replay = _request_summary(counters)
        result["replay"] = {
            "networkBefore": before_replay,
            "networkAfter": after_replay,
            "zeroNetwork": before_replay == after_replay,
            "domainResultEqual": _domain_result(first) == _domain_result(second),
            "secondAnalysis": _result_summary(second),
        }
        result["status"] = "success" if result["replay"]["zeroNetwork"] and result["replay"]["domainResultEqual"] else "blocked"
        if result["status"] != "success":
            result["error"] = "CACHE_REPLAY_NOT_PROVABLE"
        return result
    except Exception as exc:
        result["status"] = "blocked"
        result["error"] = _error(exc)
        return result
    finally:
        await counters.aclose()


async def _paris(run_cache: Path) -> dict[str, Any]:
    settings = _settings(run_cache)
    request = _request_for("paris-eiffel-tower")
    counters = CountingClient()
    result = {"center": {"id": "paris-eiffel-tower", "label": request.center.label, "lon": request.center.lon, "lat": request.center.lat}}
    try:
        if not settings.ors_api_key:
            return {**result, "status": "blocked", "error": "ORS_API_KEY_MISSING"}
        smoke = await _poi_smoke(settings, request, counters)
        adapter = OrsAdapter(settings, client=counters)
        isochrones = await adapter.create_isochrones(request)
        result.update({
            "status": "success" if smoke["status"] == "success" else "partial",
            "poiSmoke": smoke,
            "isochrone": {"rangesSeconds": [item.rangeSeconds for item in isochrones], "geometryTypes": [item.geometry.get("type") for item in isochrones], "requestCount": counters.isochrone},
            "network": _request_summary(counters),
        })
        return result
    except Exception as exc:
        return {**result, "status": "blocked", "error": _error(exc), "network": _request_summary(counters)}
    finally:
        await counters.aclose()


async def main() -> int:
    if os.environ.get("RUN_ORS_LIVE_TESTS") != "1":
        print(json.dumps({"status": "not-run", "reason": "RUN_ORS_LIVE_TESTS=1 required"}, ensure_ascii=False))
        return 2
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid4().hex[:8]
    run_cache = ROOT / "data" / "generated" / "ors-cache" / "stage-5-live-validation" / run_id
    evidence_dir = ROOT / "exports" / "stage-5-live"
    evidence_dir.mkdir(parents=True, exist_ok=True)
    wuhan = await _wuhan(run_cache)
    payload: dict[str, Any] = {"runId": run_id, "wuhan": wuhan}
    if wuhan.get("status") == "success":
        payload["paris"] = await _paris(run_cache / "paris")
    payload["evidencePath"] = "exports/stage-5-live/wuhan-huanghelou-validation.json"
    (evidence_dir / "wuhan-huanghelou-validation.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))
    return 0 if wuhan.get("status") == "success" else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
