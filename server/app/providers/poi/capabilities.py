from __future__ import annotations

CAPABILITIES = {
    "amap": {
        "providerId": "amap", "label": "高德地图", "regions": ["cn-mainland"],
        "sourceCoordinateSystem": "GCJ-02", "adapterVersion": "amap-v2",
        "supports": {"polygonSearch": True, "rectangleSearch": False, "radiusSearch": True, "textSearch": True, "detail": True, "pagination": True},
    },
    "foursquare": {
        "providerId": "foursquare", "label": "Foursquare", "regions": ["global"],
        "sourceCoordinateSystem": "WGS84", "adapterVersion": "foursquare-v1",
        "supports": {"polygonSearch": False, "rectangleSearch": True, "radiusSearch": True, "textSearch": True, "detail": True, "pagination": True},
    },
    "ors_remote": {
        "providerId": "ors_remote", "label": "OpenPOIService", "regions": ["cn-mainland", "global"],
        "sourceCoordinateSystem": "WGS84", "adapterVersion": "ors-legacy-v1",
        "supports": {"polygonSearch": True, "rectangleSearch": False, "radiusSearch": False, "textSearch": False, "detail": False, "pagination": False},
    },
}
