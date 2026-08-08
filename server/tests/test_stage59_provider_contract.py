import asyncio
import json
import unittest
from dataclasses import replace
from pathlib import Path

from app.services.driving_poi_partitioner_v2 import canonical_full_precision_coverage_audit
from app.services.stage59_provider_contract import (
    CANARY_MULTIPOLYGON_FIVE_ID,
    CANARY_MULTIPOLYGON_TWO_ID,
    STAGE59_CANARY_LIMIT,
    Stage59CanaryRunner,
    canary_quota_gate,
    coverage_audit,
    payload_for_piece,
    payload_manifest,
    roundtrip_pieces,
    split_multipolygon_fallback,
    isolated_stage59_canary_client,
    validate_provider_payload,
)


ROOT = Path(__file__).resolve().parents[2]
PLAN = json.loads((ROOT / "exports" / "stage-11-driving-partitioner-v2" / "selected-driving-poi-plan-v2.json").read_text())
CACHE = json.loads((ROOT / "data" / "generated" / "ors-cache" / "stage-5-live-validation" / "20260730T020216Z-be95b0fa" / "e8bb30111305495cf7ab9e17441cceab2079caa7b071c313b6802f7bafb7d55e.json").read_text())
OUTER = max(CACHE["payload"]["features"], key=lambda item: item["properties"]["value"])["geometry"]


def by_id(identifier):
    return next(item for item in PLAN["pieces"] if item["pieceId"] == identifier)


class FakeClient:
    def __init__(self):
        self.calls = 0

    async def query(self, body):
        self.calls += 1
        return {"type": "FeatureCollection", "features": []}, {"status": 200, "apiQuota": {"remaining": 99}}


