import unittest

from app.models import Poi
from app.services.poi_normalization import normalize_category, normalize_poi


class PoiNormalizationTest(unittest.TestCase):
    def test_known_and_unknown_provider_categories(self):
        self.assertEqual(normalize_category("provider-restaurant")["id"], "food")
        self.assertEqual(normalize_category("provider-specific-category")["id"], "other")

    def test_missing_optional_provider_fields_remain_nullable(self):
        poi = Poi(poiId="p1", name="测试点", source="ors-openpoiservice",
                  location={"lon": 114.3, "lat": 30.5}, ringId="ring-0-10")
        normalized = normalize_poi(poi)
        self.assertIsNone(normalized["rating"])
        self.assertIsNone(normalized["address"])
        self.assertIsNone(normalized["openingHours"])
        self.assertEqual(normalized["source"]["provider"], "openpoiservice")


if __name__ == "__main__":
    unittest.main()
