#!/usr/bin/env python3
"""Build the Stage 55 blocked preflight evidence without contacting providers."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from app.services.poi_batch_planner import build_poi_query_plan, public_plan
from app.services.projection import UTMProjector
from shapely.geometry import shape


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exports" / "stage-11-driving-live"
CACHE = ROOT / "data" / "generated" / "ors-cache" / "stage-5-live-validation" / "20260730T020216Z-be95b0fa" / "e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json"
CENTER = {"longitude": 114.296944, "latitude": 30.546944, "label": "武汉·黄鹤楼"}
RANGES = [600, 1200, 1800]


def dump(name: str, value: object) -> None:
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def area_km2(geometry: dict) -> float:
    parsed = shape(geometry)
    point = parsed.representative_point()
    projector = UTMProjector.for_lon_lat(point.x, point.y)
    return round(float(projector.project(parsed).area) / 1_000_000, 6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cached = json.loads(CACHE.read_text(encoding="utf-8"))
    features = cached["payload"]["features"]
    ordered = sorted(features, key=lambda feature: feature["properties"]["value"])
    outer = ordered[-1]["geometry"]
    plan = build_poi_query_plan({
        "profile": "driving-car",
        "center": CENTER,
        "rangesSeconds": RANGES,
        "outerGeometry": outer,
        "provider": "openpoiservice",
        "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000},
        "plannerConfig": {
            "targetPieceAreaKm2": 45,
            "maxSubdivisionDepth": 8,
            "minPieceAreaKm2": 0.1,
            "requestBudget": 48,
            "adaptiveReserveRatio": 0,
            "safePieceAreaKm2": 45,
        },
    })
    plan["stage"] = 55
    plan["status"] = "blocked-needs-decision"
    plan["blockingReason"] = "estimatedMinimumPoiRequests_exceeds_approved_48_before_any_poi_request"
    plan["requestBudgetPolicy"] = {
        "approvedPoiRequests": 48,
        "estimatedMinimumPoiRequests": plan["estimatedMinimumPoiRequests"],
        "adaptiveReserveUsedForGate": 0,
        "estimatedMaximumApprovedRequests": plan["estimatedMaximumApprovedRequests"],
        "gate": "blocked",
    }
    dump("driving-poi-query-plan.json", plan)

    isochrones = {
        "stage": 55,
        "profile": "driving-car",
        "center": CENTER,
        "rangesSeconds": RANGES,
        "source": "existing-real-ORS-cache",
        "cacheHit": True,
        "newUpstreamRequests": 0,
        "cachePath": str(CACHE.relative_to(ROOT)),
        "cacheSha256": hashlib.sha256(CACHE.read_bytes()).hexdigest(),
        "retrievedAt": cached["retrievedAt"],
        "request": cached["request"],
        "rings": [{
            "rangeSeconds": int(feature["properties"]["value"]),
            "geometryType": feature["geometry"]["type"],
            "areaKm2": area_km2(feature["geometry"]),
        } for feature in ordered],
        "outerGeometryHash": plan["outerGeometryHash"],
        "status": "validated-cache-only",
    }
    dump("stage55-driving-isochrones.json", isochrones)

    blocked = {
        "stage": 55,
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "blocked-needs-decision",
        "profile": "driving-car",
        "reason": "POI plan requires 93 initial Polygon pieces at the frozen <=45 km² safety limit; Stage 55 authorizes at most 48 POI upstream requests.",
        "noExecutionPerformed": True,
        "planFingerprint": plan["planFingerprint"],
        "plan": public_plan(plan),
        "upstreamRequestLedger": {service: {"attempted": 0, "cacheHits": 0, "upstreamRequests": 0, "retries": 0} for service in ("isochrones", "pois", "matrix", "geocoder", "directions")},
        "note": "The isochrone cache validation is a local file read and is not an upstream request.",
    }
    dump("request-ledger.json", blocked)
    dump("driving-poi-coverage.json", {
        "stage": 55,
        "status": "not-executed-blocked-before-poi",
        "outerGeometryHash": plan["outerGeometryHash"],
        "coverage": plan["coverage"],
        "pieces": plan["pieceCount"],
        "raw": 0, "parsed": 0, "named": 0, "missingName": 0,
        "invalid": 0, "outside": 0, "deduplicated": 0,
        "reason": blocked["reason"],
    })
    dump("driving-matrix-batch-plan.json", {
        "stage": 55, "profile": "driving-car", "status": "not-planned-blocked-before-poi",
        "destinationCount": None, "batchSize": 500, "estimatedBatches": None,
        "approvedMaximumBatches": 40, "concurrency": 1,
        "reason": "Candidate POIs cannot be obtained until the POI planning budget gate is resolved.",
    })
    dump("driving-matrix-summary.json", {
        "stage": 55, "profile": "driving-car", "status": "not-executed-blocked-before-poi",
        "ok": 0, "null": 0, "invalid": 0, "outOfRange": 0,
        "matrixRequests": 0,
    })
    dump("driving-published-result-summary.json", {
        "stage": 55, "profile": "driving-car", "status": "not-published",
        "publishedResultSchemaVersion": None,
        "reason": "No complete, non-truncated POI and Matrix dataset exists because the pre-request POI budget gate blocked execution.",
    })
    dump("driving-display-count-semantics.json", {
        "stage": 55, "profile": "driving-car", "status": "not-available-not-published",
        "totalPois": 0, "eligiblePois": 0, "selectedForLayout": 0,
        "renderedLabelDomNodes": 0, "statusBadgeNumerator": 0,
        "statusBadgeDenominator": 0, "statusBadgeMeaning": "No driving result was published.",
        "displayDensityPreset": "not-applicable",
    })
    dump("driving-ordinary-research-state.json", {
        "stage": 55, "profile": "driving-car", "status": "not-executed-blocked-before-publish",
        "ordinary": None, "research": None,
        "reason": "Browser acceptance is intentionally not run without a complete published driving result.",
    })
    dump("transport-three-profile-roundtrip.json", {
        "stage": 55, "status": "not-executed-blocked-before-driving-publish",
        "reason": "The required driving result does not exist; cycling and walking frozen caches were not touched.",
    })
    dump("driving-cache-rerun.json", {
        "stage": 55, "status": "not-executed-no-complete-driving-cache",
        "reason": "A zero-upstream rerun may only be tested after a complete driving result has been published.",
    })
    dump("zero-upstream-rerun.json", {
        "stage": 55, "status": "not-executed-no-complete-driving-cache",
        "upstreamRequests": {"isochrones": None, "pois": None, "matrix": None, "geocoder": None, "directions": None},
    })
    dump("test-summary.json", {
        "stage": 55,
        "status": "preflight-only",
        "checks": [
            {"name": "cached-driving-isochrone-parse", "status": "passed"},
            {"name": "current-45km2-polygon-plan-and-coverage-audit", "status": "passed"},
            {"name": "stage55-budget-gate", "status": "blocked-as-designed"},
            {"name": "node --check app.js", "status": "passed"},
            {"name": "PYTHONPATH=server server/.venv/bin/python -m unittest server.tests.test_poi_batch_planner", "status": "passed", "tests": 11},
            {"name": "git diff --check", "status": "passed"},
        ],
        "notRun": [
            "node --test src/**/*.test.js",
            "PYTHONPATH=server server/.venv/bin/python -m unittest discover -s server/tests -p test_*.py",
            "browser acceptance",
        ],
        "reason": "The Stage 55 document requires stopping before any POI request when the estimated plan exceeds the approved 48-request limit; no Stage 55 implementation was authorized after that gate failed.",
    })
    dump("screenshot-sha256.json", {
        "stage": 55,
        "status": "not-captured-blocked-before-browser-acceptance",
        "screenshots": [],
        "reason": "No unpublished driving data is shown as a browser acceptance result. Stage 53 archived PNG verification is recorded separately in stage53-screenshot-hash-correction.md.",
    })


if __name__ == "__main__":
    main()
