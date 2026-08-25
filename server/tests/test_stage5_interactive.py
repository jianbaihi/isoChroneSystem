import unittest

from fastapi.testclient import TestClient
from shapely.geometry import mapping, shape

from app.config import Settings
from app.main import app
from app.models import NameCloudRequest
from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.services.analysis import create_name_cloud
from app.services.quota import QuotaObserver


def live_settings() -> Settings:
    return Settings(
        app_env="test",
        app_host="127.0.0.1",
        app_port=8000,
        cors_origins=(),
        analysis_provider="ors",
        ors_base_url="https://example.test",
        ors_api_key="fixture-key",
        poi_provider="ors_remote",
        ors_profile="driving-car",
    )


class FakeGeocoder:
    def __init__(self):
        self.calls = []

    async def lookup(self, operation, **kwargs):
        self.calls.append((operation, kwargs))
        return {"results": [{"id": "ors:1", "label": "黄鹤楼", "lon": 114.296944, "lat": 30.546944, "admin": ["武汉"]}]}


class FakePoiClient:
    def __init__(self):
        self.calls = []

    async def query(self, body):
        self.calls.append(body)
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [114.297, 30.547]},
                "properties": {"osm_type": "node", "osm_id": 1, "name": "预览餐厅", "category_ids": [570]},
            }],
        }, {"status": 200, "cache": "miss", "rateLimit": {}}


class NameCloudPoiClient:
    def __init__(self):
        self.calls = []

    async def query(self, body):
        self.calls.append(body)
        return {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [114.297, 30.547]}, "properties": {"osm_type": "node", "osm_id": 1, "name": "黄鹤楼公园"}},
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [114.2967, 30.549]}, "properties": {"osm_type": "node", "osm_id": 2, "name:en": "Yangtze Bridge"}},
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [114.2967, 30.549]}, "properties": {"osm_type": "node", "osm_id": 2, "name": "duplicate"}},
            ],
        }, {"status": 200, "cache": "miss", "rateLimit": {}, "apiQuota": {}}


class Stage5InteractiveApiTest(unittest.TestCase):
    def setUp(self):
        self.original = {
            "settings": app.state.settings,
            "geocoder": getattr(app.state, "geocoder", None),
            "poi_provider": getattr(app.state, "poi_provider", None),
        }
        app.state.settings = live_settings()

    def tearDown(self):
        app.state.settings = self.original["settings"]
        for name in ("geocoder", "poi_provider"):
            value = self.original[name]
            if value is None:
                app.state._state.pop(name, None)
            else:
                setattr(app.state, name, value)

    def test_coordinate_text_is_local_and_geocoder_response_is_minimal(self):
        fake = FakeGeocoder()
        app.state.geocoder = fake
        client = TestClient(app)
        coordinate = client.get("/api/v1/geocoding/autocomplete", params={"text": "114.296944,30.546944"})
        self.assertEqual(coordinate.status_code, 200)
        self.assertEqual(coordinate.json()["results"][0]["source"], "coordinate-text")
        self.assertEqual(fake.calls, [])
        searched = client.get("/api/v1/geocoding/autocomplete", params={"text": "黄鹤楼", "size": 8})
        self.assertEqual(searched.status_code, 200)
        self.assertEqual(searched.json()["results"][0]["label"], "黄鹤楼")
        self.assertEqual(fake.calls[0][0], "autocomplete")

    def test_poi_preview_uses_one_request_and_is_not_complete(self):
        fake_client = FakePoiClient()
        app.state.poi_provider = OrsRemotePoiProvider(live_settings(), fake_client)
        client = TestClient(app)
        response = client.post("/api/v1/poi-previews", json={
            "schemaVersion": "1.0",
            "center": {"lon": 114.296944, "lat": 30.546944, "source": "preset"},
            "profile": "driving-car",
            "rangesMinutes": [10, 20, 30],
            "categoryIds": [],
            "radiusMeters": 1000,
        })
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(len(fake_client.calls), 1)
        self.assertEqual(payload["metadata"]["poiCoverage"]["mode"], "preview-radius")
        self.assertFalse(payload["metadata"]["poiCoverage"]["complete"])
        self.assertEqual(payload["metadata"]["poiCoverage"]["radiusMeters"], 1000)
        self.assertEqual(payload["returnedCount"], 1)

    def test_name_cloud_uses_one_outer_polygon_request_without_categories(self):
        configured = Settings(
            app_env="test", app_host="127.0.0.1", app_port=8000, cors_origins=(), analysis_provider="ors",
            ors_base_url="https://example.test", ors_api_key="fixture-key", poi_provider="ors_remote",
            ors_profile="foot-walking", ors_poi_limit_per_cell=2000,
        )
        polygons = [
            {"type": "Polygon", "coordinates": [[[114.297, 30.547], [114.298, 30.547], [114.298, 30.549], [114.297, 30.549], [114.297, 30.547]]]},
            {"type": "Polygon", "coordinates": [[[114.2965, 30.5465], [114.2985, 30.5465], [114.2985, 30.5495], [114.2965, 30.5495], [114.2965, 30.5465]]]},
            {"type": "Polygon", "coordinates": [[[114.296, 30.546], [114.299, 30.546], [114.299, 30.550], [114.296, 30.550], [114.296, 30.546]]]},
        ]
        request = NameCloudRequest(
            center={"lon": 114.296944, "lat": 30.546944, "label": "武汉·黄鹤楼", "source": "preset"},
            profile="foot-walking", rangesMinutes=[10, 20, 30],
            cumulativeIsochrones=[{"isochroneId": f"isochrone-{minutes}", "rangeMinutes": minutes, "rangeSeconds": minutes * 60, "geometry": polygon} for minutes, polygon in zip((10, 20, 30), polygons)],
        )
        client = NameCloudPoiClient()
        observer = QuotaObserver()
        result = __import__("asyncio").run(create_name_cloud(
            request, "name-cloud-fixture", configured,
            poi_provider=OrsRemotePoiProvider(configured, client), quota_observer=observer,
        ))
        self.assertEqual(len(client.calls), 1)
        self.assertEqual(result.categories, [])
        self.assertEqual(result.metadata.panmapMode, "unclassified-poi-name-cloud")
        self.assertGreater(result.nameCloud["stats"]["namedPoiCount"], 0)
        self.assertEqual(result.nameCloud["stats"]["deduplicatedPoiCount"], 2)
        self.assertEqual(result.nameCloud["stats"]["bandCounts"]["ring-0-10"], 1)
        self.assertEqual(result.nameCloud["stats"]["bandCounts"]["ring-10-20"], 1)


if __name__ == "__main__":
    unittest.main()
