from uuid import uuid4
from typing import Any

from fastapi import FastAPI, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import ApiError, FeatureNotAvailableError, InvalidProviderParameterError
from app.models import AnalysisRequest, MatrixAccessibilityRequest, MinuteAccessibilityRequest, NameCloudRequest, PoiPreviewRequest, PoiQueryRequest, SpatialTimeAccessibilityRequest
from app.provider_capabilities import public_provider_capabilities
from app.providers.geocoder import OrsGeocoder
from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.repositories.local_poi import LocalPoiRepository
from app.services.analysis import create_analysis as build_analysis
from app.services.analysis import create_name_cloud
from app.services.cycling_job_ledger import CyclingJobLedger, cycling_input_fingerprint
from app.services.matrix_accessibility import calculate_matrix_accessibility
from app.services.minute_accessibility import calculate_minute_accessibility
from app.services.poi_query import query_pois
from app.services.spatial_time_accessibility import calculate_spatial_time_accessibility
from app.services.poi_batch_planner import build_poi_query_plan, public_plan
from app.services.quota import QuotaObserver
from app.services.stage51_cycling_cache import build_cached_name_cloud, complete_cached_matrix
from app.services.walking_job_ledger import WalkingJobLedger, walking_input_fingerprint


app = FastAPI(title="Panmap Analysis API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Accept", "X-Request-ID", "X-Stage45-Job-ID", "X-Stage51-Job-ID"],
)
app.state.settings = settings
app.state.quota_observer = QuotaObserver()
app.state.walking_job_ledger = WalkingJobLedger()
app.state.cycling_job_ledger = CyclingJobLedger()


def walking_job_id_for(request: Request) -> str | None:
    value = request.headers.get("X-Stage45-Job-ID")
    return value.strip()[:120] if value and value.strip() else None


def cycling_job_id_for(request: Request) -> str | None:
    value = request.headers.get("X-Stage51-Job-ID")
    return value.strip()[:120] if value and value.strip() else None


def stage_job_for(request: Request, profile: str) -> tuple[str | None, Any | None, Any | None]:
    walking_id = walking_job_id_for(request)
    cycling_id = cycling_job_id_for(request)
    if walking_id and cycling_id:
        raise InvalidProviderParameterError("jobHeader", "multiple_stage_job_headers")
    if cycling_id:
        if profile != "cycling-regular":
            raise InvalidProviderParameterError("X-Stage51-Job-ID", "profile_must_be_cycling_regular")
        return cycling_id, getattr(request.app.state, "cycling_job_ledger", None), cycling_input_fingerprint
    if walking_id:
        if profile != "foot-walking":
            raise InvalidProviderParameterError("X-Stage45-Job-ID", "profile_must_be_foot_walking")
        return walking_id, getattr(request.app.state, "walking_job_ledger", None), walking_input_fingerprint
    return None, None, None


def request_id_for(request: Request) -> str:
    return request.headers.get("X-Request-ID") or str(uuid4())


def error_response(
    status_code: int,
    code: str,
    message: str,
    request_id: str,
    details: list[dict] | None = None,
    retry_after: str | None = None,
) -> JSONResponse:
    headers = {"X-Request-ID": request_id}
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "details": details or [],
                "requestId": request_id,
            }
        },
        headers=headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = request_id_for(request)
    details = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body") or "request"
        details.append({"field": location, "reason": str(error.get("type", "invalid"))})
    is_invalid_json = any("json" in str(error.get("type", "")) for error in exc.errors())
    return error_response(
        400 if is_invalid_json else 422,
        "INVALID_REQUEST" if is_invalid_json else "VALIDATION_ERROR",
        "请求 JSON 无法解析。" if is_invalid_json else "请求字段校验失败。",
        request_id,
        details,
    )


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    return error_response(
        exc.status_code,
        exc.code,
        exc.message,
        request_id_for(request),
        exc.details,
        exc.retry_after,
    )


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    return error_response(500, "INTERNAL_ERROR", "服务内部错误。", request_id_for(request))


