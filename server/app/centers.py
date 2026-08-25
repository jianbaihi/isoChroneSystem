from __future__ import annotations

from copy import deepcopy
from typing import Any


CENTER_PRESETS: dict[str, dict[str, Any]] = {
    "wuhan-huanghelou": {
        "id": "wuhan-huanghelou", "label": "武汉·黄鹤楼", "lon": 114.296944, "lat": 30.546944,
        "district": "武汉市武昌区",
    },
    "paris-eiffel-tower": {
        "id": "paris-eiffel-tower", "label": "巴黎·埃菲尔铁塔", "lon": 2.294478, "lat": 48.858297,
        "district": "法国巴黎第七区",
    },
}
DEFAULT_CENTER_PRESET_ID = "wuhan-huanghelou"


def center_preset(center_id: str = DEFAULT_CENTER_PRESET_ID) -> dict[str, Any]:
    return deepcopy(CENTER_PRESETS.get(center_id) or CENTER_PRESETS[DEFAULT_CENTER_PRESET_ID])
