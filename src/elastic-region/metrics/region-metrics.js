(function initElasticRegionMetrics(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function distance(left, right) { return Math.hypot(left[0] - right[0], left[1] - right[1]); }
  function closePoint(left, right, epsilon = 1e-4) { return distance(left, right) <= epsilon; }

  function adjacency(regions) {
    const pairs = [];
    for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
        const left = regions[leftIndex].polygon;
        const right = regions[rightIndex].polygon;
        let shared = false;
        for (let i = 0; i < left.length && !shared; i += 1) {
          const a = left[i];
          const b = left[(i + 1) % left.length];
          for (let j = 0; j < right.length; j += 1) {
            const c = right[j];
            const d = right[(j + 1) % right.length];
            if ((closePoint(a, d) && closePoint(b, c)) || (closePoint(a, c) && closePoint(b, d))) { shared = true; break; }
          }
        }
        if (shared) pairs.push([regions[leftIndex].id, regions[rightIndex].id].sort().join('|'));
      }
    }
    return pairs.sort();
  }

  function compareAdjacency(current, previous = []) {
    const currentSet = new Set(current);
    const previousSet = new Set(previous);
    return [...currentSet].filter((item) => !previousSet.has(item)).length + [...previousSet].filter((item) => !currentSet.has(item)).length;
  }

  function buildMetrics(containerPolygon, regions, targetShares, previousState, solverInfo) {
    const containerArea = elastic.polygon.area(containerPolygon);
    const sumRegionArea = regions.reduce((sum, region) => sum + region.area, 0);
    const gapArea = Math.max(0, containerArea - sumRegionArea);
    const overlapArea = Math.max(0, sumRegionArea - containerArea);
    const errors = regions.map((region, index) => Math.abs(region.areaShare - targetShares[index]));
    const currentAdjacency = adjacency(regions);
    const previousRegions = previousState?.regions || [];
    const previousById = new Map(previousRegions.map((region) => [region.id, region]));
    const centroidDeltas = regions.map((region) => previousById.has(region.id) ? distance(region.centroid, previousById.get(region.id).centroid) : 0);
    const areaDeltas = regions.map((region) => previousById.has(region.id) ? Math.abs(region.areaShare - previousById.get(region.id).areaShare) : 0);
    return {
      containerArea, sumRegionArea, gapArea, overlapArea,
      gapRatio: gapArea / containerArea, overlapRatio: overlapArea / containerArea,
      meanAreaError: errors.reduce((sum, value) => sum + value, 0) / errors.length,
      maxAreaError: Math.max(...errors),
      anchorDisplacement: solverInfo.sites.map((site) => distance(site.point, site.anchor)),
      adjacency: currentAdjacency,
      adjacencyChangeCount: compareAdjacency(currentAdjacency, previousState?.metrics?.adjacency || []),
      centroidDisplacementPerFrame: centroidDeltas,
      maxCentroidDisplacementPerFrame: Math.max(...centroidDeltas),
      areaDeltaPerFrame: areaDeltas,
      maxAreaDeltaPerFrame: Math.max(...areaDeltas),
      nodeCount: regions.length,
      solverIterations: solverInfo.iterations,
      solveMs: solverInfo.solveMs,
      warmStartUsed: solverInfo.warmStartUsed,
    };
  }

  elastic.regionMetrics = Object.freeze({ adjacency, compareAdjacency, buildMetrics });
})(window);
