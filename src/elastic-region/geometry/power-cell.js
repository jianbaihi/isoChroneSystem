(function initElasticRegionPowerCell(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function powerCell(containerPolygon, site, weight, otherSites) {
    let polygon = containerPolygon.map((point) => [...point]);
    for (const other of otherSites) {
      if (other.id === site.id) continue;
      const normal = [2 * (other.point[0] - site.point[0]), 2 * (other.point[1] - site.point[1])];
      const limit = other.point[0] ** 2 + other.point[1] ** 2 - site.point[0] ** 2 - site.point[1] ** 2 + weight - other.weight;
      polygon = elastic.polygon.clipHalfPlane(polygon, normal, limit);
      if (polygon.length < 3) return [];
    }
    return polygon;
  }

  function buildPowerCells(containerPolygon, sites) {
    return sites.map((site) => ({ ...site, polygon: powerCell(containerPolygon, site, site.weight, sites) }));
  }

  elastic.powerCell = Object.freeze({ powerCell, buildPowerCells });
})(window);
