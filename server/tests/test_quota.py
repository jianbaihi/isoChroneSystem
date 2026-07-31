import json
import unittest
from datetime import datetime, timezone

from app.services.quota import QuotaObserver, empty_quota_service


class QuotaObserverTest(unittest.TestCase):
    def test_header_names_are_case_insensitive_and_reset_is_safe(self):
        observer = QuotaObserver()
        result = observer.observe(
            "isochrones",
            {"X-RateLimit-Limit": "500", "X-RATELIMIT-REMAINING": "487", "x-ratelimit-reset": "60"},
            200,
            observed_at=datetime(2026, 7, 30, 6, 20, tzinfo=timezone.utc),
        )
        self.assertEqual(result["status"], "known")
        self.assertEqual(result["remaining"], 487)
        self.assertEqual(result["limit"], 500)
        self.assertEqual(result["resetAt"], "2026-07-30T06:21:00Z")

    def test_missing_headers_are_unknown_and_services_do_not_overwrite_each_other(self):
        observer = QuotaObserver()
        observer.observe("isochrones", {"x-ratelimit-remaining": "3"}, 200)
        missing = observer.observe("geocoder", {}, 200)
        limited = observer.observe("pois", {"Retry-After": "15"}, 429)
        snapshot = observer.snapshot()
        self.assertEqual(missing, empty_quota_service("upstream") | {"observedAt": missing["observedAt"]})
        self.assertEqual(snapshot["services"]["isochrones"]["remaining"], 3)
        self.assertEqual(snapshot["services"]["geocoder"]["status"], "unknown")
        self.assertEqual(limited["status"], "rate-limited")
        self.assertNotEqual(limited.get("remaining"), 0)

    def test_403_is_distinct_and_sensitive_headers_are_never_exposed(self):
        observer = QuotaObserver()
        forbidden = observer.observe(
            "pois",
            {
                "Authorization": "fixture-secret",
                "X-Account-Id": "fixture-account",
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Limit": "500",
            },
            403,
            observed_at=datetime(2026, 7, 30, 6, 30, tzinfo=timezone.utc),
        )
        serialized = json.dumps(observer.snapshot())
        self.assertEqual(forbidden["status"], "upstream-403")
        self.assertEqual(forbidden["remaining"], 0)
        self.assertNotIn("Authorization", serialized)
        self.assertNotIn("fixture-secret", serialized)
        self.assertNotIn("fixture-account", serialized)

    def test_malformed_values_remain_unknown_without_blocking_snapshot(self):
        observer = QuotaObserver()
        malformed = observer.observe(
            "geocoder",
            {
                "x-ratelimit-limit": "-1",
                "x-ratelimit-remaining": "not-a-number",
                "x-ratelimit-reset": "not-a-date",
                "retry-after": "9999999",
            },
            200,
        )
        self.assertEqual(malformed["status"], "unknown")
        self.assertIsNone(malformed["limit"])
        self.assertIsNone(malformed["remaining"])
        self.assertIsNone(malformed["resetAt"])
        self.assertEqual(observer.snapshot()["services"]["geocoder"], malformed)


if __name__ == "__main__":
    unittest.main()
