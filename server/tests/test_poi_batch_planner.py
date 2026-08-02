import json
import tempfile
import unittest
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape

from app.errors import InvalidProviderParameterError
from app.main import app
from app.services.poi_batch_planner import (
    PlannerConfig,
    PoiBatchJobStore,
    PoiPieceCache,
    adaptive_piece_transition,
    approval_is_valid,
    build_poi_query_plan,
    create_plan_approval,
    evaluate_execution_gate,
    merge_piece_results,
    piece_cache_key,
)
from app.services.projection import UTMProjector


CENTER = (114.296944, 30.546944)


def area_geometry(area_km2: float, *, offset_x: float = 0, offset_y: float = 0):
    projector = UTMProjector.for_lon_lat(*CENTER)
    center_x, center_y = projector.forward(*CENTER)
    side = (area_km2 * 1_000_000) ** 0.5
    projected = box(
        center_x + offset_x - side / 2, center_y + offset_y - side / 2,
        center_x + offset_x + side / 2, center_y + offset_y + side / 2,
    )
    return projector.unproject(projected)


def payload(area_km2: float = 1, **overrides):
    value = {
        "center": {"longitude": CENTER[0], "latitude": CENTER[1]},
        "profile": "driving-car",
        "rangesSeconds": [600, 1200, 1800],
        "outerGeometry": mapping(area_geometry(area_km2)),
        "poiFilter": None,
        "provider": "openpoiservice",
        "providerLimits": {"maxAreaKm2": 50, "requestLimit": 2000},
        "plannerConfig": {
            "targetPieceAreaKm2": 35, "maxSubdivisionDepth": 4,
            "minPieceAreaKm2": 0.1, "requestBudget": 20,
        },
    }
    value.update(overrides)
    return value