@app.get("/api/v1/health")
async def health(raw_request: Request) -> JSONResponse:
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    request_id = request_id_for(raw_request)
    return JSONResponse(
        status_code=200,
        content={
            **runtime_settings.readiness(),
            "service": "panmap-analysis-api",
            "mode": runtime_settings.analysis_provider,
            "providerReady": runtime_settings.provider_ready,
            "providerCapabilities": public_provider_capabilities(),
        },
        headers={"X-Request-ID": request_id},
    )


@app.post("/api/v1/analyses", response_model=None, response_model_exclude_none=False)
async def create_analysis(request: AnalysisRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    if request.options.calculateTravelTimes:
        raise FeatureNotAvailableError(
            "本阶段未实现 Matrix 通行时间计算。",
            [{"field": "options.calculateTravelTimes", "reason": "stage_2_only_mock"}],
        )
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    job_id, ledger, fingerprint_builder = stage_job_for(raw_request, request.profile)
    if job_id:
        if list(request.rangesMinutes) != [10, 20, 30]:
            raise FeatureNotAvailableError("当前真实点击链路仅批准黄鹤楼 10/20/30 分钟。")
        ledger.begin(job_id, fingerprint_builder(request.center, request.profile, request.rangesMinutes))
        ledger.transition(job_id, "isochrone-running")
    try:
        result = await build_analysis(
            request,
            request_id,
            runtime_settings,
            getattr(raw_request.app.state, "ors_adapter", None),
            getattr(raw_request.app.state, "poi_provider", None),
            getattr(raw_request.app.state, "quota_observer", None),
        )
    except Exception:
        if job_id:
            ledger.transition(job_id, "failed")
        raise
    if job_id:
        cache_hit = bool(result.metadata.cacheHit)
        ledger.record(job_id, "isochrones", attempted=1, cache_hits=int(cache_hit), upstream=int(not cache_hit))
        ledger.transition(job_id, "isochrone-ready")
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict(),
        headers={"X-Request-ID": request_id},
    )


