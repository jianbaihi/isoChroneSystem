"""Frozen provider capabilities used by Stage 6 orchestration."""

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

