import asyncio
import unittest

from fastapi.testclient import TestClient
from shapely.geometry import mapping

from app.main import app
from app.models import CumulativeIsochrone
from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.services.geometry import normalize_geojson_geometry
from test_ors_remote_poi import feature, request, settings


class FakeIsochrones:
    async def create_isochrones(self, analysis_request):
        center = analysis_request.center
        result = []
        for minutes, delta in ((10, 0.01), (20, 0.02), (30, 0.03)):
            result.append(CumulativeIsochrone(
                isochroneId=f"isochrone-{minutes}",
                rangeMinutes=minutes,
                rangeSeconds=minutes * 60,
                geometry=normalize_geojson_geometry({"type": "Polygon", "coordinates": [[
                    [center.lon - delta, center.lat - delta], [center.lon + delta, center.lat - delta],
                    [center.lon + delta, center.lat + delta], [center.lon - delta, center.lat + delta],
                    [center.lon - delta, center.lat - delta],
                ]]}),
            ))
        return result


class FakePoiClient:
    async def query(self, body):
        return {"type": "FeatureCollection", "features": [feature(99, 116.4768, 39.9953)]}, {"status": 200, "cache": "miss", "rateLimit": {}}


class OrsRemoteAnalysisTest(unittest.TestCase):
    def test_analysis_uses_remote_poi_boundary_and_metadata(self):
        configured = settings()
        original_settings = app.state.settings
        original_iso = getattr(app.state, "ors_adapter", None)
        original_poi = getattr(app.state, "poi_provider", None)
        app.state.settings = configured
        app.state.ors_adapter = FakeIsochrones()
        app.state.poi_provider = OrsRemotePoiProvider(configured, FakePoiClient())
        try:
            with TestClient(app) as client:
                response = client.post("/api/v1/analyses", json=request().dict())
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertEqual(payload["metadata"]["sources"], {"isochrones": "ors-public-api", "pois": "ors-openpoiservice"})
            self.assertEqual(payload["metadata"]["poiProvider"], "ors_remote")
            self.assertEqual(payload["pois"][0]["source"], "ors-openpoiservice")
            self.assertIsNone(payload["pois"][0]["travelTimeSeconds"])
        finally:
            app.state.settings = original_settings
            if original_iso is None:
                try:
                    del app.state.ors_adapter
                except AttributeError:
                    pass
            else:
                app.state.ors_adapter = original_iso
            if original_poi is None:
                try:
                    del app.state.poi_provider
                except AttributeError:
                    pass
            else:
                app.state.poi_provider = original_poi


if __name__ == "__main__":
    unittest.main()
