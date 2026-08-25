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

  function formatMatrixDuration(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return '未返回';
    const rounded = Math.round(seconds);
    return `${Math.floor(rounded / 60)} 分 ${rounded % 60} 秒`;
  }

  function formatMatrixDistance(value) {
    const meters = Number(value);
    if (!Number.isFinite(meters) || meters < 0) return '未返回';
    return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(2)} 千米`;
  }

  function matrixSummaryText(result) {
    const summary = result?.metadata?.matrix;
    if (!summary || typeof summary !== 'object') return '尚未计算 Matrix 路网估算';
    const requested = Number(summary.requestedPoiCount || 0);
    const ok = Number(summary.matrixOkCount || 0);
    const within = Number(summary.matrixWithinRangeCount || 0);
    const out = Number(summary.matrixOutOfRangeCount || 0);
    const abnormal = Number(summary.matrixNullCount || 0) + Number(summary.matrixInvalidCount || 0);
    return `Matrix 已计算 ${ok}/${requested} · 圈内 ${within} · 超出30分 ${out} · 异常 ${abnormal}`;
  }

  function matrixPoiDetailText(result, poiId) {
    if (!poiId) return '';
    const poi = (result?.pois || []).find((item) => item.poiId === poiId);
    const name = poi?.name || '当前 POI';
    if (!poi?.matrixStatus) return `${name} · 尚无 Matrix 路网估算`;
    if (poi.matrixStatus !== 'ok') return `${name} · Matrix 路网估算不可达或无效`;
    return `${name} · Matrix 路网估算：${formatMatrixDuration(poi.travelTimeSeconds)} · 路网距离 ${formatMatrixDistance(poi.networkDistanceMeters)}`;
  }

  function matrixBandForDuration(seconds, rangesMinutes) {
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Matrix 时间必须是正的有限数字。');
    let previous = 0;
    for (const range of rangesMinutes) {
      if (seconds <= range * 60) return `ring-${previous}-${range}`;
      previous = range;
    }
    return 'matrix-out-of-range';
  }

  function normalizeMatrixStatus(status) {
    // Stage-51 v1 used unreachable for a Matrix null.  v2 exposes null while
    // preserving the original row as an audit-compatible record.
    return status === 'unreachable' ? 'null' : status;
  }

  function enrichPoisWithMatrix(pois, matrixRecords, rangesMinutes, ringIds = []) {
    const sourcePois = Array.isArray(pois) ? pois : [];
    const sourceMatrix = Array.isArray(matrixRecords) ? matrixRecords : [];
    const poiIds = new Set();
    sourcePois.forEach((poi, index) => {
      const poiId = String(poi?.poiId || '');
      if (!poiId || poiIds.has(poiId)) throw new Error(`pois[${index}].poiId 必须稳定且唯一。`);
      poiIds.add(poiId);
    });
    if (!sourceMatrix.length) {
      return { pois: sourcePois.map((poi) => ({ ...poi, travelTimeSeconds: null })), accessibility: [], migrated: false };
    }
    const matrixById = new Map();
    sourceMatrix.forEach((record, index) => {
      const poiId = String(record?.poiId || '');
      if (!poiIds.has(poiId) || matrixById.has(poiId)) throw new Error(`accessibility[${index}].poiId 必须映射到唯一 POI。`);
      matrixById.set(poiId, record);
    });
    if (matrixById.size !== poiIds.size) throw new Error('accessibility 必须完整覆盖本次 POI。');
    const legalBands = new Set([...ringIds, 'matrix-out-of-range', 'matrix-null', 'matrix-invalid']);
    const accessibility = [];
    const enriched = sourcePois.map((poi) => {
      const poiId = String(poi.poiId);
      const record = matrixById.get(poiId);
      const matrixStatus = normalizeMatrixStatus(String(record.matrixStatus || ''));
      if (!['ok', 'null', 'invalid'].includes(matrixStatus)) throw new Error(`accessibility.${poiId}.matrixStatus 无效。`);
      const spatialBandId = record.spatialBandId == null ? (poi.spatialBandId || poi.ringId || null) : String(record.spatialBandId);
      let matrixBandId;
      let travelTimeSeconds = null;
      let networkDistanceMeters = null;
      let reachable = false;
      if (matrixStatus === 'ok') {
        travelTimeSeconds = Number(record.travelTimeSeconds);
        networkDistanceMeters = Number(record.networkDistanceMeters);
        if (!Number.isFinite(travelTimeSeconds) || travelTimeSeconds <= 0 || !Number.isFinite(networkDistanceMeters) || networkDistanceMeters < 0) {
          throw new Error(`accessibility.${poiId} 缺少合法 Matrix 数值。`);
        }
        matrixBandId = matrixBandForDuration(travelTimeSeconds, rangesMinutes);
        reachable = true;
      } else {
        matrixBandId = matrixStatus === 'null' ? 'matrix-null' : 'matrix-invalid';
      }
      if (!legalBands.has(matrixBandId)) throw new Error(`accessibility.${poiId}.matrixBandId 无效。`);
      const normalizedRecord = {
        ...record, poiId, matrixStatus, matrixBandId, spatialBandId,
        travelTimeSeconds, networkDistanceMeters, reachable,
      };
      accessibility.push(normalizedRecord);
      return {
        ...poi,
        poiId,
        travelTimeSeconds,
        networkDistanceMeters,
        ringId: matrixBandId,
        matrixBandId,
        spatialBandId,
        bandAssignmentMethod: 'matrix-duration',
        reachable,
        matrixStatus,
        routingProvider: record.routingProvider || null,
        routingGraphDate: record.routingGraphDate || null,
        calculatedAt: record.calculatedAt || null,
        snappedDistanceMeters: record.snappedDistanceMeters == null ? null : Number(record.snappedDistanceMeters),
        matrixBatchId: record.matrixBatchId || null,
      };
    });
    return { pois: enriched, accessibility, migrated: true };
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
      accessibility: Array.isArray(result.accessibility) ? result.accessibility : [],
    };
    normalized.cumulativeIsochrones = normalizeCumulativeIsochrones(result.cumulativeIsochrones || []);
    normalized.rings = normalized.rings.map((ring, index) => ({
      ...ring,
      geometry: ring?.geometry ? normalizeGeoJsonGeometry(ring.geometry, `rings[${index}].geometry`) : null,
    }));
    const poiIds = new Set();
    const isSpatialTimeResult = result.metadata?.spatialTime?.method === 'minute-isochrone-spatial';
    normalized.pois = normalized.pois.map((poi, index) => {
      if (!poi || !poi.poiId || poiIds.has(poi.poiId)) throw new Error(`pois[${index}].poiId 必须稳定且唯一。`);
      poiIds.add(poi.poiId);
      const category = poi.category || null;
      return {
        ...poi,
        poiId: String(poi.poiId),
        travelTimeSeconds: isSpatialTimeResult && poi.travelTimeSeconds != null ? Number(poi.travelTimeSeconds) : null,
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
      if (poi.ringId && !ringIds.has(poi.ringId) && !['matrix-out-of-range', 'matrix-unreachable-or-invalid', 'matrix-null', 'matrix-invalid'].includes(poi.ringId)) {
        throw new Error(`pois[${index}].ringId 不属于本次结果。`);
      }
    });
    if (isSpatialTimeResult) {
      normalized.accessibility = [];
      normalized.metadata = normalizeMetadata(normalized);
      return normalized;
    }
    const accessibilityIds = new Set();
    normalized.accessibility = normalized.accessibility.map((item, index) => {
      if (!item || !poiIds.has(String(item.poiId)) || accessibilityIds.has(String(item.poiId))) {
        throw new Error(`accessibility[${index}].poiId 必须映射到唯一 POI。`);
      }
      accessibilityIds.add(String(item.poiId));
      const matrixStatus = normalizeMatrixStatus(String(item.matrixStatus || ''));
      if (!['ok', 'null', 'invalid'].includes(matrixStatus)) throw new Error(`accessibility[${index}].matrixStatus 无效。`);
      const travelTimeSeconds = item.travelTimeSeconds == null ? null : Number(item.travelTimeSeconds);
      const networkDistanceMeters = item.networkDistanceMeters == null ? null : Number(item.networkDistanceMeters);
      if (travelTimeSeconds != null && (!Number.isFinite(travelTimeSeconds) || travelTimeSeconds < 0)) throw new Error(`accessibility[${index}].travelTimeSeconds 无效。`);
      if (networkDistanceMeters != null && (!Number.isFinite(networkDistanceMeters) || networkDistanceMeters < 0)) throw new Error(`accessibility[${index}].networkDistanceMeters 无效。`);
      const matrixBandId = item.matrixBandId == null ? null : String(item.matrixBandId);
      if (matrixBandId && !ringIds.has(matrixBandId) && !['matrix-out-of-range', 'matrix-null', 'matrix-invalid'].includes(matrixBandId)) throw new Error(`accessibility[${index}].matrixBandId 无效。`);
      // Legacy v1 caches may carry duration and distance but omit a derived
      // matrixBandId.  The canonical join below derives it from duration.
      if (matrixStatus === 'ok' && (travelTimeSeconds == null || networkDistanceMeters == null)) {
        throw new Error(`accessibility[${index}] 缺少合法 Matrix 数值。`);
      }
      return { ...item, poiId: String(item.poiId), matrixStatus, matrixBandId, travelTimeSeconds, networkDistanceMeters };
    });
    const enriched = enrichPoisWithMatrix(normalized.pois, normalized.accessibility, normalized.rangesMinutes, [...ringIds]);
    normalized.pois = enriched.pois;
    normalized.accessibility = enriched.accessibility;
    if (enriched.migrated) normalized.publishedResultSchemaVersion = '2.0';
    normalized.metadata = normalizeMetadata(normalized);
    return normalized;
  }

  app.contracts = Object.freeze({
    SCHEMA_VERSION,
    PROFILES: Object.freeze([...PROFILES]),
    normalizeAnalysisRequest,
    normalizeDraftRanges,
    normalizeAnalysisResult,
    enrichPoisWithMatrix,
    matrixBandForDuration,
    normalizePoiPreview,
    normalizeGeoJsonGeometry,
    formatMatrixDuration,
    formatMatrixDistance,
    matrixSummaryText,
    matrixPoiDetailText,
  });
})(window);
