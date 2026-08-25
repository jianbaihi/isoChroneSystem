"""Approved Stage 29 cycling-only live executor with strict request budgets.

The executor never schedules driving-car and never creates a Geocoder request.
It supports checkpointed POI, Matrix, assembly, and cache-replay phases.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import tempfile
from collections import Counter
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any

import httpx
from dotenv import dotenv_values
from shapely.geometry import Point, shape

from app.adapters.ors import OrsAdapter
from app.adapters.ors_matrix import OrsMatrixAdapter
from app.config import Settings
from app.models import AnalysisResult, Center, CumulativeIsochrone, Poi
from app.providers.poi.ors_client import OrsPoiClient
from app.providers.poi.ors_remote import _normalize_feature
from app.services.geometry import build_exclusive_rings
from app.services.multimode_orchestration import build_matrix_batch_plan
from app.services.poi_batch_planner import (
    PlannerConfig,
    PoiBatchJobStore,
    PoiPieceCache,
    adaptive_piece_transition,
    build_poi_query_plan,
    merge_piece_results,
    piece_cache_key,
)
from app.services.quota import QuotaObserver, empty_quota_service
from scripts.build_stage29_live_request_plan import (
    PROFILES,
    latest_quota,
    matching_isochrones,
    outer_geometry,
    planner_request,
    records,
)


ROOT = Path(__file__).resolve().parents[1]
APPROVAL_PATH = ROOT / "exports/stage-6-integrated-live/stage29-approved-scope.json"
PLAN_PATH = ROOT / "exports/stage-6-integrated-live/stage29-request-plan.json"
FOOT_BASELINE = ROOT / "exports/stage-6-layout/stage20-cache-baseline.json"
OUTPUT = ROOT / "exports/stage-6-integrated-live/stage29-cycling-complete.json"
EVIDENCE = ROOT / "exports/stage-6-integrated-live/stage29-live-execution.json"
REPLAY_EVIDENCE = ROOT / "exports/stage-6-integrated-live/stage29-cache-replay.json"
STATE_ROOT = ROOT / "data/generated/stage29-cycling-live"
POI_STATE = STATE_ROOT / "poi-jobs"
POI_PIECE_CACHE = STATE_ROOT / "poi-pieces"
MATRIX_STATE = STATE_ROOT / "matrix"
UPSTREAM_CACHE = ROOT / "data/generated/ors-cache/stage-6-integrated-cycling-live-20260801"
CYCLING_ISO_CACHE = ROOT / "data/generated/ors-cache/stage-6-integrated-planning-20260801"
PROFILE = "cycling-regular"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.stem}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def settings(cache_dir: Path) -> Settings:
    values = {key: value or "" for key, value in dotenv_values(ROOT / "server/.env").items()}
    configured = Settings.from_environment(values)
    if not configured.provider_ready or configured.allow_mock_fallback:
        raise RuntimeError("online provider is not ready or mock fallback is enabled")
    return replace(
        configured,
        ors_profile=PROFILE,
        ors_cache_dir=str(cache_dir),
        ors_poi_max_concurrency=1,
        ors_timeout_seconds=min(45.0, configured.ors_timeout_seconds),
        ors_poi_timeout_seconds=min(45.0, configured.ors_poi_timeout_seconds),
        ors_matrix_timeout_seconds=min(60.0, configured.ors_matrix_timeout_seconds),
    )


def current_plans() -> tuple[dict[str, Any], dict[str, tuple[Path, dict[str, Any]]]]:
    caches = matching_isochrones(records())
    if set(PROFILES) - set(caches):
        raise RuntimeError("an approved profile geometry is missing")
    plans = {
        profile: build_poi_query_plan(planner_request(profile, outer_geometry(caches[profile][1])))
        for profile in PROFILES
    }
    return plans, caches


def validate_approval() -> tuple[dict[str, Any], dict[str, Any], dict[str, tuple[Path, dict[str, Any]]]]:
    approval = read_json(APPROVAL_PATH)
    frozen = read_json(PLAN_PATH)
    plans, caches = current_plans()
    if approval.get("centerId") != "wuhan-huanghelou" or approval.get("rangesSeconds") != [600, 1200, 1800]:
        raise RuntimeError("approval scenario mismatch")
    if approval.get("approvedScope") != ["foot-walking-cache-validation", "cycling-regular-live"]:
        raise RuntimeError("approval scope mismatch")
    if approval.get("stopAfterProfile") != PROFILE or approval.get("stopOnProfileFailure") is not True:
        raise RuntimeError("approval stop gate mismatch")
    for profile in PROFILES:
        expected = approval["profiles"][profile]["planFingerprint"]
        if expected != frozen["profiles"][profile]["planFingerprint"] or expected != plans[profile]["planFingerprint"]:
            raise RuntimeError(f"plan fingerprint changed for {profile}")
    if approval["profiles"]["foot-walking"]["approvedPoiRequests"] != 0 or approval["profiles"]["foot-walking"]["approvedMatrixRequests"] != 0:
        raise RuntimeError("foot-walking must be cache-only")
    if approval["profiles"]["driving-car"]["approvedPoiRequests"] != 0 or approval["profiles"]["driving-car"]["approvedMatrixRequests"] != 0:
        raise RuntimeError("driving-car is explicitly unapproved")
    if approval["profiles"][PROFILE]["approvedPoiRequests"] != 13 or approval["profiles"][PROFILE]["approvedMatrixRequests"] != 52:
        raise RuntimeError("cycling approval budget mismatch")
    if plans[PROFILE]["estimatedMaximumApprovedRequests"] != 13:
        raise RuntimeError("cycling POI plan changed")
    quota = latest_quota(records())
    for service, approved in (("pois", 13), ("matrix", 52)):
        remaining = quota[service].get("remaining")
        if remaining is None or approved > math.floor(int(remaining) * 0.8):
            raise RuntimeError(f"{service} quota reserve is insufficient or unknown")
    return approval, plans, caches


class BudgetedClient:
    def __init__(self, service: str, allowed_suffix: str, maximum: int) -> None:
        self.service = service
        self.allowed_suffix = allowed_suffix
        self.maximum = maximum
        self.actual = 0
        self.statuses: Counter[int] = Counter()
        self._client = httpx.AsyncClient()

    async def post(self, url: str, *args: Any, **kwargs: Any) -> httpx.Response:
        if not url.rstrip("/").endswith(self.allowed_suffix):
            raise RuntimeError(f"{self.service} guard rejected URL")
        if self.actual >= self.maximum:
            raise RuntimeError(f"{self.service} approved request budget exhausted")
        self.actual += 1
        response = await self._client.post(url, *args, **kwargs)
        self.statuses[response.status_code] += 1
        return response

    async def aclose(self) -> None:
        await self._client.aclose()


class NoNetworkClient:
    def __init__(self) -> None:
        self.actual = 0

    async def post(self, *args: Any, **kwargs: Any) -> httpx.Response:
        self.actual += 1
        raise AssertionError("cache replay attempted an upstream request")


def normalized_pois(features: list[Any]) -> tuple[list[dict[str, Any]], Counter[str]]:
    values = []
    diagnostics: Counter[str] = Counter()
    for feature in features:
        item, reason = _normalize_feature(feature)
        if item is None:
            diagnostics[reason or "invalid_feature"] += 1
            continue
        values.append({
            "poiId": item.poi_id,
            "sourceId": item.poi_id,
            "source": "ors-openpoiservice",
            "name": item.name,
            "nameLocale": item.name_locale,
            "location": {"lon": item.lon, "lat": item.lat},
            "categoryId": None,
            "category": {"groupId": None, "primaryCategoryId": None, "hierarchy": []},
        })
    return values, diagnostics


def poi_body(piece: dict[str, Any]) -> dict[str, Any]:
    return {"request": "pois", "geometry": {"geojson": piece["geometry"]}, "limit": 2000, "sortby": "category"}


async def run_pois() -> dict[str, Any]:
    approval, plans, caches = validate_approval()
    plan = plans[PROFILE]
    outer = outer_geometry(caches[PROFILE][1])
    approved = approval["profiles"][PROFILE]["approvedPoiRequests"]
    store = PoiBatchJobStore(POI_STATE)
    manifest = store.initialize(plan)
    if manifest.get("planFingerprint") != plan["planFingerprint"]:
        raise RuntimeError("POI checkpoint fingerprint mismatch")
    already_used = int(manifest.get("upstreamRequestCount", 0))
    if already_used > approved:
        raise RuntimeError("saved POI requests exceed approval")
    observer = QuotaObserver()
    network = BudgetedClient("pois", "/pois", approved - already_used)
    provider = OrsPoiClient(settings(UPSTREAM_CACHE), client=network, quota_observer=observer)
    piece_cache = PoiPieceCache(POI_PIECE_CACHE)
    results_by_piece: dict[str, list[dict[str, Any]]] = {}
    try:
        while True:
            manifest = store.load(manifest["jobId"]) or manifest
            pending = [piece for piece in manifest["pieces"] if piece.get("status") in {"planned", "pending", "running", "failed"}]
            if not pending:
                break
            piece = pending[0]
            key = piece_cache_key(piece, None, 2000)
            cached = piece_cache.read(key, piece["geometryHash"])
            if cached is not None:
                values = cached["pois"]
                metadata = cached.get("metadata") or {}
                transitioned = adaptive_piece_transition(piece, int(metadata.get("rawFeatureCount", len(values))), bool(metadata.get("resultTruncated", False)), 2000, PlannerConfig())
                updated = {**transitioned["piece"], "status": "cache-hit" if not transitioned["children"] else transitioned["piece"]["status"], "cacheHit": True}
                manifest = store.checkpoint(manifest, updated)
                for child in transitioned["children"]:
                    manifest = store.checkpoint(manifest, child)
                results_by_piece[piece["pieceId"]] = values
                continue
            before = network.actual
            payload, metadata = await provider.query(poi_body(piece))
            features = payload.get("features") if isinstance(payload, dict) else None
            if not isinstance(features, list):
                raise RuntimeError("POI response features missing")
            values, diagnostics = normalized_pois(features)
            truncated = len(features) >= 2000
            transition = adaptive_piece_transition(piece, len(features), truncated, 2000, PlannerConfig())
            cache_metadata = {
                "rawFeatureCount": len(features),
                "namedFeatureCount": len(values),
                "diagnostics": dict(diagnostics),
                "resultTruncated": truncated,
                "providerMetadata": metadata,
            }
            piece_cache.write(key, piece, values, cache_metadata)
            manifest = store.checkpoint(manifest, transition["piece"])
            for child in transition["children"]:
                manifest = store.checkpoint(manifest, child)
            manifest["upstreamRequestCount"] = already_used + network.actual
            manifest["cacheHitCount"] = int(manifest.get("cacheHitCount", 0)) + (1 if network.actual == before else 0)
            manifest["lastQuota"] = metadata.get("apiQuota") or manifest.get("lastQuota")
            manifest["retryCount"] = int(manifest.get("retryCount", 0))
            store._atomic_write(store._path(manifest["jobId"]), manifest)
            results_by_piece[piece["pieceId"]] = values
            if transition["children"]:
                pending_count = sum(item.get("status") in {"planned", "pending", "running", "failed"} for item in manifest["pieces"])
                if already_used + network.actual + pending_count > approved:
                    manifest["status"] = "partial"
                    manifest["stopReason"] = "adaptive_subdivision_exceeds_approved_poi_budget"
                    store._atomic_write(store._path(manifest["jobId"]), manifest)
                    raise RuntimeError("adaptive subdivision requires more than 13 approved POI requests")
        manifest = store.load(manifest["jobId"]) or manifest
        # Rehydrate every leaf from the credential-free piece cache for deterministic merge/resume.
        for piece in manifest["pieces"]:
            if piece.get("status") == "superseded-by-children":
                continue
            cached = piece_cache.read(piece_cache_key(piece, None, 2000), piece["geometryHash"])
            if cached is None:
                raise RuntimeError(f"completed POI piece cache missing: {piece['pieceId']}")
            results_by_piece[piece["pieceId"]] = cached["pois"]
        merged = merge_piece_results(manifest, results_by_piece, outer)
        if not merged.get("publishable"):
            raise RuntimeError("POI leaf set is incomplete")
        rings = build_exclusive_rings([
            CumulativeIsochrone(
                isochroneId=f"isochrone-{int(feature['properties']['value']) // 60}",
                rangeMinutes=int(feature["properties"]["value"]) // 60,
                rangeSeconds=int(feature["properties"]["value"]),
                geometry=feature["geometry"],
            )
            for feature in sorted(caches[PROFILE][1]["payload"]["features"], key=lambda item: int(item["properties"]["value"]))
        ])
        ring_shapes = [(ring["ringId"], shape(ring["geometry"])) for ring in rings]
        assigned = []
        spatial_counts: Counter[str] = Counter()
        for item in merged["pois"]:
            point = Point(item["location"]["lon"], item["location"]["lat"])
            ring_id = next((ring_id for ring_id, geometry in ring_shapes if geometry.covers(point)), None)
            if ring_id is None:
                continue
            spatial_counts[ring_id] += 1
            assigned.append({**item, "ringId": ring_id})
        leaf_records = []
        for piece in manifest["pieces"]:
            if piece.get("status") == "superseded-by-children":
                continue
            cached = piece_cache.read(piece_cache_key(piece, None, 2000), piece["geometryHash"])
            leaf_records.append(cached or {})
        stats = {
            "rawFeatureCount": sum(int((item.get("metadata") or {}).get("rawFeatureCount", 0)) for item in leaf_records),
            "namedFeatureCountBeforeMerge": sum(int((item.get("metadata") or {}).get("namedFeatureCount", 0)) for item in leaf_records),
            "mergedNamedCount": merged["mergedCount"],
            "deduplicatedPoiCount": len(assigned),
            "duplicateCount": merged["duplicateCount"],
            "outsideCount": merged["outsideCount"] + (merged["mergedCount"] - len(assigned)),
            "spatialBandCounts": dict(spatial_counts),
        }
        output = {
            "status": "completed",
            "profile": PROFILE,
            "planFingerprint": plan["planFingerprint"],
            "jobId": manifest["jobId"],
            "outerGeometry": outer,
            "rings": rings,
            "pois": sorted(assigned, key=lambda item: item["poiId"]),
            "stats": stats,
            "requestAccounting": {
                "approved": approved,
                "actual": int(manifest.get("upstreamRequestCount", 0)),
                "cacheHits": int(manifest.get("cacheHitCount", 0)),
                "retries": int(manifest.get("retryCount", 0)),
                "remainingApproved": approved - int(manifest.get("upstreamRequestCount", 0)),
                "statuses": dict(network.statuses),
            },
            "quota": manifest.get("lastQuota") or observer.snapshot()["services"]["pois"],
            "completedAt": utc_now(),
        }
        atomic_json(STATE_ROOT / "cycling-pois-complete.json", output)
        manifest["status"] = "completed"
        manifest["published"] = True
        manifest["upstreamRequestCount"] = output["requestAccounting"]["actual"]
        store._atomic_write(store._path(manifest["jobId"]), manifest)
        return {"status": "completed", "stats": stats, "requestAccounting": output["requestAccounting"], "quota": output["quota"]}
    finally:
        await network.aclose()


async def run_matrix() -> dict[str, Any]:
    approval, plans, _ = validate_approval()
    poi_result = read_json(STATE_ROOT / "cycling-pois-complete.json")
    if poi_result.get("status") != "completed" or poi_result.get("planFingerprint") != plans[PROFILE]["planFingerprint"]:
        raise RuntimeError("cycling POI result is missing or stale")
    approved = approval["profiles"][PROFILE]["approvedMatrixRequests"]
    center = {"id": "wuhan-huanghelou", "lon": 114.296944, "lat": 30.546944}
    plan = build_matrix_batch_plan(PROFILE, center, poi_result["pois"], approved_requests=approved)
    if plan["batchCount"] > approved:
        raise RuntimeError("actual Matrix plan exceeds approved 52 requests")
    atomic_json(MATRIX_STATE / "plan.json", plan)
    manifest_path = MATRIX_STATE / "manifest.json"
    manifest = read_json(manifest_path) if manifest_path.is_file() else {
        "status": "planned", "profile": PROFILE, "planFingerprint": plan["planFingerprint"],
        "batches": {}, "upstreamRequestCount": 0, "cacheHitCount": 0, "retryCount": 0,
    }
    if manifest.get("planFingerprint") != plan["planFingerprint"]:
        raise RuntimeError("Matrix checkpoint fingerprint changed")
    already_used = int(manifest.get("upstreamRequestCount", 0))
    network = BudgetedClient("matrix", "/v2/matrix/cycling-regular", approved - already_used)
    observer = QuotaObserver()
    adapter = OrsMatrixAdapter(settings(UPSTREAM_CACHE), client=network, quota_observer=observer, profile=PROFILE)
    center_model = Center(lon=114.296944, lat=30.546944, id="wuhan-huanghelou", label="武汉·黄鹤楼")
    spatial_by_id = {item["poiId"]: item["ringId"] for item in poi_result["pois"]}
    try:
        for batch in plan["batches"]:
            result_path = MATRIX_STATE / "batches" / f"{batch['batchId']}.json"
            if result_path.is_file():
                manifest["batches"][batch["batchId"]] = {"status": "cache-hit", "destinationCount": batch["destinationCount"]}
                continue
            pois_by_id = {item["poiId"]: item for item in poi_result["pois"]}
            batch_pois = [Poi(**{**pois_by_id[poi_id], "travelTimeSeconds": None}) for poi_id in batch["poiIds"]]
            before = network.actual
            computation = await adapter.calculate(
                center=center_model,
                pois=batch_pois,
                analysis_run_id="analysis-stage29-cycling-live",
                spatial_band_by_id=spatial_by_id,
            )
            record = {
                "batch": {key: value for key, value in batch.items() if key != "requestBody"},
                "accessibility": [item.model_dump(mode="json") for item in computation.accessibility],
                "metadata": computation.metadata,
            }
            atomic_json(result_path, record)
            manifest["batches"][batch["batchId"]] = {
                "status": "completed" if network.actual > before else "cache-hit",
                "destinationCount": batch["destinationCount"],
                "adapterMatrixBatchId": computation.metadata.get("matrixBatchId"),
            }
            manifest["upstreamRequestCount"] = already_used + network.actual
            manifest["cacheHitCount"] = sum(item["status"] == "cache-hit" for item in manifest["batches"].values())
            manifest["lastQuota"] = computation.metadata.get("apiQuota") or manifest.get("lastQuota")
            atomic_json(manifest_path, manifest)
        accessibility = []
        for batch in plan["batches"]:
            record = read_json(MATRIX_STATE / "batches" / f"{batch['batchId']}.json")
            if [item["poiId"] for item in record["accessibility"]] != batch["poiIds"]:
                raise RuntimeError("Matrix POI order mismatch")
            accessibility.extend(record["accessibility"])
        if len(accessibility) != len(poi_result["pois"]):
            raise RuntimeError("Matrix destination conservation failed")
        counts = Counter(item["matrixStatus"] for item in accessibility)
        visible = Counter(item["matrixBandId"] for item in accessibility if item["matrixStatus"] == "ok" and item["matrixBandId"] in {"ring-0-10", "ring-10-20", "ring-20-30"})
        out_of_range = sum(item["matrixStatus"] == "ok" and item["matrixBandId"] == "matrix-out-of-range" for item in accessibility)
        summary = {
            "destinationCount": len(accessibility),
            "batchSize": plan["batchSize"],
            "batchCount": plan["batchCount"],
            "ok": counts["ok"],
            "null": counts["unreachable"],
            "invalid": counts["invalid"],
            "outOfRange": out_of_range,
            "withinRange": sum(visible.values()),
            "ringCounts": {ring: visible[ring] for ring in ("ring-0-10", "ring-10-20", "ring-20-30")},
            "countConserved": counts["ok"] + counts["unreachable"] + counts["invalid"] == len(accessibility),
            "resultFingerprint": sha256_json([[item["poiId"], item["travelTimeSeconds"], item["networkDistanceMeters"], item["matrixBandId"], item["matrixStatus"]] for item in accessibility]),
        }
        manifest["status"] = "completed"
        manifest["upstreamRequestCount"] = already_used + network.actual
        manifest["cacheHitCount"] = sum(item["status"] == "cache-hit" for item in manifest["batches"].values())
        manifest["summary"] = summary
        atomic_json(manifest_path, manifest)
        atomic_json(STATE_ROOT / "cycling-matrix-complete.json", {"status": "completed", "plan": {key: value for key, value in plan.items() if key != "batches"}, "accessibility": accessibility, "summary": summary, "manifest": manifest})
        return {"status": "completed", "summary": summary, "requestAccounting": {"approved": approved, "actual": manifest["upstreamRequestCount"], "cacheHits": manifest["cacheHitCount"], "retries": manifest["retryCount"], "remainingApproved": approved - manifest["upstreamRequestCount"], "statuses": dict(network.statuses)}, "quota": manifest.get("lastQuota")}
    finally:
        await network.aclose()


def distribution(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"min": None, "median": None, "p90": None, "max": None}
    ordered = sorted(values)
    return {"min": round(ordered[0], 3), "median": round(float(median(ordered)), 3), "p90": round(ordered[max(0, math.ceil(len(ordered) * 0.9) - 1)], 3), "max": round(ordered[-1], 3)}


def assemble() -> dict[str, Any]:
    approval, plans, caches = validate_approval()
    poi_result = read_json(STATE_ROOT / "cycling-pois-complete.json")
    matrix_result = read_json(STATE_ROOT / "cycling-matrix-complete.json")
    accessibility = matrix_result["accessibility"]
    summary = matrix_result["summary"]
    by_id = {item["poiId"]: item for item in accessibility}
    pois = []
    for item in poi_result["pois"]:
        access = by_id[item["poiId"]]
        pois.append({
            **item,
            "datasetId": None,
            # Keep exact fractional seconds in accessibility; the legacy Poi field is integer-only.
            "travelTimeSeconds": None,
            "ringId": access["matrixBandId"] or "matrix-unreachable-or-invalid",
            "confidence": None,
            "address": None,
            "importance": None,
        })
    features = sorted(caches[PROFILE][1]["payload"]["features"], key=lambda item: int(item["properties"]["value"]))
    isochrones = [{"isochroneId": f"isochrone-{int(item['properties']['value']) // 60}", "rangeMinutes": int(item["properties"]["value"]) // 60, "rangeSeconds": int(item["properties"]["value"]), "geometry": item["geometry"]} for item in features]
    rings = poi_result["rings"]
    for ring in rings:
        ring["statistics"] = {"poiCount": int(summary["ringCounts"].get(ring["ringId"], 0))}
    bands = [{"ringId": ring["ringId"], "label": f"{ring['innerRangeMinutes']}–{ring['outerRangeMinutes']} 分钟", "poiIds": [item["poiId"] for item in pois if item["ringId"] == ring["ringId"]]} for ring in rings]
    durations = [float(item["travelTimeSeconds"]) for item in accessibility if item["matrixStatus"] == "ok" and item["travelTimeSeconds"] is not None]
    distances = [float(item["networkDistanceMeters"]) for item in accessibility if item["matrixStatus"] == "ok" and item["networkDistanceMeters"] is not None]
    latest = latest_quota(records())
    poi_quota = poi_result.get("quota") or latest["pois"]
    matrix_quota = matrix_result.get("manifest", {}).get("lastQuota") or latest["matrix"]
    result = {
        "schemaVersion": "1.0",
        "analysisId": "analysis-stage29-cycling-live",
        "status": "completed",
        "center": {"lon": 114.296944, "lat": 30.546944, "crs": "EPSG:4326", "label": "武汉·黄鹤楼", "id": "wuhan-huanghelou", "source": "preset", "accuracyMeters": None},
        "profile": PROFILE,
        "rangesMinutes": [10, 20, 30],
        "cumulativeIsochrones": isochrones,
        "rings": rings,
        "pois": pois,
        "accessibility": accessibility,
        "categories": [],
        "nameCloud": {
            "mode": "unclassified-poi-name-cloud",
            "stats": {
                "rawPoiCount": poi_result["stats"]["rawFeatureCount"],
                "parsedPoiCount": poi_result["stats"]["namedFeatureCountBeforeMerge"],
                "namedPoiCount": poi_result["stats"]["namedFeatureCountBeforeMerge"],
                "unnamedCount": poi_result["stats"]["rawFeatureCount"] - poi_result["stats"]["namedFeatureCountBeforeMerge"],
                "deduplicatedPoiCount": len(pois),
                "outsideCount": poi_result["stats"]["outsideCount"],
                "bandCounts": summary["ringCounts"],
                "placedCount": 0,
                "unplacedCount": summary["withinRange"],
            },
            "bands": bands,
        },
        "metadata": {
            "source": "mixed",
            "sources": {"isochrones": "ors-public-api", "pois": "ors-openpoiservice"},
            "generatedAt": utc_now(),
            "requestId": "stage29-cycling-approved-live",
            "warnings": [
                "骑行真实任务严格绑定第29号批准 fingerprint 与 POI/Matrix 预算。",
                "POI 标签云不按 taxonomy 分类；字号仅编码 Matrix 时间，不表示重要性。",
                "POI 圈层按 ORS Matrix 路网估算时间判定；不是实时交通真值。",
                "驾车本轮明确未批准，未执行任何驾车 POI 或 Matrix 请求。",
            ],
            "poiDataset": None,
            "poiSelection": {"matchedCount": len(pois), "returnedCount": len(pois), "truncated": False, "strategy": "stage29-approved-spatial-batch", "spatialMethod": "non-overlapping-grid-intersection", "travelTimesCalculated": True, "bandAssignmentMethod": "matrix-duration"},
            "taxonomy": None,
            "poiProvider": "ors_remote",
            "poiCoverage": {"strategy": "stage-6-spatial-batch-v1", "cells": plans[PROFILE]["pieceCount"], "requests": poi_result["requestAccounting"]["actual"], "cacheHits": poi_result["requestAccounting"]["cacheHits"], "complete": True, "fullyCovered": True, "outerRangeMinutes": 30, "outerRangeSeconds": 1800, "rawPoiCount": poi_result["stats"]["rawFeatureCount"], "parsedPoiCount": poi_result["stats"]["namedFeatureCountBeforeMerge"], "deduplicatedPoiCount": len(pois), "resultLimit": 2000, "resultTruncated": False, "mode": "approved-spatial-pieces", "areaKm2": plans[PROFILE]["outerAreaKm2"], "spatiallyCovered": True, "datasetCompleteness": "unknown"},
            "rateLimit": poi_quota,
            "attribution": ["OpenRouteService OpenPOIService", "© OpenStreetMap contributors"],
            "isochroneProvider": "ors-public-api",
            "isLive": True,
            "cacheHit": False,
            "featureCount": 3,
            "profile": PROFILE,
            "rangesSeconds": [600, 1200, 1800],
            "apiQuota": {"services": {"isochrones": latest["isochrones"], "pois": poi_quota, "matrix": matrix_quota, "geocoder": latest["geocoder"]}},
            "panmapMode": "unclassified-poi-name-cloud",
            "matrix": {
                "requestedPoiCount": summary["destinationCount"],
                "matrixOkCount": summary["ok"],
                "matrixNullCount": summary["null"],
                "matrixInvalidCount": summary["invalid"],
                "matrixOutOfRangeCount": summary["outOfRange"],
                "matrixWithinRangeCount": summary["withinRange"],
                "matrixBandCounts": summary["ringCounts"],
                "durationSeconds": distribution(durations),
                "distanceMeters": distribution(distances),
                "resultFingerprint": summary["resultFingerprint"],
                "provider": "ors-public-api",
                "profile": PROFILE,
                "metrics": ["duration", "distance"],
                "units": "m",
                "batchCount": summary["batchCount"],
                "cacheHits": matrix_result["manifest"]["cacheHitCount"],
                "upstreamRequestCount": matrix_result["manifest"]["upstreamRequestCount"],
            },
        },
    }
    AnalysisResult(**result)
    atomic_json(OUTPUT, result)
    foot = read_json(FOOT_BASELINE)
    foot_ok = foot.get("profile") == "foot-walking" and len(foot.get("pois") or []) == 282 and len(foot.get("accessibility") or []) == 282 and foot.get("metadata", {}).get("matrix", {}).get("upstreamRequestCount") == 0
    evidence = {
        "status": "partial",
        "generatedAt": utc_now(),
        "profiles": {
            "foot-walking": {"status": "cache-complete", "poiCount": 282, "matrixDestinations": 282, "actualUpstreamRequests": {"isochrones": 0, "pois": 0, "matrix": 0, "geocoder": 0}, "consistent": foot_ok},
            PROFILE: {"status": "completed", "planFingerprint": plans[PROFILE]["planFingerprint"], "poi": poi_result["stats"], "matrix": summary, "poiRequests": poi_result["requestAccounting"], "matrixRequests": {"approved": approval["profiles"][PROFILE]["approvedMatrixRequests"], "actual": matrix_result["manifest"]["upstreamRequestCount"], "cacheHits": matrix_result["manifest"]["cacheHitCount"], "retries": matrix_result["manifest"]["retryCount"], "remainingApproved": approval["profiles"][PROFILE]["approvedMatrixRequests"] - matrix_result["manifest"]["upstreamRequestCount"]}},
            "driving-car": {"status": "awaiting-approval", "reason": "explicitly-unapproved-not-budget-error", "actualUpstreamRequests": {"isochrones": 0, "pois": 0, "matrix": 0, "geocoder": 0}},
        },
        "stoppedAfterProfile": PROFILE,
        "drivingScheduled": False,
        "result": str(OUTPUT.relative_to(ROOT)),
    }
    atomic_json(EVIDENCE, evidence)
    return evidence


async def replay() -> dict[str, Any]:
    approval, plans, caches = validate_approval()
    no_network = NoNetworkClient()
    iso_adapter = OrsAdapter(settings(CYCLING_ISO_CACHE), client=no_network)
    from scripts.build_stage29_live_request_plan import request_for
    isochrones = await iso_adapter.create_isochrones(request_for(PROFILE))
    manifest = PoiBatchJobStore(POI_STATE).load(f"poi-job-{plans[PROFILE]['planFingerprint'][:24]}")
    poi_hits = 0
    poi_client = OrsPoiClient(settings(UPSTREAM_CACHE), client=no_network)
    for piece in manifest["pieces"]:
        if piece.get("status") == "superseded-by-children":
            continue
        _, metadata = await poi_client.query(poi_body(piece))
        if metadata.get("cache") == "hit":
            poi_hits += 1
    poi_result = read_json(STATE_ROOT / "cycling-pois-complete.json")
    matrix_plan = read_json(MATRIX_STATE / "plan.json")
    center = Center(lon=114.296944, lat=30.546944, id="wuhan-huanghelou", label="武汉·黄鹤楼")
    pois_by_id = {item["poiId"]: item for item in poi_result["pois"]}
    spatial = {item["poiId"]: item["ringId"] for item in poi_result["pois"]}
    matrix_hits = 0
    matrix_adapter = OrsMatrixAdapter(settings(UPSTREAM_CACHE), client=no_network, profile=PROFILE)
    for batch in matrix_plan["batches"]:
        batch_pois = [Poi(**{**pois_by_id[poi_id], "travelTimeSeconds": None}) for poi_id in batch["poiIds"]]
        computation = await matrix_adapter.calculate(center=center, pois=batch_pois, analysis_run_id="analysis-stage29-cycling-replay", spatial_band_by_id=spatial)
        if computation.metadata.get("cache") == "hit" and computation.metadata.get("upstreamRequestCount") == 0:
            matrix_hits += 1
    result = {
        "status": "completed",
        "sameParameters": True,
        "cacheHits": {"isochrones": 1 if iso_adapter.last_cache_hit else 0, "poiPieces": poi_hits, "matrixBatches": matrix_hits},
        "actualUpstreamRequests": {"isochrones": no_network.actual, "pois": 0, "matrix": 0, "geocoder": 0},
        "allUpstreamZero": no_network.actual == 0,
        "resultFingerprint": read_json(STATE_ROOT / "cycling-matrix-complete.json")["summary"]["resultFingerprint"],
        "replayedAt": utc_now(),
    }
    if len(isochrones) != 3 or poi_hits != sum(piece.get("status") != "superseded-by-children" for piece in manifest["pieces"]) or matrix_hits != matrix_plan["batchCount"] or not result["allUpstreamZero"]:
        raise RuntimeError("cache replay did not prove zero upstream")
    atomic_json(REPLAY_EVIDENCE, result)
    return result


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True, choices=("pois", "matrix", "assemble", "replay", "validate"))
    args = parser.parse_args()
    if args.phase == "validate":
        approval, plans, _ = validate_approval()
        result = {"status": "validated", "fingerprints": {profile: plans[profile]["planFingerprint"] for profile in PROFILES}, "drivingApproved": approval["profiles"]["driving-car"]["approvedPoiRequests"] > 0}
    elif args.phase == "pois":
        result = await run_pois()
    elif args.phase == "matrix":
        result = await run_matrix()
    elif args.phase == "assemble":
        result = assemble()
    else:
        result = await replay()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
