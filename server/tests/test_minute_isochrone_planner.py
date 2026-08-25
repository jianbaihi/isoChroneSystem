import unittest

from app.services.minute_isochrone_planner import build_minute_isochrone_plan


class MinuteIsochronePlannerTest(unittest.TestCase):
    def test_expected_batch_counts_and_complete_ranges(self):
        for maximum, expected in ((1, 1), (10, 1), (11, 2), (20, 2), (21, 3), (28, 3), (60, 6)):
            plan = build_minute_isochrone_plan("driving-car", maximum)
            self.assertEqual(plan.batchCount, expected)
            flattened = [value for batch in plan.batches for value in batch]
            self.assertEqual(flattened, list(range(1, maximum + 1)))
            self.assertTrue(all(len(batch) <= 10 for batch in plan.batches))

    def test_provider_limit_and_auto_approval_are_distinct(self):
        with self.assertRaisesRegex(ValueError, "最大时间范围为 60 分钟"):
            build_minute_isochrone_plan("driving-car", 61)
        walking = build_minute_isochrone_plan("foot-walking", 61)
        self.assertTrue(walking.approvalRequired)
        self.assertEqual(walking.batchCount, 7)


if __name__ == "__main__":
    unittest.main()
