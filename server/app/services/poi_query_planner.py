from __future__ import annotations

from app.providers.poi.capabilities import CAPABILITIES


def build_provider_query_plan(provider_id: str, outer_geometry) -> dict:
    capability = CAPABILITIES[provider_id]
    supports = capability["supports"]
    minx, miny, maxx, maxy = outer_geometry.bounds
    extent_degrees = max(maxx - minx, maxy - miny)
    if supports.get("polygonSearch"):
        strategy = "polygon-pagination"
    elif supports.get("radiusSearch") and extent_degrees <= 0.06:
        strategy = "radius"
    elif supports.get("rectangleSearch"):
        strategy = "rectangle-tiles"
    else:
        raise ValueError(f"Provider {provider_id} has no compatible spatial search capability")
    return {"provider": provider_id, "strategy": strategy, "bounds": [minx, miny, maxx, maxy], "capabilityDriven": True}
