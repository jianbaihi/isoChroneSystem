(function initAnalysisPoiGeoJson(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  function emptyCollection() {
    return { type: 'FeatureCollection', features: [] };
  }

  function pointForPoi(poi, index) {
    const lon = Number(poi?.location?.lon);
    const lat = Number(poi?.location?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { error: `pois[${index}] 坐标无效。` };
    }
    const poiId = String(poi.poiId || '');
    if (!poiId) return { error: `pois[${index}].poiId 缺失。` };
    const category = poi.category || {};
    return {
      feature: {
        type: 'Feature',
        id: poiId,
        properties: {
          poiId,
          datasetId: poi.datasetId || '',
          ringId: poi.ringId || '',
          topLevelCategoryId: category.topLevelId || poi.categoryId || '',
          basicCategoryId: category.basicCategoryId || '',
          primaryCategoryId: category.primaryCategoryId || poi.categoryId || '',
          categoryLevel1Code: poi.providerCategory?.level1Code || poi.categoryId || '',
          categoryStyleKey: poi.categoryStyleKey || '',
          name: String(poi.name || ''),
          matrixStatus: poi.matrixStatus || '',
          matrixBandId: poi.matrixBandId || '',
          travelTimeSeconds: poi.travelTimeSeconds ?? null,
          networkDistanceMeters: poi.networkDistanceMeters ?? null,
        },
        geometry: { type: 'Point', coordinates: [lon, lat] },
      },
    };
  }

  function buildPoiFeatures(result, diagnostics = []) {
    const features = [];
    (Array.isArray(result?.pois) ? result.pois : []).forEach((poi, index) => {
      const normalized = pointForPoi(poi, index);
      if (normalized.error) {
        diagnostics.push(normalized.error);
        return;
      }
      features.push(normalized.feature);
    });
    return { type: 'FeatureCollection', features };
  }

  app.analysisPoiGeoJson = Object.freeze({ buildPoiFeatures, emptyCollection });
})(window);
