from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from shapely.ops import transform


WGS84_A = 6378137.0
WGS84_E2 = 0.0066943799901413165
UTM_K0 = 0.9996


@dataclass(frozen=True)
class UTMProjector:
    zone: int
    southern: bool

    @property
    def central_meridian(self) -> float:
        return (self.zone - 1) * 6 - 180 + 3

    @classmethod
    def for_lon_lat(cls, lon: float, lat: float) -> "UTMProjector":
        zone = max(1, min(60, int((lon + 180) // 6) + 1))
        return cls(zone=zone, southern=lat < 0)

    def forward(self, lon: float, lat: float) -> tuple[float, float]:
        lat_r = math.radians(lat)
        lon_r = math.radians(lon)
        lon0 = math.radians(self.central_meridian)
        e_prime_sq = WGS84_E2 / (1 - WGS84_E2)
        sin_lat, cos_lat = math.sin(lat_r), math.cos(lat_r)
        tan_lat = math.tan(lat_r)
        n = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)
        t = tan_lat * tan_lat
        c = e_prime_sq * cos_lat * cos_lat
        a = cos_lat * (lon_r - lon0)
        m = WGS84_A * (
            (1 - WGS84_E2 / 4 - 3 * WGS84_E2**2 / 64 - 5 * WGS84_E2**3 / 256) * lat_r
            - (3 * WGS84_E2 / 8 + 3 * WGS84_E2**2 / 32 + 45 * WGS84_E2**3 / 1024) * math.sin(2 * lat_r)
            + (15 * WGS84_E2**2 / 256 + 45 * WGS84_E2**3 / 1024) * math.sin(4 * lat_r)
            - (35 * WGS84_E2**3 / 3072) * math.sin(6 * lat_r)
        )
        x = UTM_K0 * n * (a + (1 - t + c) * a**3 / 6 + (5 - 18 * t + t**2 + 72 * c - 58 * e_prime_sq) * a**5 / 120) + 500000
        y = UTM_K0 * (m + n * tan_lat * (a**2 / 2 + (5 - t + 9 * c + 4 * c**2) * a**4 / 24 + (61 - 58 * t + t**2 + 600 * c - 330 * e_prime_sq) * a**6 / 720))
        if self.southern:
            y += 10000000
        return x, y

    def inverse(self, x: float, y: float) -> tuple[float, float]:
        e_prime_sq = WGS84_E2 / (1 - WGS84_E2)
        if self.southern:
            y -= 10000000
        x -= 500000
        m = y / UTM_K0
        mu = m / (WGS84_A * (1 - WGS84_E2 / 4 - 3 * WGS84_E2**2 / 64 - 5 * WGS84_E2**3 / 256))
        e1 = (1 - math.sqrt(1 - WGS84_E2)) / (1 + math.sqrt(1 - WGS84_E2))
        phi1 = mu + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu) + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu) + (151 * e1**3 / 96) * math.sin(6 * mu) + (1097 * e1**4 / 512) * math.sin(8 * mu)
        sin_phi, cos_phi = math.sin(phi1), math.cos(phi1)
        tan_phi = math.tan(phi1)
        n1 = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_phi * sin_phi)
        r1 = WGS84_A * (1 - WGS84_E2) / (1 - WGS84_E2 * sin_phi * sin_phi) ** 1.5
        t1 = tan_phi * tan_phi
        c1 = e_prime_sq * cos_phi * cos_phi
        d = x / (n1 * UTM_K0)
        lat = phi1 - (n1 * tan_phi / r1) * (d**2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * e_prime_sq) * d**4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * e_prime_sq - 3 * c1**2) * d**6 / 720)
        lon = math.radians(self.central_meridian) + (d - (1 + 2 * t1 + c1) * d**3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * e_prime_sq + 24 * t1**2) * d**5 / 120) / cos_phi
        return math.degrees(lon), math.degrees(lat)

    def project(self, geometry: Any) -> Any:
        return transform(lambda x, y, z=None: self.forward(float(x), float(y)), geometry)

    def unproject(self, geometry: Any) -> Any:
        return transform(lambda x, y, z=None: self.inverse(float(x), float(y)), geometry)
