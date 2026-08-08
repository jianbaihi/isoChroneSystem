import unittest

from app.models import Center
from app.services.walking_job_ledger import WalkingJobLedger, walking_input_fingerprint


class Stage45WalkingJobLedgerTest(unittest.TestCase):
    def test_exact_state_chain_and_zero_cache_replay_are_audited(self):
        ledger = WalkingJobLedger()
        fingerprint = walking_input_fingerprint(Center(lon=114.296944, lat=30.546944), "foot-walking", [10, 20, 30])
        ledger.begin("job-1", fingerprint)
        for state in (
            "isochrone-running", "isochrone-ready", "poi-planning", "poi-running",
            "poi-ready", "matrix-planning", "matrix-running", "layout-ready",
        ):
            ledger.transition("job-1", state)
        ledger.record("job-1", "isochrones", attempted=1, cache_hits=1, upstream=0)
        ledger.record("job-1", "pois", attempted=1, cache_hits=1, upstream=0)
        ledger.record("job-1", "matrix", attempted=1, cache_hits=1, upstream=0)
        ledger.mark_published("job-1")
        snapshot = ledger.snapshot("job-1")
        self.assertEqual(snapshot["job"]["status"], "completed")
        self.assertTrue(snapshot["job"]["published"])
        self.assertEqual([item["state"] for item in snapshot["job"]["transitions"]], [
            "idle", "isochrone-running", "isochrone-ready", "poi-planning", "poi-running",
            "poi-ready", "matrix-planning", "matrix-running", "layout-ready", "completed",
        ])
        self.assertTrue(all(item["upstreamRequests"] == 0 for item in snapshot["totals"].values()))

    def test_fingerprint_is_stable_and_sensitive_to_ranges(self):
        center = Center(lon=114.296944, lat=30.546944)
        first = walking_input_fingerprint(center, "foot-walking", [10, 20, 30])
        self.assertEqual(first, walking_input_fingerprint(center, "foot-walking", [10, 20, 30]))
        self.assertNotEqual(first, walking_input_fingerprint(center, "foot-walking", [10, 20, 40]))


if __name__ == "__main__":
    unittest.main()
