import asyncio
import unittest

from app.adapters.ors_matrix import MatrixComputation, OrsMatrixAdapter
from app.config import Settings
from app.models import CumulativeIsochrone, MatrixAccessibilityRequest, NameCloudRequest, Poi
from app.services.analysis import create_name_cloud
from app.services.matrix_accessibility import calculate_matrix_accessibility


def settings() -> Settings:
    return Settings(
        app_env="test",
        app_host="127.0.0.1",
        app_port=8000,
        cors_origins=("http://127.0.0.1:5500",),
        analysis_provider="ors",
        ors_base_url="https://example.test",
        ors_api_key="fixture-key",
        poi_provider="ors_remote",
    )


def polygon(delta: float) -> dict:
    lon, lat = 121.4737, 31.2304
    return {
        "type": "Polygon",
        "coordinates": [[
            [lon - delta, lat - delta], [lon + delta, lat - delta],
            [lon + delta, lat + delta], [lon - delta, lat + delta],
            [lon - delta, lat - delta],
        ]],
    }


class FakePoiProvider:
    async def fetch(self, request, outer_geometry, rings, *, single_polygon=False, approved=False):
        self.request = request
        self.single_polygon = single_polygon
        poi = Poi(
            poiId="dynamic-poi-1",
            name="动态阈值测试点",
            location={"lon": 121.4738, "lat": 31.2305},
            ringId="ring-0-5",
        )
        return {
            "pois": [poi], "categories": [], "ringCounts": {"ring-0-5": 1},
            "matchedCount": 1, "returnedCount": 1, "truncated": False,
            "coverage": {"requests": 1, "cacheHits": 0},
            "diagnostics": {}, "attribution": [],
        }


class DynamicOnlineWorkflowTest(unittest.TestCase):
    def test_arbitrary_center_profile_and_ranges_flow_from_poi_to_matrix(self):
        ranges = [5, 15]
        cumulative = [
            CumulativeIsochrone(isochroneId="iso-5", rangeMinutes=5, rangeSeconds=300, geometry=polygon(0.002)),
            CumulativeIsochrone(isochroneId="iso-15", rangeMinutes=15, rangeSeconds=900, geometry=polygon(0.004)),
        ]
        provider = FakePoiProvider()
        poi_result = asyncio.run(create_name_cloud(
            request=NameCloudRequest(
                center={"lon": 121.4737, "lat": 31.2304, "label": "上海测试中心", "source": "geocoder"},
                profile="driving-car",
                rangesMinutes=ranges,
                cumulativeIsochrones=cumulative,
            ),
            request_id="dynamic-request",
            settings=settings(),
            poi_provider=provider,
        ))
        self.assertEqual(poi_result.center.label, "上海测试中心")
        self.assertEqual(poi_result.profile, "driving-car")
        self.assertEqual(poi_result.rangesMinutes, ranges)
        self.assertEqual([ring.ringId for ring in poi_result.rings], ["ring-0-5", "ring-5-15"])
        self.assertEqual(poi_result.metadata.poiCoverage["rangeSeconds"], 900)

        adapter = OrsMatrixAdapter(settings(), profile="driving-car")
        accessibility = adapter.parse_response(
            {
                "durations": [[600]], "distances": [[1500]],
                "sources": [{"location": [121.4737, 31.2304]}],
                "destinations": [{"location": [121.4738, 31.2305]}],
            },
            center=poi_result.center,
            pois=poi_result.pois,
            analysis_run_id=poi_result.analysisId,
            calculated_at="2026-08-25T00:00:00Z",
            matrix_batch_id="dynamic-batch",
            ranges_minutes=ranges,
        )

        class FakeMatrixAdapter:
            async def calculate(self, **kwargs):
                self.kwargs = kwargs
                return MatrixComputation(accessibility, {
                    "calculatedAt": "2026-08-25T00:00:00Z",
                    "matrixBatchId": "dynamic-batch",
                    "cache": "miss",
                    "upstreamRequestCount": 1,
                })

        matrix_result = asyncio.run(calculate_matrix_accessibility(
            MatrixAccessibilityRequest(baseResult=poi_result),
            settings(),
            matrix_adapter=FakeMatrixAdapter(),
        ))
        self.assertEqual(matrix_result.pois[0].ringId, "ring-5-15")
        self.assertEqual(matrix_result.pois[0].travelTimeSeconds, 600)
        self.assertEqual(matrix_result.metadata.matrix["profile"], "driving-car")
        self.assertEqual(matrix_result.metadata.matrix["matrixBandCounts"], {"ring-5-15": 1})


if __name__ == "__main__":
    unittest.main()
