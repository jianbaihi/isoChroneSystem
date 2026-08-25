from __future__ import annotations

from typing import Any

from app.adapters.ors import OrsAdapter
from app.config import Settings
from app.errors import ApprovalRequiredError
from app.models import AnalysisOptions, AnalysisRequest, AnalysisResult, MinuteAccessibilityRequest, SpatialTimeAccessibilityRequest
from app.services.minute_isochrone_planner import build_minute_isochrone_plan
from app.services.quota import QuotaObserver
from app.services.spatial_time_accessibility import calculate_spatial_time_accessibility


async def calculate_minute_accessibility(
    request: MinuteAccessibilityRequest,
    settings: Settings,
    *,
    adapter: OrsAdapter | None = None,
    quota_observer: QuotaObserver | None = None,
) -> AnalysisResult:
    base = request.baseResult
    plan = build_minute_isochrone_plan(base.profile, max(base.rangesMinutes))
    if plan.approvalRequired and not request.approved:
        raise ApprovalRequiredError(
            f"分钟级分析需要 {plan.batchCount} 次等时圈请求，超过自动执行上限 {plan.autoRequestLimit}。",
            [{"field": "minuteIsochrones", "reason": "request_budget", "plan": plan.as_dict()}],
        )

    provider = adapter or OrsAdapter(settings, quota_observer=quota_observer)
    minute_isochrones = []
    cache_hits = 0
    upstream_requests = 0
    batch_audit: list[dict[str, Any]] = []
    for index, ranges in enumerate(plan.batches):
        batch_request = AnalysisRequest(
            center=base.center,
            profile=base.profile,
            rangesMinutes=ranges,
            categoryIds=[],
            options=AnalysisOptions(includePois=False, calculateTravelTimes=False),
        )
        batch = await provider.create_isochrones(batch_request)
        cache_hit = bool(provider.last_cache_hit)
        cache_hits += int(cache_hit)
        upstream_requests += int(not cache_hit)
        minute_isochrones.extend(batch)
        batch_audit.append({
            "batchIndex": index,
            "rangesMinutes": ranges,
            "status": "completed",
            "cacheHit": cache_hit,
            "upstreamRequestCount": int(not cache_hit),
        })

    result = calculate_spatial_time_accessibility(SpatialTimeAccessibilityRequest(
        baseResult=base,
        minuteIsochrones=minute_isochrones,
    ))
    result.metadata.spatialTime.update({
        "plan": plan.as_dict(),
        "batchCount": plan.batchCount,
        "cacheHitCount": cache_hits,
        "upstreamRequestCount": upstream_requests,
        "batches": batch_audit,
        "status": "complete",
    })
    return result
