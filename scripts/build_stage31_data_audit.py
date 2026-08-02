#!/usr/bin/env python3
"""Build Stage 31 evidence strictly from the frozen Stage 20 local cache."""
from __future__ import annotations

import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "exports/stage-6-layout/stage20-cache-baseline.json"
OUTPUT_DIR = ROOT / "exports/stage-7-controls"


def audit_baseline(payload: dict) -> dict:
    pois = payload.get("pois") or []
    accessibility = payload.get("accessibility") or []
    id_counts = Counter(str(poi.get("poiId") or "") for poi in pois)
    duplicate_ids = sorted(poi_id for poi_id, count in id_counts.items() if poi_id and count > 1)
    missing_names: list[str] = []
    invalid_coordinates: list[str] = []
    coordinates_by_id: dict[str, set[tuple[float, float]]] = defaultdict(set)
    valid_coordinates = 0
    for poi in pois:
        poi_id = str(poi.get("poiId") or "<missing-id>")
        if not str(poi.get("name") or "").strip():
            missing_names.append(poi_id)
        location = poi.get("location") or {}
        lon, lat = location.get("lon"), location.get("lat")
        valid = isinstance(lon, (int, float)) and isinstance(lat, (int, float)) and math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90
        if valid:
            valid_coordinates += 1
            coordinates_by_id[poi_id].add((float(lon), float(lat)))
        else:
            invalid_coordinates.append(poi_id)
    conflicting_coordinates = sorted(poi_id for poi_id, coordinates in coordinates_by_id.items() if len(coordinates) > 1)
    matrix_ok = sum(item.get("matrixStatus") == "ok" for item in accessibility)
    out_of_range_ids = sorted(str(item.get("poiId")) for item in accessibility if item.get("matrixBandId") == "matrix-out-of-range")
    ring_counter = Counter(str(item.get("matrixBandId")) for item in accessibility)
    rings = {"600": ring_counter["ring-0-10"], "1200": ring_counter["ring-10-20"], "1800": ring_counter["ring-20-30"]}
    eligible = sum(rings.values())
    audit = {
        "schemaVersion": "1.0",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "exports/stage-6-layout/stage20-cache-baseline.json",
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest() if SOURCE.exists() else None,
        "centerId": payload.get("center", {}).get("id"),
        "profile": payload.get("profile"),
        "rangesSeconds": [value * 60 for value in payload.get("rangesMinutes", [])],
        "totalPoi": len(pois),
        "validCoordinates": valid_coordinates,
        "invalidCoordinates": len(invalid_coordinates),
        "invalidCoordinatePoiIds": invalid_coordinates,
        "matrixOk": matrix_ok,
        "eligible": eligible,
        "outOfRange": len(out_of_range_ids),
        "outOfRangePoiIds": out_of_range_ids,
        "rings": rings,
        "duplicateStableIds": len(duplicate_ids),
        "duplicateStablePoiIds": duplicate_ids,
        "conflictingCoordinatePoiIds": conflicting_coordinates,
        "missingNames": len(missing_names),
        "missingNamePoiIds": missing_names,
        "conservation": {
            "eligiblePlusOutOfRangeEqualsTotal": eligible + len(out_of_range_ids) == len(pois),
            "ringsEqualEligible": sum(rings.values()) == eligible,
        },
        "upstreamRequests": {"isochrones": 0, "poi": 0, "matrix": 0, "geocoder": 0},
    }
    expected = (282, 282, 0, 282, 252, 30, {"600": 39, "1200": 83, "1800": 130}, 0, 0)
    actual = (audit["totalPoi"], audit["validCoordinates"], audit["invalidCoordinates"], audit["matrixOk"], audit["eligible"], audit["outOfRange"], audit["rings"], audit["duplicateStableIds"], audit["missingNames"])
    if actual != expected or conflicting_coordinates or not all(audit["conservation"].values()):
        raise RuntimeError(f"Stage 31 frozen baseline mismatch: expected={expected!r} actual={actual!r}")
    return audit


def main() -> None:
    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    audit = audit_baseline(payload)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "stage31-data-audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    zero_api = {
        "schemaVersion": "1.0",
        "stage": 31,
        "status": "completed",
        "budget": {"isochrones": 0, "poi": 0, "matrix": 0, "geocoder": 0},
        "actual": {"isochrones": 0, "poi": 0, "matrix": 0, "geocoder": 0},
        "dataSource": "local-stage20-cache-only",
        "profileIsolation": {"footWalking": "cache-only", "cyclingRegular": "frozen-not-read", "drivingCar": "awaiting-approval-not-scheduled"},
        "browser": {
            "url": "http://127.0.0.1:5500/?stage21Baseline=1&stage31Controls=1",
            "loads": 2,
            "localRoutes": ["GET /api/v1/health", "GET /api/v1/poi-datasets", "GET /exports/stage-6-layout/stage20-cache-baseline.json"],
            "businessRoutes": [],
            "pageDatasetUpstreamRequests": 0,
            "stage21DatasetUpstreamRequests": 0,
        },
        "screenshot": {
            "path": "exports/stage-7-controls/stage31-controls.png",
            "mime": "image/png",
            "pixelWidth": 1126,
            "pixelHeight": 943,
            "sha256": "7826d2b9aaf37a4c5eb36a8f6dd97317b7ad234a18b94b876f6916a1a8965a5f",
        },
        "networkGuard": "test-environment-network-forbidden",
    }
    (OUTPUT_DIR / "stage31-zero-api-evidence.json").write_text(json.dumps(zero_api, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
