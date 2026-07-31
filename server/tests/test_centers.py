import unittest
from pathlib import Path

from app.centers import CENTER_PRESETS, DEFAULT_CENTER_PRESET_ID, center_preset


class CenterPresetTest(unittest.TestCase):
    def test_wuhan_is_the_default_and_uses_lon_lat_order(self):
        center = center_preset()
        self.assertEqual(DEFAULT_CENTER_PRESET_ID, "wuhan-huanghelou")
        self.assertEqual(center["label"], "武汉·黄鹤楼")
        self.assertEqual([center["lon"], center["lat"]], [114.296944, 30.546944])

    def test_paris_preset_is_exact(self):
        center = CENTER_PRESETS["paris-eiffel-tower"]
        self.assertEqual([center["lon"], center["lat"]], [2.294478, 48.858297])
        self.assertEqual(center["label"], "巴黎·埃菲尔铁塔")

    def test_frontend_and_backend_confirmed_facts_stay_in_sync(self):
        frontend = (Path(__file__).resolve().parents[2] / "src" / "config" / "center-presets.js").read_text(encoding="utf-8")
        for value in ("wuhan-huanghelou", "武汉·黄鹤楼", "114.296944", "30.546944", "paris-eiffel-tower", "巴黎·埃菲尔铁塔", "2.294478", "48.858297"):
            self.assertIn(value, frontend)


if __name__ == "__main__":
    unittest.main()
