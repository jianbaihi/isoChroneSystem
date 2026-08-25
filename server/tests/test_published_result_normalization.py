import json
import unittest
from copy import deepcopy
from pathlib import Path

from app.errors import InvalidMatrixResponseError
from app.models import AnalysisResult
from app.services.published_result_normalization import enrich_pois_with_matrix, matrix_band_for_duration, normalization_summary


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "exports/stage-6-integrated-live/stage29-cycling-complete.json"


class PublishedResultNormalizationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads(ARCHIVE.read_text(encoding="utf-8"))

    def result(self):
        return AnalysisResult.model_validate(deepcopy(self.payload))

    def test_stage51_cache_join_is_complete_immutable_and_conserved(self):
        source = self.result()
        before = source.model_dump(mode="json")
        normalized = enrich_pois_with_matrix(source)
        self.assertEqual(source.model_dump(mode="json"), before)
        self.assertEqual(normalized.publishedResultSchemaVersion, "2.0")
        self.assertEqual(normalized.analysisId, source.analysisId)
        self.assertEqual(normalized.metadata.matrix["resultFingerprint"], source.metadata.matrix["resultFingerprint"])
        self.assertEqual(len(normalized.pois), 2413)
        self.assertEqual(len(normalized.accessibility), 2413)
        self.assertTrue(all(poi.matrixStatus == "ok" for poi in normalized.pois))
        self.assertTrue(all(poi.travelTimeSeconds is not None for poi in normalized.pois))
        self.assertTrue(all(poi.networkDistanceMeters is not None for poi in normalized.pois))
        self.assertTrue(all(poi.ringId == poi.matrixBandId for poi in normalized.pois))
        summary = normalization_summary(normalized)
        self.assertEqual(summary["ringCounts"]["ring-0-10"], 127)
        self.assertEqual(summary["ringCounts"]["ring-10-20"], 433)
        self.assertEqual(summary["ringCounts"]["ring-20-30"], 1240)
        self.assertEqual(summary["ringCounts"]["matrix-out-of-range"], 613)

    def test_join_uses_poi_id_regardless_of_matrix_order(self):
        source = self.result()
        source.accessibility = list(reversed(source.accessibility))
        normalized = enrich_pois_with_matrix(source)
        times = {poi.poiId: poi.travelTimeSeconds for poi in normalized.pois}
        expected = {item.poiId: item.travelTimeSeconds for item in source.accessibility}
        self.assertEqual(times, expected)

    def test_duplicate_missing_and_extra_matrix_records_fail_closed(self):
        duplicate = self.result()
        duplicate.accessibility.append(duplicate.accessibility[0].model_copy(deep=True))
        with self.assertRaises(InvalidMatrixResponseError):
            enrich_pois_with_matrix(duplicate)

        missing = self.result()
        missing.accessibility.pop()
        with self.assertRaises(InvalidMatrixResponseError):
            enrich_pois_with_matrix(missing)

        extra = self.result()
        extra.accessibility[0].poiId = "not-a-poi"
        with self.assertRaises(InvalidMatrixResponseError):
            enrich_pois_with_matrix(extra)

    def test_matrix_band_boundaries_and_null_invalid_contract(self):
        self.assertEqual(matrix_band_for_duration(600, [10, 20, 30]), "ring-0-10")
        self.assertEqual(matrix_band_for_duration(1200, [10, 20, 30]), "ring-10-20")
        self.assertEqual(matrix_band_for_duration(1800, [10, 20, 30]), "ring-20-30")
        self.assertEqual(matrix_band_for_duration(1800.01, [10, 20, 30]), "matrix-out-of-range")

        source = self.result()
        source.accessibility[0].matrixStatus = "unreachable"
        source.accessibility[0].travelTimeSeconds = None
        source.accessibility[0].networkDistanceMeters = None
        source.accessibility[1].matrixStatus = "invalid"
        source.accessibility[1].travelTimeSeconds = None
        source.accessibility[1].networkDistanceMeters = None
        normalized = enrich_pois_with_matrix(source)
        self.assertEqual(normalized.pois[0].matrixStatus, "null")
        self.assertEqual(normalized.pois[0].ringId, "matrix-null")
        self.assertEqual(normalized.pois[1].matrixStatus, "invalid")
        self.assertEqual(normalized.pois[1].ringId, "matrix-invalid")


if __name__ == "__main__":
    unittest.main()
