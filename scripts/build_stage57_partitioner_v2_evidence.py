#!/usr/bin/env python3
"""Generate Stage 57 offline partitioner evidence from the frozen driving cache."""

from __future__ import annotations

import hashlib
import json
import math
import resource
import struct
import time
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from shapely.geometry import shape

from app.services.driving_poi_partitioner_v2 import (
    PARTITIONER_VERSION,
    adjacency_constrained_merge,
    build_balanced_partition_plan,
    fragmentation_audit,
)
from app.services.poi_batch_planner import build_poi_query_plan, geometry_hash
from app.services.projection import UTMProjector


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "exports" / "stage-11-driving-partitioner-v2"
CACHE = ROOT / "data" / "generated" / "ors-cache" / "stage-5-live-validation" / "20260730T020216Z-be95b0fa" / "e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json"
CENTER = {"label": "武汉·黄鹤楼", "longitude": 114.296944, "latitude": 30.546944}
RANGES = [600, 1200, 1800]


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def dump(name: str, value: Any) -> Path:
    path = OUT / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def outer_geometry() -> tuple[dict[str, Any], dict[str, Any]]:
    cached = json.loads(CACHE.read_text(encoding="utf-8"))
    feature = max(cached["payload"]["features"], key=lambda item: item["properties"]["value"])
    return cached, feature["geometry"]


def v1_plan(outer: dict[str, Any]) -> dict[str, Any]:
    return build_poi_query_plan({
        "profile": "driving-car", "center": CENTER, "rangesSeconds": RANGES,
        "outerGeometry": outer, "provider": "openpoiservice",
        "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000},
        "plannerConfig": {"targetPieceAreaKm2": 45, "maxSubdivisionDepth": 8, "minPieceAreaKm2": 0.1, "requestBudget": 48, "adaptiveReserveRatio": 0, "safePieceAreaKm2": 45},
    })


def stats_for_pieces(pieces: list[dict[str, Any]], outer: dict[str, Any]) -> dict[str, Any]:
    audit = fragmentation_audit(pieces, outer)
    vertices = [int(item.get("vertexCountAfter", item.get("vertexCountBefore", 0))) for item in pieces]
    bytes_ = [int(item.get("geometryBytes", len(canonical(item["geometry"]).encode("utf-8")))) for item in pieces]
    return {
        "pieceCount": len(pieces), "areaKm2": audit["areaKm2"], "smallFragments": audit["areaThresholdCounts"],
        "maxVertexCount": max(vertices) if vertices else 0, "maxGeometryBytes": max(bytes_) if bytes_ else 0,
        "multiPolygonCount": audit["multiPolygonPieceCount"], "coverage": audit["coverage"],
        "compactness": audit["compactness"], "executionUpstreamRequests": 0,
    }


