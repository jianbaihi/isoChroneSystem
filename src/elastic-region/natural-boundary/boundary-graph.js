(function initNaturalBoundaryGraph(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;

  function cloneBoundary(boundary) {
    return {
      ...boundary,
      controls: boundary.controls.map((control) => ({ ...control, point: [...control.point] })),
    };
  }

  function build(input, targetBoundaries) {
    const previousMap = new Map((input.previousBoundaryState?.boundaries || []).map((boundary) => [boundary.id, boundary]));
    const boundaries = targetBoundaries.map((target) => {
      const previous = previousMap.get(target.id);
      const seed = previous?.controls?.length === target.controls.length ? previous : target;
      const boundary = cloneBoundary(seed);
      boundary.leftRegionId = target.leftRegionId;
      boundary.rightRegionId = target.rightRegionId;
      boundary.targetEndpointAngle = target.controls[0].angle;
      boundary.targetControls = target.controls.map((control) => ({ ...control, point: [...control.point] }));
      boundary.graphDistance = target.graphDistance;
      boundary.amplitude = target.amplitude;
      return boundary;
    });
    const regionRefs = input.regions.map((region, index) => ({
      id: region.id,
      order: region.order,
      startBoundaryId: boundaries[index].id,
      endBoundaryId: boundaries[(index + 1) % boundaries.length].id,
      startDirection: 1,
      endDirection: -1,
    }));
    return { schemaVersion: 'shared-boundary-graph-v1', boundaries, regionRefs };
  }

  function audit(graph) {
    const ids = graph.boundaries.map((boundary) => boundary.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    const useCount = new Map(ids.map((id) => [id, 0]));
    graph.regionRefs.forEach((region) => {
      useCount.set(region.startBoundaryId, (useCount.get(region.startBoundaryId) || 0) + 1);
      useCount.set(region.endBoundaryId, (useCount.get(region.endBoundaryId) || 0) + 1);
    });
    return {
      boundaryCount: ids.length,
      duplicateBoundaryCount: new Set(duplicates).size,
      sharedExactlyTwiceCount: [...useCount.values()].filter((count) => count === 2).length,
      allBoundariesSharedExactlyTwice: [...useCount.values()].every((count) => count === 2),
    };
  }

  natural.boundaryGraph = Object.freeze({ build, audit, cloneBoundary });
})(window);