@app.post("/api/v1/poi-previews", response_model=None, response_model_exclude_none=False)
async def create_poi_preview(request: PoiPreviewRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    if runtime_settings.analysis_provider != "ors" or not runtime_settings.ors_api_key:
        raise FeatureNotAvailableError(
            "当前服务未启用 ORS POI 预览。",
            [{"field": "POI_PROVIDER", "reason": "ors_preview_requires_live_provider"}],
        )
    quota_observer = getattr(raw_request.app.state, "quota_observer", None)
    provider = getattr(raw_request.app.state, "poi_provider", None)
    if not isinstance(provider, OrsRemotePoiProvider):
        provider = OrsRemotePoiProvider(runtime_settings, quota_observer=quota_observer)
    selection = await provider.preview(request, request.radiusMeters)
    return JSONResponse(
        status_code=200,
        content={
            "schemaVersion": "1.0",
            "pois": [item.model_dump(mode="json") if hasattr(item, "model_dump") else item.dict() for item in selection["pois"]],
            "categories": [item.model_dump(mode="json") if hasattr(item, "model_dump") else item.dict() for item in selection["categories"]],
            "ringCounts": selection["ringCounts"],
            "matchedCount": selection["matchedCount"],
            "returnedCount": selection["returnedCount"],
            "truncated": selection["truncated"],
            "metadata": {
                "requestId": request_id,
                "poiProvider": "ors_remote",
                "poiCoverage": selection["coverage"],
                "poiSelection": {
                    "matchedCount": selection["matchedCount"],
                    "returnedCount": selection["returnedCount"],
                    "truncated": selection["truncated"],
                    "diagnostics": selection.get("diagnostics", {}),
                },
                "rateLimit": selection.get("rateLimit", {}),
                "apiQuota": quota_observer.snapshot() if quota_observer else None,
                "attribution": selection.get("attribution", []),
                "source": "ors",
                "sources": {"isochrones": "ors-public-api", "pois": "ors-openpoiservice"},
                "isLive": True,
                "cacheHit": bool(selection["coverage"].get("cacheHits")),
                "featureCount": selection["returnedCount"],
                "profile": request.profile,
                "rangesSeconds": [value * 60 for value in request.rangesMinutes],
            },
        },
        headers={"X-Request-ID": request_id},
    )


@app.post("/api/v1/name-clouds", response_model=None, response_model_exclude_none=False)
async def create_name_cloud_endpoint(request: NameCloudRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    quota_observer = getattr(raw_request.app.state, "quota_observer", None)
    provider = getattr(raw_request.app.state, "poi_provider", None)
    if not isinstance(provider, OrsRemotePoiProvider):
        provider = OrsRemotePoiProvider(runtime_settings, quota_observer=quota_observer)
    job_id, ledger, fingerprint_builder = stage_job_for(raw_request, request.profile)
    if job_id:
        ledger.begin(job_id, fingerprint_builder(request.center, request.profile, request.rangesMinutes))
        ledger.transition(job_id, "poi-planning")
        ledger.transition(job_id, "poi-running")
    try:
        if request.profile == "cycling-regular" and job_id:
            result = build_cached_name_cloud(request, request_id)
        else:
            result = await create_name_cloud(
                request,
                request_id,
                runtime_settings,
                poi_provider=provider,
                quota_observer=quota_observer,
            )
    except Exception:
        if job_id:
            ledger.transition(job_id, "partial")
        raise
    if job_id:
        coverage = result.metadata.poiCoverage or {}
        attempted = int(coverage.get("requests", 0))
        hits = int(coverage.get("cacheHits", int(bool(coverage.get("cacheHit")))))
        ledger.record(job_id, "pois", attempted=attempted, cache_hits=hits, upstream=max(0, attempted - hits))
        ledger.transition(job_id, "poi-ready")
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict(),
        headers={"X-Request-ID": request_id},
    )


@app.post("/api/v1/poi-query", response_model=None, response_model_exclude_none=False)
async def create_poi_query_endpoint(request: PoiQueryRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    quota_observer = getattr(raw_request.app.state, "quota_observer", None)
    provider = getattr(raw_request.app.state, "poi_provider", None)
    if not isinstance(provider, OrsRemotePoiProvider):
        provider = OrsRemotePoiProvider(runtime_settings, quota_observer=quota_observer)
    result = await query_pois(request, runtime_settings, provider, quota_observer)
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict(),
        headers={"X-Request-ID": request_id},
    )


@app.post("/api/v1/matrix-accessibility", response_model=None, response_model_exclude_none=False)
async def create_matrix_accessibility_endpoint(request: MatrixAccessibilityRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    profile = request.baseResult.profile
    job_id, ledger, fingerprint_builder = stage_job_for(raw_request, profile)
    if job_id:
        ledger.begin(job_id, fingerprint_builder(request.baseResult.center, profile, request.baseResult.rangesMinutes))
        ledger.transition(job_id, "matrix-planning")
        batch_count = (len(request.baseResult.pois) + 499) // 500
        limit = 12 if profile == "cycling-regular" else 2
        if batch_count > limit:
            ledger.transition(job_id, "approval-required")
            raise FeatureNotAvailableError(f"Matrix 需要 {batch_count} 批，超过本阶段批准上限 {limit}。")
        ledger.transition(job_id, "matrix-running")
    try:
        if profile == "cycling-regular" and job_id:
            result = complete_cached_matrix(request)
        else:
            result = await calculate_matrix_accessibility(
                request,
                runtime_settings,
                matrix_adapter=getattr(raw_request.app.state, "matrix_adapter", None),
                quota_observer=getattr(raw_request.app.state, "quota_observer", None),
            )
    except Exception:
        if job_id:
            ledger.transition(job_id, "partial")
        raise
    if job_id:
        metadata = result.metadata.matrix or {}
        upstream = int(metadata.get("upstreamRequestCount", 0))
        attempted = int(metadata.get("batchCount", 1))
        cache_hits = int(metadata.get("cacheHits", attempted if upstream == 0 else 0))
        ledger.record(job_id, "matrix", attempted=attempted, cache_hits=cache_hits, upstream=upstream)
        ledger.transition(job_id, "layout-ready")
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict(),
        headers={"X-Request-ID": request_id},
    )


@app.post("/api/v1/spatial-time-accessibility", response_model=None, response_model_exclude_none=False)
async def create_spatial_time_accessibility_endpoint(request: SpatialTimeAccessibilityRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    result = calculate_spatial_time_accessibility(request)
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict(),
        headers={"X-Request-ID": request_id, "X-Upstream-Request-Count": "0"},
    )


@app.post("/api/v1/minute-accessibility", response_model=None, response_model_exclude_none=False)
async def create_minute_accessibility_endpoint(request: MinuteAccessibilityRequest, raw_request: Request):
    request_id = request_id_for(raw_request)
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    result = await calculate_minute_accessibility(
        request,
        runtime_settings,
        adapter=getattr(raw_request.app.state, "ors_adapter", None),
        quota_observer=getattr(raw_request.app.state, "quota_observer", None),
    )
    metadata = result.metadata or {}
    return JSONResponse(
        status_code=200,
        content=result.model_dump(mode="json") if hasattr(result, "model_dump") else result.dict(),
        headers={
            "X-Request-ID": request_id,
            "X-Upstream-Request-Count": str(metadata.get("upstreamRequestCount", 0)),
        },
    )


@app.get("/api/v1/walking-job-ledger")
async def walking_job_ledger(raw_request: Request, jobId: str | None = Query(default=None)) -> JSONResponse:
    request_id = request_id_for(raw_request)
    ledger = getattr(raw_request.app.state, "walking_job_ledger", None)
    return JSONResponse(
        status_code=200,
        content=ledger.snapshot(jobId) if ledger else {"stage": 45, "job": None, "jobCount": 0},
        headers={"X-Request-ID": request_id, "X-Upstream-Request-Count": "0"},
    )


@app.post("/api/v1/walking-jobs/{job_id}/publish")
async def publish_walking_job(job_id: str, raw_request: Request) -> JSONResponse:
    request_id = request_id_for(raw_request)
    ledger = getattr(raw_request.app.state, "walking_job_ledger", None)
    if ledger is None or job_id not in ledger.jobs:
        raise InvalidProviderParameterError("jobId", "walking_job_not_found")
    if ledger.jobs[job_id]["status"] != "layout-ready":
        raise InvalidProviderParameterError("walkingJob.status", "layout_not_ready")
    ledger.mark_published(job_id)
    return JSONResponse(
        status_code=200,
        content=ledger.snapshot(job_id),
        headers={"X-Request-ID": request_id, "X-Upstream-Request-Count": "0"},
    )


@app.get("/api/v1/cycling-job-ledger")
async def cycling_job_ledger(raw_request: Request, jobId: str | None = Query(default=None)) -> JSONResponse:
    request_id = request_id_for(raw_request)
    ledger = getattr(raw_request.app.state, "cycling_job_ledger", None)
    return JSONResponse(
        status_code=200,
        content=ledger.snapshot(jobId) if ledger else {"stage": 51, "job": None, "jobCount": 0},
        headers={"X-Request-ID": request_id, "X-Upstream-Request-Count": "0"},
    )


@app.post("/api/v1/cycling-jobs/{job_id}/publish")
async def publish_cycling_job(job_id: str, raw_request: Request) -> JSONResponse:
    request_id = request_id_for(raw_request)
    ledger = getattr(raw_request.app.state, "cycling_job_ledger", None)
    if ledger is None or job_id not in ledger.jobs:
        raise InvalidProviderParameterError("jobId", "cycling_job_not_found")
    if ledger.jobs[job_id]["status"] != "layout-ready":
        raise InvalidProviderParameterError("cyclingJob.status", "layout_not_ready")
    ledger.mark_published(job_id)
    return JSONResponse(
        status_code=200,
        content=ledger.snapshot(job_id),
        headers={"X-Request-ID": request_id, "X-Upstream-Request-Count": "0"},
    )


@app.post("/api/v1/poi-query-plan", response_model=None, response_model_exclude_none=False)
async def create_poi_query_plan(payload: dict[str, Any], raw_request: Request):
    """Create a deterministic dry-run plan; this endpoint never calls an upstream service."""
    request_id = request_id_for(raw_request)
    plan = build_poi_query_plan(payload)
    return JSONResponse(
        status_code=200,
        content=public_plan(plan),
        headers={"X-Request-ID": request_id, "X-Upstream-Request-Count": "0"},
    )


def _geocoder_size(value: int) -> int:
    return max(1, min(10, int(value)))


def _coordinate_pair(text: str) -> tuple[float, float] | None:
    parts = [part.strip() for part in text.split(",")]
    if len(parts) != 2:
        return None
    try:
        lon, lat = float(parts[0]), float(parts[1])
    except ValueError:
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    return lon, lat


async def _geocode_text(operation: str, text: str, raw_request: Request, size: int, focus_lon: float | None, focus_lat: float | None):
    value = text.strip()
    if len(value) < 2:
        raise ApiError("VALIDATION_ERROR", "地点搜索至少需要 2 个字符。", [{"field": "text", "reason": "min_length"}], 422)
    coordinate = _coordinate_pair(value)
    if coordinate is not None:
        lon, lat = coordinate
        request_id = request_id_for(raw_request)
        return JSONResponse(
            status_code=200,
            content={"results": [{"id": f"coordinate:{lon:.6f}:{lat:.6f}", "label": value, "lon": lon, "lat": lat, "admin": [], "source": "coordinate-text"}]},
            headers={"X-Request-ID": request_id},
        )
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    geocoder = getattr(raw_request.app.state, "geocoder", None) or OrsGeocoder(runtime_settings, quota_observer=getattr(raw_request.app.state, "quota_observer", None))
    payload = await geocoder.lookup(operation, text=value, size=_geocoder_size(size), focus_lon=focus_lon, focus_lat=focus_lat)
    payload["requestId"] = request_id_for(raw_request)
    return JSONResponse(status_code=200, content=payload, headers={"X-Request-ID": payload["requestId"]})


@app.get("/api/v1/geocoding/autocomplete")
async def geocode_autocomplete(
    raw_request: Request,
    text: str = Query(...),
    size: int = Query(8, ge=1, le=10),
    focus_lon: float | None = Query(None, alias="focus.point.lon"),
    focus_lat: float | None = Query(None, alias="focus.point.lat"),
):
    return await _geocode_text("autocomplete", text, raw_request, size, focus_lon, focus_lat)


@app.get("/api/v1/geocoding/search")
async def geocode_search(
    raw_request: Request,
    text: str = Query(...),
    size: int = Query(8, ge=1, le=10),
    focus_lon: float | None = Query(None, alias="focus.point.lon"),
    focus_lat: float | None = Query(None, alias="focus.point.lat"),
):
    return await _geocode_text("search", text, raw_request, size, focus_lon, focus_lat)


@app.get("/api/v1/geocoding/reverse")
async def geocode_reverse(
    raw_request: Request,
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
):
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    geocoder = getattr(raw_request.app.state, "geocoder", None) or OrsGeocoder(runtime_settings, quota_observer=getattr(raw_request.app.state, "quota_observer", None))
    payload = await geocoder.lookup("reverse", lon=lon, lat=lat, size=1)
    request_id = request_id_for(raw_request)
    return JSONResponse(status_code=200, content=payload, headers={"X-Request-ID": request_id})


@app.get("/api/v1/poi-datasets")
async def list_poi_datasets(raw_request: Request) -> JSONResponse:
    runtime_settings = getattr(raw_request.app.state, "settings", settings)
    request_id = request_id_for(raw_request)
    datasets = []
    if runtime_settings.poi_provider in {"local", "overture_local"}:
        with LocalPoiRepository(runtime_settings.poi_database_path, read_only=True) as repository:
            datasets = repository.list_ready_datasets()
    return JSONResponse(status_code=200, content={"datasets": datasets}, headers={"X-Request-ID": request_id})


@app.get("/api/v1/quota")
async def quota_snapshot(raw_request: Request) -> JSONResponse:
    request_id = request_id_for(raw_request)
    observer = getattr(raw_request.app.state, "quota_observer", None)
    return JSONResponse(
        status_code=200,
        content={"apiQuota": observer.snapshot() if observer else {"services": {}}},
        headers={"X-Request-ID": request_id},
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc) -> JSONResponse:
    return error_response(404, "INVALID_REQUEST", "接口不存在。", request_id_for(request))
