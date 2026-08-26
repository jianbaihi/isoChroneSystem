import unittest

from app.errors import AnalysisStaleError
from app.models import PoiQueryRequest
from app.services.poi_query import analysis_fingerprint, query_pois
from app.config import Settings


def polygon(size=0.01):
    return {"type": "Polygon", "coordinates": [[[0, 0], [size, 0], [size, size], [0, size], [0, 0]]]}


class FakeProvider:
    def __init__(self):
        self.calls = 0

    async def fetch(self, request, outer_geometry, rings, **kwargs):
        self.calls += 1
        return {
            "pois": [], "categories": [], "ringCounts": {"ring-0-7": 0},
            "matchedCount": 0, "returnedCount": 0, "diagnostics": {"outside_outer_isochrone": 1},
            "coverage": {"requests": 1, "cacheHits": 0, "estimatedTileCount": 1, "parsedPoiCount": 2,
                         "deduplicatedPoiCount": 1, "rawPoiCount": 3},
            "attribution": [],
        }


class PoiQueryTest(unittest.IsolatedAsyncioTestCase):
    def request(self):
        center = {"lon": 0, "lat": 0, "crs": "EPSG:4326", "source": "map-pick"}
        ranges = [7]
        contour = {"isochroneId": "iso-7", "rangeMinutes": 7, "rangeSeconds": 420, "geometry": polygon()}
        return PoiQueryRequest(
            analysisFingerprint=analysis_fingerprint(type("C", (), center)(), "foot-walking", ranges, []),
            center=center, profile="foot-walking", rangesMinutes=ranges, categoryIds=[],
            cumulativeIsochrones=[contour], outerIsochrone=contour,
        )

    async def test_builds_independent_empty_result_without_other_upstreams(self):
        provider = FakeProvider()
        result = await query_pois(self.request(), Settings.from_environment({}), provider)
        self.assertEqual(result.outerRangeMinutes, 7)
        self.assertEqual(result.pois, [])
        self.assertEqual(result.metadata["minuteUpstreamRequestCount"], 0)
        self.assertEqual(result.metadata["matrixUpstreamRequestCount"], 0)
        self.assertEqual(result.metadata["panmapLayoutCallCount"], 0)
        self.assertEqual(result.coverage["outsideRemovedCount"], 1)

    async def test_stale_fingerprint_rejected_before_provider(self):
        provider = FakeProvider()
        request = self.request().copy(update={"analysisFingerprint": "fnv1a-deadbeef"})
        with self.assertRaises(AnalysisStaleError):
            await query_pois(request, Settings.from_environment({}), provider)
        self.assertEqual(provider.calls, 0)

