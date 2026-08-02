import json
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import UpstreamRateLimitedError
from app.main import app
from app.models import CumulativeIsochrone
from app.services.geometry import normalize_geojson_geometry


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "ors_isochrones_success.json"


def ors_settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "app_host": "127.0.0.1",
        "app_port": 8000,
        "cors_origins": ("http://127.0.0.1:5500",),
        "analysis_provider": "ors",
        "ors_base_url": "https://example.test",
        "ors_api_key": "fixture-key",
        "ors_timeout_seconds": 3.0,
    }
    values.update(overrides)
    return Settings(**values)


def fixture_isochrones() -> list[CumulativeIsochrone]:
    payload = json.loads(FIXTURE_PATH.read_text())
    by_value = {feature["properties"]["value"]: feature for feature in payload["features"]}
    return [
        CumulativeIsochrone(
            isochroneId=f"isochrone-{minutes}",
            rangeMinutes=minutes,
            rangeSeconds=minutes * 60,
            geometry=normalize_geojson_geometry(by_value[minutes * 60]["geometry"]),
        )
        for minutes in (10, 20, 30)
    ]


class StubProvider:
    def __init__(self, error=None):
        self.error = error

    async def create_isochrones(self, request):
        if self.error:
            raise self.error
        return fixture_isochrones()


class OrsAnalysisApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_settings = app.state.settings
        self.original_adapter = getattr(app.state, "ors_adapter", None)
        app.state.settings = ors_settings()
        app.state.ors_adapter = StubProvider()
        self.client = TestClient(app)
        self.request = {
            "schemaVersion": "1.0",
            "center": {"lon": 116.4815, "lat": 39.9906, "crs": "EPSG:4326", "label": "望京广场"},
            "profile": "foot-walking",
            "rangesMinutes": [10, 20, 30],
            "categoryIds": ["food", "shopping"],
            "options": {"includePois": False, "calculateTravelTimes": False},
        }

    def tearDown(self) -> None:
        app.state.settings = self.original_settings
        if self.original_adapter is None:
            try:
                del app.state.ors_adapter
            except AttributeError:
                pass
        else:
            app.state.ors_adapter = self.original_adapter

    def test_ors_result_contains_valid_exclusive_rings_without_mock_fallback(self):
        response = self.client.post(
            "/api/v1/analyses",
            json=self.request,
            headers={"X-Request-ID": "ors-fixture-request"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(response.headers["X-Request-ID"], "ors-fixture-request")
        self.assertEqual(payload["metadata"]["requestId"], "ors-fixture-request")
        self.assertEqual(payload["metadata"]["source"], "ors")
        self.assertEqual(payload["metadata"]["sources"], {"isochrones": "ors", "pois": "none"})
        self.assertEqual([item["rangeMinutes"] for item in payload["cumulativeIsochrones"]], [10, 20, 30])
        self.assertEqual([item["rangeSeconds"] for item in payload["cumulativeIsochrones"]], [600, 1200, 1800])
        self.assertEqual(len(payload["rings"]), 3)
        self.assertTrue(all(ring["geometry"]["type"] in {"Polygon", "MultiPolygon"} for ring in payload["rings"]))
        self.assertEqual(payload["pois"], [])
        self.assertNotIn("POI 数据仍为开发用模拟数据。", payload["metadata"]["warnings"])

    def test_ors_without_pois_has_ors_source_and_no_pois(self):
        request = {**self.request, "options": {"includePois": False, "calculateTravelTimes": False}}
        response = self.client.post("/api/v1/analyses", json=request)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["metadata"]["source"], "ors")
        self.assertEqual(payload["metadata"]["sources"], {"isochrones": "ors", "pois": "none"})
        self.assertEqual(payload["pois"], [])

    def test_missing_ors_key_is_clear_and_health_is_not_ready(self):
        app.state.settings = ors_settings(ors_api_key="")
        app.state.ors_adapter = None
        health = self.client.get("/api/v1/health")
        self.assertFalse(health.json()["providerReady"])
        response = self.client.post("/api/v1/analyses", json=self.request)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error"]["code"], "PROVIDER_NOT_CONFIGURED")

    def test_upstream_retry_after_is_mapped_safely(self):
        app.state.ors_adapter = StubProvider(UpstreamRateLimitedError("15"))
        # The concrete error class owns the safe retry-after value in production.
        app.state.ors_adapter.error.retry_after = "15"
        response = self.client.post("/api/v1/analyses", json=self.request)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "15")
        self.assertEqual(response.json()["error"]["code"], "UPSTREAM_RATE_LIMITED")


if __name__ == "__main__":
    unittest.main()
