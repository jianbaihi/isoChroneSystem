import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.config import Settings


class AnalysisApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_settings = app.state.settings
        app.state.settings = Settings(
            app_env="test", app_host="127.0.0.1", app_port=8000,
            cors_origins=("http://127.0.0.1:5500",), analysis_provider="mock",
            ors_base_url="https://api.example.test",
            allow_network=False, allow_mock_fallback=False,
        )
        self.client = TestClient(app)
        self.request = {
            "schemaVersion": "1.0",
            "center": {"lon": 116.4815, "lat": 39.9906, "crs": "EPSG:4326", "label": "望京广场"},
            "profile": "foot-walking",
            "rangesMinutes": [10, 20, 30],
            "categoryIds": ["food", "shopping"],
            "options": {"includePois": True, "calculateTravelTimes": False},
        }

    def tearDown(self) -> None:
        app.state.settings = self.original_settings

    def test_health(self):
        response = self.client.get("/api/v1/health", headers={"X-Request-ID": "test-health-1"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "mock")
        self.assertTrue(response.json()["providerReady"])
        self.assertEqual(response.json()["status"], "ready")
        self.assertFalse(response.json()["networkProbePerformed"])
        self.assertEqual(response.headers["X-Request-ID"], "test-health-1")

    def test_valid_analysis_preserves_request_fields(self):
        response = self.client.post("/api/v1/analyses", json=self.request)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["center"]["lon"], self.request["center"]["lon"])
        self.assertEqual(payload["center"]["lat"], self.request["center"]["lat"])
        self.assertEqual(payload["profile"], self.request["profile"])
        self.assertEqual(payload["rangesMinutes"], self.request["rangesMinutes"])
        self.assertEqual(payload["metadata"]["source"], "mock")
        self.assertEqual(payload["metadata"]["sources"], {"isochrones": "mock", "pois": "mock"})
        self.assertEqual(response.headers["X-Request-ID"], payload["metadata"]["requestId"])

    def test_rings_are_contiguous(self):
        payload = self.client.post("/api/v1/analyses", json=self.request).json()
        previous = 0
        for ring in payload["rings"]:
            self.assertEqual(ring["innerRangeMinutes"], previous)
            self.assertEqual(ring["geometry"], None)
            previous = ring["outerRangeMinutes"]

    def test_invalid_coordinate_has_unified_error(self):
        request = {**self.request, "center": {**self.request["center"], "lat": 91}}
        response = self.client.post("/api/v1/analyses", json=request)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")
        self.assertTrue(response.json()["error"]["requestId"])

    def test_invalid_ranges_have_unified_error(self):
        for ranges in ([10, 10], [20, 10], [0, 10], list(range(1, 12))):
            response = self.client.post("/api/v1/analyses", json={**self.request, "rangesMinutes": ranges})
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["error"]["code"], "VALIDATION_ERROR")

    def test_matrix_is_not_available(self):
        request = {**self.request, "options": {"includePois": True, "calculateTravelTimes": True}}
        response = self.client.post("/api/v1/analyses", json=request)
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.json()["error"]["code"], "FEATURE_NOT_AVAILABLE")

    def test_mock_result_does_not_fabricate_travel_time(self):
        payload = self.client.post("/api/v1/analyses", json=self.request).json()
        self.assertTrue(payload["metadata"]["warnings"])
        self.assertTrue(all(poi["travelTimeSeconds"] is None for poi in payload["pois"]))
        self.assertTrue(all(ring["geometry"] is None for ring in payload["rings"]))

    def test_mock_without_pois_has_none_poi_source(self):
        request = {**self.request, "options": {"includePois": False, "calculateTravelTimes": False}}
        response = self.client.post("/api/v1/analyses", json=request)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["pois"], [])
        self.assertEqual(payload["metadata"]["sources"]["pois"], "none")
        self.assertTrue(all(ring["statistics"]["poiCount"] == 0 for ring in payload["rings"]))


if __name__ == "__main__":
    unittest.main()