class Stage59ProviderContractTest(unittest.TestCase):
    def test_01_all_43_payloads_generate(self):
        manifest, _ = payload_manifest(PLAN["pieces"])
        self.assertEqual(len(manifest), 43)

    def test_02_polygon_payload_schema(self):
        piece = next(item for item in PLAN["pieces"] if item["geometryType"] == "Polygon")
        self.assertTrue(validate_provider_payload(payload_for_piece(piece))["schemaValid"])

    def test_03_multipolygon_payload_schema(self):
        self.assertTrue(validate_provider_payload(payload_for_piece(by_id(CANARY_MULTIPOLYGON_TWO_ID)))["schemaValid"])

    def test_04_key_and_authorization_do_not_enter_payload(self):
        serialized = json.dumps(payload_for_piece(by_id(CANARY_MULTIPOLYGON_TWO_ID)))
        self.assertNotIn("Authorization", serialized)
        self.assertNotIn("ORS_API_KEY", serialized)

    def test_05_five_multipolygons_are_identified(self):
        _, multi = payload_manifest(PLAN["pieces"])
        self.assertEqual(len(multi), 5)

    def test_06_expected_multipolygon_part_counts(self):
        actual = {item["pieceId"]: item["partCount"] for item in PLAN["pieces"] if item["geometryType"] == "MultiPolygon"}
        self.assertEqual(actual, {"v2-piece-007-34f5a73d000034ed": 5, "v2-piece-017-6ea053fb7b6b71ce": 2, "v2-piece-032-c9c87148dafa0c3a": 2, "v2-piece-034-d21991729bd10cb5": 2, "v2-piece-041-fa22a1c714bc7af2": 4})

    def test_07_split_has_15_multipolygon_components(self):
        _, summary = split_multipolygon_fallback(PLAN["pieces"])
        self.assertEqual(summary["multiPolygonComponentTotal"], 15)

    def test_08_split_count_is_53(self):
        _, summary = split_multipolygon_fallback(PLAN["pieces"])
        self.assertEqual(summary["fallbackRequestUnits"], 53)

    def test_09_split_additional_count_is_10(self):
        _, summary = split_multipolygon_fallback(PLAN["pieces"])
        self.assertEqual(summary["additionalRequestsIfSplit"], 10)

    def test_10_split_parent_children_area_conserve(self):
        children, _ = split_multipolygon_fallback(PLAN["pieces"])
        for piece in PLAN["pieces"]:
            if piece["geometryType"] == "MultiPolygon":
                self.assertAlmostEqual(sum(item["areaKm2"] for item in children if item["parentPieceId"] == piece["pieceId"]), piece["areaKm2"], places=6)

    def test_11_split_full_coverage_is_within_tolerance(self):
        children, _ = split_multipolygon_fallback(PLAN["pieces"])
        self.assertTrue(coverage_audit(OUTER, children, layer="split")["withinTolerance"])

    def test_12_canonical_coverage_is_within_tolerance(self):
        audit = canonical_full_precision_coverage_audit({"profile": "driving-car", "center": PLAN["center"], "rangesSeconds": [600, 1200, 1800], "outerGeometry": OUTER, "config": PLAN["config"]})
        self.assertTrue(audit["withinTolerance"])

    def test_13_roundtrip_coverage_is_within_tolerance(self):
        self.assertTrue(coverage_audit(OUTER, roundtrip_pieces(PLAN["pieces"]), layer="roundtrip")["withinTolerance"])

    def test_14_roundtrip_does_not_format_tiny_values_as_zero(self):
        audit = coverage_audit(OUTER, roundtrip_pieces(PLAN["pieces"]), layer="roundtrip")
        self.assertNotEqual(format(audit["uncoveredAreaKm2"], ".12e"), "0.000000000000e+00")

    def test_15_unknown_quota_blocks_canary(self):
        self.assertFalse(canary_quota_gate({"remaining": None})["allowed"])

    def test_16_quota_under_ten_blocks_canary(self):
        self.assertFalse(canary_quota_gate({"remaining": 9})["allowed"])

    def test_17_quota_ten_allows_canary(self):
        self.assertTrue(canary_quota_gate({"remaining": 10})["allowed"])

    def test_18_canary_never_retries_when_quota_unknown(self):
        client = FakeClient(); runner = Stage59CanaryRunner(client)
        result = asyncio.run(runner.run(by_id(CANARY_MULTIPOLYGON_TWO_ID), {"remaining": None}))
        self.assertFalse(result["attempted"]); self.assertEqual(client.calls, 0)

    def test_19_canary_truncation_is_a_flag_not_recursion(self):
        class LimitClient(FakeClient):
            async def query(self, body):
                self.calls += 1
                return {"type": "FeatureCollection", "features": [{}] * 2000}, {"status": 200, "apiQuota": {"remaining": 20}}
        client = LimitClient(); result = asyncio.run(Stage59CanaryRunner(client).run(by_id(CANARY_MULTIPOLYGON_TWO_ID), {"remaining": 20}))
        self.assertTrue(result["resultTruncated"]); self.assertEqual(client.calls, 1)

    def test_20_canary_maximum_is_three(self):
        client = FakeClient(); runner = Stage59CanaryRunner(client)
        for _ in range(STAGE59_CANARY_LIMIT):
            asyncio.run(runner.run(by_id(CANARY_MULTIPOLYGON_TWO_ID), {"remaining": 20}))
        fourth = asyncio.run(runner.run(by_id(CANARY_MULTIPOLYGON_TWO_ID), {"remaining": 20}))
        self.assertFalse(fourth["attempted"]); self.assertEqual(client.calls, 3)

    def test_21_canary_has_no_analysis_or_matrix_side_effect_fields(self):
        result = asyncio.run(Stage59CanaryRunner(FakeClient()).run(by_id(CANARY_MULTIPOLYGON_FIVE_ID), {"remaining": 20}))
        self.assertNotIn("analysisId", result); self.assertNotIn("matrix", result); self.assertFalse(result["cacheWritten"])

    def test_22_selected_plan_fingerprint_is_frozen(self):
        self.assertEqual(PLAN["planFingerprint"], "633aa700d21cc7582b77dea610a5e43a2bf35c7b382df6bbb48a6b90a941efd0")

    def test_23_canary_client_uses_a_stage59_isolated_cache(self):
        from app.config import Settings
        settings = Settings.from_environment({"APP_ENV": "test", "ANALYSIS_PROVIDER": "mock", "ALLOW_NETWORK": "false", "ALLOW_MOCK_FALLBACK": "false", "ORS_BASE_URL": "https://example.test", "ORS_POI_BASE_URL": "https://example.test"})
        client = isolated_stage59_canary_client(settings)
        self.assertIn("provider-contract-canary/stage59", str(client.settings.ors_cache_dir))


if __name__ == "__main__":
    unittest.main()
