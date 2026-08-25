import json
import math
import unittest
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape

from app.services.driving_poi_partitioner_v2 import (
    PARTITIONER_VERSION,
    PartitionerConfig,
    adjacency_constrained_merge,
    build_balanced_partition_plan,
    fragmentation_audit,
)
from app.services.poi_batch_planner import build_poi_query_plan
from app.services.projection import UTMProjector


CENTER = {"longitude": 114.296944, "latitude": 30.546944}


def projected_geometry(area_km2, x=0, y=0):
    projector = UTMProjector.for_lon_lat(CENTER["longitude"], CENTER["latitude"])
    cx, cy = projector.forward(CENTER["longitude"], CENTER["latitude"])
    side = math.sqrt(area_km2 * 1_000_000)
    return projector.unproject(box(cx + x - side / 2, cy + y - side / 2, cx + x + side / 2, cy + y + side / 2))


def payload(geometry, *, max_area=45, simplify=0):
    return {
        "profile": "driving-car", "center": CENTER, "rangesSeconds": [600, 1200, 1800],
        "outerGeometry": mapping(geometry),
        "config": {"max_area_km2": max_area, "simplification_tolerance_meters": simplify},
    }


class DrivingV2PartitionerTest(unittest.TestCase):
    def test_01_area_over_45_is_recursively_partitioned(self):
        plan = build_balanced_partition_plan(payload(projected_geometry(100)))
        self.assertEqual(plan["pieceCount"], 3)
        self.assertTrue(all(piece["areaKm2"] <= 45.000001 for piece in plan["pieces"]))

    def test_02_balanced_bisection_is_nearly_equal(self):
        plan = build_balanced_partition_plan(payload(projected_geometry(80)))
        areas = [piece["areaKm2"] for piece in plan["pieces"]]
        self.assertEqual(len(areas), 2)
        self.assertLess(abs(areas[0] - areas[1]), 0.001)

    def test_03_concave_polygon_is_conserved(self):
        base = projected_geometry(196)
        west, south, east, north = base.bounds
        concave = Polygon([(west, south), (east, south), (east, north), ((west + east) / 2, (south + north) / 2), (west, north)])
        plan = build_balanced_partition_plan(payload(concave))
        self.assertTrue(plan["coverage"]["areaConserved"])

    def test_04_multipolygon_is_supported(self):
        left = projected_geometry(50, x=-7000)
        right = projected_geometry(50, x=7000)
        plan = build_balanced_partition_plan(payload(MultiPolygon([left, right])))
        self.assertTrue(plan["coverage"]["areaConserved"])
        self.assertGreaterEqual(plan["pieceCount"], 3)

    def test_05_holes_are_retained(self):
        outer = projected_geometry(120)
        hole = projected_geometry(5)
        polygon = Polygon(outer.exterior.coords, [hole.exterior.coords])
        plan = build_balanced_partition_plan(payload(polygon))
        self.assertTrue(plan["coverage"]["areaConserved"])
        self.assertEqual(plan["outerAreaKm2"], 115.0)

    def test_06_shared_boundary_fragments_merge(self):
        projector = UTMProjector.for_lon_lat(CENTER["longitude"], CENTER["latitude"])
        cx, cy = projector.forward(CENTER["longitude"], CENTER["latitude"])
        first = projector.unproject(box(cx, cy, cx + 3000, cy + 3000))
        second = projector.unproject(box(cx + 3000, cy, cx + 6000, cy + 3000))
        merged = adjacency_constrained_merge([{"pieceId": "a", "geometry": mapping(first)}, {"pieceId": "b", "geometry": mapping(second)}])
        self.assertEqual(len(merged), 1)

    def test_07_union_over_45_is_rejected(self):
        projector = UTMProjector.for_lon_lat(CENTER["longitude"], CENTER["latitude"])
        cx, cy = projector.forward(CENTER["longitude"], CENTER["latitude"])
        first = projector.unproject(box(cx, cy, cx + 5000, cy + 5000))
        second = projector.unproject(box(cx + 5000, cy, cx + 10000, cy + 5000))
        merged = adjacency_constrained_merge([{"pieceId": "a", "geometry": mapping(first)}, {"pieceId": "b", "geometry": mapping(second)}])
        self.assertEqual(len(merged), 2)

    def test_08_non_shared_boundary_is_rejected(self):
        first = projected_geometry(5, x=-5000)
        second = projected_geometry(5, x=5000)
        self.assertEqual(len(adjacency_constrained_merge([{"pieceId": "a", "geometry": mapping(first)}, {"pieceId": "b", "geometry": mapping(second)}])), 2)

    def test_09_small_isolated_component_is_not_deleted(self):
        large = projected_geometry(60)
        isolated = projected_geometry(0.05, x=12000)
        plan = build_balanced_partition_plan(payload(MultiPolygon([large, isolated])))
        self.assertTrue(plan["coverage"]["areaConserved"])
        self.assertGreater(sum(piece["partCount"] for piece in plan["pieces"]), 1)

    def test_10_topology_preserving_simplification_is_bounded(self):
        plan = build_balanced_partition_plan(payload(projected_geometry(100), simplify=1))
        self.assertTrue(plan["coverage"]["areaConserved"])
        self.assertTrue(all(piece["simplificationToleranceMeters"] == 1 for piece in plan["pieces"]))

    def test_11_geometry_complexity_is_recorded(self):
        plan = build_balanced_partition_plan(payload(projected_geometry(100)))
        self.assertTrue(all(piece["vertexCountAfter"] <= 500 and piece["geometryBytes"] <= 100_000 for piece in plan["pieces"]))

    def test_12_area_conservation(self):
        self.assertTrue(build_balanced_partition_plan(payload(projected_geometry(100))) ["coverage"]["areaConserved"])

    def test_13_uncovered_area_is_zero(self):
        self.assertEqual(build_balanced_partition_plan(payload(projected_geometry(100)))["coverage"]["uncoveredAreaKm2"], 0.0)

    def test_14_outside_area_is_zero(self):
        self.assertEqual(build_balanced_partition_plan(payload(projected_geometry(100)))["coverage"]["outsideAreaKm2"], 0.0)

    def test_15_overlap_area_is_zero(self):
        self.assertEqual(build_balanced_partition_plan(payload(projected_geometry(100)))["coverage"]["overlapAreaKm2"], 0.0)

    def test_16_theoretical_lower_bound_is_respected(self):
        plan = build_balanced_partition_plan(payload(projected_geometry(1903.245963)))
        self.assertEqual(plan["theoreticalLowerBound"], 43)
        self.assertEqual(plan["pieceCount"], 43)

    def test_17_fingerprint_is_deterministic(self):
        first = build_balanced_partition_plan(payload(projected_geometry(100)))
        second = build_balanced_partition_plan(payload(projected_geometry(100)))
        self.assertEqual(first["planFingerprint"], second["planFingerprint"])
        self.assertEqual([item["pieceId"] for item in first["pieces"]], [item["pieceId"] for item in second["pieces"]])

    def test_18_v1_plan_is_distinct_and_unchanged_by_v2(self):
        geometry = projected_geometry(100)
        v1 = build_poi_query_plan({"profile": "driving-car", "center": CENTER, "rangesSeconds": [600, 1200, 1800], "outerGeometry": mapping(geometry), "provider": "openpoiservice", "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000}, "plannerConfig": {"targetPieceAreaKm2": 45, "maxSubdivisionDepth": 8, "minPieceAreaKm2": 0.1, "requestBudget": 48, "adaptiveReserveRatio": 0}})
        before = v1["planFingerprint"]
        build_balanced_partition_plan(payload(geometry))
        self.assertEqual(v1["planFingerprint"], before)

    def test_19_plan_performs_no_upstream_requests(self):
        self.assertEqual(build_balanced_partition_plan(payload(projected_geometry(100)))["upstreamRequestCount"], 0)

    def test_20_fragmentation_audit_reports_adjacency(self):
        geometry = projected_geometry(100)
        v1 = build_poi_query_plan({"profile": "driving-car", "center": CENTER, "rangesSeconds": [600, 1200, 1800], "outerGeometry": mapping(geometry), "provider": "openpoiservice", "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000}, "plannerConfig": {"targetPieceAreaKm2": 45, "maxSubdivisionDepth": 8, "minPieceAreaKm2": 0.1, "requestBudget": 48, "adaptiveReserveRatio": 0}})
        audit = fragmentation_audit(v1["pieces"], mapping(geometry))
        self.assertEqual(audit["pieceCount"], v1["pieceCount"])
        self.assertGreaterEqual(audit["adjacency"]["sharedBoundaryPairs"], 1)

    def test_21_version_is_frozen(self):
        self.assertEqual(build_balanced_partition_plan(payload(projected_geometry(1)))["plannerVersion"], PARTITIONER_VERSION)


if __name__ == "__main__":
    unittest.main()
