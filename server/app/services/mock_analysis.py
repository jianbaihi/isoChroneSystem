from datetime import datetime, timezone
from uuid import uuid4

from app.models import (
    AnalysisRequest,
    AnalysisResult,
    Category,
    Center,
    Location,
    Poi,
    Ring,
    RingStatistics,
)


MOCK_CATEGORIES = [
    ("food", "餐饮美食", ["火锅", "咖啡", "烧烤"]),
    ("shopping", "购物商场", ["商超", "百货", "购物中心"]),
    ("hotel", "酒店住宿", ["连锁酒店", "经济酒店", "民宿"]),
    ("service", "生活服务", ["银行", "美容服务", "ATM"]),
    ("transit", "交通设施", ["地铁站", "停车场", "公交站"]),
    ("medical", "医疗健康", ["综合医院", "专科医院", "药店"]),
    ("scenic", "景点休闲", ["博物馆", "展览馆", "植物园"]),
    ("leisure", "休闲娱乐", ["电影院", "KTV", "桌游馆"]),
    ("education", "教育培训", ["早教", "职业培训", "艺术培训"]),
]
MOCK_CATEGORY_ALIASES = {
    "food_and_drink": "food", "shopping": "shopping", "cultural_and_historic": "scenic",
    "lodging": "hotel", "health_care": "medical", "education": "education",
    "travel_and_transportation": "transit", "lifestyle_services": "service",
    "arts_and_entertainment": "leisure",
}


def _selected_categories(request: AnalysisRequest) -> list[tuple[str, str, list[str]]]:
    selected = {MOCK_CATEGORY_ALIASES.get(category_id, category_id) for category_id in request.categoryIds}
    return [item for item in MOCK_CATEGORIES if not selected or item[0] in selected]


def _mock_location(center: Center, ring_index: int, category_index: int, poi_index: int) -> Location:
    # This is a deterministic fixture offset, not a geocoded or routed position.
    offset = (ring_index + 1) * (category_index + 1) * (poi_index + 1) * 0.0001
    return Location(
        lon=max(-180, min(180, center.lon + offset)),
        lat=max(-90, min(90, center.lat + offset * 0.72)),
    )


def build_mock_entities(request: AnalysisRequest) -> tuple[list[Category], list[Ring], list[Poi]]:
    categories_data = _selected_categories(request)
    categories = [Category(categoryId=item[0], label=item[1], level=1) for item in categories_data]
    rings: list[Ring] = []
    pois: list[Poi] = []
    previous_range = 0
    poi_index = 1

    for ring_index, outer_range in enumerate(request.rangesMinutes):
        ring_id = f"ring-{previous_range}-{outer_range}"
        ring_pois: list[Poi] = []
        for category_index, (category_id, label, child_labels) in enumerate(categories_data):
            sample_count = min(4, 2 + ring_index)
            for child_index in range(sample_count):
                child_label = child_labels[child_index % len(child_labels)]
                ring_pois.append(
                    Poi(
                        poiId=f"mock-poi-{poi_index:03d}",
                        name=f"{label}·{child_label}示例 {child_index + 1}",
                        location=_mock_location(request.center, ring_index, category_index, child_index),
                        categoryId=category_id,
                        ringId=ring_id,
                    )
                )
                poi_index += 1
        rings.append(Ring(
            ringId=ring_id,
            innerRangeMinutes=previous_range,
            outerRangeMinutes=outer_range,
            geometry=None,
            statistics=RingStatistics(poiCount=len(ring_pois)),
        ))
        pois.extend(ring_pois)
        previous_range = outer_range
    return categories, rings, pois


def create_mock_analysis(request: AnalysisRequest, request_id: str) -> AnalysisResult:
    categories, rings, pois = build_mock_entities(request)
    if not request.options.includePois:
        rings = [
            ring.model_copy(update={"statistics": RingStatistics(poiCount=0)})
            if hasattr(ring, "model_copy")
            else ring.copy(update={"statistics": RingStatistics(poiCount=0)})
            for ring in rings
        ]

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return AnalysisResult(
        analysisId=f"analysis-mock-{uuid4()}",
        center=request.center,
        profile=request.profile,
        rangesMinutes=list(request.rangesMinutes),
        rings=rings,
        pois=pois if request.options.includePois else [],
        categories=categories,
        metadata={
            "source": "mock",
            "sources": {"isochrones": "mock", "pois": "mock" if request.options.includePois else "none"},
            "generatedAt": generated_at,
            "requestId": request_id,
            "warnings": [
                "第 2 阶段返回模拟数据，未调用 ORS、POI 或 Matrix 服务。",
                "POI 为开发 fixture，用于验证数据管线，不代表真实地点检索结果。",
            ],
        },
    )
