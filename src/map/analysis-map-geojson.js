(function initAnalysisMapGeoJson(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  function emptyCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function assertCoordinatePair(pair, field) {
    if (!Array.isArray(pair) || pair.length < 2) throw new Error(`${field} 坐标无效。`);
    const lon = Number(pair[0]);
    const lat = Number(pair[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      throw new Error(`${field} 坐标超出 WGS84 范围。`);
    }
    return [lon, lat];
  }

  function visitCoordinates(value, field, visitor) {
    if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} coordinates 不能为空。`);
    if (typeof value[0] === 'number') {
      visitor(assertCoordinatePair(value, field));
      return;
    }
    value.forEach((child, index) => visitCoordinates(child, `${field}[${index}]`, visitor));
  }

  function normalizeGeometry(geometry, field) {
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      throw new Error(`${field} 只支持 Polygon 或 MultiPolygon。`);
    }
    visitCoordinates(geometry.coordinates, field, () => {});
    return { type: geometry.type, coordinates: geometry.coordinates };
  }

  function buildRingFeatures(result) {
    const features = (Array.isArray(result?.rings) ? result.rings : [])
      .filter((ring) => ring && ring.geometry)
      .map((ring, index) => {
        const ringId = String(ring.ringId || `ring-${index}`);
        return {
          type: 'Feature',
          id: ringId,
          properties: {
            ringId,
            innerRangeMinutes: Number(ring.innerRangeMinutes),
            outerRangeMinutes: Number(ring.outerRangeMinutes),
          },
          geometry: normalizeGeometry(ring.geometry, `rings[${index}].geometry`),
        };
      });
    return { type: 'FeatureCollection', features };
  }

  function buildCenterFeatures(center) {
    if (!center) return emptyCollection();
    const coordinates = assertCoordinatePair([center.lon, center.lat], 'center');
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        id: 'analysis-center',
        properties: { label: center.label || '' },
        geometry: { type: 'Point', coordinates },
      }],
    };
  }

  function boundsForGeometry(geometry) {
    if (!geometry) return null;
    const bounds = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
    visitCoordinates(geometry.coordinates, 'geometry', ([lon, lat]) => {
      bounds.minLon = Math.min(bounds.minLon, lon);
      bounds.minLat = Math.min(bounds.minLat, lat);
      bounds.maxLon = Math.max(bounds.maxLon, lon);
      bounds.maxLat = Math.max(bounds.maxLat, lat);
    });
    return Number.isFinite(bounds.minLon)
      ? [[bounds.minLon, bounds.minLat], [bounds.maxLon, bounds.maxLat]]
      : null;
  }

  function boundsForFeatures(collection) {
    const bounds = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
    (collection?.features || []).forEach((feature) => {
      const featureBounds = feature.geometry?.type === 'Point'
        ? [feature.geometry.coordinates, feature.geometry.coordinates]
        : boundsForGeometry(feature.geometry);
      if (!featureBounds) return;
      bounds.minLon = Math.min(bounds.minLon, featureBounds[0][0]);
      bounds.minLat = Math.min(bounds.minLat, featureBounds[0][1]);
      bounds.maxLon = Math.max(bounds.maxLon, featureBounds[1][0]);
      bounds.maxLat = Math.max(bounds.maxLat, featureBounds[1][1]);
    });
    return Number.isFinite(bounds.minLon)
      ? [[bounds.minLon, bounds.minLat], [bounds.maxLon, bounds.maxLat]]
      : null;
  }

  app.analysisMapGeoJson = Object.freeze({
    buildRingFeatures,
    buildCenterFeatures,
    boundsForGeometry,
    boundsForFeatures,
  });
})(window);
