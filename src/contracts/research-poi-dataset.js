(function initResearchPoiDataset(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  function build(poiResult, minuteResult = null) {
    if (!poiResult?.poiQueryId) throw new Error('PoiResult is required.');
    const assignments = new Map((minuteResult?.assignments || []).map((item) => [item.poiId, item]));
    const categoryStatistics = {}, categoryRingStatistics = {};
    const pois = (poiResult.pois || []).map((poi) => {
      const assignment = assignments.get(poi.poiId) || null;
      const code = poi.providerCategory?.level1Code || poi.categoryId || 'unknown';
      const label = poi.providerCategory?.level1Label || poi.category?.label || code;
      categoryStatistics[code] ||= { label, count: 0 };
      categoryStatistics[code].count += 1;
      categoryRingStatistics[code] ||= {};
      categoryRingStatistics[code][poi.ringId] = (categoryRingStatistics[code][poi.ringId] || 0) + 1;
      return { poiId: poi.poiId, name: poi.name, lon: poi.location.lon, lat: poi.location.lat, provider: poi.source,
        providerCategory: poi.providerCategory || null, semanticCategory: poi.semanticCategory || null,
        categoryStyleKey: poi.categoryStyleKey || `amap-l1-${code}`, displayRingId: poi.ringId,
        travelTimeMinuteEstimate: assignment?.travelTimeMinuteEstimate ?? null, travelTimeBand: assignment?.travelTimeBand || null };
    });
    const c = poiResult.metadata?.completeness || {};
    const queryCompleteness = c.status === 'complete' ? 'complete' : c.blockedCategories ? 'partial-budget' : 'partial-provider-cap';
    return { schemaVersion: 'research-poi-dataset-v1', pois, categoryStatistics, categoryRingStatistics, metadata: {
      center: poiResult.center, profile: poiResult.profile, rangesMinutes: poiResult.rangesMinutes,
      reachabilityFingerprint: poiResult.metadata?.reachabilityFingerprint || poiResult.analysisFingerprint,
      poiQueryFingerprint: poiResult.metadata?.poiQueryFingerprint || null, provider: poiResult.metadata?.provider,
      categorySchemaVersion: poiResult.metadata?.categorySchemaVersion || 'amap-poi-l1-v1', categoryStyleVersion: app.categoryStyleRegistry?.version || 'amap-category-style-v1',
      coordinatePolicyVersion: poiResult.metadata?.coordinatePolicy || 'wgs84-gcj02-v1', selectedCategoryCount: (poiResult.categoryIds || []).length,
      queriedCategoryCount: Object.keys(c.categories || {}).length, completeCategoryCount: c.completeCategories || 0,
      partialCategoryCount: (c.partialCategories || 0) + (c.blockedCategories || 0), queryCompleteness, generatedAt: new Date().toISOString() } };
  }
  app.researchPoiDataset = Object.freeze({ build });
})(window);
