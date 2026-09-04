(function initElasticRegionPolygon(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function signedArea(polygon) {
    let twice = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      twice += current[0] * next[1] - next[0] * current[1];
    }
    return twice / 2;
  }

  function area(polygon) { return Math.abs(signedArea(polygon)); }

  function centroid(polygon) {
    const signed = signedArea(polygon);
    if (Math.abs(signed) < 1e-12) {
      const count = Math.max(1, polygon.length);
      return [polygon.reduce((sum, point) => sum + point[0], 0) / count, polygon.reduce((sum, point) => sum + point[1], 0) / count];
    }
    let x = 0;
    let y = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const cross = current[0] * next[1] - next[0] * current[1];
      x += (current[0] + next[0]) * cross;
      y += (current[1] + next[1]) * cross;
    }
    return [x / (6 * signed), y / (6 * signed)];
  }

  function clipHalfPlane(polygon, normal, limit, epsilon = 1e-9) {
    if (!polygon.length) return [];
    const output = [];
    const inside = (point) => normal[0] * point[0] + normal[1] * point[1] <= limit + epsilon;
    const intersection = (start, end) => {
      const direction = [end[0] - start[0], end[1] - start[1]];
      const denominator = normal[0] * direction[0] + normal[1] * direction[1];
      if (Math.abs(denominator) < 1e-14) return [...start];
      const t = (limit - normal[0] * start[0] - normal[1] * start[1]) / denominator;
      return [start[0] + direction[0] * t, start[1] + direction[1] * t];
    };
    for (let index = 0; index < polygon.length; index += 1) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const startInside = inside(start);
      const endInside = inside(end);
      if (startInside && endInside) output.push([...end]);
      else if (startInside && !endInside) output.push(intersection(start, end));
      else if (!startInside && endInside) output.push(intersection(start, end), [...end]);
    }
    return output.filter((point, index, items) => index === 0 || Math.hypot(point[0] - items[index - 1][0], point[1] - items[index - 1][1]) > epsilon);
  }

  function pointInConvexPolygon(point, polygon, epsilon = 1e-7) {
    let sign = 0;
    for (let index = 0; index < polygon.length; index += 1) {
      const a = polygon[index];
      const b = polygon[(index + 1) % polygon.length];
      const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
      if (Math.abs(cross) <= epsilon) continue;
      const nextSign = Math.sign(cross);
      if (sign && nextSign !== sign) return false;
      sign = nextSign;
    }
    return true;
  }

  elastic.polygon = Object.freeze({ signedArea, area, centroid, clipHalfPlane, pointInConvexPolygon });
})(window);
