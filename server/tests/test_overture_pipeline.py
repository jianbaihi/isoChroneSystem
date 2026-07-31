from __future__ import annotations

import json
import asyncio
import tempfile
import unittest
from pathlib import Path

from app.importers.overture import ImportValidationError, import_overture_places
from app.config import Settings
from app.models import AnalysisRequest, CumulativeIsochrone
from app.repositories.local_poi import LocalPoiRepository
from app.services.analysis import create_analysis
from app.services.poi_selection import select_local_overture_pois


class OverturePipelineTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.release = root / "release.json"
        self.region = root / "region.json"
        self.source = root / "places.geojson"
        self.database = root / "poi.sqlite3"
        self.release.write_text(json.dumps({
            "source": "overture", "theme": "places", "type": "place", "sourceRelease": "2026-07-22.0",
            "schemaFields": ["taxonomy.hierarchy", "taxonomy.primary", "taxonomy.alternates", "basic_category"],
            "licenseSummary": ["CDLA-Permissive-2.0"], "attribution": "Overture Maps Foundation",
        }), encoding="utf-8")
        features = [
            self.feature("one", 0.5, 0.5, "餐馆", ["food_and_drink", "restaurant", "hot_pot_restaurant"], "hot_pot_restaurant", "restaurant", ["shopping"]),
            self.feature("two", 1.0, 0.5, "咖啡馆", ["food_and_drink", "restaurant", "casual_eatery"], "casual_eatery", None, []),
            self.feature("boundary", 2.0, 0.0, "边界店", ["food_and_drink", "restaurant", "casual_eatery"], "casual_eatery", "restaurant", []),
            self.feature("closed", 0.5, 0.5, "关闭店", ["food_and_drink", "restaurant"], "restaurant", "restaurant", [], status="permanently_closed"),
            self.feature("invalid", 0.5, 0.5, "坏数据", [], "", None, []),
            self.feature("outside", 9.0, 9.0, "范围外", ["food_and_drink", "restaurant"], "restaurant", "restaurant", []),
        ]
        features.append(features[0])
        self.source.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False), encoding="utf-8")
        self.region.write_text(json.dumps({
            "datasetId": "overture-2026-07-22-test", "source": "overture", "sourceRelease": "2026-07-22.0",
            "regionId": "test", "displayName": "测试区域", "countryCode": "CN", "preferredLocales": ["zh-CN", "en"],
            "crs": "EPSG:4326", "bbox": [0, 0, 3, 3],
            "defaultCenter": {"lon": 1, "lat": 1, "label": "测试中心"}, "sourceFile": str(self.source),
            "sha256": "导入前计算", "attribution": "Overture Maps Foundation",
            "eligibility": {"minConfidence": None, "allowMissingConfidence": True, "excludePermanentlyClosed": True},
            "quality": {"minTaxonomyValidRate": 0.5},
        }), encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    @staticmethod
    def feature(identifier, lon, lat, name, hierarchy, primary, basic, alternates, status="operating"):
        return {
            "type": "Feature", "id": identifier, "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"names": {"primary": {"value": name, "language": "zh-CN"}},
                "taxonomy": {"hierarchy": hierarchy, "primary": primary, "alternates": alternates},
                "basic_category": basic, "operating_status": status, "confidence": 0.8,
                "addresses": [{"freeform": f"{name}地址"}]},
        }

    def test_import_idempotence_query_and_ring_selection(self):
        dry_report = import_overture_places(self.release, self.region, self.database, dry_run=True)
        self.assertEqual(dry_report["insertedCount"], 0)
        self.assertEqual(dry_report["eligibleCount"], 3)
        self.assertEqual(dry_report["exactDuplicateIdCount"], 1)
        self.assertEqual(dry_report["basicCategoryOutsideHierarchyCount"], 0)

        report = import_overture_places(self.release, self.region, self.database)
        self.assertEqual(report["insertedCount"], 3)
        self.assertEqual(report["RTreeRowCount"], 3)
        no_op = import_overture_places(self.release, self.region, self.database)
        self.assertTrue(no_op["noOp"])

        request = AnalysisRequest(
            center={"lon": 1, "lat": 1}, profile="foot-walking", rangesMinutes=[10, 20],
            categoryIds=["restaurant"], poiDatasetId="overture-2026-07-22-test",
        )
        rings = [
            {"ringId": "ring-0-10", "innerRangeMinutes": 0, "outerRangeMinutes": 10,
             "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}},
            {"ringId": "ring-10-20", "innerRangeMinutes": 10, "outerRangeMinutes": 20,
             "geometry": {"type": "Polygon", "coordinates": [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]]}} ,
        ]
        with LocalPoiRepository(self.database, read_only=True) as repository:
            selection = select_local_overture_pois(request, rings, repository, 600, 50000)
        self.assertEqual(selection["matchedCount"], 3)
        self.assertEqual(len(selection["pois"]), 3)
        self.assertEqual(selection["pois"][0].travelTimeSeconds, None)
        one = next(poi for poi in selection["pois"] if poi.poiId == "overture:one")
        self.assertEqual(one.category["alternateIds"], ["shopping"])
        self.assertEqual(selection["ringCounts"]["ring-0-10"], 2)
        self.assertEqual(selection["ringCounts"]["ring-10-20"], 1)
        category_ids = {category.categoryId for category in selection["categories"]}
        self.assertNotIn("shopping", category_ids)

    def test_replace_requires_flag_and_rolls_back_on_bad_release(self):
        import_overture_places(self.release, self.region, self.database)
        changed = json.loads(self.source.read_text(encoding="utf-8"))
        changed["features"][0]["properties"]["names"]["primary"]["value"] = "新名称"
        self.source.write_text(json.dumps(changed, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(ImportValidationError):
            import_overture_places(self.release, self.region, self.database)
        report = import_overture_places(self.release, self.region, self.database, replace=True)
        self.assertEqual(report["insertedCount"], 3)
        with LocalPoiRepository(self.database, read_only=True) as repository:
            rows = repository.query_candidates("overture-2026-07-22-test", (0, 0, 3, 3), 50)
        self.assertEqual(len(rows), 3)
        self.assertEqual(next(row["name"] for row in rows if row["poi_id"] == "overture:one"), "新名称")

    def test_ors_and_local_pois_are_returned_as_one_atomic_result(self):
        import_overture_places(self.release, self.region, self.database)

        class FakeIsochrones:
            async def create_isochrones(self, _request):
                return [
                    CumulativeIsochrone(isochroneId="isochrone-10", rangeMinutes=10, rangeSeconds=600,
                        geometry={"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]}),
                    CumulativeIsochrone(isochroneId="isochrone-20", rangeMinutes=20, rangeSeconds=1200,
                        geometry={"type": "Polygon", "coordinates": [[[0, 0], [3, 0], [3, 3], [0, 3], [0, 0]]]}),
                ]

        settings = Settings(
            app_env="test", app_host="127.0.0.1", app_port=8000, cors_origins=(), analysis_provider="ors",
            ors_base_url="https://example.invalid", poi_provider="local", poi_database_path=str(self.database),
        )
        request = AnalysisRequest(
            center={"lon": 1, "lat": 1}, profile="foot-walking", rangesMinutes=[10, 20],
            categoryIds=[], poiDatasetId="overture-2026-07-22-test",
        )
        result = asyncio.run(create_analysis(request, "pipeline-request", settings, FakeIsochrones()))
        self.assertEqual(result.metadata.sources.pois, "local-overture")
        self.assertEqual(result.metadata.poiDataset["sourceRelease"], "2026-07-22.0")
        self.assertEqual(result.metadata.poiSelection["matchedCount"], 3)
        self.assertTrue(all(poi.travelTimeSeconds is None for poi in result.pois))
        self.assertEqual({ring.statistics.poiCount for ring in result.rings}, {2, 1})


if __name__ == "__main__":
    unittest.main()
