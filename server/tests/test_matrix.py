import asyncio
import copy
import tempfile
import unittest
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.adapters.ors_matrix import MatrixComputation, OrsMatrixAdapter, matrix_band_id
from app.config import Settings
from app.errors import InvalidMatrixResponseError
from app.main import app
from app.models import AnalysisMetadata, AnalysisResult, Center, MatrixAccessibilityRequest, Poi, Ring, RingStatistics
from app.services.matrix_accessibility import calculate_matrix_accessibility
from app.services.quota import QuotaObserver


def sample_settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "app_host": "127.0.0.1",
        "app_port": 8000,
        "cors_origins": ("http://127.0.0.1:5500",),
        "analysis_provider": "ors",
        "ors_base_url": "https://api.example.test",
        "ors_api_key": "fixture-key",
        "ors_matrix_timeout_seconds": 3,
    }
    values.update(overrides)
    return Settings(**values)


def sample_pois() -> list[Poi]:
    return [
        Poi(poiId="poi-c", name="C", location={"lon": 114.297, "lat": 30.547}, ringId="ring-0-10"),
        Poi(poiId="poi-a", name="A", location={"lon": 114.30, "lat": 30.55}, ringId="ring-10-20"),
        Poi(poiId="poi-b", name="B", location={"lon": 114.31, "lat": 30.56}, ringId="ring-20-30"),
    ]


def sample_payload(durations=None, distances=None):
    return {
        "durations": [durations or [600, 1200, 1800]],
        "distances": [distances or [500, 1000, 1500]],
        "sources": [{"location": [114.296944, 30.546944], "snapped_distance": 1.2}],
        "destinations": [
            {"location": [114.297, 30.547], "snapped_distance": 2.1},
            {"location": [114.30, 30.55], "snapped_distance": 3.2},
            {"location": [114.31, 30.56], "snapped_distance": 4.3},
        ],
        "metadata": {"engine": {"graph_date": "2026-07-01T00:00:00Z"}},
    }


def sample_result() -> AnalysisResult:
    return AnalysisResult(
        analysisId="analysis-stage5",
        center={"lon": 114.296944, "lat": 30.546944, "id": "wuhan-huanghelou", "label": "武汉·黄鹤楼"},
        profile="foot-walking",
        rangesMinutes=[10, 20, 30],
        rings=[
            Ring(ringId="ring-0-10", innerRangeMinutes=0, outerRangeMinutes=10, statistics=RingStatistics(poiCount=1)),
            Ring(ringId="ring-10-20", innerRangeMinutes=10, outerRangeMinutes=20, statistics=RingStatistics(poiCount=1)),
            Ring(ringId="ring-20-30", innerRangeMinutes=20, outerRangeMinutes=30, statistics=RingStatistics(poiCount=1)),
        ],
        pois=sample_pois(),
        nameCloud={"stats": {"bandCounts": {"ring-0-10": 1, "ring-10-20": 1, "ring-20-30": 1}}, "bands": []},
        metadata=AnalysisMetadata(
            source="mixed",
            sources={"isochrones": "ors-public-api", "pois": "ors-openpoiservice"},
            generatedAt="2026-07-30T00:00:00Z",
            requestId="fixture-request",
            apiQuota={"services": {}},
            poiSelection={"travelTimesCalculated": False},
        ),
    )


