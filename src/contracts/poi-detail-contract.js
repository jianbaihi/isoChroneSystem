(function initPoiDetailContract(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const CATEGORY_LABELS = {
    food: '餐饮', shopping: '购物', attraction: '景点', lodging: '住宿', health: '医疗',
    education: '教育', transport: '交通', service: '生活服务', entertainment: '休闲娱乐', other: '其他',
  };

  function normalizedCategory(poi) {
    const sourceCategory = poi?.categoryId || poi?.category?.primaryCategoryId || null;
    const text = String(sourceCategory || '').toLowerCase();
    const mappings = [
      ['food', ['food', 'restaurant', 'cafe']], ['shopping', ['shop']],
      ['attraction', ['tour', 'historic', 'attraction']], ['lodging', ['hotel', 'lodging']],
      ['health', ['health', 'hospital']], ['education', ['education', 'school']],
      ['transport', ['transport', 'station']], ['service', ['service']],
      ['entertainment', ['entertainment', 'leisure', 'arts']],
    ];
    const id = mappings.find(([, needles]) => needles.some((needle) => text.includes(needle)))?.[0] || 'other';
    return { id, label: CATEGORY_LABELS[id], sourceCategory };
  }

  function normalizePoi(poi) {
    if (!poi?.poiId || !poi?.name || !poi?.location) throw new Error('NormalizedPoi 缺少必填字段。');
    const provider = typeof poi.source === 'string' ? poi.source : poi.source?.provider || 'unknown';
    return {
      poiId: poi.poiId, name: poi.name, location: { ...poi.location, crs: poi.location.crs || 'EPSG:4326' },
      category: normalizedCategory(poi), address: poi.address ?? null, rating: poi.rating ?? null,
      phone: poi.phone ?? null, website: poi.website ?? null, openingHours: poi.openingHours ?? null,
      brand: poi.brand ?? null,
      source: { provider, providerPoiId: poi.source?.providerPoiId || poi.poiId, attribution: poi.source?.attribution || [] },
      displayRingId: poi.displayRingId || poi.ringId || null,
    };
  }

  function buildPoiDetailViewModel(poiId, poiResult, minuteResult, profile) {
    const raw = poiResult?.pois?.find((poi) => poi.poiId === poiId);
    if (!raw) return null;
    const poi = normalizePoi(raw);
    const assignment = minuteResult?.assignments?.find((item) => item.poiId === poiId) || null;
    const minute = assignment?.travelTimeMinuteEstimate ?? null;
    const band = assignment?.travelTimeBand || null;
    const profileLabels = { 'foot-walking': '步行', 'cycling-regular': '骑行', 'driving-car': '驾车' };
    const lat = Number(poi.location.lat);
    const lon = Number(poi.location.lon);
    return {
      poiId: poi.poiId, name: poi.name, categoryLabel: poi.category.label, address: poi.address,
      location: poi.location, displayRingId: poi.displayRingId,
      displayRingLabel: poi.displayRingId ? `${poi.displayRingId.replace(/^ring-/, '').replaceAll('-', '–')} 分钟圈层` : null,
      profile, profileLabel: profileLabels[profile] || profile || null,
      coordinateLabel: Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E` : null,
      sourceCategory: poi.category.sourceCategory,
      travelTimePrimary: minute == null ? null : `约 ${minute} 分钟`,
      travelTimeSecondary: band ? `(${band.lowerExclusiveMinutes}, ${band.upperInclusiveMinutes}] 分钟` : null,
      travelTimeMethodLabel: assignment ? '1 分钟等时圈估计' : '尚未补齐',
      rating: poi.rating, phone: poi.phone, website: poi.website, openingHours: poi.openingHours,
      brand: poi.brand, providerLabel: poi.source.provider === 'ors-openpoiservice' ? 'OpenPOIService' : poi.source.provider,
    };
  }

  app.poiDetailContract = Object.freeze({ normalizedCategory, normalizePoi, buildPoiDetailViewModel });
})(window);
