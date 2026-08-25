import unittest

from app.models import SpatialTimeAccessibilityRequest
from app.services.spatial_time_accessibility import calculate_spatial_time_accessibility
from tests.test_matrix import sample_result


def square(size):
    return {"type": "Polygon", "coordinates": [[[-size, -size], [size, -size], [size, size], [-size, size], [-size, -size]]]}


class SpatialTimeAccessibilityTest(unittest.TestCase):
    def test_assigns_first_covering_minute_without_matrix(self):
        base = sample_result()
        base.center.lon = 0
        base.center.lat = 0
        base.rangesMinutes = [1, 2, 3]
        base.rings = base.rings[:3]
        for index, ring in enumerate(base.rings):
            ring.ringId = f"ring-{index}-{index + 1}"
            ring.innerRangeMinutes = index
            ring.outerRangeMinutes = index + 1
        base.pois = base.pois[:2]
        base.pois[0].location.lon, base.pois[0].location.lat = 0.005, 0
        base.pois[1].location.lon, base.pois[1].location.lat = 0.05, 0
        minute_isochrones = [
            {"isochroneId": f"minute-{minute}", "rangeMinutes": minute, "rangeSeconds": minute * 60, "geometry": square(minute * 0.01)}
            for minute in range(1, 4)
        ]
        result = calculate_spatial_time_accessibility(SpatialTimeAccessibilityRequest(baseResult=base, minuteIsochrones=minute_isochrones))
        self.assertIsNone(result.pois[0].travelTimeSeconds)
        self.assertIsNone(result.pois[0].networkDistanceMeters)
        self.assertEqual(result.pois[0].travelTimeMinuteEstimate, 1)
        self.assertEqual(result.pois[0].travelTimeBand, {"lowerExclusiveMinutes": 0, "upperInclusiveMinutes": 1})
        self.assertEqual(result.pois[0].travelTimeMethod, "isochrone-minute-band")
        self.assertIsNone(result.pois[0].bandAssignmentMethod)
        self.assertIsNone(result.pois[1].travelTimeSeconds)
        self.assertIsNone(result.metadata.matrix)
        self.assertEqual(result.metadata.spatialTime["precisionMinutes"], 1)


if __name__ == "__main__":
    unittest.main()
