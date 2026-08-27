from __future__ import annotations

LABELS = {
    "food": "餐饮", "shopping": "购物", "attraction": "景点", "lodging": "住宿",
    "health": "医疗", "education": "教育", "transport": "交通", "service": "生活服务",
    "entertainment": "休闲娱乐", "nature": "公园自然", "public": "公共设施", "other": "其他",
}
CATEGORY_MAPPING_VERSION = "normalized-category-v1"


def amap_category(typecode: str | None, source: str | None) -> str:
    if (typecode or "").startswith("1101"):
        return "nature"
    prefix = (typecode or "")[:2]
    return {"05": "food", "06": "shopping", "07": "service", "08": "entertainment", "09": "health", "10": "lodging", "11": "attraction", "12": "service", "14": "education", "15": "transport", "16": "transport", "17": "transport", "18": "transport", "19": "service", "20": "public"}.get(prefix, "other")


def foursquare_category(category_id: int | str | None, source: str | None) -> str:
    try:
        prefix = int(category_id or 0) // 1000
    except (TypeError, ValueError):
        prefix = 0
    return {10: "entertainment", 11: "service", 12: "service", 13: "food", 14: "entertainment", 15: "health", 16: "attraction", 17: "shopping", 18: "entertainment", 19: "transport"}.get(prefix, "other")


def category_payload(category_id: str, source: str | None, source_code: str | None) -> dict:
    return {"id": category_id, "label": LABELS[category_id], "sourceCategory": source, "sourceCategoryCode": source_code}
