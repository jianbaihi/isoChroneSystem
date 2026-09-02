(function initPanmapMvpLayout(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  function aggregateCategories(snapshot, limit = 10) {
    return snapshot.rings.map((ring) => {
      const groups = new Map();
      snapshot.pois.filter((poi) => poi.displayRingId === ring.ringId).forEach((poi) => {
        const code = poi.providerCategory.level1Code;
        if (!groups.has(code)) groups.set(code, {
          nodeId: `${ring.ringId}:${code}`, nodeType: 'category-cluster', ringId: ring.ringId,
          categoryCode: code, categoryLabel: poi.providerCategory.level1Label,
          poiCount: 0, weight: 0, styleKey: poi.categoryStyleKey,
        });
        const item = groups.get(code);
        item.poiCount += 1;
        item.weight = item.poiCount;
      });
      const sorted = [...groups.values()].sort((a, b) => b.poiCount - a.poiCount || a.categoryCode.localeCompare(b.categoryCode));
      if (sorted.length <= limit) return { ring, nodes: sorted };
      const visible = sorted.slice(0, limit);
      const rest = sorted.slice(limit);
      visible.push({
        nodeId: `${ring.ringId}:other`, nodeType: 'category-cluster', ringId: ring.ringId,
        categoryCode: 'other', categoryLabel: '其他', poiCount: rest.reduce((sum, item) => sum + item.poiCount, 0),
        weight: rest.reduce((sum, item) => sum + item.weight, 0), styleKey: 'amap-l1-unknown', aggregatedCodes: rest.map((item) => item.categoryCode),
      });
      return { ring, nodes: visible };
    });
  }

  function buildOverviewLayout(snapshot, width = 920, height = 720) {
    const cx = width / 2;
    const cy = height / 2;
    const ringStep = Math.min(width, height) / (snapshot.rings.length * 2 + 1.6);
    return aggregateCategories(snapshot).map(({ ring, nodes }, ringIndex) => {
      const radius = ringStep * (ringIndex + 1.15);
      const total = Math.max(1, nodes.reduce((sum, node) => sum + node.weight, 0));
      let cursor = -Math.PI / 2;
      return {
        ...ring,
        radius,
        nodes: nodes.map((node) => {
          const angleSpan = Math.max(0.18, Math.PI * 2 * node.weight / total);
          const angle = cursor + angleSpan / 2;
          cursor += angleSpan;
          const size = Math.max(34, Math.min(76, 26 + Math.sqrt(node.weight) * 6));
          return { ...node, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, radius: size };
        }),
      };
    });
  }

  function selectPoiLabels(snapshot, ringId, categoryCode, limit = 40) {
    const uniqueNames = new Set();
    return snapshot.pois
      .filter((poi) => poi.displayRingId === ringId && (categoryCode === 'other' || poi.providerCategory.level1Code === categoryCode))
      .sort((a, b) => a.travelTimeMinuteEstimate - b.travelTimeMinuteEstimate || a.name.localeCompare(b.name) || a.poiId.localeCompare(b.poiId))
      .filter((poi) => { if (uniqueNames.has(poi.name)) return false; uniqueNames.add(poi.name); return true; })
      .slice(0, limit);
  }

  function layoutPoiLabels(pois, width = 760, height = 540) {
    const placed = [];
    const candidates = [];
    const cx = width / 2;
    const cy = height / 2;
    for (let index = 0; index < 240; index += 1) {
      const angle = index * 2.399963229728653;
      const radius = 18 + 13 * Math.sqrt(index);
      candidates.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    pois.forEach((poi) => {
      const w = Math.min(190, Math.max(68, 30 + poi.name.length * 14));
      const h = 34;
      const candidate = candidates.find((point) => {
        const box = { left: point.x - w / 2, right: point.x + w / 2, top: point.y - h / 2, bottom: point.y + h / 2 };
        if (box.left < 8 || box.right > width - 8 || box.top < 8 || box.bottom > height - 8) return false;
        return placed.every((item) => box.right + 6 < item.box.left || box.left - 6 > item.box.right || box.bottom + 6 < item.box.top || box.top - 6 > item.box.bottom);
      });
      if (!candidate) return;
      placed.push({ poi, x: candidate.x, y: candidate.y, box: { left: candidate.x - w / 2, right: candidate.x + w / 2, top: candidate.y - h / 2, bottom: candidate.y + h / 2 }, width: w, height: h });
    });
    return { labels: placed, visiblePoiCount: placed.length, hiddenPoiCount: Math.max(0, pois.length - placed.length), overlapCount: 0 };
  }

  app.panmapMvpLayout = Object.freeze({ aggregateCategories, buildOverviewLayout, selectPoiLabels, layoutPoiLabels });
})(window);
