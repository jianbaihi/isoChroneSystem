from typing import Any


class ApiError(Exception):
    """Safe, serializable application error for the HTTP boundary."""

    def __init__(
        self,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
        status_code: int = 500,
        retry_after: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or []
        self.status_code = status_code
        self.retry_after = retry_after


class FeatureNotAvailableError(ApiError):
    def __init__(self, message: str, details: list[dict[str, Any]] | None = None) -> None:
        super().__init__("FEATURE_NOT_AVAILABLE", message, details, status_code=501)


class ProviderNotConfiguredError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "PROVIDER_NOT_CONFIGURED",
            "ORS 提供者未完成服务端配置。",
            [{"field": "ORS_API_KEY", "reason": "missing"}],
            status_code=503,
        )


class OrsApiKeyMissingError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "ORS_API_KEY_MISSING",
            "ORS 提供者未完成服务端配置。",
            [{"field": "ORS_API_KEY", "reason": "missing"}],
            status_code=503,
        )


class UpstreamTimeoutError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "UPSTREAM_TIMEOUT",
            "ORS 服务请求超时。",
            [{"field": "provider", "reason": "timeout"}],
            status_code=504,
        )


class UpstreamUnavailableError(ApiError):
    def __init__(self, reason: str = "unavailable") -> None:
        super().__init__(
            "UPSTREAM_UNAVAILABLE",
            "ORS 服务暂时不可用。",
            [{"field": "provider", "reason": reason}],
            status_code=503,
        )


class UpstreamAuthError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "UPSTREAM_AUTH_ERROR",
            "ORS 服务鉴权失败。",
            [{"field": "provider", "reason": "authentication"}],
            status_code=502,
        )


class UpstreamRateLimitedError(ApiError):
    def __init__(self, retry_after: str | None = None) -> None:
        super().__init__(
            "UPSTREAM_RATE_LIMITED",
            "ORS 服务请求受到限流。",
            [{"field": "provider", "reason": "rate_limited"}],
            status_code=429,
            retry_after=retry_after,
        )


class UpstreamRequestRejectedError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "UPSTREAM_REQUEST_REJECTED",
            "ORS 服务拒绝了已通过本地校验的请求。",
            [{"field": "provider", "reason": "request_rejected"}],
            status_code=422,
        )


class InvalidProviderResponseError(ApiError):
    def __init__(self, details: list[dict[str, Any]] | None = None) -> None:
        super().__init__(
            "UPSTREAM_INVALID_RESPONSE",
            "ORS 服务返回了无法转换的等时圈数据。",
            details or [{"field": "provider", "reason": "invalid_response"}],
            status_code=502,
        )


class InvalidPoiProviderResponseError(ApiError):
    def __init__(self, reason: str = "invalid_response") -> None:
        super().__init__(
            "ORS_POI_RESPONSE_INVALID",
            "OpenPOIService 返回了无法转换的 POI 数据。",
            [{"field": "provider", "reason": reason}],
            status_code=502,
        )


class PoiUpstreamTruncatedError(ApiError):
    def __init__(self) -> None:
        super().__init__(
            "POI_UPSTREAM_TRUNCATED",
            "OpenPOIService 返回达到单元上限，仍无法在安全预算内完整展开。",
            [{"field": "poi", "reason": "upstream_limit"}],
            status_code=422,
        )


class PoiRequestBudgetExceededError(ApiError):
    def __init__(self, planned: int, maximum: int) -> None:
        super().__init__(
            "POI_REQUEST_BUDGET_EXCEEDED",
            "POI 查询计划超过本次分析的请求预算。",
            [{"field": "poiRequests", "reason": "budget_exceeded", "planned": planned, "maximum": maximum}],
            status_code=422,
        )


class InvalidProviderParameterError(ApiError):
    def __init__(self, field: str, reason: str) -> None:
        super().__init__(
            "INVALID_PROVIDER_PARAMETER",
            "当前 ORS 远程提供者不接受该参数。",
            [{"field": field, "reason": reason}],
            status_code=422,
        )


class PoiDatasetNotReadyError(ApiError):
    def __init__(self, dataset_id: str | None = None) -> None:
        super().__init__(
            "POI_DATASET_NOT_READY",
            "请求的 Overture POI 数据集尚未就绪。",
            [{"field": "poiDatasetId", "reason": "not_ready", "datasetId": dataset_id}] if dataset_id else [],
            status_code=503,
        )


class InvalidPoiCategoryError(ApiError):
    def __init__(self, category_ids: list[str]) -> None:
        super().__init__(
            "INVALID_POI_CATEGORY",
            "请求包含当前 POI 数据集不存在的主路径类别。",
            [{"field": "categoryIds", "reason": "unknown_category", "categoryIds": category_ids}],
            status_code=422,
        )


class PoiCandidateLimitError(ApiError):
    def __init__(self, limit: int) -> None:
        super().__init__(
            "POI_CANDIDATE_LIMIT_EXCEEDED",
            "POI 空间候选数超过安全上限，请缩小研究范围或调整数据集。",
            [{"field": "poiCandidates", "reason": "limit_exceeded", "limit": limit}],
            status_code=422,
        )


class PoiCoverageAreaExceededError(ApiError):
    def __init__(self, area_km2: float, maximum_km2: float) -> None:
        super().__init__(
            "POI_COVERAGE_AREA_EXCEEDED",
            "步行等时圈面积超过单次 POI 查询安全上限，已停止名称云请求。",
            [{"field": "poiCoverage.areaKm2", "reason": "area_exceeded", "areaKm2": area_km2, "maximumKm2": maximum_km2}],
            status_code=422,
        )
