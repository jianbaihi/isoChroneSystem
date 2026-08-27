from __future__ import annotations

import math

VERSION = "wgs84-gcj02-v1"
_A = 6378245.0
_EE = 0.006693421622965943


def in_china_extent(lon: float, lat: float) -> bool:
    return 72.004 <= lon <= 137.8347 and 0.8293 <= lat <= 55.8271


def _lat_offset(x: float, y: float) -> float:
    value = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*math.sqrt(abs(x))
    value += (20*math.sin(6*x*math.pi) + 20*math.sin(2*x*math.pi))*2/3
    value += (20*math.sin(y*math.pi) + 40*math.sin(y/3*math.pi))*2/3
    return value + (160*math.sin(y/12*math.pi) + 320*math.sin(y*math.pi/30))*2/3


def _lon_offset(x: float, y: float) -> float:
    value = 300 + x + 2*y + .1*x*x + .1*x*y + .1*math.sqrt(abs(x))
    value += (20*math.sin(6*x*math.pi) + 20*math.sin(2*x*math.pi))*2/3
    value += (20*math.sin(x*math.pi) + 40*math.sin(x/3*math.pi))*2/3
    return value + (150*math.sin(x/12*math.pi) + 300*math.sin(x/30*math.pi))*2/3


def wgs84_to_gcj02(lon: float, lat: float) -> tuple[float, float]:
    if not in_china_extent(lon, lat):
        return lon, lat
    dlat, dlon = _lat_offset(lon - 105, lat - 35), _lon_offset(lon - 105, lat - 35)
    rad = lat / 180 * math.pi
    magic = 1 - _EE * math.sin(rad) ** 2
    sqrt_magic = math.sqrt(magic)
    dlat = dlat * 180 / ((_A * (1 - _EE)) / (magic * sqrt_magic) * math.pi)
    dlon = dlon * 180 / (_A / sqrt_magic * math.cos(rad) * math.pi)
    return lon + dlon, lat + dlat


def gcj02_to_wgs84(lon: float, lat: float) -> tuple[float, float]:
    if not in_china_extent(lon, lat):
        return lon, lat
    guess_lon, guess_lat = lon, lat
    for _ in range(4):
        shifted_lon, shifted_lat = wgs84_to_gcj02(guess_lon, guess_lat)
        guess_lon -= shifted_lon - lon
        guess_lat -= shifted_lat - lat
    return guess_lon, guess_lat


def geometry_wgs84_to_gcj02(geometry):
    from shapely.ops import transform
    return transform(lambda x, y, z=None: wgs84_to_gcj02(x, y), geometry)
