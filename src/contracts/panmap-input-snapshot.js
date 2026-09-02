(function initPanmapInputSnapshot(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const SCHEMA_VERSION = 'panmap-input-snapshot-v1';

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }

  function hash(value) {
    let output = 2166136261;
    const text = stableStringify(value);
    for (let index = 0; index < text.length; index += 1) {
      output ^= text.charCodeAt(index);
      output = Math.imul(output, 16777619);
    }
    return `panmap-${(output >>> 0).toString(16).padStart(8, '0')}`;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function exclusiveRings(rangesMinutes) {
    const ordered = [...new Set((rangesMinutes || []).map(Number).filter((item) => Number.isFinite(item) && item > 0))].sort((a, b) => a - b);
    return ordered.map((upper, index) => ({
      ringId: `ring-${index ? ordered[index - 1] : 0}-${upper}`,
      lowerExclusiveMinutes: index ? ordered[index - 1] : 0,
      upperInclusiveMinutes: upper,
      label: `${upper} 分钟`,
      order: index,
    }));
  }

  function ringForMinute(minute, rings) {
    const numeric = Number(minute);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return rings.find((ring) => numeric > ring.lowerExclusiveMinutes && numeric <= ring.upperInclusiveMinutes)
      || (numeric === 0 ? rings[0] : null);
  }

  function buildPanmapInputSnapshot(reachabilityResult, poiResult, minuteResult) {
    if (!reachabilityResult || !poiResult?.poiQueryId || !minuteResult?.minuteAccessibilityId) {
      throw new Error('请先完成可达域、POI 查询与分钟级通行时间补齐。');
    }
    if (poiResult.analysisFingerprint !== minuteResult.analysisFingerprint
      || poiResult.poiQueryId !== minuteResult.poiQueryId) throw new Error('POI 与分钟结果不属于同一次查询。');
    const rangesMinutes = reachabilityResult.rangesMinutes || poiResult.rangesMinutes || [];
    const rings = exclusiveRings(rangesMinutes);
    const assignments = new Map((minuteResult.assignments || []).map((item) => [item.poiId, item]));
    const pois = (poiResult.pois || []).map((poi) => {
      const assignment = assignments.get(poi.poiId);
      const ring = ringForMinute(assignment?.travelTimeMinuteEstimate, rings);
      if (!ring) return null;
      const level1Code = String(poi.providerCategory?.level1Code || poi.categoryLevel1Code || poi.categoryId || 'unknown');
      const style = app.categoryStyleRegistry?.forCode?.(level1Code);
      return {
        poiId: poi.poiId,
        name: poi.name,
        lon: Number(poi.location?.lon ?? poi.lon),
        lat: Number(poi.location?.lat ?? poi.lat),
        address: poi.address ?? null,
        source: typeof poi.source === 'string' ? poi.source : poi.source?.provider || 'unknown',
        providerCategory: {
          level1Code,
          level1Label: poi.providerCategory?.level1Label || style?.label || level1Code,
        },
        semanticCategory: poi.semanticCategory || null,
        categoryStyleKey: poi.categoryStyleKey || style?.styleKey || `amap-l1-${level1Code}`,
        displayRingId: ring.ringId,
        travelTimeMinuteEstimate: Number(assignment.travelTimeMinuteEstimate),
        travelTimeBand: assignment.travelTimeBand || {
          lowerExclusiveMinutes: Math.max(0, Number(assignment.travelTimeMinuteEstimate) - 1),
          upperInclusiveMinutes: Number(assignment.travelTimeMinuteEstimate),
        },
      };
    }).filter(Boolean).sort((left, right) => left.poiId.localeCompare(right.poiId));
    const identity = {
      center: reachabilityResult.center,
      profile: poiResult.profile,
      rangesMinutes,
      reachabilityFingerprint: poiResult.metadata?.reachabilityFingerprint || poiResult.analysisFingerprint,
      poiQueryFingerprint: poiResult.metadata?.poiQueryFingerprint || poiResult.poiQueryId,
      minuteAccessibilityId: minuteResult.minuteAccessibilityId,
      poiIds: pois.map((poi) => poi.poiId),
    };
    const snapshot = {
      schemaVersion: SCHEMA_VERSION,
      snapshotId: hash(identity),
      generatedAt: new Date().toISOString(),
      center: { ...reachabilityResult.center },
      profile: poiResult.profile,
      rangesMinutes: [...rangesMinutes],
      rings,
      reachabilityFingerprint: identity.reachabilityFingerprint,
      poiQueryFingerprint: identity.poiQueryFingerprint,
      minuteAccessibilityId: minuteResult.minuteAccessibilityId,
      categorySchemaVersion: poiResult.metadata?.categorySchemaVersion || 'amap-poi-l1-v1',
      categoryStyleVersion: app.categoryStyleRegistry?.version || 'amap-category-style-v1',
      pois,
      metadata: {
        sourcePoiCount: (poiResult.pois || []).length,
        eligiblePoiCount: pois.length,
        categoryCount: new Set(pois.map((poi) => poi.providerCategory.level1Code)).size,
        ringCount: rings.length,
        providerCallCount: 0,
      },
    };
    return deepFreeze(snapshot);
  }

  app.panmapInputSnapshot = Object.freeze({
    SCHEMA_VERSION, stableStringify, hash, exclusiveRings, ringForMinute, buildPanmapInputSnapshot,
  });
})(window);
