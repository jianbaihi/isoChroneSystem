import unittest

from shapely.geometry import shape

from app.errors import InvalidProviderResponseError
from app.models import CumulativeIsochrone
from app.services.geometry import build_exclusive_rings, normalize_geojson_geometry


def square(minimum: float, maximum: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[
            [minimum, minimum],
            [maximum, minimum],
            [maximum, maximum],
            [minimum, maximum],
            [minimum, minimum],
        ]],
    }


class GeometryTest(unittest.TestCase):
    def test_polygon_and_multipolygon_are_normalized(self):
        polygon = normalize_geojson_geometry(square(0, 10))
        self.assertEqual(polygon["type"], "Polygon")
        multipolygon = normalize_geojson_geometry({
            "type": "MultiPolygon",
            "coordinates": [square(0, 10)["coordinates"], square(20, 30)["coordinates"]],
        })
        self.assertEqual(multipolygon["type"], "MultiPolygon")

    def test_invalid_type_and_coordinates_are_rejected(self):
        cases = [
            {"type": "Point", "coordinates": [0, 0]},
            {"type": "Polygon", "coordinates": []},
            {"type": "Polygon", "coordinates": [[[0, 0], [float("nan"), 1], [1, 1], [0, 0]]]},
        ]
        for geometry in cases:
            with self.assertRaises(InvalidProviderResponseError):
                normalize_geojson_geometry(geometry)

    def test_invalid_polygon_is_repaired_only_as_polygonal_output(self):
        bowtie = {
            "type": "Polygon",
            "coordinates": [[[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]],
        }
        result = normalize_geojson_geometry(bowtie)
        self.assertIn(result["type"], {"Polygon", "MultiPolygon"})
        self.assertTrue(shape(result).is_valid)

    def test_exclusive_rings_are_ordered_and_non_overlapping(self):
        isochrones = [
            CumulativeIsochrone(isochroneId="isochrone-10", rangeMinutes=10, rangeSeconds=600, geometry=square(0, 10)),
            CumulativeIsochrone(isochroneId="isochrone-20", rangeMinutes=20, rangeSeconds=1200, geometry=square(-2, 12)),
            CumulativeIsochrone(isochroneId="isochrone-30", rangeMinutes=30, rangeSeconds=1800, geometry=square(-4, 14)),
        ]
        rings = build_exclusive_rings(isochrones)
        self.assertEqual([ring["ringId"] for ring in rings], ["ring-0-10", "ring-10-20", "ring-20-30"])
        geometries = [shape(ring["geometry"]) for ring in rings]
        self.assertTrue(all(geometry.is_valid and not geometry.is_empty for geometry in geometries))
        self.assertAlmostEqual(geometries[0].area, 100)
        self.assertAlmostEqual(sum(geometry.area for geometry in geometries), 324)
        self.assertTrue(geometries[0].intersection(geometries[1]).area == 0)

    def test_empty_difference_fails_instead_of_returning_success(self):
        isochrones = [
            CumulativeIsochrone(isochroneId="isochrone-10", rangeMinutes=10, rangeSeconds=600, geometry=square(0, 10)),
            CumulativeIsochrone(isochroneId="isochrone-20", rangeMinutes=20, rangeSeconds=1200, geometry=square(0, 10)),
        ]
        with self.assertRaises(InvalidProviderResponseError):
            build_exclusive_rings(isochrones)


if __name__ == "__main__":
    unittest.main()