class GeometryPlannerTest(unittest.TestCase):
    def test_boundary_areas_use_frozen_45_km2_fast_path(self):
        for area in (1, 44.9, 45):
            plan = build_poi_query_plan(payload(area))
            self.assertEqual(plan["pieceCount"], 1, area)
            self.assertEqual(plan["strategy"], "single-piece-fast-path")
            self.assertLessEqual(plan["pieces"][0]["areaKm2"], 45.000001)
        for area in (45.1, 50):
            plan = build_poi_query_plan(payload(area))
            self.assertGreater(plan["pieceCount"], 1, area)
            self.assertTrue(all(piece["areaKm2"] <= 45.000001 for piece in plan["pieces"]))

    def test_polygon_multipolygon_and_complex_hole_conserve_area_without_overlap(self):
        left = area_geometry(20, offset_x=-7000)
        right = area_geometry(20, offset_x=7000)
        multi = MultiPolygon([left, right])
        large = area_geometry(120)
        hole = area_geometry(5)
        complex_polygon = Polygon(large.exterior.coords, [hole.exterior.coords])
        for geometry in (multi, complex_polygon):
            plan = build_poi_query_plan(payload(outerGeometry=mapping(geometry)))
            self.assertTrue(plan["coverage"]["areaConserved"])
            self.assertLessEqual(plan["coverage"]["uncoveredAreaKm2"], plan["coverage"]["toleranceKm2"])
            self.assertLessEqual(plan["coverage"]["overlapAreaKm2"], plan["coverage"]["toleranceKm2"])
            self.assertTrue(all(piece["areaKm2"] <= 45.000001 for piece in plan["pieces"]))

    def test_empty_invalid_self_intersecting_and_out_of_bounds_fail_closed(self):
        invalid = [
            {"type": "Polygon", "coordinates": []},
            {"type": "Polygon", "coordinates": [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]]},
            {"type": "Polygon", "coordinates": [[[181, 0], [181, 1], [179, 1], [181, 0]]]},
        ]
        for geometry in invalid:
            with self.assertRaises(InvalidProviderParameterError):
                build_poi_query_plan(payload(outerGeometry=geometry))

    def test_ids_order_and_fingerprint_are_stable_and_input_sensitive(self):
        first = build_poi_query_plan(payload(120))
        second = build_poi_query_plan(payload(120))
        self.assertEqual(first["planFingerprint"], second["planFingerprint"])
        self.assertEqual([item["pieceId"] for item in first["pieces"]], [item["pieceId"] for item in second["pieces"]])
        changed = build_poi_query_plan(payload(120, profile="cycling-regular"))
        self.assertNotEqual(first["planFingerprint"], changed["planFingerprint"])
        self.assertEqual(piece_cache_key(first["pieces"][0], None, 2000), piece_cache_key(changed["pieces"][0], None, 2000))

    def test_budget_requires_approval_when_upper_bound_exceeds_budget(self):
        plan = build_poi_query_plan(payload(600, plannerConfig={
            "targetPieceAreaKm2": 35, "maxSubdivisionDepth": 4,
            "minPieceAreaKm2": 0.1, "requestBudget": 3,
        }))
        self.assertEqual(plan["budgetStatus"], "approval-required")
        self.assertEqual(plan["reservedAdaptiveRequests"], (plan["pieceCount"] + 3) // 4)
        self.assertGreater(plan["estimatedMaximumApprovedRequests"], plan["requestBudget"])


class StateAndResumeTest(unittest.TestCase):
    def test_limit_triggers_children_and_max_depth_marks_incomplete(self):
        plan = build_poi_query_plan(payload(1))
        piece = plan["pieces"][0]
        transition = adaptive_piece_transition(piece, 2000, False, 2000, PlannerConfig())
        self.assertEqual(transition["piece"]["status"], "superseded-by-children")
        self.assertEqual(len(transition["children"]), 4)
        self.assertTrue(all(child["parentPieceId"] == piece["pieceId"] for child in transition["children"]))
        stopped = adaptive_piece_transition(piece, 2000, True, 2000, PlannerConfig(max_subdivision_depth=0))
        self.assertEqual(stopped["piece"]["status"], "incomplete-dense-piece")

    def test_atomic_manifest_resume_preserves_completed_and_resets_running(self):
        plan = build_poi_query_plan(payload(50))
        with tempfile.TemporaryDirectory() as directory:
            store = PoiBatchJobStore(directory)
            manifest = store.initialize(plan)
            completed = {**manifest["pieces"][0], "status": "completed", "attemptCount": 1, "resultCount": 3, "resultTruncated": False}
            manifest = store.checkpoint(manifest, completed)
            running = {**manifest["pieces"][1], "status": "running", "attemptCount": 1}
            manifest = store.checkpoint(manifest, running)
            recovered = store.recover(manifest["jobId"])
            by_id = {item["pieceId"]: item for item in recovered["pieces"]}
            self.assertEqual(by_id[completed["pieceId"]]["status"], "completed")
            self.assertEqual(by_id[running["pieceId"]]["status"], "pending")
            self.assertFalse(any(path.suffix == ".tmp" for path in store.directory.iterdir()))
            self.assertEqual(recovered["upstreamRequestCount"], 0)

    def test_piece_cache_is_atomic_and_profile_independent(self):
        driving = build_poi_query_plan(payload(1))
        cycling = build_poi_query_plan(payload(1, profile="cycling-regular"))
        first = driving["pieces"][0]
        second = cycling["pieces"][0]
        driving_key = piece_cache_key(first, {"category": "all"}, 2000)
        cycling_key = piece_cache_key(second, {"category": "all"}, 2000)
        self.assertEqual(driving_key, cycling_key)
        with tempfile.TemporaryDirectory() as directory:
            cache = PoiPieceCache(directory)
            cache.write(driving_key, first, [{"poiId": "one"}], {"resultCount": 1, "truncated": False})
            hit = cache.read(cycling_key, second["geometryHash"])
            self.assertEqual(hit["pois"], [{"poiId": "one"}])
            self.assertFalse(any(path.suffix == ".tmp" for path in cache.directory.iterdir()))

    def test_partial_job_does_not_publish_and_complete_merge_deduplicates_safely(self):
        plan = build_poi_query_plan(payload(50))
        pieces = plan["pieces"]
        partial = {"pieces": [{**item, "status": "completed" if index == 0 else "pending"} for index, item in enumerate(pieces)]}
        self.assertFalse(merge_piece_results(partial, {}, payload(50)["outerGeometry"])["publishable"])
        complete = {"pieces": [{**item, "status": "completed", "resultTruncated": False} for item in pieces]}
        common = {"source": "osm", "sourceId": "node-1", "name": "边界点", "location": {"lon": CENTER[0], "lat": CENTER[1]}}
        same_name_far_a = {"source": "osm", "name": "同名店", "location": {"lon": CENTER[0] - 0.01, "lat": CENTER[1]}}
        same_name_far_b = {"source": "osm", "name": "同名店", "location": {"lon": CENTER[0] + 0.01, "lat": CENTER[1]}}
        outside = {"source": "osm", "sourceId": "outside", "name": "外部", "location": {"lon": 0, "lat": 0}}
        results = {item["pieceId"]: [] for item in pieces}
        results[pieces[0]["pieceId"]] = [common, same_name_far_a, outside]
        results[pieces[1]["pieceId"]] = [common, same_name_far_b]
        merged = merge_piece_results(complete, results, payload(50)["outerGeometry"])
        self.assertTrue(merged["publishable"])
        self.assertEqual(merged["mergedCount"], 3)
        self.assertEqual(merged["duplicateCount"], 1)
        self.assertEqual(merged["outsideCount"], 1)

    def test_approval_binding_quota_unknown_and_429(self):
        plan = build_poi_query_plan(payload(1))
        approval = create_plan_approval(plan, 2, "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z")
        now = "2026-08-01T12:00:00Z"
        self.assertTrue(approval_is_valid(plan, approval, now))
        self.assertTrue(evaluate_execution_gate(plan, approval, {"status": "unknown", "remaining": None}, now)["allowed"])
        self.assertFalse(evaluate_execution_gate(plan, approval, {"status": "unknown", "remaining": None}, now, profile_count=3)["allowed"])
        limited = evaluate_execution_gate(plan, approval, {"status": "429", "retryAfter": "60"}, now)
        self.assertFalse(limited["allowed"])
        self.assertEqual(limited["retryAfter"], "60")
        self.assertTrue(evaluate_execution_gate(plan, approval, {"status": "known", "remaining": 10}, now)["allowed"])
        self.assertFalse(evaluate_execution_gate(plan, approval, {"status": "known", "remaining": 2}, now)["allowed"])
        changed = build_poi_query_plan(payload(1, rangesSeconds=[600, 900, 1800]))
        self.assertFalse(approval_is_valid(changed, approval, now))


class DryRunApiTest(unittest.TestCase):
    def test_endpoint_returns_redacted_plan_and_zero_upstream_header(self):
        response = TestClient(app).post("/api/v1/poi-query-plan", json=payload(1))
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["upstreamRequestCount"], 0)
        self.assertEqual(response.headers["X-Upstream-Request-Count"], "0")
        self.assertNotIn("geometry", body["pieces"][0])
        self.assertEqual(body["pieceCount"], 1)


if __name__ == "__main__":
    unittest.main()
