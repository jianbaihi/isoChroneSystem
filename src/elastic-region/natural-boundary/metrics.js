(function initNaturalBoundaryMetrics(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;

  function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  function orientation(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }

  function segmentsIntersect(a, b, c, d) {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    return abC * abD < -1e-8 && cdA * cdB < -1e-8;
  }

  function selfIntersects(polygon) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      for (let j = i + 2; j < polygon.length; j += 1) {
        if ((j + 1) % polygon.length === i) continue;
        const c = polygon[j];
        const d = polygon[(j + 1) % polygon.length];
        if (segmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function boundaryCrossings(boundaries) {
    let count = 0;
    for (let i = 0; i < boundaries.length; i += 1) {
      for (let j = i + 1; j < boundaries.length; j += 1) {
        const left = boundaries[i].points;
        const right = boundaries[j].points;
        for (let a = 0; a < left.length - 1; a += 1) {
          for (let b = 0; b < right.length - 1; b += 1) {
            if (segmentsIntersect(left[a], left[a + 1], right[b], right[b + 1])) count += 1;
          }
        }
      }
    }
    return count;
  }

  function curvature(boundary) {
    const values = [];
    for (let index = 1; index < boundary.points.length - 1; index += 1) {
      const a = boundary.points[index - 1];
      const b = boundary.points[index];
      const c = boundary.points[index + 1];
      const first = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const second = Math.atan2(c[1] - b[1], c[0] - b[0]);
      let delta = Math.abs(second - first);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      const length = Math.max(1e-6, (distance(a, b) + distance(b, c)) / 2);
      values.push(delta / length);
    }
    return values;
  }

  function stateMap(state) {
    return new Map((state?.boundaries || []).map((boundary) => [boundary.id, boundary]));
  }

  function displacements(graph, state) {
    const previous = stateMap(state);
    return graph.boundaries.flatMap((boundary) => {
      const prior = previous.get(boundary.id);
      return prior?.controls?.length === boundary.controls.length
        ? boundary.controls.map((control, index) => distance(control.point, prior.controls[index].point)) : [];
    });
  }

  function compute(input, graph, regions, targetShares, solveMs, warmStartUsed) {
    const annulusArea = Math.PI * (input.outerRadius ** 2 - input.innerRadius ** 2);
    const totalArea = regions.reduce((sum, region) => sum + region.polygonArea, 0);
    const areaErrors = regions.map((region, index) => Math.abs(region.areaShare - targetShares[index]));
    const curvatureValues = graph.boundaries.flatMap(curvature);
    const movement = displacements(graph, input.previousBoundaryState);
    const referenceMovement = displacements(graph, input.referenceBoundaryState);
    const previousRegions = new Map((input.previousBoundaryState?.regions || []).map((region) => [region.id, region]));
    const centroidDisplacements = regions.map((region) => {
      const prior = previousRegions.get(region.id);
      return prior?.centroid ? distance(region.centroid, prior.centroid) : 0;
    });
    const areaDeltas = regions.map((region) => {
      const prior = previousRegions.get(region.id);
      return prior ? Math.abs(region.areaShare - prior.areaShare) : 0;
    });
    const graphAudit = natural.boundaryGraph.audit(graph);
    const gapArea = Math.max(0, annulusArea - totalArea);
    const overlapArea = Math.max(0, totalArea - annulusArea);
    const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const maximum = (values) => values.length ? Math.max(...values) : 0;
    const curvatureMean = mean(curvatureValues);
    return {
      regionCount: regions.length,
      boundaryCount: graph.boundaries.length,
      duplicateBoundaryCount: graphAudit.duplicateBoundaryCount,
      allBoundariesSharedExactlyTwice: graphAudit.allBoundariesSharedExactlyTwice,
      annulusArea,
      sumRegionArea: totalArea,
      coverageRatio: Math.min(1, totalArea / annulusArea),
      gapRatio: gapArea / annulusArea,
      overlapRatio: overlapArea / annulusArea,
      meanAreaError: mean(areaErrors),
      maxAreaError: maximum(areaErrors),
      boundaryCrossingCount: boundaryCrossings(graph.boundaries),
      selfIntersectionRegionCount: regions.filter((region) => selfIntersects(region.polygon)).length,
      orderChangeCount: input.previousBoundaryState?.regionOrder
        && input.previousBoundaryState.regionOrder.join('|') !== regions.map((region) => region.id).join('|') ? 1 : 0,
      centerDelta: 0,
      innerRadiusDelta: 0,
      outerRadiusDelta: 0,
      curvatureMean,
      curvatureMax: maximum(curvatureValues),
      curvatureVariation: mean(curvatureValues.map((value) => Math.abs(value - curvatureMean))),
      temporalMeanControlDisplacement: mean(movement),
      temporalMaxControlDisplacement: maximum(movement),
      maxBoundaryMove: maximum(movement),
      maxCentroidDisplacement: maximum(centroidDisplacements),
      maxAreaDelta: maximum(areaDeltas),
      returnGeometryDrift: maximum(referenceMovement),
      movementByGraphDistance: graph.boundaries.map((boundary) => ({
        boundaryId: boundary.id,
        graphDistance: boundary.graphDistance,
        maxMove: maximum(displacements({ boundaries: [boundary] }, input.previousBoundaryState)),
      })),
      solveMs,
      warmStartUsed,
      iterations: input.parameters.iterations,
      iterationsPerFrame: input.parameters.iterationsPerFrame,
    };
  }

  natural.metrics = Object.freeze({ distance, segmentsIntersect, selfIntersects, boundaryCrossings, curvature, compute });
})(window);
