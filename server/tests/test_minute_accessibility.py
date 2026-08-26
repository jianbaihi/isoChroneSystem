import asyncio
import unittest

from shapely.geometry import mapping, box

from app.config import Settings
from app.errors import AnalysisStaleError, ApprovalRequiredError
from app.models import Center, CumulativeIsochrone, MinuteAccessibilityRequest
from app.services.minute_accessibility import calculate_minute_accessibility, classify_minute_accessibility
from app.services.poi_query import analysis_fingerprint


class FakeIsochroneAdapter:
    def __init__(self, fail_batch=None, cache_hit=False):
        self.calls = []
        self.last_cache_hit = cache_hit
        self.fail_batch = fail_batch

    async def create_isochrones(self, request):
        self.calls.append(list(request.rangesMinutes))
        if self.fail_batch == len(self.calls):
            raise RuntimeError("fixture batch failed")
        return [CumulativeIsochrone(
            isochroneId=f"minute-{minute}", rangeMinutes=minute, rangeSeconds=minute * 60,
            geometry=mapping(box(-minute / 100, -minute / 100, minute / 100, minute / 100)),
        ) for minute in request.rangesMinutes]


class MinuteAccessibilityTest(unittest.TestCase):
    def settings(self):
        return Settings(app_env="test", app_host="127.0.0.1", app_port=8000, cors_origins=(), analysis_provider="ors", ors_base_url="https://example.test", ors_api_key="fixture")

    def request(self, maximum=12, pois=None):
        center = Center(lon=0, lat=0, crs="EPSG:4326")
        ranges = [5, maximum] if maximum > 5 else [maximum]
        return MinuteAccessibilityRequest(
            analysisFingerprint=analysis_fingerprint(center, "foot-walking", ranges, []), poiQueryId="poi-query-fixture",
            center=center, profile="foot-walking", rangesMinutes=ranges, maxRangeMinutes=maximum,
            pois=pois or [{"poiId": "poi-a", "location": {"lon": 0.005, "lat": 0, "crs": "EPSG:4326"}}],
        )

    def test_backend_owns_batches_and_returns_assignments_without_geometry_or_matrix_fields(self):
        adapter = FakeIsochroneAdapter()
        result = asyncio.run(calculate_minute_accessibility(self.request(), self.settings(), adapter=adapter))
        self.assertEqual(adapter.calls, [list(range(1, 11)), [11, 12]])
        self.assertEqual(result.assignments[0].travelTimeMinuteEstimate, 1)
        payload = result.model_dump(mode="json")
        self.assertNotIn("minuteIsochrones", payload)
        self.assertNotIn("travelTimeSeconds", payload["assignments"][0])
        self.assertEqual(result.metadata["batchCount"], 2)

    def test_large_plan_requires_explicit_approval_before_any_call(self):
        adapter = FakeIsochroneAdapter()
        with self.assertRaises(ApprovalRequiredError):
            asyncio.run(calculate_minute_accessibility(self.request(61), self.settings(), adapter=adapter))
        self.assertEqual(adapter.calls, [])

    def test_stale_identity_is_rejected_before_any_upstream_call(self):
        adapter = FakeIsochroneAdapter()
        request = self.request()
        request.analysisFingerprint = "fnv1a-deadbeef"
        with self.assertRaises(AnalysisStaleError):
            asyncio.run(calculate_minute_accessibility(request, self.settings(), adapter=adapter))
        self.assertEqual(adapter.calls, [])

    def test_batch_cache_is_reported_and_poi_identity_does_not_affect_requests(self):
        adapter = FakeIsochroneAdapter(cache_hit=True)
        result = asyncio.run(calculate_minute_accessibility(self.request(18), self.settings(), adapter=adapter))
        self.assertEqual(result.metadata["cacheHitCount"], 2)
        self.assertEqual(result.metadata["upstreamRequestCount"], 0)
        self.assertEqual(adapter.calls, [list(range(1, 11)), list(range(11, 19))])

    def test_minimum_covering_minute_boundary_unassigned_and_non_nested_audit(self):
        request = self.request(3, [
            {"poiId": "a", "location": {"lon": 0, "lat": 0}},
            {"poiId": "b", "location": {"lon": 1.5, "lat": 0}},
            {"poiId": "boundary", "location": {"lon": 2, "lat": 0}},
            {"poiId": "outside", "location": {"lon": 9, "lat": 9}},
        ])
        contours = [
            CumulativeIsochrone(isochroneId="1", rangeMinutes=1, rangeSeconds=60, geometry=mapping(box(-1, -1, 1, 1))),
            CumulativeIsochrone(isochroneId="2", rangeMinutes=2, rangeSeconds=120, geometry=mapping(box(-2, -2, 2, 2))),
            CumulativeIsochrone(isochroneId="3", rangeMinutes=3, rangeSeconds=180, geometry=mapping(box(-0.5, -3, 3, 3))),
        ]
        assignments, stats, audit = classify_minute_accessibility(request, contours)
        indexed = {item.poiId: item for item in assignments}
        self.assertEqual(indexed["a"].travelTimeMinuteEstimate, 1)
        self.assertEqual(indexed["b"].travelTimeMinuteEstimate, 2)
        self.assertEqual(indexed["boundary"].travelTimeMinuteEstimate, 2)
        self.assertEqual(indexed["outside"].status, "unassigned")
        self.assertGreater(stats["boundaryPoiCount"], 0)
        self.assertGreater(stats["nonNestedContourPairCount"], 0)
        self.assertFalse(audit[-1]["pairNested"])

    def test_failed_batch_publishes_no_partial_result(self):
        adapter = FakeIsochroneAdapter(fail_batch=2)
        with self.assertRaises(RuntimeError):
            asyncio.run(calculate_minute_accessibility(self.request(), self.settings(), adapter=adapter))


if __name__ == "__main__":
    unittest.main()
