import json
import unittest
from pathlib import Path

from app.errors import PoiRequestBudgetExceededError
from app.models import Center, MatrixAccessibilityRequest, NameCloudRequest
from app.services.cycling_job_ledger import CyclingJobLedger, cycling_input_fingerprint
from app.services.stage51_cycling_cache import build_cached_name_cloud, complete_cached_matrix, profile_cache_identity


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "exports/stage-6-integrated-live/stage29-cycling-complete.json"


class Stage51CyclingJobTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = json.loads(ARCHIVE.read_text(encoding="utf-8"))

    def request(self):
        return NameCloudRequest.model_validate({
            "schemaVersion": "1.0",
            "center": self.archive["center"],
            "profile": "cycling-regular",
            "rangesMinutes": [10, 20, 30],
            "categoryIds": [],
            "cumulativeIsochrones": self.archive["cumulativeIsochrones"],
        })

    def test_real_cache_replay_is_complete_and_profile_isolated(self):
        base = build_cached_name_cloud(self.request(), "stage51-test")
        self.assertEqual(base.profile, "cycling-regular")
        self.assertEqual(len(base.pois), 2413)
        self.assertEqual(len(base.accessibility), 0)
        self.assertEqual(base.metadata.poiCoverage["cacheHits"], 10)
        self.assertEqual(base.metadata.poiCoverage["upstreamRequestCount"], 0)
        full = complete_cached_matrix(MatrixAccessibilityRequest(baseResult=base))
        self.assertEqual(full.publishedResultSchemaVersion, "2.0")
        self.assertEqual(len(full.accessibility), 2413)
        self.assertTrue(all(poi.travelTimeSeconds is not None for poi in full.pois))
        self.assertTrue(all(poi.networkDistanceMeters is not None for poi in full.pois))
        self.assertTrue(all(poi.ringId == poi.matrixBandId for poi in full.pois))
        self.assertEqual(full.metadata.matrix["batchCount"], 5)
        self.assertEqual(full.metadata.matrix["cacheHits"], 5)
        self.assertEqual(full.metadata.matrix["upstreamRequestCount"], 0)
        self.assertEqual(full.metadata.matrix["resultFingerprint"], "f41b23c25e23a997c03b0050451a8976303683d15342842129d8f47e80d0d203")
        self.assertEqual([ring.statistics.poiCount for ring in full.rings], [127, 433, 1240])
        summary = full.metadata.matrix
        self.assertEqual(
            summary["matrixWithinRangeCount"] + summary["matrixOutOfRangeCount"]
            + summary["matrixNullCount"] + summary["matrixInvalidCount"],
            len(full.pois),
        )

    def test_stage51_budget_and_fingerprint_do_not_reuse_stage45_identity(self):
        center = Center(lon=114.296944, lat=30.546944)
        cycling = cycling_input_fingerprint(center, "cycling-regular", [10, 20, 30])
        walking_shape = cycling_input_fingerprint(center, "foot-walking", [10, 20, 30])
        self.assertNotEqual(cycling, walking_shape)
        outer = self.archive["cumulativeIsochrones"][-1]["geometry"]
        cycling_cache = profile_cache_identity(
            center=center, profile="cycling-regular", ranges=[10, 20, 30], outer_geometry=outer,
        )
        walking_cache = profile_cache_identity(
            center=center, profile="foot-walking", ranges=[10, 20, 30], outer_geometry=outer,
        )
        self.assertNotEqual(cycling_cache["cacheFingerprint"], walking_cache["cacheFingerprint"])
        ledger = CyclingJobLedger()
        ledger.begin("cycling-job", cycling)
        ledger.record("cycling-job", "pois", attempted=10, cache_hits=10, upstream=0)
        ledger.record("cycling-job", "matrix", attempted=5, cache_hits=5, upstream=0)
        self.assertEqual(ledger.snapshot("cycling-job")["budgets"]["pois"], 12)
        with self.assertRaises(PoiRequestBudgetExceededError):
            ledger.record("cycling-job", "pois", attempted=13, cache_hits=0, upstream=13)

    def test_exact_state_chain_can_publish_after_layout_ready(self):
        ledger = CyclingJobLedger()
        fingerprint = cycling_input_fingerprint(Center(lon=114.296944, lat=30.546944), "cycling-regular", [10, 20, 30])
        ledger.begin("job", fingerprint)
        for state in (
            "isochrone-running", "isochrone-ready", "poi-planning", "poi-running",
            "poi-ready", "matrix-planning", "matrix-running", "layout-ready",
        ):
            ledger.transition("job", state)
        ledger.mark_published("job")
        snapshot = ledger.snapshot("job")
        self.assertEqual(snapshot["job"]["status"], "completed")
        self.assertTrue(snapshot["job"]["published"])


if __name__ == "__main__":
    unittest.main()
