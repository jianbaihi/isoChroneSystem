import math
import os
from dataclasses import dataclass, field
from typing import Mapping


DEFAULT_CORS_ORIGINS = "http://127.0.0.1:5500,http://localhost:5500"
MAX_ORS_TIMEOUT_SECONDS = 120.0
MAX_POI_RESULTS = 5000
MAX_POI_CANDIDATES = 500000
MAX_ORS_POI_REQUESTS = 200


class ConfigurationError(ValueError):
    """Raised when an environment-backed setting is unsafe to use."""


def _parse_timeout(raw_value: str) -> float:
    try:
        timeout = float(raw_value)
    except (TypeError, ValueError) as exc:
        raise ConfigurationError("ORS_TIMEOUT_SECONDS 必须是有限正数。") from exc
    if not math.isfinite(timeout) or timeout <= 0 or timeout > MAX_ORS_TIMEOUT_SECONDS:
        raise ConfigurationError(
            f"ORS_TIMEOUT_SECONDS 必须大于 0 且不超过 {int(MAX_ORS_TIMEOUT_SECONDS)} 秒。"
        )
    return timeout


def _parse_int(raw_value: str, field_name: str, minimum: int, maximum: int) -> int:
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as exc:
        raise ConfigurationError(f"{field_name} 必须是整数。") from exc
    if value < minimum or value > maximum:
        raise ConfigurationError(f"{field_name} 必须在 {minimum} 至 {maximum} 之间。")
    return value


def _parse_optional_confidence(raw_value: str) -> float | None:
    if raw_value is None or not str(raw_value).strip():
        return None
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as exc:
        raise ConfigurationError("POI_MIN_CONFIDENCE 必须为空或 0 至 1 的数字。") from exc
    if not math.isfinite(value) or value < 0 or value > 1:
        raise ConfigurationError("POI_MIN_CONFIDENCE 必须为空或 0 至 1 的数字。")
    return value


def _parse_float(raw_value: str, field_name: str, minimum: float, maximum: float) -> float:
    try:
        value = float(raw_value)
    except (TypeError, ValueError) as exc:
        raise ConfigurationError(f"{field_name} 必须是数字。") from exc
    if not math.isfinite(value) or value < minimum or value > maximum:
        raise ConfigurationError(f"{field_name} 必须在 {minimum} 至 {maximum} 之间。")
    return value


def _parse_ranges(raw_value: str) -> tuple[int, ...]:
    try:
        values = tuple(int(item.strip()) for item in raw_value.split(",") if item.strip())
    except (TypeError, ValueError) as exc:
        raise ConfigurationError("ORS_ISOCHRONE_RANGES_SECONDS 必须是逗号分隔的整数。") from exc
    if not values or any(value <= 0 for value in values) or list(values) != sorted(set(values)):
        raise ConfigurationError("ORS_ISOCHRONE_RANGES_SECONDS 必须是严格升序的正整数。")
    if max(values) > 3600:
        raise ConfigurationError("ORS 等时圈最大时间不能超过 3600 秒。")
    return values


def _parse_bool(raw_value: str, field_name: str) -> bool:
    value = str(raw_value).strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise ConfigurationError(f"{field_name} 必须是 true 或 false。")


