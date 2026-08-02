"""Build Stage 23 planning evidence from local caches and synthetic fixtures only."""

import hashlib
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, box, mapping

from app.services.poi_batch_planner import build_poi_query_plan, public_plan
from app.services.projection import UTMProjector


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "exports/stage-6-batch-planner/stage23-dry-run-plans.json"
CACHE_ROOT = ROOT / "data/generated/ors-cache"
CENTER = (114.296944, 30.546944)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cached_isochrones():
    records = {}
    for path in sorted(CACHE_ROOT.rglob("*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if record.get("endpointType") != "isochrone":
            continue
        endpoint = str(record.get("endpoint") or "")
        profile = endpoint.rsplit("/", 1)[-1]
        request = record.get("request") or {}
        if request.get("locations") != [[CENTER[0], CENTER[1]]] or request.get("range") != [600, 1200, 1800]:
            continue
        records.setdefault(profile, (path, record))
    return records


def outer_geometry(record):
    features = record["payload"]["features"]
    feature = max(features, key=lambda item: int((item.get("properties") or {}).get("value", 0)))
    assert int(feature["properties"]["value"]) == 1800
    return feature["geometry"]


def request_for(profile, geometry, budget=20):
    return {
        "center": {"longitude": CENTER[0], "latitude": CENTER[1]},
        "profile": profile, "rangesSeconds": [600, 1200, 1800], "outerGeometry": geometry,
        "poiFilter": None, "provider": "openpoiservice",
        "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000},
        "plannerConfig": {
            "targetPieceAreaKm2": 35, "maxSubdivisionDepth": 4,
            "minPieceAreaKm2": 0.1, "requestBudget": budget,
        },
    }


def synthetic_box(area_km2, offset_x=0, offset_y=0):
    projector = UTMProjector.for_lon_lat(*CENTER)
    x, y = projector.forward(*CENTER)
    side = (area_km2 * 1_000_000) ** 0.5
    return projector.unproject(box(x + offset_x - side / 2, y + offset_y - side / 2, x + offset_x + side / 2, y + offset_y + side / 2))


def compact(plan):
    return {
        "planId": plan["planId"], "planFingerprint": plan["planFingerprint"],
        "outerAreaKm2": plan["outerAreaKm2"], "strategy": plan["strategy"],
        "pieceCount": plan["pieceCount"], "minimumRequests": plan["estimatedMinimumPoiRequests"],
        "adaptiveReserve": plan["reservedAdaptiveRequests"], "maximumApprovedRequests": plan["estimatedMaximumApprovedRequests"],
        "requestBudget": plan["requestBudget"], "budgetStatus": plan["budgetStatus"],
        "maxPieceAreaKm2": max(piece["areaKm2"] for piece in plan["pieces"]),
        "minPieceAreaKm2": min(piece["areaKm2"] for piece in plan["pieces"]),
        "coverage": plan["coverage"], "upstreamRequestCount": plan["upstreamRequestCount"],
    }


def main():
    caches = cached_isochrones()
    profiles = {}
    for profile in ("foot-walking", "cycling-regular", "driving-car"):
        cached = caches.get(profile)
        if cached is None:
            profiles[profile] = {
                "status": "N/A", "sourceType": "missing-real-cache",
                "reason": "No matching Huanghelou 600/1200/1800 ORS cache; network retrieval forbidden.",
                "upstreamRequestCount": 0,
            }
            continue
        path, record = cached
        plan = build_poi_query_plan(request_for(profile, outer_geometry(record)))
        repeated = build_poi_query_plan(request_for(profile, outer_geometry(record)))
        assert plan["planFingerprint"] == repeated["planFingerprint"]
        profiles[profile] = {
            "status": "planned", "sourceType": "real-ors-cache-geometry",
            "sourcePath": str(path.relative_to(ROOT)), "sourceSha256": sha256(path),
            "retrievedAt": record.get("retrievedAt"), "endpoint": record.get("endpoint"),
            "plan": compact(plan), "publicPlan": public_plan(plan),
        }

    multi = MultiPolygon([synthetic_box(20, -7000), synthetic_box(20, 7000)])
    large = synthetic_box(120)
    hole = synthetic_box(5)
    donut = Polygon(large.exterior.coords, [hole.exterior.coords])
    fixtures = {}
    for name, geometry in {
        "boundary-45km2": synthetic_box(45),
        "boundary-45.1km2": synthetic_box(45.1),
        "multipolygon-40km2": multi,
        "complex-hole-115km2": donut,
    }.items():
        plan = build_poi_query_plan(request_for("driving-car", mapping(geometry)))
        fixtures[name] = {"sourceType": "synthetic-local-projected-fixture", "plan": compact(plan)}

    evidence = {
        "stage": 23, "generatedAt": "2026-08-01", "mode": "dry-run-only",
        "upstreamApiBudget": {"isochrones": 0, "pois": 0, "matrix": 0, "geocoder": 0},
        "upstreamRequestCount": 0, "profiles": profiles, "syntheticFixtures": fixtures,
        "sourceDifference": {
            "realCache": "Previously persisted ORS FeatureCollection outer polygon; no HTTP call.",
            "syntheticFixture": "Locally constructed projected polygons used only for boundary and topology tests.",
        },
    }
    assert all(item.get("upstreamRequestCount", item.get("plan", {}).get("upstreamRequestCount", 0)) == 0 for item in profiles.values())
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT.relative_to(ROOT)), "sha256": sha256(OUTPUT),
        "profiles": {key: (value.get("plan") or {}).get("pieceCount", value["status"]) for key, value in profiles.items()},
        "upstreamRequestCount": 0,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
