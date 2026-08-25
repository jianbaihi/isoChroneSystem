"""Single source of truth for live provider limits."""

SUPPORTED_PROFILES = ("foot-walking", "cycling-regular", "driving-car")
PROFILE_LABELS = {
    "foot-walking": "步行",
    "cycling-regular": "骑行",
    "driving-car": "驾车",
}
UNSUPPORTED_TRANSPORT_MODES = {
    "transit": "当前数据源不支持",
    "bus": "当前数据源不支持",
    "subway": "当前数据源不支持",
    "train": "当前数据源不支持",
    "high-speed-rail": "当前数据源不支持",
    "airplane": "当前数据源不支持",
}

MATRIX_MAX_ROUTES_PER_REQUEST = 3500
MATRIX_BATCH_DESTINATIONS = 500
MATRIX_CONCURRENCY = 1
MATRIX_TIMEOUT_SECONDS = 60
MATRIX_BATCH_VERSION = "stage-6-multimode-matrix-batch-v1"

PROFILE_MAX_TIME_MINUTES = {
    "foot-walking": 1200,
    "cycling-regular": 300,
    "driving-car": 60,
}
ISOCHRONE_MAX_INTERVALS_PER_REQUEST = 10
POI_PROVIDER_MAX_AREA_KM2 = 50.0
POI_SAFE_AREA_KM2 = 45.0
MINUTE_ISOCHRONE_AUTO_REQUEST_LIMIT = 6


def public_provider_capabilities() -> dict:
    return {
        "profiles": {
            profile: {"maxTimeMinutes": PROFILE_MAX_TIME_MINUTES[profile]}
            for profile in SUPPORTED_PROFILES
        },
        "isochrones": {"maxIntervalsPerRequest": ISOCHRONE_MAX_INTERVALS_PER_REQUEST},
        "pois": {
            "providerMaxAreaKm2": POI_PROVIDER_MAX_AREA_KM2,
            "safeAreaKm2": POI_SAFE_AREA_KM2,
        },
        "minuteIsochrones": {
            "resolutionMinutes": 1,
            "autoRequestLimit": MINUTE_ISOCHRONE_AUTO_REQUEST_LIMIT,
        },
    }
