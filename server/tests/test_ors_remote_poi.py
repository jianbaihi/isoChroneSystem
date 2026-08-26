import asyncio
import tempfile
import unittest
from pathlib import Path

import httpx
from shapely.geometry import MultiPolygon, Polygon, mapping, shape

from app.config import Settings
from app.errors import PoiUpstreamTruncatedError
from app.models import AnalysisRequest
from app.providers.poi.ors_client import OrsPoiClient
from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.services.poi_tiling import plan_poi_cells
from app.services.projection import UTMProjector


def settings(**overrides) -> Settings:
    values = {
        "app_env": "test",
        "app_host": "127.0.0.1",
        "app_port": 8000,
        "cors_origins": (),
        "analysis_provider": "ors",
        "ors_base_url": "https://example.test",
        "ors_api_key": "fixture-key",
        "ors_timeout_seconds": 3,
        "poi_provider": "ors_remote",
        "ors_profile": "driving-car",
        "ors_poi_grid_size_meters": 6000,
        "ors_poi_limit_per_cell": 2000,
        "ors_poi_max_requests_per_analysis": 40,
        "ors_poi_max_concurrency": 2,
        "poi_max_results": 600,
        "poi_max_candidates": 50000,
    }
    values.update(overrides)
    return Settings(**values)


def request() -> AnalysisRequest:
    return AnalysisRequest(
        center={"lon": 116.4768, "lat": 39.9953, "crs": "EPSG:4326"},
        profile="driving-car",
        rangesMinutes=[10, 20, 30],
        categoryIds=[],
        options={"includePois": True, "calculateTravelTimes": False},
    )


def feature(osm_id: int, lon: float, lat: float, **properties):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"osm_type": "node", "osm_id": osm_id, "name": f"POI {osm_id}", "category_ids": [570], **properties},
    }


class FakePoiClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = 0

    async def query(self, body):
        self.calls += 1
        return self.payload, {"status": 200, "cache": "miss", "rateLimit": {}}


class OrsRemotePoiTest(unittest.TestCase):
    def test_utm_round_trip_and_projected_grid(self):
        projector = UTMProjector.for_lon_lat(116.4768, 39.9953)
        x, y = projector.forward(116.4768, 39.9953)
        lon, lat = projector.inverse(x, y)
        self.assertAlmostEqual(lon, 116.4768, places=6)
        self.assertAlmostEqual(lat, 39.9953, places=6)
        cells, _ = plan_poi_cells(shape({"type": "Polygon", "coordinates": [[[116.45, 39.97], [116.50, 39.97], [116.50, 40.02], [116.45, 40.02], [116.45, 39.97]]]}), 6000, 45)
        self.assertTrue(cells)
        self.assertTrue(all(cell.area_km2 <= 45 for cell in cells))
        self.assertTrue(all(cell.geometry["type"] == "Polygon" for cell in cells))

    def test_fragmented_grid_cells_are_normalized_to_provider_safe_polygons(self):
        fragments = MultiPolygon([
            Polygon([(114.20, 30.50), (114.21, 30.50), (114.21, 30.51), (114.20, 30.51)]),
            Polygon([(114.23, 30.52), (114.24, 30.52), (114.24, 30.53), (114.23, 30.53)]),
        ])
        cells, _ = plan_poi_cells(fragments, 6000, 45)
        self.assertTrue(cells)
        self.assertTrue(all(cell.geometry["type"] == "Polygon" for cell in cells))

    def test_remote_normalizes_deduplicates_and_reports_diagnostics(self):
        outer = shape({"type": "Polygon", "coordinates": [[[116.45, 39.97], [116.50, 39.97], [116.50, 40.02], [116.45, 40.02], [116.45, 39.97]]]})
        payload = {"type": "FeatureCollection", "features": [
            feature(1, 116.4768, 39.9953),
            feature(1, 116.4768, 39.9953, name="duplicate"),
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [116.477, 39.996]}, "properties": {"name": "no osm"}},
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [116.477, 39.996]}, "properties": {"osm_type": "node", "osm_id": 2}},
        ]}
        client = FakePoiClient(payload)
        ring = {"ringId": "ring-0-30", "innerRangeMinutes": 0, "outerRangeMinutes": 30, "geometry": mapping(outer)}
        result = asyncio.run(OrsRemotePoiProvider(settings(), client).fetch(request(), outer, [ring]))
        self.assertGreaterEqual(client.calls, 1)
        self.assertEqual(result["matchedCount"], 2)
        self.assertEqual(result["returnedCount"], 2)
        osm_poi = next(poi for poi in result["pois"] if poi.poiId == "ors-poi:node:1")
        self.assertEqual(osm_poi.categoryId, "ors:category:570")
        self.assertEqual(result["categories"][0].categoryId, "ors:group:560")
        self.assertTrue(any(poi.poiId.startswith("ors-poi:fallback:no osm:") for poi in result["pois"]))
        self.assertGreaterEqual(result["coverage"]["duplicateRemovedCount"], 1)
        self.assertGreaterEqual(result["diagnostics"]["name_missing"], 1)
        self.assertTrue(result["coverage"]["fullyCovered"])

    def test_limit_response_is_split_and_unresolved_limit_is_returned_as_truncated(self):
        outer = shape({"type": "Polygon", "coordinates": [[[116.45, 39.97], [116.50, 39.97], [116.50, 40.02], [116.45, 40.02], [116.45, 39.97]]]})
        payload = {"type": "FeatureCollection", "features": [feature(1, 116.4768, 39.9953), feature(2, 116.477, 39.996)]}
        client = FakePoiClient(payload)
        ring = {"ringId": "ring-0-30", "innerRangeMinutes": 0, "outerRangeMinutes": 30, "geometry": mapping(outer)}
        result = asyncio.run(OrsRemotePoiProvider(settings(ors_poi_limit_per_cell=2), client).fetch(request(), outer, [ring]))
        self.assertTrue(result["truncated"])
        self.assertFalse(result["coverage"]["complete"])
        self.assertGreater(client.calls, 1)

    def test_exact_request_cache_has_zero_second_network_call(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = 0

            async def handler(incoming: httpx.Request):
                nonlocal calls
                calls += 1
                return httpx.Response(200, json={"type": "FeatureCollection", "features": []}, request=incoming)

            async def run():
                client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
                configured = settings(app_env="development", ors_cache_dir=directory)
                adapter = OrsPoiClient(configured, client=client)
                body = {"request": "pois", "geometry": {"geojson": {"type": "Polygon", "coordinates": []}}, "limit": 1}
                await adapter.query(body)
                await adapter.query(body)
                await client.aclose()

            asyncio.run(run())
            self.assertEqual(calls, 1)
            self.assertTrue(list(Path(directory).glob("*.json")))


if __name__ == "__main__":
    unittest.main()
