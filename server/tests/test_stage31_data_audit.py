import copy
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("stage31_audit", ROOT / "scripts/build_stage31_data_audit.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Stage31DataAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = json.loads((ROOT / "exports/stage-6-layout/stage20-cache-baseline.json").read_text())

    def test_frozen_baseline_is_complete_and_conserved(self):
        audit = MODULE.audit_baseline(self.baseline)
        self.assertEqual((audit["totalPoi"], audit["eligible"], audit["outOfRange"]), (282, 252, 30))
        self.assertEqual(audit["rings"], {"600": 39, "1200": 83, "1800": 130})
        self.assertEqual(audit["validCoordinates"], 282)
        self.assertEqual(audit["upstreamRequests"], {"isochrones": 0, "poi": 0, "matrix": 0, "geocoder": 0})

    def test_invalid_coordinate_fixture_is_rejected(self):
        fixture = copy.deepcopy(self.baseline)
        fixture["pois"][0]["location"]["lon"] = 999
        with self.assertRaisesRegex(RuntimeError, "frozen baseline mismatch"):
            MODULE.audit_baseline(fixture)

    def test_duplicate_id_fixture_is_rejected(self):
        fixture = copy.deepcopy(self.baseline)
        fixture["pois"].append(copy.deepcopy(fixture["pois"][0]))
        with self.assertRaisesRegex(RuntimeError, "frozen baseline mismatch"):
            MODULE.audit_baseline(fixture)


if __name__ == "__main__":
    unittest.main()
