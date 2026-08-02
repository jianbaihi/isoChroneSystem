"""Build Stage 25 evidence from local cache baselines and synthetic fixtures only."""

import hashlib
import json
from pathlib import Path

from app.services.multimode_orchestration import (
    build_matrix_batch_plan,
    matrix_batch_count,
    merge_matrix_batches,
    parse_matrix_batch_result,
    prepare_all_profiles,
)


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "exports/stage-6-layout/stage20-cache-baseline.json"
STAGE23 = ROOT / "exports/stage-6-batch-planner/stage23-dry-run-plans.json"
OUTPUT = ROOT / "exports/stage-6-multimode/stage25-zero-api-evidence.json"
CENTER = {"lon": 114.296944, "lat": 30.546944}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def synthetic_pois(profile, count):
    return [
        {"poiId": f"fixture:{profile}:{index:04d}", "location": {"lon": 114.29 + index * 0.000001, "lat": 30.54}}
        for index in range(count)
    ]


def fixture_matrix(profile, count, durations):
    plan = build_matrix_batch_plan(profile, CENTER, synthetic_pois(profile, count))
    results = {}
    cursor = 0
    for batch in plan["batches"]:
        size = batch["destinationCount"]
        batch_durations = durations[cursor:cursor + size]
        payload = {"durations": [batch_durations], "distances": [[float(index + 100) for index in range(size)]]}
        results[batch["batchId"]] = parse_matrix_batch_result(batch, payload)
        batch["status"] = "completed"
        cursor += size
    merged = merge_matrix_batches(profile, plan, results)
    return {
        "sourceType": "synthetic-orchestration-fixture-not-wuhan-live-data",
        "planFingerprint": plan["planFingerprint"],
        "batchCount": plan["batchCount"],
        "summary": merged["summary"],
        "publishable": merged["publishable"],
        "upstreamRequestCount": 0,
    }


def main():
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    stage23 = json.loads(STAGE23.read_text(encoding="utf-8"))
    walking_pois = [
        {"poiId": poi["poiId"], "location": {"lon": poi["location"]["lon"], "lat": poi["location"]["lat"]}}
        for poi in baseline["pois"]
    ]
    walking_plan = build_matrix_batch_plan("foot-walking", CENTER, walking_pois)
    prepare = prepare_all_profiles({
        "foot-walking": {
            "outerGeometryAvailable": True, "minimumPoiRequests": 1, "adaptiveReserve": 1,
            "minimumMatrixRequests": walking_plan["minimumMatrixRequests"],
            "planFingerprint": stage23["profiles"]["foot-walking"]["plan"]["planFingerprint"],
        },
        "cycling-regular": {
            "status": "N/A", "outerGeometryAvailable": False,
            "reason": "No matching real cache; no network retrieval.",
        },
        "driving-car": {
            "outerGeometryAvailable": True, "minimumPoiRequests": 108, "adaptiveReserve": 27,
            "budgetStatus": "approval-required",
            "planFingerprint": stage23["profiles"]["driving-car"]["plan"]["planFingerprint"],
        },
    })
    boundaries = {str(count): matrix_batch_count(count) for count in (0, 1, 499, 500, 501, 1000, 3501)}
    evidence = {
        "stage": 25,
        "generatedAt": "2026-08-01",
        "mode": "offline-cache-and-fixture-only",
        "executionOrder": [
            "profile-specific isochrone", "profile-specific outer geometry", "POI query plan",
            "POI leaf-piece acquisition", "POI merge and deduplication",
            "same-profile Matrix batches", "matrix-based ring assignment", "profile layout-ready",
        ],
        "realCacheBaseline": {
            "profile": "foot-walking", "sourceType": "existing-real-cache-derived-stage20-baseline",
            "sourcePath": str(BASELINE.relative_to(ROOT)), "sourceSha256": sha256(BASELINE),
            "destinationCount": len(walking_pois), "matrixBatchCount": walking_plan["batchCount"],
            "matrixPlanFingerprint": walking_plan["planFingerprint"], "upstreamRequestCount": 0,
        },
        "profileFixtures": {
            "cycling-regular": fixture_matrix("cycling-regular", 3, [500.0, 1100.0, None]),
            "driving-car": fixture_matrix("driving-car", 3, [700.0, 1700.0, 2000.0]),
        },
        "prepareAll": prepare,
        "matrixBoundaryBatchCounts": boundaries,
        "unsupportedModes": {
            mode: {"enabled": False, "reason": "当前数据源不支持"}
            for mode in ("bus", "subway", "train", "high-speed-rail", "airplane")
        },
        "upstreamApiBudget": {"isochrones": 0, "pois": 0, "matrix": 0, "geocoder": 0},
        "upstreamRequestCount": {"isochrones": 0, "pois": 0, "matrix": 0, "geocoder": 0, "total": 0},
        "sourceDisclosure": {
            "realCache": "Only the persisted Stage 20 walking baseline is real cached Wuhan-derived data.",
            "fixtures": "Cycling and driving Matrix summaries are synthetic orchestration fixtures and are not Wuhan live results.",
            "driving": "Existing real cached outer geometry is plan-only; 108/135 POI budget remains approval-required and unexecuted.",
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT.relative_to(ROOT)), "sha256": sha256(OUTPUT),
        "matrixBoundaryBatchCounts": boundaries, "walkingBatchCount": walking_plan["batchCount"],
        "prepareFingerprint": prepare["fingerprint"], "upstreamRequestCount": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

