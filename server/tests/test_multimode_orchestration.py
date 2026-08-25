import tempfile
import unittest

from app.adapters.ors_matrix import OrsMatrixAdapter
from app.config import Settings
from app.errors import InvalidProviderParameterError
from app.services.multimode_orchestration import (
    MultimodeJobStore,
    build_matrix_batch_plan,
    matrix_batch_count,
    merge_matrix_batches,
    parse_matrix_batch_result,
    prepare_all_profiles,
    retry_decision,
    validate_profile,
)


CENTER = {"lon": 114.296944, "lat": 30.546944}


def pois(count):
    return [
        {"poiId": f"poi-{index:04d}", "location": {"lon": 114.2 + index * 0.000001, "lat": 30.5}}
        for index in reversed(range(count))
    ]


def complete_batch(plan, batch, null_index=None):
    count = batch["destinationCount"]
    durations = [float((index % 4 + 1) * 500) for index in range(count)]
    distances = [float(index + 1) for index in range(count)]
    if null_index is not None:
        durations[null_index] = None
        distances[null_index] = None
    result = parse_matrix_batch_result(batch, {"durations": [durations], "distances": [distances]})
    batch["status"] = "completed"
    return result


class MatrixBatchPlanningTest(unittest.TestCase):
    def test_matrix_adapter_endpoint_and_identity_are_profile_specific(self):
        settings = Settings(
            app_env="test", app_host="127.0.0.1", app_port=8000, cors_origins=(),
            analysis_provider="ors", ors_base_url="https://api.example.test",
        )
        for profile in ("foot-walking", "cycling-regular", "driving-car"):
            adapter = OrsMatrixAdapter(settings, profile=profile)
            self.assertTrue(adapter.endpoint.endswith(f"/v2/matrix/{profile}"))
            self.assertEqual(adapter.profile, profile)

    def test_frozen_destination_boundaries(self):
        expected = {0: 0, 1: 1, 499: 1, 500: 1, 501: 2, 1000: 2, 3501: 8}
        self.assertEqual({count: matrix_batch_count(count) for count in expected}, expected)
        for count, batch_count in expected.items():
            plan = build_matrix_batch_plan("foot-walking", CENTER, pois(count))
            self.assertEqual(plan["batchCount"], batch_count)
            self.assertEqual(plan["upstreamRequestCount"], 0)

    def test_stable_sort_ids_coordinates_and_explicit_one_to_many(self):
        first = build_matrix_batch_plan("cycling-regular", CENTER, pois(501))
        second = build_matrix_batch_plan("cycling-regular", CENTER, list(reversed(pois(501))))
        self.assertEqual(first["planFingerprint"], second["planFingerprint"])
        self.assertEqual(first["batches"][0]["poiIds"][0], "poi-0000")
        self.assertEqual(first["batches"][0]["requestBody"]["sources"], ["0"])
        self.assertEqual(first["batches"][0]["requestBody"]["destinations"][0], "1")
        self.assertEqual(len(first["batches"][0]["requestBody"]["locations"]), 501)
        self.assertEqual(first["batches"][1]["destinationCount"], 1)

    def test_profiles_get_distinct_matrix_identity(self):
        walk = build_matrix_batch_plan("foot-walking", CENTER, pois(3))
        drive = build_matrix_batch_plan("driving-car", CENTER, pois(3))
        self.assertNotEqual(walk["planFingerprint"], drive["planFingerprint"])
        self.assertNotEqual(walk["batches"][0]["batchId"], drive["batches"][0]["batchId"])

    def test_null_destination_is_explicit_but_http_or_dimension_failure_blocks_batch(self):
        plan = build_matrix_batch_plan("foot-walking", CENTER, pois(3))
        values = complete_batch(plan, plan["batches"][0], null_index=1)
        merged = merge_matrix_batches("foot-walking", plan, {plan["batches"][0]["batchId"]: values})
        self.assertTrue(merged["publishable"])
        self.assertEqual(merged["summary"]["matrixUnreachableCount"], 1)
        with self.assertRaises(InvalidProviderParameterError):
            parse_matrix_batch_result(plan["batches"][0], {"durations": [[1]], "distances": [[1]]})
        plan["batches"][0]["status"] = "failed"
        self.assertFalse(merge_matrix_batches("foot-walking", plan, {})["publishable"])

    def test_merge_rejects_order_and_cross_profile_results(self):
        plan = build_matrix_batch_plan("driving-car", CENTER, pois(2))
        batch = plan["batches"][0]
        values = complete_batch(plan, batch)
        reversed_values = list(reversed(values))
        self.assertEqual(merge_matrix_batches("driving-car", plan, {batch["batchId"]: reversed_values})["reason"], "batch_result_order_mismatch")
        values[0]["profile"] = "foot-walking"
        self.assertEqual(merge_matrix_batches("driving-car", plan, {batch["batchId"]: values})["reason"], "cross_profile_accessibility")

    def test_limited_retry_consumes_approved_budget(self):
        self.assertTrue(retry_decision(429, 0, 1, 2)["retry"])
        self.assertTrue(retry_decision(503, 0, 1, 2)["retry"])
        self.assertFalse(retry_decision(503, 1, 1, 3)["retry"])
        self.assertFalse(retry_decision(413, 0, 0, 3)["retry"])
        self.assertFalse(retry_decision(429, 0, 2, 2)["retry"])
        self.assertFalse(retry_decision(502, 0, 0, 2, cancelled=True)["retry"])


