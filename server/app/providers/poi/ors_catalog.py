from __future__ import annotations

from typing import Any


GROUPS: dict[str, tuple[str, str]] = {
    "100": ("accommodation", "住宿"), "120": ("animals", "动物"), "130": ("arts_and_culture", "艺术与文化"),
    "150": ("education", "教育"), "160": ("facilities", "设施"), "190": ("financial", "金融"),
    "200": ("healthcare", "医疗健康"), "220": ("historic", "历史"), "260": ("leisure_and_entertainment", "休闲娱乐"),
    "330": ("natural", "自然"), "360": ("public_places", "公共场所"), "390": ("service", "服务"),
    "420": ("shops", "商店"), "560": ("sustenance", "餐饮"), "580": ("transport", "交通"), "620": ("tourism", "旅游"),
}
CATEGORIES: dict[str, tuple[str, str, str]] = {
    "108": ("100", "hotel", "酒店"), "156": ("150", "school", "学校"), "157": ("150", "university", "大学"),
    "206": ("200", "hospital", "医院"), "208": ("200", "pharmacy", "药店"), "435": ("560", "cafe", "咖啡馆"),
    "570": ("560", "restaurant", "餐厅"), "601": ("580", "parking", "停车场"), "622": ("620", "attraction", "景点"),
}
LEGACY_GROUP_MAP = {
    "services_and_business": {"390"}, "shopping": {"420"}, "food_and_drink": {"560"}, "lifestyle_services": {"390"},
    "travel_and_transportation": {"580"}, "health_care": {"200"}, "education": {"150"}, "cultural_and_historic": {"130", "220"},
    "sports_and_recreation": {"260"}, "community_and_government": {"360"}, "lodging": {"100"}, "arts_and_entertainment": {"130", "260"},
    "geographic_entities": {"330"},
}


def _ids(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, (str, int)):
        values = [values]
    if not isinstance(values, (list, tuple, set)):
        return []
    return [str(value).split(".", 1)[0] for value in values if str(value).strip()]


def category_hierarchy(properties: dict[str, Any]) -> tuple[str | None, str | None, list[str]]:
    category_ids = _ids(properties.get("category_ids") or properties.get("categoryIds") or properties.get("category_id"))
    group_ids = _ids(properties.get("category_group_ids") or properties.get("categoryGroupIds") or properties.get("category_group_id"))
    category_id = next((item for item in category_ids if item in CATEGORIES), None)
    group_id = CATEGORIES[category_id][0] if category_id else next((item for item in group_ids if item in GROUPS), None)
    if group_id is None:
        group_id = next((item for item in category_ids if item in GROUPS), None)
    if group_id is None:
        return None, None, []
    category_id = category_id or next((item for item in category_ids if CATEGORIES.get(item, (None,))[0] == group_id), None)
    hierarchy = [f"ors:group:{group_id}"]
    if category_id:
        hierarchy.append(f"ors:category:{category_id}")
    return group_id, category_id, hierarchy


def category_filter_groups(category_ids: list[str]) -> set[str]:
    result: set[str] = set()
    for category_id in category_ids:
        value = str(category_id)
        if value.startswith("ors:group:"):
            result.add(value.rsplit(":", 1)[-1])
        elif value.startswith("ors:category:") and value.rsplit(":", 1)[-1] in CATEGORIES:
            result.add(CATEGORIES[value.rsplit(":", 1)[-1]][0])
        else:
            result.update(LEGACY_GROUP_MAP.get(value, set()))
    return result


def category_catalog_item(group_id: str, category_id: str | None) -> list[dict[str, Any]]:
    group_name, group_label = GROUPS.get(group_id, (f"unknown-{group_id}", f"未知分组 {group_id}"))
    items = [{"id": f"ors:group:{group_id}", "parent": None, "label": group_label, "name": group_name, "level": 1}]
    if category_id:
        _, name, label = CATEGORIES.get(category_id, (group_id, f"unknown-{category_id}", f"未知类别 {category_id}"))
        items.append({"id": f"ors:category:{category_id}", "parent": f"ors:group:{group_id}", "label": label, "name": name, "level": 2})
    return items
