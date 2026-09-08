(function initNaturalBoundaryGeometry(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;
  const TAU = Math.PI * 2;

  function unwrapNear(angle, reference) {
    let value = angle;
    while (value - reference > Math.PI) value -= TAU;
    while (value - reference < -Math.PI) value += TAU;
    return value;
  }

  function sampleBoundary(input, boundary) {
    const points = [];
    for (let index = 0; index < boundary.controls.length - 1; index += 1) {
      const left = boundary.controls[index];
      const right = boundary.controls[index + 1];
      const rightAngle = unwrapNear(right.angle, left.angle);
      for (let step = 0; step < input.parameters.sampleSteps; step += 1) {
        const t = step / input.parameters.sampleSteps;
        const eased = t * t * (3 - 2 * t);
        const radius = left.radius + (right.radius - left.radius) * t;
        const angle = left.angle + (rightAngle - left.angle) * eased;
        points.push(natural.controlPoints.point(input.center, radius, angle));
      }
    }
    points.push([...boundary.controls.at(-1).point]);
    return points;
  }

  function arc(input, radius, startAngle, endAngle, reverse = false) {
    let end = endAngle;
    while (end <= startAngle) end += TAU;
    const count = Math.max(2, Math.ceil((end - startAngle) / input.arcStepRadians));
    const points = Array.from({ length: count + 1 }, (_, index) => natural.controlPoints.point(
      input.center, radius, startAngle + (end - startAngle) * index / count,
    ));
    return reverse ? points.reverse() : points;
  }

  function polygonArea(polygon) {
    return Math.abs(polygon.reduce((sum, a, index) => {
      const b = polygon[(index + 1) % polygon.length];
      return sum + a[0] * b[1] - b[0] * a[1];
    }, 0) / 2);
  }

  function polygonCentroid(polygon) {
    let crossTotal = 0;
    let x = 0;
    let y = 0;
    polygon.forEach((a, index) => {
      const b = polygon[(index + 1) % polygon.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      crossTotal += cross;
      x += (a[0] + b[0]) * cross;
      y += (a[1] + b[1]) * cross;
    });
    return Math.abs(crossTotal) < 1e-9 ? [...(polygon[0] || [0, 0])] : [x / (3 * crossTotal), y / (3 * crossTotal)];
  }

  function build(input, graph, targetShares) {
    graph.boundaries.forEach((boundary) => { boundary.points = sampleBoundary(input, boundary); });
    const byId = new Map(graph.boundaries.map((boundary) => [boundary.id, boundary]));
    return graph.regionRefs.map((ref, index) => {
      const start = byId.get(ref.startBoundaryId);
      const end = byId.get(ref.endBoundaryId);
      const startOuterAngle = start.controls.at(-1).angle;
      const endOuterAngle = unwrapNear(end.controls.at(-1).angle, startOuterAngle);
      const startInnerAngle = start.controls[0].angle;
      const endInnerAngle = unwrapNear(end.controls[0].angle, startInnerAngle);
      const polygon = [
        ...start.points,
        ...arc(input, input.outerRadius, startOuterAngle, endOuterAngle).slice(1),
        ...[...end.points].reverse().slice(1),
        ...arc(input, input.innerRadius, startInnerAngle, endInnerAngle, true).slice(1),
      ];
      const area = polygonArea(polygon);
      const centroid = polygonCentroid(polygon);
      return {
        id: ref.id,
        order: ref.order,
        targetShare: targetShares[index],
        areaShare: area / (Math.PI * (input.outerRadius ** 2 - input.innerRadius ** 2)),
        polygonArea: area,
        polygon,
        centroid,
        labelPoint: centroid,
        startBoundaryId: ref.startBoundaryId,
        endBoundaryId: ref.endBoundaryId,
        metadata: input.regions[index].metadata,
      };
    });
  }

  natural.geometry = Object.freeze({ unwrapNear, sampleBoundary, arc, polygonArea, polygonCentroid, build });
})(window);
