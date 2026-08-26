from __future__ import annotations

from typing import Any


NORMALIZED_CATEGORY_LABELS = {
    "food": "餐饮", "shopping": "购物", "attraction": "景点", "lodging": "住宿",
    "health": "医疗", "education": "教育", "transport": "交通", "service": "生活服务",
    "entertainment": "休闲娱乐", "other": "其他",
}


def normalize_category(source_category: str | None, label: str | None = None) -> dict[str, Any]:
    text = f"{source_category or ''} {label or ''}".casefold()
    mappings = (
        ("food", ("food", "restaurant", "cafe", "餐饮")),
        ("shopping", ("shop", "shopping", "购物")),
        ("attraction", ("tour", "attraction", "historic", "景点")),
        ("lodging", ("hotel", "lodging", "住宿")),
        ("health", ("health", "hospital", "clinic", "医疗")),
        ("education", ("education", "school", "university", "教育")),
        ("transport", ("transport", "station", "交通")),
        ("service", ("service", "生活服务")),
        ("entertainment", ("entertainment", "leisure", "arts", "休闲娱乐")),
    )
    category_id = next((target for target, needles in mappings if any(item in text for item in needles)), "other")
    return {"id": category_id, "label": NORMALIZED_CATEGORY_LABELS[category_id], "sourceCategory": source_category}


def normalize_poi(poi: Any, provider: str = "openpoiservice") -> dict[str, Any]:
    value = poi.model_dump(mode="json") if hasattr(poi, "model_dump") else poi.dict() if hasattr(poi, "dict") else dict(poi)
    category = normalize_category(value.get("categoryId"), (value.get("category") or {}).get("label"))
    return {
        "poiId": value["poiId"], "name": value["name"], "location": value["location"],
        "category": category, "address": value.get("address"), "rating": value.get("rating"),
        "phone": value.get("phone"), "website": value.get("website"),
        "openingHours": value.get("openingHours"), "brand": value.get("brand"),
        "source": {"provider": provider, "providerPoiId": value["poiId"], "attribution": []},
        "displayRingId": value.get("ringId"),
    }
