(function initAnnularGeometry(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};
  const annular = elastic.annular = elastic.annular || {};
  const TAU = Math.PI * 2;

  function point(center, radius, angle) {
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  }

  function arc(center, radius, startAngle, endAngle, stepRadians, reverse = false) {
    const count = Math.max(1, Math.ceil(Math.abs(endAngle - startAngle) / stepRadians));
    const points = Array.from({ length: count + 1 }, (_, index) => point(center, radius, startAngle + (endAngle - startAngle) * index / count));
    return reverse ? points.reverse() : points;
  }

  function sectorPolygon(center, innerRadius, outerRadius, startAngle, endAngle, stepRadians) {
    return [
      ...arc(center, outerRadius, startAngle, endAngle, stepRadians),
      ...arc(center, innerRadius, startAngle, endAngle, stepRadians, true),
    ];
  }

  function polygonArea(polygon) {
    return Math.abs(polygon.reduce((sum, pointA, index) => {
      const pointB = polygon[(index + 1) % polygon.length];
      return sum + pointA[0] * pointB[1] - pointB[0] * pointA[1];
    }, 0) / 2);
  }

  function polygonCentroid(polygon) {
    let twiceArea = 0;
    let x = 0;
    let y = 0;
    polygon.forEach((pointA, index) => {
      const pointB = polygon[(index + 1) % polygon.length];
      const cross = pointA[0] * pointB[1] - pointB[0] * pointA[1];
      twiceArea += cross;
      x += (pointA[0] + pointB[0]) * cross;
      y += (pointA[1] + pointB[1]) * cross;
    });
    if (Math.abs(twiceArea) < 1e-12) return polygon[0] || [0, 0];
    return [x / (3 * twiceArea), y / (3 * twiceArea)];
  }

  function build(input, shares) {
    let cursor = input.startAngle;
    return input.regions.map((region, index) => {
      const startAngle = cursor;
      const endAngle = index === input.regions.length - 1 ? input.startAngle + TAU : cursor + shares[index] * TAU;
      cursor = endAngle;
      const polygon = sectorPolygon(input.center, input.innerRadius, input.outerRadius, startAngle, endAngle, input.arcStepRadians);
      const middleAngle = startAngle + (endAngle - startAngle) / 2;
      const labelRadius = (input.innerRadius + input.outerRadius) / 2;
      const angularShare = (endAngle - startAngle) / TAU;
      return {
        id: region.id,
        order: region.order,
        startAngle,
        endAngle,
        angularShare,
        areaShare: angularShare,
        angleShare: angularShare,
        polygon,
        polygonArea: polygonArea(polygon),
        centroid: polygonCentroid(polygon),
        labelPoint: point(input.center, labelRadius, middleAngle),
        metadata: region.metadata,
      };
    });
  }

  annular.geometry = Object.freeze({ point, arc, sectorPolygon, polygonArea, polygonCentroid, build });
})(window);
