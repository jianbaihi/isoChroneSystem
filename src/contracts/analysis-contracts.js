(function initAnalysisContracts(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const PROFILES = new Set(['foot-walking', 'cycling-regular', 'driving-car']);
  const SCHEMA_VERSION = '1.0';

  function assertFiniteNumber(value, field) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${field} 必须是有限数字。`);
    }
    return value;
  }

  function normalizeCenter(center) {
    if (!center || typeof center !== 'object') throw new Error('center 必须存在。');
    const lon = assertFiniteNumber(Number(center.lon), 'center.lon');
    const lat = assertFiniteNumber(Number(center.lat), 'center.lat');
    if (lon < -180 || lon > 180) throw new Error('center.lon 超出范围。');
    if (lat < -90 || lat > 90) throw new Error('center.lat 超出范围。');
    return {
      lon,
      lat,
      crs: 'EPSG:4326',
      ...(center.label ? { label: String(center.label) } : {}),
      ...(center.id ? { id: String(center.id) } : {}),
      source: ['preset', 'geocoder', 'geolocation', 'map-click'].includes(center.source) ? center.source : 'preset',
      ...(center.accuracyMeters == null ? {} : { accuracyMeters: assertFiniteNumber(Number(center.accuracyMeters), 'center.accuracyMeters') }),
    };
  }

  function normalizeRanges(ranges) {
    if (!Array.isArray(ranges) || ranges.length < 1 || ranges.length > 10) {
      throw new Error('rangesMinutes 必须包含 1 至 10 项。');
    }
    const normalized = ranges.map((value) => {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) throw new Error('rangesMinutes 必须是正整数。');
      return number;
    });
    if (normalized.some((value, index) => index > 0 && value <= normalized[index - 1])) {
      throw new Error('rangesMinutes 必须严格升序且不能重复。');
    }
    return normalized;
  }

  function normalizeDraftRanges(ranges) {
    if (!Array.isArray(ranges)) throw new Error('时间阈值必须是数组。');
    const normalized = [...new Set(ranges.map((value) => {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) throw new Error('时间阈值必须是正整数。');
      return number;
    }))].sort((a, b) => a - b);
    return normalizeRanges(normalized);
  }

  function normalizeCategoryIds(categoryIds) {
    if (!Array.isArray(categoryIds)) throw new Error('categoryIds 必须是数组。');
    return [...new Set(categoryIds.map((value) => String(value).trim()).filter(Boolean))];
  }

  function normalizePoiDatasetId(value) {
    if (value == null || value === '') return null;
    const normalized = String(value).trim();
    if (!/^[a-z0-9][a-z0-9._:-]{1,127}$/i.test(normalized)) throw new Error('poiDatasetId 格式无效。');
    return normalized;
  }

  function normalizeGeoJsonGeometry(geometry, field) {
    if (!geometry || typeof geometry !== 'object' || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      throw new Error(`${field} 只支持 Polygon 或 MultiPolygon。`);
    }
    const visitCoordinates = (coordinates) => {
      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        throw new Error(`${field}.coordinates 不能为空。`);
      }
      if (coordinates.every((value) => typeof value === 'number')) {
        if (coordinates.length < 2 || coordinates.slice(0, 2).some((value) => !Number.isFinite(value))) {
          throw new Error(`${field}.coordinates 包含非法坐标。`);
        }
        return;
      }
      coordinates.forEach((child) => visitCoordinates(child));
    };
    visitCoordinates(geometry.coordinates);
    return { type: geometry.type, coordinates: geometry.coordinates };
  }

  function normalizeCumulativeIsochrones(value) {
    if (!Array.isArray(value)) throw new Error('cumulativeIsochrones 必须是数组。');
    const normalized = value.map((item, index) => {
      if (!item || typeof item !== 'object') throw new Error(`cumulativeIsochrones[${index}] 无效。`);
      const rangeMinutes = Number(item.rangeMinutes);
      const rangeSeconds = Number(item.rangeSeconds);
      if (!Number.isInteger(rangeMinutes) || rangeMinutes <= 0) {
        throw new Error(`cumulativeIsochrones[${index}].rangeMinutes 无效。`);
      }
      if (rangeSeconds !== rangeMinutes * 60) {
        throw new Error(`cumulativeIsochrones[${index}].rangeSeconds 与阈值不匹配。`);
      }
      if (!item.isochroneId) throw new Error(`cumulativeIsochrones[${index}].isochroneId 缺失。`);
      return {
        ...item,
        isochroneId: String(item.isochroneId),
        rangeMinutes,
        rangeSeconds,
        geometry: normalizeGeoJsonGeometry(item.geometry, `cumulativeIsochrones[${index}].geometry`),
      };
    });
    normalized.forEach((item, index) => {
      if (index > 0 && item.rangeMinutes <= normalized[index - 1].rangeMinutes) {
        throw new Error('cumulativeIsochrones 必须按时间阈值严格升序。');
      }
    });
    if (new Set(normalized.map((item) => item.isochroneId)).size !== normalized.length) {
      throw new Error('cumulativeIsochrones 的 isochroneId 必须唯一。');
    }
    return normalized;
  }

  function normalizeMetadata(result) {
    const metadata = result.metadata && typeof result.metadata === 'object' ? result.metadata : {};
    const source = String(metadata.source || 'mock');
    if (!['mock', 'mixed', 'ors'].includes(source)) throw new Error('metadata.source 无效。');
    const sources = metadata.sources || {
      isochrones: source === 'ors' || source === 'mixed' ? 'ors' : 'mock',
      pois: result.pois.length > 0 ? 'mock' : 'none',
    };
    if (!['mock', 'ors', 'ors-public-api'].includes(sources.isochrones)
      || !['mock', 'local-overture', 'none', 'ors-openpoiservice'].includes(sources.pois)) {
      throw new Error('metadata.sources 无效。');
    }
    return {
      ...metadata,
      source,
      sources: { isochrones: sources.isochrones, pois: sources.pois },
      warnings: Array.isArray(metadata.warnings) ? metadata.warnings.map(String) : [],
    };
  }

  function normalizeAnalysisRequest(request) {
    if (!request || typeof request !== 'object') throw new Error('AnalysisRequest 必须是对象。');
    const schemaVersion = String(request.schemaVersion || SCHEMA_VERSION);
    if (schemaVersion !== SCHEMA_VERSION) throw new Error('schemaVersion 只支持 1.0。');
    const profile = String(request.profile || '');
    if (!PROFILES.has(profile)) throw new Error(`不支持的 profile: ${profile}`);
    const options = request.options || {};
    return {
      schemaVersion,
      center: normalizeCenter(request.center),
      profile,
      rangesMinutes: normalizeRanges(request.rangesMinutes),
      categoryIds: normalizeCategoryIds(request.categoryIds || []),
      poiDatasetId: normalizePoiDatasetId(request.poiDatasetId),
      options: {
        includePois: options.includePois === true,
        calculateTravelTimes: options.calculateTravelTimes === true,
        ...(options.poiPreviewRadiusMeters == null ? {} : { poiPreviewRadiusMeters: [500, 1000, 2000].includes(Number(options.poiPreviewRadiusMeters)) ? Number(options.poiPreviewRadiusMeters) : (() => { throw new Error('poiPreviewRadiusMeters 必须是 500、1000 或 2000。'); })() }),
      },
    };
  }

  function normalizePoiPreview(result) {
    if (!result || typeof result !== 'object') throw new Error('PoiPreview 必须是对象。');
    const pois = Array.isArray(result.pois) ? result.pois : [];
    const ids = new Set();
    return {
      ...result,
      pois: pois.map((poi, index) => {
        if (!poi?.poiId || ids.has(poi.poiId)) throw new Error(`pois[${index}].poiId 必须稳定且唯一。`);
        ids.add(poi.poiId);
        return { ...poi, poiId: String(poi.poiId), travelTimeSeconds: null };
      }),
      categories: Array.isArray(result.categories) ? result.categories : [],
      metadata: result.metadata && typeof result.metadata === 'object' ? result.metadata : {},
    };
  }

  function normalizeAnalysisResult(result) {
    if (!result || typeof result !== 'object') throw new Error('AnalysisResult 必须是对象。');
    const normalized = {
      ...result,
      schemaVersion: String(result.schemaVersion || SCHEMA_VERSION),
      status: String(result.status || 'completed'),
      rangesMinutes: Array.isArray(result.rangesMinutes) ? result.rangesMinutes.map(Number) : [],
      rings: Array.isArray(result.rings) ? result.rings : [],
      pois: Array.isArray(result.pois) ? result.pois : [],
      categories: Array.isArray(result.categories) ? result.categories : [],
    };
    normalized.cumulativeIsochrones = normalizeCumulativeIsochrones(result.cumulativeIsochrones || []);
    normalized.rings = normalized.rings.map((ring, index) => ({
      ...ring,
      geometry: ring?.geometry ? normalizeGeoJsonGeometry(ring.geometry, `rings[${index}].geometry`) : null,
    }));
    const poiIds = new Set();
    normalized.pois = normalized.pois.map((poi, index) => {
      if (!poi || !poi.poiId || poiIds.has(poi.poiId)) throw new Error(`pois[${index}].poiId 必须稳定且唯一。`);
      poiIds.add(poi.poiId);
      const category = poi.category || null;
      return {
        ...poi,
        poiId: String(poi.poiId),
        travelTimeSeconds: null,
        ...(category ? {
          category: {
            ...category,
            hierarchy: Array.isArray(category.hierarchy) ? category.hierarchy.map(String) : [],
            alternateIds: Array.isArray(category.alternateIds) ? [...new Set(category.alternateIds.map(String))] : [],
          },
        } : {}),
      };
    });
    const ringIds = new Set(normalized.rings.map((ring) => ring.ringId));
    normalized.pois.forEach((poi, index) => {
      if (poi.ringId && !ringIds.has(poi.ringId)) throw new Error(`pois[${index}].ringId 不属于本次结果。`);
    });
    normalized.metadata = normalizeMetadata(normalized);
    return normalized;
  }

  app.contracts = Object.freeze({
    SCHEMA_VERSION,
    PROFILES: Object.freeze([...PROFILES]),
    normalizeAnalysisRequest,
    normalizeDraftRanges,
    normalizeAnalysisResult,
    normalizePoiPreview,
    normalizeGeoJsonGeometry,
  });
})(window);
