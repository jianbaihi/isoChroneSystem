from app.providers.poi.amap import AmapPoiAdapter
from app.providers.poi.foursquare import FoursquarePoiAdapter
from app.providers.poi.ors_remote import OrsRemotePoiProvider


def build_provider(provider_id: str, settings, quota_observer=None):
    if provider_id == "amap":
        return AmapPoiAdapter(settings)
    if provider_id == "foursquare":
        return FoursquarePoiAdapter(settings)
    if provider_id == "ors_remote":
        return OrsRemotePoiProvider(settings, quota_observer=quota_observer)
    raise ValueError(f"unknown provider: {provider_id}")
