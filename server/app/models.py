from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, validator

from app.provider_capabilities import PROFILE_MAX_TIME_MINUTES


SCHEMA_VERSION = "1.0"
Profile = Literal["foot-walking", "cycling-regular", "driving-car"]


class Center(BaseModel):
    lon: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)
    crs: Literal["EPSG:4326"] = "EPSG:4326"
    label: Optional[str] = None
    id: Optional[str] = None
    source: Literal["preset", "geocoder", "geolocation", "map-pick"] = "preset"
    accuracyMeters: Optional[float] = Field(default=None, ge=0)


class AnalysisOptions(BaseModel):
    includePois: bool = True
    calculateTravelTimes: bool = False
    poiPreviewRadiusMeters: Optional[Literal[500, 1000, 2000]] = None


class AnalysisRequest(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    center: Center
    profile: Profile
    rangesMinutes: list[int] = Field(..., min_items=1, max_items=10)
    categoryIds: list[str] = Field(default_factory=list)
    poiDatasetId: Optional[str] = None
    options: AnalysisOptions = Field(default_factory=AnalysisOptions)

    @validator("rangesMinutes")
    def validate_ranges(cls, value: list[int], values: dict) -> list[int]:
        if any(not isinstance(item, int) or isinstance(item, bool) or item <= 0 for item in value):
            raise ValueError("rangesMinutes 必须是正整数。")
        if any(value[index] <= value[index - 1] for index in range(1, len(value))):
            raise ValueError("rangesMinutes 必须严格升序且不能重复。")
        profile = values.get("profile")
        maximum = PROFILE_MAX_TIME_MINUTES.get(profile)
        if maximum is not None and max(value) > maximum:
            raise ValueError(f"当前 ORS 公共 {profile} 最大时间范围为 {maximum} 分钟。")
        return value

    @validator("categoryIds")
    def normalize_category_ids(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(item.strip() for item in value if item and item.strip()))


class PoiPreviewRequest(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    center: Center
    profile: Profile
    rangesMinutes: list[int] = Field(..., min_items=1, max_items=10)
    categoryIds: list[str] = Field(default_factory=list)
    radiusMeters: Literal[500, 1000, 2000] = 1000

    @validator("rangesMinutes")
    def validate_ranges(cls, value: list[int]) -> list[int]:
        if any(not isinstance(item, int) or isinstance(item, bool) or item <= 0 for item in value):
            raise ValueError("rangesMinutes 必须是正整数。")
        if any(value[index] <= value[index - 1] for index in range(1, len(value))):
            raise ValueError("rangesMinutes 必须严格升序且不能重复。")
        return value

    @validator("categoryIds")
    def normalize_category_ids(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(item.strip() for item in value if item and item.strip()))


class RingStatistics(BaseModel):
    poiCount: int = Field(..., ge=0)


class Ring(BaseModel):
    ringId: str
    innerRangeMinutes: int = Field(..., ge=0)
    outerRangeMinutes: int = Field(..., gt=0)
    geometry: Optional[dict] = None
    statistics: RingStatistics


class CumulativeIsochrone(BaseModel):
    isochroneId: str
    rangeMinutes: int = Field(..., gt=0)
    rangeSeconds: int = Field(..., gt=0)
    geometry: dict[str, Any]


class NameCloudRequest(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    center: Center
    profile: Profile
    rangesMinutes: list[int] = Field(..., min_items=1, max_items=10)
    categoryIds: list[str] = Field(default_factory=list)
    cumulativeIsochrones: list[CumulativeIsochrone] = Field(..., min_items=1, max_items=10)
    approved: bool = False

    @validator("rangesMinutes")
    def validate_ranges(cls, value: list[int]) -> list[int]:
        if any(not isinstance(item, int) or isinstance(item, bool) or item <= 0 for item in value):
            raise ValueError("rangesMinutes 必须是正整数。")
        if any(value[index] <= value[index - 1] for index in range(1, len(value))):
            raise ValueError("rangesMinutes 必须严格升序且不能重复。")
        return value

    @validator("categoryIds")
    def normalize_category_ids(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(item.strip() for item in value if item and item.strip()))


class Category(BaseModel):
    categoryId: str
    parentCategoryId: Optional[str] = None
    label: str
    level: int = Field(..., ge=1)
    depth: int | None = Field(default=None, ge=0)
    topLevelId: Optional[str] = None
    isBasicCategory: bool = False
    isLeafInResult: bool = False
    childCategoryIds: list[str] = Field(default_factory=list)
    matchedPoiCount: int = Field(default=0, ge=0)
    returnedPoiCount: int = Field(default=0, ge=0)
    ringCounts: dict[str, int] = Field(default_factory=dict)


class Location(BaseModel):
    lon: float = Field(..., ge=-180, le=180)
    lat: float = Field(..., ge=-90, le=90)
    crs: Literal["EPSG:4326"] = "EPSG:4326"


class Poi(BaseModel):
    poiId: str
    datasetId: Optional[str] = None
    source: str = "mock"
    name: str
    nameLocale: Optional[str] = None
    location: Location
    categoryId: Optional[str] = None
    category: Optional[dict[str, Any]] = None
    # Published results carry the Matrix fields on the POI itself.  The
    # accessibility array remains an audit trail, but consumers must not have
    # to perform a second join merely to show time, distance, or ring.
    travelTimeSeconds: Optional[float] = Field(default=None, ge=0)
    networkDistanceMeters: Optional[float] = Field(default=None, ge=0)
    travelTimeMinuteEstimate: Optional[int] = Field(default=None, ge=1)
    travelTimeBand: Optional[dict[str, int]] = None
    travelTimeMethod: Optional[Literal["isochrone-minute-band"]] = None
    ringId: str
    matrixBandId: Optional[str] = None
    spatialBandId: Optional[str] = None
    bandAssignmentMethod: Optional[Literal["matrix-duration", "minute-isochrone-spatial"]] = None
    reachable: Optional[bool] = None
    matrixStatus: Optional[Literal["ok", "null", "unreachable", "invalid"]] = None
    routingProvider: Optional[Literal["ors-public-api"]] = None
    routingGraphDate: Optional[str] = None
    calculatedAt: Optional[str] = None
    snappedDistanceMeters: Optional[float] = Field(default=None, ge=0)
    matrixBatchId: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    address: Optional[str] = None
    importance: Optional[float] = None


class PoiAccessibility(BaseModel):
    analysisRunId: str
    poiId: str
    centerId: Optional[str] = None
    center: Center
    profile: Profile
    travelTimeSeconds: Optional[float] = Field(default=None, ge=0)
    networkDistanceMeters: Optional[float] = Field(default=None, ge=0)
    reachable: bool
    matrixBandId: Optional[str] = None
    spatialBandId: str
    bandAssignmentMethod: Literal["matrix-duration"] = "matrix-duration"
    routingProvider: Literal["ors-public-api"] = "ors-public-api"
    routingGraphDate: Optional[str] = None
    calculatedAt: str
    snappedDistanceMeters: Optional[float] = Field(default=None, ge=0)
    matrixBatchId: str
    matrixStatus: Literal["ok", "null", "unreachable", "invalid"]


class AnalysisSources(BaseModel):
    isochrones: Literal["mock", "ors", "ors-public-api"]
    pois: Literal["mock", "local-overture", "none", "ors-openpoiservice"]


class AnalysisMetadata(BaseModel):
    source: Literal["mock", "mixed", "ors"] = "mock"
    sources: AnalysisSources
    generatedAt: str
    requestId: str
    warnings: list[str] = Field(default_factory=list)
    poiDataset: Optional[dict[str, Any]] = None
    poiSelection: Optional[dict[str, Any]] = None
    taxonomy: Optional[dict[str, Any]] = None
    poiProvider: Optional[str] = None
    poiCoverage: Optional[dict[str, Any]] = None
    rateLimit: Optional[dict[str, Any]] = None
    attribution: Optional[list[str]] = None
    isochroneProvider: Optional[str] = None
    isLive: Optional[bool] = None
    cacheHit: Optional[bool] = None
    featureCount: Optional[int] = Field(default=None, ge=0)
    profile: Optional[str] = None
    rangesSeconds: Optional[list[int]] = None
    apiQuota: Optional[dict[str, Any]] = None
    panmapMode: Optional[str] = None
    matrix: Optional[dict[str, Any]] = None
    spatialTime: Optional[dict[str, Any]] = None


class AnalysisResult(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    publishedResultSchemaVersion: str = "1.0"
    analysisId: str
    status: Literal["completed"] = "completed"
    center: Center
    profile: Profile
    rangesMinutes: list[int]
    cumulativeIsochrones: list[CumulativeIsochrone] = Field(default_factory=list)
    rings: list[Ring] = Field(default_factory=list)
    pois: list[Poi] = Field(default_factory=list)
    accessibility: list[PoiAccessibility] = Field(default_factory=list)
    categories: list[Category] = Field(default_factory=list)
    nameCloud: Optional[dict[str, Any]] = None
    metadata: AnalysisMetadata


class MatrixAccessibilityRequest(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    baseResult: AnalysisResult


class SpatialTimeAccessibilityRequest(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    baseResult: AnalysisResult
    minuteIsochrones: list[CumulativeIsochrone] = Field(..., min_items=1, max_items=180)

    @validator("minuteIsochrones")
    def validate_minute_isochrones(cls, value: list[CumulativeIsochrone]) -> list[CumulativeIsochrone]:
        ranges = [item.rangeMinutes for item in value]
        if ranges != list(range(1, max(ranges) + 1)):
            raise ValueError("minuteIsochrones 必须从 1 分钟开始连续递增。")
        return value


class MinuteAccessibilityRequest(BaseModel):
    schemaVersion: Literal["1.0"] = SCHEMA_VERSION
    baseResult: AnalysisResult
    approved: bool = False


class ErrorDetail(BaseModel):
    field: str
    reason: str


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    requestId: str


class ErrorResponse(BaseModel):
    error: ErrorPayload
