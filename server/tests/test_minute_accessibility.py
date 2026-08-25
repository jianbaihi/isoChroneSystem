import asyncio
import unittest

from shapely.geometry import mapping, box

from app.config import Settings
from app.errors import ApprovalRequiredError
from app.models import CumulativeIsochrone, MinuteAccessibilityRequest
from app.services.minute_accessibility import calculate_minute_accessibility
from tests.test_matrix import sample_result


class FakeIsochroneAdapter:
    def __init__(self, fail_batch=None):
        self.calls = []
        self.last_cache_hit = False
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

    def base(self, maximum=12):
        result = sample_result()
        result.center.lon = 0
        result.center.lat = 0
        result.rangesMinutes = [5, maximum]
        result.pois = result.pois[:1]
        result.pois[0].location.lon = 0.005
        result.pois[0].location.lat = 0
        return result

    def test_backend_owns_batches_and_preserves_matrix_fields(self):
        adapter = FakeIsochroneAdapter()
        result = asyncio.run(calculate_minute_accessibility(
            MinuteAccessibilityRequest(baseResult=self.base()), self.settings(), adapter=adapter,
        ))
        self.assertEqual(adapter.calls, [list(range(1, 11)), [11, 12]])
        self.assertEqual(result.pois[0].travelTimeMinuteEstimate, 1)
        self.assertIsNone(result.pois[0].travelTimeSeconds)
        self.assertIsNone(result.pois[0].networkDistanceMeters)
        self.assertEqual(result.metadata.spatialTime["batchCount"], 2)

    def test_large_plan_requires_explicit_approval_before_any_call(self):
        adapter = FakeIsochroneAdapter()
        with self.assertRaises(ApprovalRequiredError):
            asyncio.run(calculate_minute_accessibility(
                MinuteAccessibilityRequest(baseResult=self.base(61)), self.settings(), adapter=adapter,
            ))
        self.assertEqual(adapter.calls, [])

    def test_failed_batch_does_not_mutate_base_result(self):
        base = self.base()
        adapter = FakeIsochroneAdapter(fail_batch=2)
        with self.assertRaises(RuntimeError):
            asyncio.run(calculate_minute_accessibility(
                MinuteAccessibilityRequest(baseResult=base), self.settings(), adapter=adapter,
            ))
        self.assertIsNone(base.pois[0].travelTimeMinuteEstimate)


if __name__ == "__main__":
    unittest.main()
