import asyncio
import copy
import json
import unittest
from pathlib import Path

import httpx

from app.adapters.ors import OrsAdapter
from app.config import ConfigurationError, Settings
from app.errors import (
    InvalidProviderResponseError,
    ProviderNotConfiguredError,
    UpstreamAuthError,
    UpstreamRateLimitedError,
    UpstreamRequestRejectedError,
    UpstreamTimeoutError,
    UpstreamUnavailableError,
)
from app.models import AnalysisRequest


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "ors_isochrones_success.json"


def sample_request() -> AnalysisRequest:
    return AnalysisRequest(
        schemaVersion="1.0",
        center={"lon": 116.4815, "lat": 39.9906, "crs": "EPSG:4326"},
        profile="foot-walking",
        rangesMinutes=[10, 20, 30],
        categoryIds=["food"],
        options={"includePois": True, "calculateTravelTimes": False},
    )


def sample_settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "app_host": "127.0.0.1",
        "app_port": 8000,
        "cors_origins": ("http://127.0.0.1:5500",),
        "analysis_provider": "ors",
        "ors_base_url": "https://api.heigit.org/openrouteservice",
        "ors_api_key": "fixture-key",
        "ors_timeout_seconds": 3.0,
    }
    values.update(overrides)
    return Settings(**values)


class OrsAdapterTest(unittest.TestCase):
    def test_request_mapping_and_sorted_response(self):
        fixture = json.loads(FIXTURE_PATH.read_text())
        captured = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            captured["body"] = json.loads(request.content)
            return httpx.Response(200, json=fixture, request=request)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                adapter = OrsAdapter(sample_settings(), client=client)
                result = await adapter.create_isochrones(sample_request())
                return result

        result = asyncio.run(run())
        self.assertEqual(captured["url"], "https://api.heigit.org/openrouteservice/v2/isochrones/foot-walking")
        self.assertEqual(captured["headers"]["authorization"], "fixture-key")
        self.assertEqual(captured["headers"]["content-type"], "application/json")
        self.assertEqual(captured["body"], {
            "locations": [[116.4815, 39.9906]],
            "range": [600, 1200, 1800],
            "range_type": "time",
            "location_type": "start",
        })
        self.assertEqual([item.rangeMinutes for item in result], [10, 20, 30])
        self.assertEqual([item.rangeSeconds for item in result], [600, 1200, 1800])
        self.assertEqual(result[1].geometry["type"], "MultiPolygon")

    def test_all_profiles_use_explicit_endpoint_mapping(self):
        endpoints = []

        async def handler(request: httpx.Request) -> httpx.Response:
            endpoints.append(str(request.url))
            return httpx.Response(200, json=json.loads(FIXTURE_PATH.read_text()), request=request)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                for profile in ("foot-walking", "cycling-regular", "driving-car"):
                    adapter = OrsAdapter(sample_settings(), client=client)
                    request = sample_request().model_copy(update={"profile": profile})
                    await adapter.create_isochrones(request)

        asyncio.run(run())
        self.assertEqual(endpoints, [
            "https://api.heigit.org/openrouteservice/v2/isochrones/foot-walking",
            "https://api.heigit.org/openrouteservice/v2/isochrones/cycling-regular",
            "https://api.heigit.org/openrouteservice/v2/isochrones/driving-car",
        ])

    def test_missing_key_fails_before_http(self):
        calls = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            return httpx.Response(500, request=request)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                adapter = OrsAdapter(sample_settings(ors_api_key=""), client=client)
                with self.assertRaises(ProviderNotConfiguredError):
                    await adapter.create_isochrones(sample_request())

        asyncio.run(run())
        self.assertEqual(calls, 0)

    def test_invalid_responses_fail_without_empty_success(self):
        base = json.loads(FIXTURE_PATH.read_text())
        cases = []
        cases.append({"type": "FeatureCollection"})
        cases.append({"type": "FeatureCollection", "features": []})
        duplicate = copy.deepcopy(base)
        duplicate["features"][1]["properties"]["value"] = 1800
        cases.append(duplicate)
        missing_value = copy.deepcopy(base)
        del missing_value["features"][0]["properties"]["value"]
        cases.append(missing_value)
        invalid_geometry = copy.deepcopy(base)
        invalid_geometry["features"][0]["geometry"] = {"type": "Point", "coordinates": [1, 2]}
        cases.append(invalid_geometry)

        for payload in cases:
            async def handler(request: httpx.Request, response_payload=payload) -> httpx.Response:
                return httpx.Response(200, json=response_payload, request=request)

            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                    adapter = OrsAdapter(sample_settings(), client=client)
                    with self.assertRaises(InvalidProviderResponseError):
                        await adapter.create_isochrones(sample_request())

            asyncio.run(run())

        async def invalid_json_handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=b"not-json", request=request)

        async def run_invalid_json():
            async with httpx.AsyncClient(transport=httpx.MockTransport(invalid_json_handler)) as client:
                with self.assertRaises(InvalidProviderResponseError):
                    await OrsAdapter(sample_settings(), client=client).create_isochrones(sample_request())

        asyncio.run(run_invalid_json())

    def test_upstream_errors_map_without_retry(self):
        statuses = {
            401: UpstreamAuthError,
            403: UpstreamAuthError,
            429: UpstreamRateLimitedError,
            400: UpstreamRequestRejectedError,
            422: UpstreamRequestRejectedError,
            500: UpstreamUnavailableError,
        }
        for status, expected_error in statuses.items():
            calls = 0

            async def handler(request: httpx.Request, status_code=status) -> httpx.Response:
                nonlocal calls
                calls += 1
                headers = {"Retry-After": "15"} if status_code == 429 else {}
                return httpx.Response(status_code, headers=headers, request=request)

            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                    with self.assertRaises(expected_error) as context:
                        await OrsAdapter(sample_settings(), client=client).create_isochrones(sample_request())
                    return context.exception

            error = asyncio.run(run())
            self.assertEqual(calls, 1)
            if status == 429:
                self.assertEqual(error.retry_after, "15")

    def test_timeout_maps_without_retry(self):
        calls = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            raise httpx.ReadTimeout("fixture timeout", request=request)

        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(UpstreamTimeoutError):
                    await OrsAdapter(sample_settings(), client=client).create_isochrones(sample_request())

        asyncio.run(run())
        self.assertEqual(calls, 1)


