"""Rebuild the Stage 21 browser fixture from the frozen Stage 20 caches only."""

import asyncio
import json
from pathlib import Path

from app.adapters.ors import OrsAdapter
from app.adapters.ors_matrix import OrsMatrixAdapter
from app.config import Settings
from app.models import AnalysisRequest, MatrixAccessibilityRequest, NameCloudRequest
from app.providers.poi.ors_client import OrsPoiClient
from app.providers.poi.ors_remote import OrsRemotePoiProvider
from app.services.analysis import create_name_cloud
from app.services.matrix_accessibility import calculate_matrix_accessibility


ROOT = Path(__file__).resolve().parents[1]
CACHE_DIR = ROOT / "data/generated/ors-cache/stage-5-name-cloud-resume-20260730"
OUTPUT = ROOT / "exports/stage-6-layout/stage20-cache-baseline.json"


class NoNetworkClient:
    async def post(self, *args, **kwargs):
        raise AssertionError("Stage 21 forbids every upstream request; a required cache entry is missing")


async def rebuild():
    settings = Settings(
        app_env="development", app_host="127.0.0.1", app_port=8000,
        cors_origins=("http://127.0.0.1:5500",), analysis_provider="ors",
        ors_base_url="https://api.heigit.org/openrouteservice", ors_api_key="cache-only-not-a-real-key",
        poi_provider="ors_remote", ors_profile="foot-walking",
        ors_isochrone_ranges_seconds=(600, 1200, 1800), ors_cache_dir=str(CACHE_DIR),
        ors_poi_limit_per_cell=2000,
    )
    request = AnalysisRequest(
        schemaVersion="1.0",
        center={"lon": 114.296944, "lat": 30.546944, "crs": "EPSG:4326", "label": "武汉·黄鹤楼", "id": "wuhan-huanghelou", "source": "preset"},
        profile="foot-walking", rangesMinutes=[10, 20, 30], categoryIds=[],
        options={"includePois": False, "calculateTravelTimes": False},
    )
    iso_adapter = OrsAdapter(settings, client=NoNetworkClient())
    isochrones = await iso_adapter.create_isochrones(request)
    poi_client = OrsPoiClient(settings, client=NoNetworkClient())
    poi_provider = OrsRemotePoiProvider(settings, client=poi_client)
    name_cloud = await create_name_cloud(
        NameCloudRequest(
            schemaVersion="1.0", center=request.center, profile=request.profile,
            rangesMinutes=request.rangesMinutes, categoryIds=[], cumulativeIsochrones=isochrones,
        ),
        request_id="stage21-cache-only", settings=settings, poi_provider=poi_provider,
    )
    name_cloud.analysisId = "analysis-stage20-cache-baseline"
    matrix_adapter = OrsMatrixAdapter(settings, client=NoNetworkClient())
    result = await calculate_matrix_accessibility(
        MatrixAccessibilityRequest(schemaVersion="1.0", baseResult=name_cloud),
        settings, matrix_adapter=matrix_adapter,
    )
    summary = result.metadata.matrix
    assert summary["requestedPoiCount"] == 282 and summary["matrixOkCount"] == 282
    assert summary["matrixWithinRangeCount"] == 252 and summary["matrixOutOfRangeCount"] == 30
    assert summary["matrixBandCounts"] == {"ring-0-10": 39, "ring-10-20": 83, "ring-20-30": 130}
    assert matrix_adapter.last_metadata["cache"] == "hit"
    assert matrix_adapter.last_metadata["upstreamRequestCount"] == 0
    assert iso_adapter.last_cache_hit and name_cloud.metadata.cacheHit
    result.metadata.warnings.append("第21阶段浏览器夹具由第20号真实缓存离线重建；本次上游 API 调用为0。")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return {
        "output": str(OUTPUT.relative_to(ROOT)), "bytes": OUTPUT.stat().st_size,
        "matrix": summary, "cache": {
            "isochrone": "hit", "poi": "hit", "matrix": matrix_adapter.last_metadata["cache"],
            "upstreamRequests": matrix_adapter.last_metadata["upstreamRequestCount"],
        },
    }


if __name__ == "__main__":
    print(json.dumps(asyncio.run(rebuild()), ensure_ascii=False, indent=2))