class OrsMatrixAdapterTest(unittest.TestCase):
    def test_request_is_explicit_one_to_many_and_preserves_poi_order(self):
        body = OrsMatrixAdapter.request_body(Center(lon=114.296944, lat=30.546944), sample_pois())
        self.assertEqual(body["sources"], ["0"])
        self.assertEqual(body["destinations"], ["1", "2", "3"])
        self.assertEqual(len(body["locations"]), 4)
        self.assertEqual(body["locations"][1], [114.297, 30.547])
        self.assertEqual(body["metrics"], ["duration", "distance"])

    def test_response_maps_by_saved_order_and_boundaries_use_earlier_band(self):
        adapter = OrsMatrixAdapter(sample_settings())
        result = adapter.parse_response(
            sample_payload(), center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
            analysis_run_id="run", calculated_at="2026-07-31T00:00:00Z", matrix_batch_id="batch",
        )
        self.assertEqual([item.poiId for item in result], ["poi-c", "poi-a", "poi-b"])
        self.assertEqual([item.matrixBandId for item in result], ["ring-0-10", "ring-10-20", "ring-20-30"])
        self.assertEqual([item.networkDistanceMeters for item in result], [500, 1000, 1500])
        self.assertEqual(result[0].snappedDistanceMeters, 2.1)
        self.assertEqual(result[0].routingGraphDate, "2026-07-01T00:00:00Z")
        self.assertEqual(matrix_band_id(1800.01), "matrix-out-of-range")

    def test_custom_thresholds_create_dynamic_mutually_exclusive_bands(self):
        self.assertEqual(matrix_band_id(300, [5, 15, 45]), "ring-0-5")
        self.assertEqual(matrix_band_id(301, [5, 15, 45]), "ring-5-15")
        self.assertEqual(matrix_band_id(2700, [5, 15, 45]), "ring-15-45")
        self.assertEqual(matrix_band_id(2700.1, [5, 15, 45]), "matrix-out-of-range")

    def test_null_and_invalid_numbers_are_never_coerced_to_zero(self):
        adapter = OrsMatrixAdapter(sample_settings())
        payload = sample_payload([None, -1, float("inf")], [None, 10, 20])
        result = adapter.parse_response(
            payload, center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
            analysis_run_id="run", calculated_at="time", matrix_batch_id="batch",
        )
        self.assertEqual([item.matrixStatus for item in result], ["unreachable", "invalid", "invalid"])
        self.assertTrue(all(item.travelTimeSeconds is None for item in result))

    def test_zero_duration_requires_same_resolved_point(self):
        adapter = OrsMatrixAdapter(sample_settings())
        payload = sample_payload([0, 600, 600], [0, 1, 1])
        first = adapter.parse_response(
            payload, center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
            analysis_run_id="run", calculated_at="time", matrix_batch_id="batch",
        )
        self.assertEqual(first[0].matrixStatus, "invalid")
        payload["destinations"][0]["location"] = payload["sources"][0]["location"]
        second = adapter.parse_response(
            payload, center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
            analysis_run_id="run", calculated_at="time", matrix_batch_id="batch",
        )
        self.assertEqual(second[0].matrixStatus, "ok")

    def test_dimension_mismatches_are_rejected(self):
        adapter = OrsMatrixAdapter(sample_settings())
        cases = []
        too_short = sample_payload()
        too_short["durations"] = [[1, 2]]
        cases.append(too_short)
        too_long = sample_payload()
        too_long["distances"] = [[1, 2, 3, 4]]
        cases.append(too_long)
        extra_source = sample_payload()
        extra_source["durations"] = [[1, 2, 3], [1, 2, 3]]
        cases.append(extra_source)
        for payload in cases:
            with self.assertRaises(InvalidMatrixResponseError):
                adapter.parse_response(
                    payload, center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
                    analysis_run_id="run", calculated_at="time", matrix_batch_id="batch",
                )

    def test_identical_input_uses_cache_without_second_upstream_request(self):
        calls = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(200, json=sample_payload(), headers={"X-RateLimit-Remaining": "99"}, request=request)

        async def run(cache_dir: str):
            configured = sample_settings(app_env="development", ors_cache_dir=cache_dir)
            observer = QuotaObserver()
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                adapter = OrsMatrixAdapter(configured, client=client, quota_observer=observer)
                first = await adapter.calculate(center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(), analysis_run_id="run")
                second = await adapter.calculate(center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(), analysis_run_id="run")
                return first, second

        with tempfile.TemporaryDirectory() as directory:
            first, second = asyncio.run(run(directory))
            self.assertEqual(calls, 1)
            self.assertEqual(first.metadata["calculatedAt"], second.metadata["calculatedAt"])
            self.assertEqual(second.metadata["cache"], "hit")
            self.assertEqual(second.metadata["upstreamRequestCount"], 0)
            cache_text = "".join(path.read_text() for path in Path(directory).glob("*.json"))
            self.assertNotIn("fixture-key", cache_text)


