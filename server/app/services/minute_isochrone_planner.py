from __future__ import annotations

from dataclasses import dataclass

from app.provider_capabilities import (
    ISOCHRONE_MAX_INTERVALS_PER_REQUEST,
    MINUTE_ISOCHRONE_AUTO_REQUEST_LIMIT,
    PROFILE_MAX_TIME_MINUTES,
)


@dataclass(frozen=True)
class MinuteIsochronePlan:
    resolutionMinutes: int
    maxRangeMinutes: int
    rangeCount: int
    batchSize: int
    maxIntervalsPerRequest: int
    batchCount: int
    batches: list[list[int]]
    autoRequestLimit: int
    approvalRequired: bool

    def as_dict(self) -> dict:
        return {
            "resolutionMinutes": self.resolutionMinutes,
            "maxRangeMinutes": self.maxRangeMinutes,
            "rangeCount": self.rangeCount,
            "batchSize": self.batchSize,
            "maxIntervalsPerRequest": self.maxIntervalsPerRequest,
            "batchCount": self.batchCount,
            "batches": self.batches,
            "autoRequestLimit": self.autoRequestLimit,
            "approvalRequired": self.approvalRequired,
        }


def build_minute_isochrone_plan(profile: str, max_range_minutes: int) -> MinuteIsochronePlan:
    maximum = PROFILE_MAX_TIME_MINUTES.get(profile)
    if maximum is None:
        raise ValueError(f"不支持的交通方式：{profile}")
    if not isinstance(max_range_minutes, int) or isinstance(max_range_minutes, bool) or max_range_minutes <= 0:
        raise ValueError("maxRangeMinutes 必须是正整数。")
    if max_range_minutes > maximum:
        raise ValueError(f"当前 ORS 公共 {profile} 最大时间范围为 {maximum} 分钟。")
    ranges = list(range(1, max_range_minutes + 1))
    batches = [ranges[index:index + ISOCHRONE_MAX_INTERVALS_PER_REQUEST] for index in range(0, len(ranges), ISOCHRONE_MAX_INTERVALS_PER_REQUEST)]
    return MinuteIsochronePlan(
        resolutionMinutes=1,
        maxRangeMinutes=max_range_minutes,
        rangeCount=len(ranges),
        batchSize=ISOCHRONE_MAX_INTERVALS_PER_REQUEST,
        maxIntervalsPerRequest=ISOCHRONE_MAX_INTERVALS_PER_REQUEST,
        batchCount=len(batches),
        batches=batches,
        autoRequestLimit=MINUTE_ISOCHRONE_AUTO_REQUEST_LIMIT,
        approvalRequired=len(batches) > MINUTE_ISOCHRONE_AUTO_REQUEST_LIMIT,
    )