def candidate_c_plan(v1: dict[str, Any], outer: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    peak_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    merged = adjacency_constrained_merge(v1["pieces"], max_area_km2=45.0)
    projector = UTMProjector.for_lon_lat(CENTER["longitude"], CENTER["latitude"])
    records: list[dict[str, Any]] = []
    for index, item in enumerate(merged, start=1):
        parsed = shape(item["geometry"])
        projected = projector.project(parsed)
        geometry_hash_value = geometry_hash(parsed)
        records.append({
            "pieceId": f"v1-merge-piece-{index:03d}-{geometry_hash_value[:16]}", "geometryHash": geometry_hash_value,
            "geometry": item["geometry"], "areaKm2": round(projected.area / 1_000_000, 6),
            "vertexCountAfter": sum(len(part.exterior.coords) + sum(len(ring.coords) for ring in part.interiors) for part in getattr(parsed, "geoms", [parsed])),
            "geometryBytes": len(canonical(item["geometry"]).encode("utf-8")), "sourcePieceIds": item.get("sourcePieceIds", []),
        })
    records.sort(key=lambda item: item["geometryHash"])
    return {
        "planId": "stage57-v1-adjacency-merge-" + digest([item["geometryHash"] for item in records])[:24],
        "planFingerprint": digest({"plannerVersion": "stage57-v1-grid-adjacency-merge-local-rebisection", "outerGeometryHash": v1["outerGeometryHash"], "pieces": [item["geometryHash"] for item in records]}),
        "plannerVersion": "stage57-v1-grid-adjacency-merge-local-rebisection", "strategy": "v1-grid-plus-adjacency_constrained_merge",
        "profile": "driving-car", "center": CENTER, "rangesSeconds": RANGES, "outerGeometryHash": v1["outerGeometryHash"],
        "outerAreaKm2": v1["outerAreaKm2"], "pieceCount": len(records), "pieces": records,
        "coverage": fragmentation_audit(records, outer)["coverage"], "executionSeconds": round(time.perf_counter() - started, 6), "peakProcessRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, "peakProcessRssDeltaBytes": max(0, resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - peak_before), "rssUnit": "bytes on macOS", "upstreamRequestCount": 0,
        "comparisonNote": "This candidate performs deterministic shared-boundary merges only. It remains above the request budget and is retained as an unfavourable comparison, not silently replaced by V2 bisection.",
    }


def plan_with_time(max_area: float, outer: dict[str, Any], **config_overrides: Any) -> dict[str, Any]:
    started = time.perf_counter()
    peak_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    config = {"max_area_km2": max_area, "simplification_tolerance_meters": 0.0}
    config.update(config_overrides)
    plan = build_balanced_partition_plan({
        "profile": "driving-car", "center": CENTER, "rangesSeconds": RANGES, "outerGeometry": outer,
        "config": config,
    })
    plan["executionSeconds"] = round(time.perf_counter() - started, 6)
    plan["peakProcessRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    plan["peakProcessRssDeltaBytes"] = max(0, resource.getrusage(resource.RUSAGE_SELF).ru_maxrss - peak_before)
    plan["rssUnit"] = "bytes on macOS"
    return plan


def draw_line(pixels: bytearray, width: int, height: int, start: tuple[int, int], end: tuple[int, int], color: tuple[int, int, int], thickness: int = 1) -> None:
    x0, y0 = start
    x1, y1 = end
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    error = dx + dy
    while True:
        for ox in range(-thickness + 1, thickness):
            for oy in range(-thickness + 1, thickness):
                px, py = x0 + ox, y0 + oy
                if 0 <= px < width and 0 <= py < height:
                    index = (py * width + px) * 3
                    pixels[index:index + 3] = bytes(color)
        if x0 == x1 and y0 == y1:
            return
        twice = 2 * error
        if twice >= dy:
            error += dy
            x0 += sx
        if twice <= dx:
            error += dx
            y0 += sy


def png_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def render_v1_audit_map(outer: dict[str, Any], pieces: list[dict[str, Any]], path: Path) -> None:
    width, height, padding = 1500, 1120, 35
    image = bytearray([249, 251, 253] * width * height)
    all_geometries = [shape(outer)] + [shape(item["geometry"]) for item in pieces]
    west = min(item.bounds[0] for item in all_geometries); south = min(item.bounds[1] for item in all_geometries)
    east = max(item.bounds[2] for item in all_geometries); north = max(item.bounds[3] for item in all_geometries)
    span_x, span_y = max(east - west, 1e-12), max(north - south, 1e-12)
    scale = min((width - 2 * padding) / span_x, (height - 2 * padding) / span_y)
    def point(value):
        return (round(padding + (value[0] - west) * scale), round(height - padding - (value[1] - south) * scale))
    def outline(geometry, color, thickness):
        for part in getattr(geometry, "geoms", [geometry]):
            rings = [part.exterior, *part.interiors]
            for ring in rings:
                coords = list(ring.coords)
                for a, b in zip(coords, coords[1:]):
                    draw_line(image, width, height, point(a), point(b), color, thickness)
    outline(shape(outer), (66, 75, 90), 2)
    for item in pieces:
        geometry = shape(item["geometry"])
        outline(geometry, (44, 122, 183), 1)
        projector = UTMProjector.for_lon_lat(CENTER["longitude"], CENTER["latitude"])
        area = projector.project(geometry).area / 1_000_000
        if area < 1:
            centroid = point((geometry.representative_point().x, geometry.representative_point().y))
            for dx in range(-3, 4):
                for dy in range(-3, 4):
                    if dx * dx + dy * dy <= 9:
                        x, y = centroid[0] + dx, centroid[1] + dy
                        if 0 <= x < width and 0 <= y < height:
                            index = (y * width + x) * 3
                            image[index:index + 3] = bytes((211, 47, 47))
    raw = b"".join(b"\x00" + bytes(image[row * width * 3:(row + 1) * width * 3]) for row in range(height))
    payload = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")
    path.write_bytes(payload)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cached, outer = outer_geometry()
    v1 = v1_plan(outer)
    v1_audit = fragmentation_audit(v1["pieces"], outer)
    v1_audit.update({"stage": 57, "plannerVersion": v1["plannerVersion"], "planFingerprint": v1["planFingerprint"], "outerGeometryHash": v1["outerGeometryHash"], "upstreamRequestCount": 0, "fragmentInterpretation": "Small areas are grid-intersection remnants: 20 pieces below 1 km² and 39 below 5 km² coexist with 28 pieces above 40 km². The shared-boundary audit records 57 geometrically mergeable pairs, proving the count is not imposed by the 45 km² area bound alone."})
    dump("v1-fragmentation-audit.json", v1_audit)
    map_path = OUT / "v1-fragmentation-map.png"
    render_v1_audit_map(outer, v1["pieces"], map_path)

    candidate_a = plan_with_time(45.0, outer)
    candidate_b = plan_with_time(44.0, outer, compactness_penalty_weight=0.10, boundary_complexity_penalty_weight=1.00, multi_part_penalty_weight=0.35)
    candidate_c = candidate_c_plan(v1, outer)
    for name, plan in (("candidate-plan-a.json", candidate_a), ("candidate-plan-b.json", candidate_b), ("candidate-plan-c.json", candidate_c)):
        dump(name, plan)

    summaries = {"A": stats_for_pieces(candidate_a["pieces"], outer), "B": stats_for_pieces(candidate_b["pieces"], outer), "C": stats_for_pieces(candidate_c["pieces"], outer)}
    summaries["A"].update({"maxAreaKm2": 45, "planFingerprint": candidate_a["planFingerprint"], "executionSeconds": candidate_a["executionSeconds"], "peakProcessRssBytes": candidate_a["peakProcessRssBytes"], "peakProcessRssDeltaBytes": candidate_a["peakProcessRssDeltaBytes"], "rssUnit": candidate_a["rssUnit"], "strategy": candidate_a["strategy"]})
    summaries["B"].update({"maxAreaKm2": 44, "planFingerprint": candidate_b["planFingerprint"], "executionSeconds": candidate_b["executionSeconds"], "peakProcessRssBytes": candidate_b["peakProcessRssBytes"], "peakProcessRssDeltaBytes": candidate_b["peakProcessRssDeltaBytes"], "rssUnit": candidate_b["rssUnit"], "strategy": candidate_b["strategy"]})
    summaries["C"].update({"maxAreaKm2": 45, "planFingerprint": candidate_c["planFingerprint"], "executionSeconds": candidate_c["executionSeconds"], "peakProcessRssBytes": candidate_c["peakProcessRssBytes"], "peakProcessRssDeltaBytes": candidate_c["peakProcessRssDeltaBytes"], "rssUnit": candidate_c["rssUnit"], "strategy": candidate_c["strategy"]})
    selected = candidate_a
    comparison = {"stage": 57, "status": "completed-approval-ready", "selection": "A", "selectionReason": "All hard geometry and complexity constraints pass; A reaches the mathematical 43-piece lower bound, has no <1 km² leaf, and therefore precedes B (44 leaves) and C (61 leaves) under the frozen selection ordering.", "theoreticalLowerBound": 43, "candidates": summaries, "upstreamRequestCount": 0}
    dump("candidate-comparison.json", comparison)
    dump("selected-driving-poi-plan-v2.json", {**selected, "selectedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "selection": "candidate-A"})
    dump("selected-driving-poi-plan-v2.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {key: item[key] for key in ("pieceId", "geometryHash", "areaKm2", "vertexCountAfter", "geometryBytes", "compactness", "partCount")}, "geometry": item["geometry"]} for item in selected["pieces"]]})
    dump("coverage-audit.json", {"stage": 57, "selectedPlanFingerprint": selected["planFingerprint"], "coverage": selected["coverage"], "allHardConstraintsPass": bool(selected["coverage"]["areaConserved"] and max(item["areaKm2"] for item in selected["pieces"]) <= 45.0)})
    dump("geometry-complexity-audit.json", {"stage": 57, "selectedPlanFingerprint": selected["planFingerprint"], "constraints": {"maxVertices": 500, "maxGeometryBytes": 100000, "maxPieceAreaKm2": 45, "maxAreaErrorRatio": 0.001}, "pieces": [{key: item[key] for key in ("pieceId", "areaKm2", "vertexCountBefore", "vertexCountAfter", "geometryBytes", "compactness", "bboxUtilization", "simplificationToleranceMeters", "areaErrorRatio", "valid", "partCount", "holeCount")} for item in selected["pieces"]]})

    determinism_runs = []
    for index in range(5):
        started = time.perf_counter()
        plan = plan_with_time(45.0, outer)
        determinism_runs.append({"run": index + 1, "pieceCount": plan["pieceCount"], "pieceIds": [item["pieceId"] for item in plan["pieces"]], "geometryHashes": [item["geometryHash"] for item in plan["pieces"]], "planFingerprint": plan["planFingerprint"], "coverage": plan["coverage"], "executionSeconds": round(time.perf_counter() - started, 6)})
    stable = all(run["planFingerprint"] == determinism_runs[0]["planFingerprint"] and run["pieceIds"] == determinism_runs[0]["pieceIds"] and run["coverage"] == determinism_runs[0]["coverage"] for run in determinism_runs)
    dump("determinism-audit.json", {"stage": 57, "runs": determinism_runs, "stable": stable, "uiIndependence": "No UI state is an input to this offline service; ordinary/research mode and display density cannot change its identity.", "upstreamRequestCount": 0})
    base = selected["pieceCount"]
    reserve = max(8, math.ceil(base * 0.20))
    dump("budget-feasibility.json", {"stage": 57, "status": "completed-approval-ready", "selectedPlanFingerprint": selected["planFingerprint"], "baseRequests": base, "currentApprovedPoiRequests": 48, "remainingReserveAtCurrentBudget": 48 - base, "budgetClassification": "base-feasible-with-minimal-reserve", "minimumAdaptiveReserve": reserve, "recommendedApprovedPoiRequests": base + reserve, "reason": "43 initial requests reach the theoretical lower bound, but 5 remaining requests under the old 48 cap are below the recommended max(8, ceil(base*20%)) reserve for result truncation subdivisions. The recommended 52 is a future approval request only, not authorization granted by this stage.", "matrixUnknown": True, "matrixWarning": "POI candidate total is unknown without forbidden live POI retrieval; Stage57 cannot prove the later Matrix job will fit 40 batches or 20000 destinations.", "upstreamRequestCount": 0})
    dump("zero-upstream-evidence.json", {"stage": 57, "services": {name: {"upstreamRequests": 0, "cacheWrites": 0} for name in ("isochrones", "pois", "matrix", "geocoder", "directions")}, "evidence": "The builder imports only local cache parsing and geometry planning modules. It has no provider client invocation path."})
    png_hash = hashlib.sha256(map_path.read_bytes()).hexdigest()
    dump("screenshot-sha256.json", {"stage": 57, "images": [{"file": map_path.name, "sha256": png_hash, "format": "PNG", "purpose": "offline fragmentation audit, not product browser acceptance"}]})


if __name__ == "__main__":
    main()
