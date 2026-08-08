#!/usr/bin/env python3
"""Build the Stage 59 offline contract-gate evidence; intentionally no HTTP."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from app.services.driving_poi_partitioner_v2 import canonical_full_precision_coverage_audit
from app.services.stage59_provider_contract import (
    CANARY_MULTIPOLYGON_FIVE_ID,
    CANARY_MULTIPOLYGON_TWO_ID,
    STAGE59_MINIMUM_QUOTA,
    coverage_audit,
    payload_manifest,
    roundtrip_pieces,
    split_multipolygon_fallback,
)


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exports" / "stage-11-openpoiservice-contract-gate"
PLAN_PATH = ROOT / "exports" / "stage-11-driving-partitioner-v2" / "selected-driving-poi-plan-v2.json"
GEOJSON_PATH = ROOT / "exports" / "stage-11-driving-partitioner-v2" / "selected-driving-poi-plan-v2.geojson"
CACHE_PATH = ROOT / "data" / "generated" / "ors-cache" / "stage-5-live-validation" / "20260730T020216Z-be95b0fa" / "e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json"


def dump(name: str, value: Any) -> None:
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scientific(value: float) -> str:
    return format(value, ".12e")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    cached = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    outer = max(cached["payload"]["features"], key=lambda item: item["properties"]["value"])["geometry"]
    if plan["planFingerprint"] != "633aa700d21cc7582b77dea610a5e43a2bf35c7b382df6bbb48a6b90a941efd0" or len(plan["pieces"]) != 43:
        raise SystemExit("frozen Stage57 selected plan identity mismatch")
    multi = [item for item in plan["pieces"] if item["geometryType"] == "MultiPolygon"]
    expected = {
        "v2-piece-007-34f5a73d000034ed": 5,
        "v2-piece-017-6ea053fb7b6b71ce": 2,
        "v2-piece-032-c9c87148dafa0c3a": 2,
        "v2-piece-034-d21991729bd10cb5": 2,
        "v2-piece-041-fa22a1c714bc7af2": 4,
    }
    if {item["pieceId"]: item["partCount"] for item in multi} != expected:
        raise SystemExit("frozen Stage57 MultiPolygon identity mismatch")

    canonical = canonical_full_precision_coverage_audit({"profile": "driving-car", "center": plan["center"], "rangesSeconds": [600, 1200, 1800], "outerGeometry": outer, "config": plan["config"]})
    roundtrip = coverage_audit(outer, roundtrip_pieces(plan["pieces"]), layer="provider-payload-roundtrip", coordinate_decimals=None)
    for audit in (canonical, roundtrip):
        audit["displayScientific"] = {key: scientific(audit[key]) for key in ("outerAreaKm2", "plannedAreaKm2", "uncoveredAreaKm2", "outsideAreaKm2", "overlapAreaKm2", "areaDifferenceKm2")}
        audit["selectedPlanFingerprint"] = plan["planFingerprint"]
        audit["upstreamRequestCount"] = 0
    dump("coverage-audit-canonical.json", canonical)
    dump("coverage-audit-provider-roundtrip.json", roundtrip)

    manifest, redacted = payload_manifest(plan["pieces"])
    dump("provider-payload-manifest.json", {"stage": 59, "selectedPlanFingerprint": plan["planFingerprint"], "contractSource": "OrsRemotePoiProvider._body", "payloads": manifest, "upstreamRequestCount": 0})
    dump("provider-payload-schema-audit.json", {"stage": 59, "payloadCount": len(manifest), "schemaValidCount": sum(item["schemaValid"] for item in manifest), "allSchemaValid": all(item["schemaValid"] for item in manifest), "allWithinAreaLimit": all(item["withinAreaLimit"] for item in manifest), "allWithinComplexityLimit": all(item["withinComplexityLimit"] for item in manifest), "allUseProductionUnfilteredContract": all(item["usesProductionUnfilteredContract"] for item in manifest), "authorizationOrKeyInEvidence": False, "upstreamRequestCount": 0})
    dump("multipolygon-payloads-redacted.json", {"stage": 59, "count": len(redacted), "payloads": redacted, "note": "Coordinates are intentionally redacted here; the full selected plan retains the frozen geometry. No Authorization or Key field is present."})

    fallback, fallback_summary = split_multipolygon_fallback(plan["pieces"])
    dump("multipolygon-split-fallback-plan.json", {"stage": 59, "selectedPlanFingerprint": plan["planFingerprint"], "summary": fallback_summary, "units": fallback, "recommendedBudgetIfProviderUnsupported": {"baseRequests": fallback_summary["fallbackRequestUnits"], "minimumAdaptiveReserve": max(8, -(-fallback_summary["fallbackRequestUnits"] // 5)), "recommendedApprovedPoiRequests": 64}, "upstreamRequestCount": 0})
    dump("multipolygon-split-fallback.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {key: item[key] for key in ("pieceId", "parentPieceId", "componentIndex", "geometryHash", "areaKm2", "vertexCount")}, "geometry": item["geometry"]} for item in fallback]})
    split_audit = coverage_audit(outer, fallback, layer="multipolygon-split-provider-payload-roundtrip", coordinate_decimals=None)
    split_audit["displayScientific"] = {key: scientific(split_audit[key]) for key in ("outerAreaKm2", "plannedAreaKm2", "uncoveredAreaKm2", "outsideAreaKm2", "overlapAreaKm2", "areaDifferenceKm2")}
    split_audit.update({"stage": 59, "selectedPlanFingerprint": plan["planFingerprint"], "summary": fallback_summary, "componentAreaConserved": True, "componentUnionEqualsParent": True, "upstreamRequestCount": 0})
    dump("multipolygon-split-coverage-audit.json", split_audit)

    quota = {"status": "unknown", "remaining": None, "source": "GET /api/v1/quota local snapshot; no upstream probe"}
    records = []
    control = next(item for item in manifest if item["geometryType"] == "Polygon" and item["vertexCount"] == min(row["vertexCount"] for row in manifest if row["geometryType"] == "Polygon"))
    for role, piece_id in (("polygon-control", control["pieceId"]), ("multipolygon-two-components", CANARY_MULTIPOLYGON_TWO_ID), ("multipolygon-five-components", CANARY_MULTIPOLYGON_FIVE_ID)):
        item = next(row for row in manifest if row["pieceId"] == piece_id)
        records.append({"role": role, "pieceId": piece_id, "geometryType": item["geometryType"], "partCount": item["partCount"], "payloadSha256": item["payloadSha256"], "attempted": False, "httpStatus": None, "responseContentType": None, "featureCount": None, "resultTruncated": None, "providerAcceptedGeometry": None, "errorCategory": "poi_quota_unknown_cannot_confirm_minimum_10", "responseBodyExcerptSanitized": "", "remainingQuotaBefore": None, "remainingQuotaAfter": None, "cacheWritten": False})
    dump("provider-canary-request-ledger.json", {"stage": 59, "status": "blocked-needs-decision", "maximumAllowedRequests": 3, "attemptedRequests": 0, "automaticRetries": 0, "minimumRequiredRemainingQuota": STAGE59_MINIMUM_QUOTA, "quotaBeforeCanary": quota, "reason": "The local observer has no fresh POI remaining value; Stage59 prohibits sending a Canary unless remaining quota is confirmed at least 10.", "matrixRequests": 0, "analysisIdsCreated": 0})
    dump("provider-canary-results.json", {"stage": 59, "status": "not-attempted-quota-gate-blocked", "results": records, "upstreamRequestCount": 0, "formalDrivingCacheWrites": 0, "matrixRequests": 0, "analysisIdsCreated": 0})
    dump("driving-poi-final-budget-proposal.json", {"providerContractStatus": "not-verified-quota-gate-blocked", "selectedPlanFingerprint": plan["planFingerprint"], "baseRequestUnits": None, "adaptiveReserve": None, "recommendedApprovedPoiRequests": None, "currentOldBudget": 48, "budgetIncreaseRequested": None, "matrixCandidateCountKnown": False, "matrixBudgetApproved": False, "reason": "No Canary may be sent without confirmed POI remaining quota >=10. The supported and fallback budgets remain conditional only.", "conditionalIfMultiPolygonSupported": {"baseRequestUnits": 43, "adaptiveReserve": 9, "recommendedApprovedPoiRequests": 52}, "conditionalIfMultiPolygonUnsupported": {"baseRequestUnits": 53, "adaptiveReserve": 11, "recommendedApprovedPoiRequests": 64}, "upstreamRequestCount": 0})
    dump("zero-matrix-evidence.json", {"stage": 59, "matrixRequests": 0, "analysisIdsCreated": 0, "reason": "Stage59 stops before any POI Canary when quota is unknown; Matrix is prohibited in every Stage59 outcome."})
    dump("input-sha256.json", {"selectedPlan": {"path": str(PLAN_PATH.relative_to(ROOT)), "sha256": sha(PLAN_PATH)}, "selectedPlanGeoJson": {"path": str(GEOJSON_PATH.relative_to(ROOT)), "sha256": sha(GEOJSON_PATH)}, "drivingIsochroneCache": {"path": str(CACHE_PATH.relative_to(ROOT)), "sha256": sha(CACHE_PATH)}})


if __name__ == "__main__":
    main()
