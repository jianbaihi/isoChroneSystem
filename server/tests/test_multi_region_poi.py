import json
import unittest

import httpx
from shapely.geometry import box

from app.config import Settings
from app.models import AnalysisRequest
from app.providers.poi.amap import AmapPoiAdapter
from app.providers.poi.category_mapping import amap_category, foursquare_category
from app.providers.poi.coordinate_policy import gcj02_to_wgs84, wgs84_to_gcj02
from app.providers.poi.foursquare import FoursquarePoiAdapter
from app.providers.poi.router import resolve_provider
from app.services.poi_region_resolver import resolve_region
from app.services.poi_query_planner import build_provider_query_plan


def settings(**overrides):
    values = {
        "APP_ENV": "test", "ANALYSIS_PROVIDER": "mock", "ALLOW_NETWORK": "false",
        "ALLOW_MOCK_FALLBACK": "false", "POI_PROVIDER": "none",
        "AMAP_POI_ENABLED": "true", "AMAP_WEB_SERVICE_KEY": "test-amap-secret",
        "FOURSQUARE_POI_ENABLED": "true", "FOURSQUARE_SERVICE_KEY": "test-fsq-secret",
    }
    values.update(overrides)
    return Settings.from_environment(values)


class MultiRegionPoiTest(unittest.IsolatedAsyncioTestCase):
    def test_region_resolver_uses_boundary_polygon(self):
        for lon, lat in [(114.2969, 30.5469), (114.34, 30.58), (116.4074, 39.9042), (121.4737, 31.2304)]:
            self.assertEqual(resolve_region(lon, lat)["region"], "cn-mainland")
        for lon, lat in [(2.2945, 48.8584), (-74.006, 40.7128), (139.6917, 35.6895)]:
            self.assertEqual(resolve_region(lon, lat)["region"], "global")

    def test_router_auto_and_override(self):
        cfg = settings()
        self.assertEqual(resolve_provider("cn-mainland", cfg), "amap")
        self.assertEqual(resolve_provider("global", cfg), "foursquare")
        with self.assertRaisesRegex(Exception, "不支持当前区域"):
            resolve_provider("global", cfg, "amap")

    def test_coordinate_round_trip_and_overseas_identity(self):
        for lon, lat in [(114.2969, 30.5469), (116.4074, 39.9042), (121.4737, 31.2304), (113.2644, 23.1291)]:
            gcj = wgs84_to_gcj02(lon, lat)
            back = gcj02_to_wgs84(*gcj)
            self.assertAlmostEqual(back[0], lon, places=6)
            self.assertAlmostEqual(back[1], lat, places=6)
        for point in [(2.2945, 48.8584), (139.6917, 35.6895), (-74.006, 40.7128)]:
            self.assertEqual(wgs84_to_gcj02(*point), point)

    def test_category_mapping(self):
        self.assertEqual(amap_category("050100", "中餐厅"), "food")
        self.assertEqual(foursquare_category(13065, "Restaurant"), "food")
        self.assertEqual(amap_category("", "unknown"), "other")

    def test_capability_driven_planner(self):
        geometry = box(0, 0, .01, .01)
        self.assertEqual(build_provider_query_plan("amap", geometry)["strategy"], "polygon-pagination")
        self.assertEqual(build_provider_query_plan("foursquare", geometry)["strategy"], "radius")

    async def test_amap_auth_pagination_coordinate_and_normalization(self):
        seen_urls = []
        shifted = wgs84_to_gcj02(114.2969, 30.5469)
        async def handler(request):
            seen_urls.append(str(request.url))
            self.assertEqual(request.url.params["key"], "test-amap-secret")
            return httpx.Response(200, json={"status": "1", "pois": [{"id": "A1", "name": "测试餐厅", "location": f"{shifted[0]},{shifted[1]}", "type": "中餐厅", "typecode": "050100", "address": "武汉", "business": {"rating": "4.6", "tel": "123"}}]})
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        adapter = AmapPoiAdapter(settings(), client)
        outer = box(114.28, 30.53, 114.31, 30.56)
        result = await adapter.fetch(AnalysisRequest(center={"lon": 114.2969, "lat": 30.5469}, profile="foot-walking", rangesMinutes=[5], options={}), outer, [{"ringId": "ring-0-5", "geometry": outer.__geo_interface__}])
        await client.aclose()
        self.assertEqual(result["pois"][0].poiId, "amap:A1")
        self.assertEqual(result["pois"][0].sourceLocation.crs, "GCJ-02")
        self.assertAlmostEqual(result["pois"][0].location.lon, 114.2969, places=5)
        serializable = {**result, "pois": [poi.model_dump(mode="json") for poi in result["pois"]], "categories": [item.model_dump(mode="json") for item in result["categories"]]}
        self.assertNotIn("test-amap-secret", json.dumps(serializable, ensure_ascii=False))

    async def test_foursquare_bearer_version_and_normalization(self):
        async def handler(request):
            self.assertEqual(request.headers["Authorization"], "Bearer test-fsq-secret")
            self.assertEqual(request.headers["X-Places-Api-Version"], "2025-06-17")
            return httpx.Response(200, json={"results": [{"fsq_place_id": "F1", "name": "Cafe Paris", "latitude": 48.8584, "longitude": 2.2945, "categories": [{"id": 13065, "name": "Restaurant"}], "location": {"formatted_address": "Paris"}}]})
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        adapter = FoursquarePoiAdapter(settings(), client)
        outer = box(2.28, 48.84, 2.31, 48.87)
        result = await adapter.fetch(AnalysisRequest(center={"lon": 2.2945, "lat": 48.8584}, profile="foot-walking", rangesMinutes=[5], options={}), outer, [{"ringId": "ring-0-5", "geometry": outer.__geo_interface__}])
        await client.aclose()
        self.assertEqual(result["pois"][0].poiId, "foursquare:F1")
        self.assertEqual(result["pois"][0].category["id"], "food")
        self.assertEqual(result["pois"][0].sourceLocation.crs, "EPSG:4326")
