import unittest

import httpx
from shapely.geometry import box

from app.config import Settings
from app.models import AnalysisRequest
from app.providers.poi.amap import AmapPoiAdapter
from app.providers.poi.coordinate_policy import wgs84_to_gcj02


class MemoryCache:
    def __init__(self): self.values = {}
    def read(self, identity): return self.values.get(str(sorted(identity.items())))
    def write(self, identity, payload): self.values[str(sorted(identity.items()))] = payload


def config(**overrides):
    values = {"APP_ENV":"test","ANALYSIS_PROVIDER":"mock","ALLOW_NETWORK":"false","ALLOW_MOCK_FALLBACK":"false","POI_PROVIDER":"none","AMAP_POI_ENABLED":"true","AMAP_WEB_SERVICE_KEY":"fixture","AMAP_POI_MAX_PAGES_PER_JOB":"4","AMAP_POI_AUTO_REQUEST_LIMIT":"20","AMAP_POI_MAX_SPLIT_DEPTH":"3","AMAP_POI_MIN_CELL_AREA_KM2":"0.01"}
    values.update(overrides)
    return Settings.from_environment(values)


def request(categories):
    return AnalysisRequest(center={"lon":114.2969,"lat":30.5469}, profile="foot-walking", rangesMinutes=[10], categoryIds=categories, options={})


def item(index=0, typecode="050100", poi_id=None):
    lon, lat = wgs84_to_gcj02(114.2969 + index * .000001, 30.5469)
    return {"id":poi_id or f"P{index}","name":f"POI {index}","location":f"{lon},{lat}","type":"fixture","typecode":typecode}


class AmapCompletenessTest(unittest.IsolatedAsyncioTestCase):
    outer = box(114.28, 30.53, 114.31, 30.56)
    rings = [{"ringId":"ring-0-10","geometry":outer.__geo_interface__}]

    async def run_adapter(self, handler, categories, settings=None, cache=None):
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        adapter = AmapPoiAdapter(settings or config(), client, cache=cache)
        result = await adapter.fetch(request(categories), self.outer, self.rings)
        await client.aclose()
        return result

    async def test_category_types_and_independent_pagination(self):
        calls = []
        async def handler(req):
            calls.append(dict(req.url.params))
            self.assertTrue(req.url.params.get("types"))
            page = int(req.url.params["page_num"])
            return httpx.Response(200, json={"status":"1","pois":[item(i) for i in range(25)] if page == 1 else [item(30)]})
        result = await self.run_adapter(handler, ["food"])
        self.assertEqual([call["types"] for call in calls], ["050000", "050000"])
        self.assertEqual(result["completeness"]["categories"]["food"]["status"], "complete")
        self.assertEqual(result["coverage"]["upstreamRequests"], 2)

    async def test_saturated_parent_splits_and_resolves(self):
        calls = 0
        async def handler(req):
            nonlocal calls
            calls += 1
            pois = [item(i) for i in range(25)] if calls == 1 else [item(40 + calls)]
            return httpx.Response(200, json={"status":"1","pois":pois})
        cfg = config(AMAP_POI_MAX_PAGES_PER_JOB="1")
        result = await self.run_adapter(handler, ["food"], cfg)
        self.assertGreaterEqual(result["coverage"]["splitCount"], 1)
        self.assertEqual(result["completeness"]["categories"]["food"]["status"], "complete")

    async def test_budget_stops_and_preserves_partial_result(self):
        async def handler(req): return httpx.Response(200, json={"status":"1","pois":[item(1)]})
        result = await self.run_adapter(handler, ["food", "health"], config(AMAP_POI_AUTO_REQUEST_LIMIT="1"))
        self.assertEqual(result["coverage"]["upstreamRequests"], 1)
        self.assertEqual(result["completeness"]["categories"]["health"]["status"], "blocked-budget")
        self.assertEqual(len(result["pois"]), 1)

    async def test_incremental_categories_reuse_category_cell_page_cache(self):
        upstream = 0
        async def handler(req):
            nonlocal upstream
            upstream += 1
            code = {"050000":"050100","110000":"110200","110100":"110101"}[req.url.params["types"]]
            return httpx.Response(200, json={"status":"1","pois":[item(upstream, code)]})
        cache = MemoryCache()
        await self.run_adapter(handler, ["food", "attraction"], cache=cache)
        self.assertEqual(upstream, 2)
        result = await self.run_adapter(handler, ["food", "attraction", "nature"], cache=cache)
        self.assertEqual(upstream, 3)
        self.assertEqual(result["coverage"]["cacheHits"], 2)

    async def test_nature_precedence_and_global_provider_id_dedup(self):
        async def handler(req):
            return httpx.Response(200, json={"status":"1","pois":[item(0, "110101", "SAME")]})
        result = await self.run_adapter(handler, ["attraction", "nature"])
        self.assertEqual(len(result["pois"]), 1)
        self.assertEqual(result["pois"][0].categoryId, "nature")