class MatrixAccessibilityServiceTest(unittest.TestCase):
    def _computation(self, payload, metadata=None):
        adapter = OrsMatrixAdapter(sample_settings())
        accessibility = adapter.parse_response(
            payload, center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
            analysis_run_id="analysis-stage5", calculated_at="2026-07-31T00:00:00Z", matrix_batch_id="batch",
        )
        return MatrixComputation(accessibility, metadata or {"calculatedAt": "2026-07-31T00:00:00Z", "matrixBatchId": "batch", "cache": "miss", "upstreamRequestCount": 1})

    def test_complete_result_reassigns_bands_and_reports_migrations(self):
        computation = self._computation(sample_payload([601, 1201, 1801], [500, 1000, 1500]))

        class FakeAdapter:
            async def calculate(self, **kwargs):
                return computation

        result = asyncio.run(calculate_matrix_accessibility(
            MatrixAccessibilityRequest(baseResult=sample_result()), sample_settings(), matrix_adapter=FakeAdapter()
        ))
        self.assertEqual([poi.ringId for poi in result.pois], ["ring-10-20", "ring-20-30", "matrix-out-of-range"])
        self.assertEqual(result.metadata.matrix["matrixOkCount"], 3)
        self.assertEqual(result.metadata.matrix["matrixWithinRangeCount"], 2)
        self.assertEqual(result.metadata.matrix["matrixOutOfRangeCount"], 1)
        self.assertEqual(result.metadata.matrix["spatialVsMatrixMismatchCount"], 3)
        self.assertEqual([ring.statistics.poiCount for ring in result.rings], [0, 1, 1])

    def test_null_destination_is_audited_and_input_is_not_mutated(self):
        base = sample_result()
        before = copy.deepcopy(base.model_dump(mode="json"))
        computation = self._computation(sample_payload([600, None, 1800], [500, None, 1500]))

        class FakeAdapter:
            async def calculate(self, **kwargs):
                return computation

        result = asyncio.run(calculate_matrix_accessibility(
            MatrixAccessibilityRequest(baseResult=base), sample_settings(), matrix_adapter=FakeAdapter()
        ))
        self.assertEqual(result.metadata.matrix["requestedPoiCount"], 3)
        self.assertEqual(result.metadata.matrix["matrixOkCount"], 2)
        self.assertEqual(result.metadata.matrix["matrixNullCount"], 1)
        self.assertEqual(result.metadata.matrix["matrixInvalidCount"], 0)
        self.assertEqual(len(result.accessibility), 3)
        self.assertEqual(base.model_dump(mode="json"), before)


class MatrixAccessibilityApiTest(unittest.TestCase):
    def test_local_business_endpoint_returns_complete_atomic_result(self):
        adapter = OrsMatrixAdapter(sample_settings())
        accessibility = adapter.parse_response(
            sample_payload(), center=Center(lon=114.296944, lat=30.546944), pois=sample_pois(),
            analysis_run_id="analysis-stage5", calculated_at="2026-07-31T00:00:00Z", matrix_batch_id="batch",
        )
        computation = MatrixComputation(accessibility, {
            "calculatedAt": "2026-07-31T00:00:00Z", "matrixBatchId": "batch",
            "cache": "miss", "upstreamRequestCount": 1,
        })

        class FakeAdapter:
            async def calculate(self, **kwargs):
                return computation

        previous_settings = app.state.settings
        previous_adapter = getattr(app.state, "matrix_adapter", None)
        app.state.settings = sample_settings()
        app.state.matrix_adapter = FakeAdapter()
        try:
            response = TestClient(app).post("/api/v1/matrix-accessibility", json={
                "schemaVersion": "1.0",
                "baseResult": sample_result().model_dump(mode="json"),
            })
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertEqual(payload["metadata"]["matrix"]["matrixOkCount"], 3)
            self.assertEqual(len(payload["accessibility"]), 3)
        finally:
            app.state.settings = previous_settings
            if previous_adapter is None:
                app.state._state.pop("matrix_adapter", None)
            else:
                app.state.matrix_adapter = previous_adapter


if __name__ == "__main__":
    unittest.main()