@dataclass(frozen=True)
class Settings:
    app_env: str
    app_host: str
    app_port: int
    cors_origins: tuple[str, ...]
    analysis_provider: str
    ors_base_url: str
    ors_api_key: str = field(default="", repr=False)
    ors_timeout_seconds: float = 15.0
    poi_provider: str = "none"
    poi_database_path: str = "../data/generated/poi.sqlite3"
    poi_max_results: int = 600
    poi_max_candidates: int = 50000
    poi_min_confidence: float | None = None
    ors_poi_base_url: str = "https://api.openrouteservice.org"
    ors_poi_path: str = "/pois"
    ors_profile: str = "driving-car"
    ors_isochrone_ranges_seconds: tuple[int, ...] = (600, 1200, 1800)
    ors_poi_query_strategy: str = "outer-isochrone-grid"
    ors_poi_grid_size_meters: float = 6000.0
    ors_poi_max_cell_area_km2: float = 45.0
    ors_poi_limit_per_cell: int = 2000
    ors_poi_max_requests_per_analysis: int = 40
    ors_poi_max_concurrency: int = 2
    ors_poi_timeout_seconds: float = 30.0
    ors_cache_dir: str = "data/generated/ors-cache"
    ors_cache_ttl_seconds: int = 604800
    ors_cache_stale_if_error: bool = True
    ors_geocoder_base_url: str = "https://api.openrouteservice.org"
    ors_geocoder_autocomplete_path: str = "/geocode/autocomplete"
    ors_geocoder_search_path: str = "/geocode/search"
    ors_geocoder_reverse_path: str = "/geocode/reverse"
    ors_geocoder_timeout_seconds: float = 10.0

    @classmethod
    def from_environment(cls, environ: Mapping[str, str] | None = None) -> "Settings":
        env = os.environ if environ is None else environ
        provider = env.get("ANALYSIS_PROVIDER", "mock").strip().lower()
        if provider not in {"mock", "ors"}:
            raise ConfigurationError("ANALYSIS_PROVIDER 只支持 mock 或 ors。")

        base_url = env.get("ORS_BASE_URL", "https://api.heigit.org/openrouteservice").strip().rstrip("/")
        if not base_url or not base_url.startswith(("http://", "https://")):
            raise ConfigurationError("ORS_BASE_URL 必须是 HTTP(S) URL。")

        cors_origins = tuple(
            origin.strip()
            for origin in env.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
            if origin.strip()
        )
        try:
            app_port = int(env.get("APP_PORT", "8000"))
        except ValueError as exc:
            raise ConfigurationError("APP_PORT 必须是整数。") from exc
        poi_provider = env.get("POI_PROVIDER", "none").strip().lower() or "none"
        if poi_provider == "local":
            poi_provider = "overture_local"
        if poi_provider not in {"none", "overture_local", "ors_remote"}:
            raise ConfigurationError("POI_PROVIDER 只支持 none、overture_local 或 ors_remote。")

        poi_base_url = env.get("ORS_POI_BASE_URL", "https://api.openrouteservice.org").strip().rstrip("/")
        if not poi_base_url or not poi_base_url.startswith(("http://", "https://")):
            raise ConfigurationError("ORS_POI_BASE_URL 必须是 HTTP(S) URL。")
        poi_path = env.get("ORS_POI_PATH", "/pois").strip() or "/pois"
        if not poi_path.startswith("/"):
            poi_path = f"/{poi_path}"
        geocoder_base_url = env.get("ORS_GEOCODER_BASE_URL", "https://api.openrouteservice.org").strip().rstrip("/")
        if not geocoder_base_url or not geocoder_base_url.startswith(("http://", "https://")):
            raise ConfigurationError("ORS_GEOCODER_BASE_URL 必须是 HTTP(S) URL。")
        profile = env.get("ORS_PROFILE", "driving-car").strip().lower()
        if profile not in {"foot-walking", "cycling-regular", "driving-car"}:
            raise ConfigurationError("ORS_PROFILE 不是受支持的 ORS profile。")

        return cls(
            app_env=env.get("APP_ENV", "development").strip() or "development",
            app_host=env.get("APP_HOST", "127.0.0.1").strip() or "127.0.0.1",
            app_port=app_port,
            cors_origins=cors_origins,
            analysis_provider=provider,
            ors_base_url=base_url,
            ors_api_key=env.get("ORS_API_KEY", "").strip(),
            ors_timeout_seconds=_parse_timeout(env.get("ORS_TIMEOUT_SECONDS", "15")),
            poi_provider=poi_provider,
            poi_database_path=env.get("POI_DATABASE_PATH", "../data/generated/poi.sqlite3").strip() or "../data/generated/poi.sqlite3",
            poi_max_results=_parse_int(env.get("POI_MAX_RESULTS", "600"), "POI_MAX_RESULTS", 1, MAX_POI_RESULTS),
            poi_max_candidates=_parse_int(env.get("POI_MAX_CANDIDATES", "50000"), "POI_MAX_CANDIDATES", 1, MAX_POI_CANDIDATES),
            poi_min_confidence=_parse_optional_confidence(env.get("POI_MIN_CONFIDENCE", "")),
            ors_poi_base_url=poi_base_url,
            ors_poi_path=poi_path,
            ors_profile=profile,
            ors_isochrone_ranges_seconds=_parse_ranges(env.get("ORS_ISOCHRONE_RANGES_SECONDS", "600,1200,1800")),
            ors_poi_query_strategy=env.get("ORS_POI_QUERY_STRATEGY", "outer-isochrone-grid").strip() or "outer-isochrone-grid",
            ors_poi_grid_size_meters=_parse_float(env.get("ORS_POI_GRID_SIZE_METERS", env.get("ORS_GRID_SIZE_METERS", "6000")), "ORS_POI_GRID_SIZE_METERS", 500, 20000),
            ors_poi_max_cell_area_km2=_parse_float(env.get("ORS_POI_MAX_CELL_AREA_KM2", "45"), "ORS_POI_MAX_CELL_AREA_KM2", 1, 100),
            ors_poi_limit_per_cell=_parse_int(env.get("ORS_POI_LIMIT_PER_CELL", "2000"), "ORS_POI_LIMIT_PER_CELL", 1, 10000),
            ors_poi_max_requests_per_analysis=_parse_int(env.get("ORS_POI_MAX_REQUESTS_PER_ANALYSIS", "40"), "ORS_POI_MAX_REQUESTS_PER_ANALYSIS", 1, MAX_ORS_POI_REQUESTS),
            ors_poi_max_concurrency=_parse_int(env.get("ORS_POI_MAX_CONCURRENCY", "2"), "ORS_POI_MAX_CONCURRENCY", 1, 8),
            ors_poi_timeout_seconds=_parse_timeout(env.get("ORS_POI_TIMEOUT_SECONDS", "30")),
            ors_cache_dir=env.get("ORS_CACHE_DIR", "data/generated/ors-cache").strip() or "data/generated/ors-cache",
            ors_cache_ttl_seconds=_parse_int(env.get("ORS_CACHE_TTL_SECONDS", "604800"), "ORS_CACHE_TTL_SECONDS", 0, 31536000),
            ors_cache_stale_if_error=_parse_bool(env.get("ORS_CACHE_STALE_IF_ERROR", "true"), "ORS_CACHE_STALE_IF_ERROR"),
            ors_geocoder_base_url=geocoder_base_url,
            ors_geocoder_autocomplete_path=env.get("ORS_GEOCODER_AUTOCOMPLETE_PATH", "/geocode/autocomplete").strip() or "/geocode/autocomplete",
            ors_geocoder_search_path=env.get("ORS_GEOCODER_SEARCH_PATH", "/geocode/search").strip() or "/geocode/search",
            ors_geocoder_reverse_path=env.get("ORS_GEOCODER_REVERSE_PATH", "/geocode/reverse").strip() or "/geocode/reverse",
            ors_geocoder_timeout_seconds=_parse_timeout(env.get("ORS_GEOCODER_TIMEOUT_SECONDS", "10")),
        )

    @property
    def provider_ready(self) -> bool:
        return self.analysis_provider == "mock" or bool(self.ors_api_key)


settings = Settings.from_environment()