class ConfigurationTest(unittest.TestCase):
    def test_provider_and_timeout_configuration(self):
        settings = Settings.from_environment({
            "ANALYSIS_PROVIDER": "mock",
            "ORS_BASE_URL": "https://example.test/",
            "ORS_TIMEOUT_SECONDS": "12.5",
        })
        self.assertEqual(settings.analysis_provider, "mock")
        self.assertEqual(settings.ors_base_url, "https://example.test")
        self.assertEqual(settings.ors_timeout_seconds, 12.5)
        self.assertTrue(settings.provider_ready)
        default_settings = Settings.from_environment({"ANALYSIS_PROVIDER": "mock"})
        self.assertEqual(default_settings.ors_base_url, "https://api.heigit.org/openrouteservice")

    def test_invalid_provider_or_timeout_is_rejected(self):
        for env in (
            {"ANALYSIS_PROVIDER": "unknown"},
            {"ORS_TIMEOUT_SECONDS": "0"},
            {"ORS_TIMEOUT_SECONDS": "nan"},
            {"ORS_TIMEOUT_SECONDS": "121"},
        ):
            with self.assertRaises(ConfigurationError):
                Settings.from_environment(env)

    def test_ors_without_key_is_not_ready(self):
        settings = Settings.from_environment({"ANALYSIS_PROVIDER": "ors", "ORS_API_KEY": ""})
        self.assertFalse(settings.provider_ready)


if __name__ == "__main__":
    unittest.main()
