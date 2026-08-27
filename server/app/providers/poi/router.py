from __future__ import annotations

from app.errors import PoiProviderError
from app.providers.poi.capabilities import CAPABILITIES


def resolve_provider(region: str, settings, override: str | None = None) -> str:
    provider = override or (settings.poi_provider_cn if region == "cn-mainland" else settings.poi_provider_global)
    capability = CAPABILITIES.get(provider)
    if not capability or region not in capability["regions"]:
        raise PoiProviderError("POI_PROVIDER_REGION_UNSUPPORTED", "所选 POI Provider 不支持当前区域。", 422)
    if provider == "amap" and (not settings.amap_poi_enabled or not settings.amap_web_service_key):
        raise PoiProviderError("POI_PROVIDER_NOT_CONFIGURED", "高德 POI Provider 尚未配置。", 503)
    if provider == "foursquare" and (not settings.foursquare_poi_enabled or not settings.foursquare_service_key):
        raise PoiProviderError("POI_PROVIDER_NOT_CONFIGURED", "Foursquare POI Provider 尚未配置。", 503)
    return provider
