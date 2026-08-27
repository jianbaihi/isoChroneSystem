from __future__ import annotations

import hashlib
from shapely.geometry import Point, Polygon

# Versioned, local mainland outline. It deliberately excludes Taiwan and offshore
# territories; the checksum is exported so changes invalidate routing evidence.
BOUNDARY_VERSION = "cn-mainland-simplified-v1"
BOUNDARY_COORDINATES = (
    (73.5, 39.5), (79.0, 49.0), (87.0, 49.2), (96.0, 54.0), (110.0, 49.0),
    (119.5, 53.3), (135.1, 48.3), (130.0, 42.3), (124.0, 39.0), (121.7, 30.5),
    (122.0, 24.5), (116.0, 22.5), (108.0, 20.0), (100.0, 21.0), (97.0, 24.0),
    (91.0, 27.0), (82.0, 30.0), (78.0, 35.0), (73.5, 39.5),
)
BOUNDARY = Polygon(BOUNDARY_COORDINATES)
BOUNDARY_SHA256 = hashlib.sha256(repr(BOUNDARY_COORDINATES).encode()).hexdigest()


def resolve_region(lon: float, lat: float) -> dict[str, str]:
    return {
        "region": "cn-mainland" if BOUNDARY.covers(Point(lon, lat)) else "global",
        "method": "boundary-polygon",
        "boundaryVersion": BOUNDARY_VERSION,
        "boundaryChecksum": BOUNDARY_SHA256,
    }