class ProfileJobStoreTest(unittest.TestCase):
    def test_state_machine_profile_isolation_old_response_and_atomic_publish(self):
        with tempfile.TemporaryDirectory() as directory:
            store = MultimodeJobStore(directory)
            walk = store.create("foot-walking", "a" * 64)
            drive = store.create("driving-car", "b" * 64)
            self.assertNotEqual(walk["jobId"], drive["jobId"])
            self.assertIsNone(store.transition("foot-walking", "stale-job", "planning"))
            walk = store.transition("foot-walking", walk["jobId"], "planning")
            walk = store.transition("foot-walking", walk["jobId"], "fetching-isochrone")
            walk = store.transition("foot-walking", walk["jobId"], "fetching-pois")
            walk = store.transition("foot-walking", walk["jobId"], "merging-pois")
            walk = store.transition("foot-walking", walk["jobId"], "fetching-matrix")
            walk = store.transition("foot-walking", walk["jobId"], "assigning-rings")
            walk = store.transition("foot-walking", walk["jobId"], "layout-ready")
            partial = {"profile": "foot-walking", "status": "completed", "poiQueryPlan": {"fullyCovered": False}, "summary": {"countConserved": True}}
            self.assertFalse(store.publish("foot-walking", walk["jobId"], partial))
            complete = {"profile": "foot-walking", "status": "completed", "poiQueryPlan": {"fullyCovered": True}, "summary": {"countConserved": True}}
            self.assertTrue(store.publish("foot-walking", walk["jobId"], complete))
            self.assertEqual(store.current("driving-car")["status"], "draft")
            self.assertIsNone(store.result("driving-car"))

    def test_recovery_keeps_completed_work_and_resets_running(self):
        with tempfile.TemporaryDirectory() as directory:
            store = MultimodeJobStore(directory)
            job = store.create("cycling-regular", "c" * 64)
            job = store.transition("cycling-regular", job["jobId"], "planning")
            job = store.transition("cycling-regular", job["jobId"], "fetching-isochrone")
            completed = {"pieceId": "piece-1", "status": "completed", "cacheHit": True}
            running = {"pieceId": "piece-2", "status": "running", "cacheHit": False}
            store.checkpoint("cycling-regular", job["jobId"], "poiPieces", completed)
            store.checkpoint("cycling-regular", job["jobId"], "poiPieces", running)
            store.checkpoint("cycling-regular", job["jobId"], "matrixBatches", {"batchId": "batch-1", "status": "completed", "cacheHit": True})
            store.checkpoint("cycling-regular", job["jobId"], "matrixBatches", {"batchId": "batch-2", "status": "running", "cacheHit": False})
            recovered = store.recover("cycling-regular")
            self.assertEqual([item["status"] for item in recovered["poiPieces"]], ["completed", "pending"])
            self.assertEqual([item["status"] for item in recovered["matrixBatches"]], ["completed", "pending"])
            self.assertEqual(recovered["status"], "partial")
            self.assertEqual(recovered["upstreamRequestCount"], 0)

    def test_illegal_transition_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            store = MultimodeJobStore(directory)
            job = store.create("foot-walking", "d" * 64)
            with self.assertRaises(InvalidProviderParameterError):
                store.transition("foot-walking", job["jobId"], "completed")


class PrepareAllTest(unittest.TestCase):
    def test_prepare_all_is_ordered_plan_only_and_driving_stays_approval_required(self):
        result = prepare_all_profiles({
            "foot-walking": {"outerGeometryAvailable": True, "minimumPoiRequests": 1, "adaptiveReserve": 1},
            "cycling-regular": {"status": "N/A", "outerGeometryAvailable": False},
            "driving-car": {
                "outerGeometryAvailable": True, "minimumPoiRequests": 108, "adaptiveReserve": 27,
                "budgetStatus": "approval-required", "planFingerprint": "drive-fingerprint",
            },
        })
        self.assertEqual(result["profileOrder"], ["foot-walking", "cycling-regular", "driving-car"])
        self.assertEqual(result["profiles"][1]["status"], "N/A")
        self.assertEqual(result["profiles"][2]["status"], "awaiting-approval")
        self.assertEqual(result["profiles"][2]["poiRequestUpperBound"], 135)
        self.assertFalse(result["executed"])
        self.assertEqual(result["upstreamRequestCount"], 0)

    def test_unsupported_modes_are_rejected_not_mapped(self):
        for mode in ("bus", "subway", "train", "airplane"):
            with self.assertRaises(InvalidProviderParameterError):
                validate_profile(mode)


if __name__ == "__main__":
    unittest.main()
