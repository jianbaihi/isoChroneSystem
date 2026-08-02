import asyncio
import json
import unittest

from fastapi.testclient import TestClient

from app.adapters.ors import OrsAdapter
from app.adapters.ors_matrix import OrsMatrixAdapter
from app.config import ConfigurationError, Settings
from app.errors import InvalidProviderParameterError, NetworkDisabledError
from app.main import app
from app.models import AnalysisRequest, Center, Poi
from app.providers.geocoder import OrsGeocoder
from app.providers.poi.ors_client import OrsPoiClient
from app.services.analysis import create_analysis


def online_settings(**overrides):
    values = {
        "app_env": "development", "app_host": "127.0.0.1", "app_port": 8000,
        "cors_origins": ("http://127.0.0.1:5500",), "analysis_provider": "ors",
        "poi_provider": "ors_remote", "ors_base_url": "https://api.example.test",
        "ors_api_key": "fixture-key", "allow_mock_fallback": False, "allow_network": True,
    }
    values.update(overrides)
    return Settings(**values)


def request(include_pois=False):
    return AnalysisRequest(
        center={"lon": 114.296944, "lat": 30.546944}, profile="foot-walking",
        rangesMinutes=[10, 20, 30], options={"includePois": include_pois},
    )


class OnlineConfigurationTest(unittest.TestCase):
    def test_development_defaults_to_all_online_providers(self):
        settings = Settings.from_environment({"ORS_API_KEY": "fixture-key"})
        self.assertEqual(settings.app_env, "development")
        self.assertEqual(settings.analysis_provider, "ors")
        self.assertEqual(settings.poi_provider, "ors_remote")
        self.assertFalse(settings.allow_mock_fallback)
        self.assertTrue(settings.allow_network)
        self.assertTrue(settings.provider_ready)
        self.assertEqual(settings.cors_origins, ("http://127.0.0.1:5500",))

    def test_mock_is_only_explicit_test_and_test_network_is_forbidden(self):
        with self.assertRaises(ConfigurationError):
            Settings.from_environment({"APP_ENV": "development", "ANALYSIS_PROVIDER": "mock"})
        fixture = Settings.from_environment({"APP_ENV": "test", "ANALYSIS_PROVIDER": "mock", "ALLOW_NETWORK": "false"})
        self.assertTrue(fixture.provider_ready)
        self.assertFalse(fixture.allow_network)
        with self.assertRaises(ConfigurationError):
            Settings.from_environment({"APP_ENV": "test", "ANALYSIS_PROVIDER": "mock", "ALLOW_NETWORK": "true"})

    def test_missing_key_is_not_ready_without_mock_fallback(self):
        settings = Settings.from_environment({"ORS_API_KEY": ""})
        readiness = settings.readiness()
        self.assertFalse(settings.provider_ready)
        self.assertEqual(readiness["status"], "not-ready")
        self.assertEqual(readiness["missingConfiguration"], ["ORS_API_KEY"])
        self.assertFalse(readiness["mockFallback"])

    def test_invalid_online_provider_combination_is_rejected(self):
        for values in (
            {"POI_PROVIDER": "none"},
            {"ANALYSIS_PROVIDER": "mock"},
            {"ALLOW_MOCK_FALLBACK": "true"},
        ):
            with self.assertRaises(ConfigurationError):
                Settings.from_environment(values)


class HealthAndNetworkGuardTest(unittest.TestCase):
    def setUp(self):
        self.previous = app.state.settings
        app.state.settings = online_settings(ors_api_key="")
        self.client = TestClient(app)

    def tearDown(self):
        app.state.settings = self.previous

    def test_health_is_local_not_ready_and_secret_free(self):
        response = self.client.get("/api/v1/health", headers={"Origin": "http://127.0.0.1:5500"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "not-ready")
        self.assertFalse(payload["networkProbePerformed"])
        self.assertFalse(payload["mockFallback"])
        self.assertEqual(payload["missingConfiguration"], ["ORS_API_KEY"])
        encoded = json.dumps(payload)
        self.assertNotIn("fixture-key", encoded)
        self.assertNotIn("/Users/", encoded)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://127.0.0.1:5500")

    def test_unmocked_test_adapters_fail_before_network(self):
        settings = Settings(
            app_env="test", app_host="127.0.0.1", app_port=8000, cors_origins=(),
            analysis_provider="ors", poi_provider="ors_remote", ors_api_key="fixture-key",
            ors_base_url="https://api.example.test",
            allow_network=False, allow_mock_fallback=False,
        )
        center = Center(lon=114.296944, lat=30.546944)
        poi = Poi(poiId="fixture", name="Fixture", location={"lon": 114.3, "lat": 30.55}, ringId="ring-0-10")
        async def run():
            operations = (
                OrsAdapter(settings).create_isochrones(request()),
                OrsMatrixAdapter(settings).calculate(center=center, pois=[poi], analysis_run_id="fixture"),
                OrsGeocoder(settings).lookup("search", text="fixture"),
                OrsPoiClient(settings).query({"request": "fixture"}),
            )
            for operation in operations:
                with self.assertRaises(NetworkDisabledError):
                    await operation
        asyncio.run(run())

    def test_online_analysis_never_falls_back_to_mock_pois(self):
        class IsoFixture:
            async def create_isochrones(self, _request):
                from app.models import CumulativeIsochrone
                values = []
                for value, delta in ((10, 0.001), (20, 0.002), (30, 0.003)):
                    ring = [[
                        [114.296944 - delta, 30.546944 - delta], [114.296944 + delta, 30.546944 - delta],
                        [114.296944 + delta, 30.546944 + delta], [114.296944 - delta, 30.546944 + delta],
                        [114.296944 - delta, 30.546944 - delta],
                    ]]
                    values.append(CumulativeIsochrone(
                        isochroneId=f"i-{value}", rangeMinutes=value, rangeSeconds=value * 60,
                        geometry={"type": "Polygon", "coordinates": ring},
                    ))
                return values
        settings = online_settings(poi_provider="none")
        with self.assertRaises(InvalidProviderParameterError):
            asyncio.run(create_analysis(request(True), "request", settings, ors_adapter=IsoFixture()))


if __name__ == "__main__":
    unittest.main()
