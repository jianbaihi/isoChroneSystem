(function initPanmapLayoutAdapter(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  const THEMES = {
    food: { color: '#f6c75f', text: '#c86b00', icon: '♨', angle: -2.36, children: ['火锅', '咖啡', '烧烤', '川菜', '甜品', '串串香'] },
    shopping: { color: '#f2aebc', text: '#c83d5f', icon: '▣', angle: -0.94, children: ['商超', '百货', '购物中心', '便利店', '综合市场'] },
    hotel: { color: '#c3a9e5', text: '#7147b1', icon: '▣', angle: 0.42, children: ['连锁酒店', '经济酒店', '民宿', '公寓酒店'] },
    service: { color: '#9bd6d0', text: '#18857f', icon: '⌁', angle: 1.48, children: ['银行', '美容服务', 'ATM', '菜鸟驿站'] },
    transit: { color: '#8fc4f3', text: '#1671c9', icon: '▤', angle: 2.68, children: ['地铁站', '停车场', '公交站', 'P+R'] },
    medical: { color: '#efb6cc', text: '#c7577b', icon: '✚', angle: -2.14, children: ['综合医院', '专科医院', '眼科', '药店'] },
    scenic: { color: '#f2d7a4', text: '#bf8430', icon: '♜', angle: -1.05, children: ['博物馆', '展览馆', '植物园', '科技馆'] },
    leisure: { color: '#f4c9af', text: '#d97955', icon: '☺', angle: -0.2, children: ['电影院', 'KTV', '桌游馆'] },
    education: { color: '#cbb4ed', text: '#7652b7', icon: '◆', angle: 2.8, children: ['早教', '少儿编程', '职业培训', '艺术培训'] },
  };
  const DEFAULT_THEME = { color: '#c8ddb1', text: '#5e7f42', icon: '⌖', angle: -Math.PI / 2, children: ['便民服务'] };
  const LAYER_THEME = [
    { targetRadius: 92, maxRadius: 150, bandwidth: 24, fill: '#edf5e7', stroke: '#6c9d49' },
    { targetRadius: 200, maxRadius: 285, bandwidth: 30, fill: '#f5f9fe', stroke: '#1677f3' },
    { targetRadius: 365, maxRadius: 445, bandwidth: 34, fill: '#faf6fc', stroke: '#9f78dc' },
  ];
  const NAME_CLOUD_THEME = [
    { targetRadius: 120, maxRadius: 178, fill: '#edf5e7', stroke: '#35a866', text: '#257b4a' },
    { targetRadius: 222, maxRadius: 300, fill: '#f2f7ff', stroke: '#2878ef', text: '#1b5fc6' },
    { targetRadius: 344, maxRadius: 458, fill: '#faf5fc', stroke: '#9f78dc', text: '#754eab' },
  ];

  function themeFor(categoryId, index) {
    return THEMES[categoryId] || Object.values(THEMES)[index % Object.values(THEMES).length] || DEFAULT_THEME;
  }

  function radiusFor(count, level) {
    const base = level === 1 ? 22 : 16;
    return Math.max(base, Math.min(level === 1 ? 54 : 28, base + Math.sqrt(Math.max(count, 1)) * (level === 1 ? 2.6 : 1.8)));
  }

  function labelFor(category) {
    return String(category?.label || app.categoryLabels?.labelFor(category?.categoryId) || category?.categoryId || '未命名类别');
  }

  function poiPrimaryPath(poi) {
    return app.categoryTree?.primaryPathForPoi
      ? app.categoryTree.primaryPathForPoi(poi)
      : (poi?.category?.hierarchy || [poi?.category?.primaryCategoryId || poi?.categoryId].filter(Boolean));
  }

  function buildCategory(category, categoryPois, ring, categoryIndex, tree, focusPath) {
    const theme = themeFor(category.categoryId, categoryIndex);
    const node = tree?.nodes?.get(category.categoryId) || category;
    const childNodes = (node.childCategoryIds || [])
      .map((childId) => tree?.nodes?.get(childId))
      .filter(Boolean);
    const children = childNodes.length
      ? childNodes.map((child) => {
        const childPois = categoryPois.filter((poi) => poiPrimaryPath(poi).includes(child.categoryId));
        return {
          label: labelFor(child),
          categoryId: child.categoryId,
          hasChildren: Boolean(child.childCategoryIds?.length),
          categoryPath: [...focusPath, category.categoryId, child.categoryId],
          radius: radiusFor(childPois.length, 2),
          poiIds: childPois.map((poi) => poi.poiId),
          count: childPois.length,
        };
      }).filter((child) => child.poiIds.length > 0 || node.matchedPoiCount > 0).slice(0, 8)
      : categoryPois.map((poi) => ({
        label: String(poi.name || labelFor(category)),
        categoryId: category.categoryId,
        hasChildren: false,
        categoryPath: [...focusPath, category.categoryId],
        radius: radiusFor(1, 2),
        poiIds: [poi.poiId],
        count: 1,
      })).slice(0, 8);
    if (!children.length) {
      theme.children.slice(0, 3).forEach((label) => children.push({ label, radius: 18, poiIds: [] }));
    }
    return {
      name: labelFor(category),
      categoryId: category.categoryId,
      ringId: ring.ringId,
      categoryPath: [...focusPath, category.categoryId],
      hasChildren: childNodes.length > 0,
      color: theme.color,
      text: theme.text,
      icon: theme.icon,
      angle: theme.angle + categoryIndex * 0.04,
      parent: {
        label: labelFor(category),
        radius: radiusFor(categoryPois.length, 1),
        count: categoryPois.length,
        poiIds: categoryPois.map((poi) => poi.poiId),
      },
      children,
    };
  }

  function buildNameCloudLayers(result) {
    const pois = Array.isArray(result?.pois) ? result.pois : [];
    const rings = Array.isArray(result?.rings) ? result.rings : [];
    return rings.map((ring, layerIndex) => {
      const visual = NAME_CLOUD_THEME[Math.min(layerIndex, NAME_CLOUD_THEME.length - 1)];
      const labels = pois
        .filter((poi) => poi.ringId === ring.ringId && poi.name)
        .map((poi) => ({
          label: String(poi.name),
          poiId: String(poi.poiId),
          ringId: ring.ringId,
          source: poi.source,
        }))
        .sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans') || left.poiId.localeCompare(right.poiId));
      return {
        mode: 'unclassified-poi-name-cloud',
        time: ring.outerRangeMinutes,
        ringId: ring.ringId,
        targetRadius: visual.targetRadius,
        maxRadius: visual.maxRadius,
        bandwidth: 0,
        fill: visual.fill,
        stroke: visual.stroke,
        text: visual.text,
        labels,
      };
    });
  }

  function buildPanmapLayers(result, options = {}) {
    if (result?.metadata?.panmapMode === 'unclassified-poi-name-cloud' || result?.nameCloud?.mode === 'unclassified-poi-name-cloud') {
      return buildNameCloudLayers(result);
    }
    const pois = Array.isArray(result?.pois) ? result.pois : [];
    const categories = Array.isArray(result?.categories) ? result.categories : [];
    const rings = Array.isArray(result?.rings) ? result.rings : [];
    const tree = app.categoryTree?.buildCategoryTree ? app.categoryTree.buildCategoryTree(categories) : null;
    const requestedPath = options.categoryFocusPath || options.categoryPath || [];
    const focusPath = tree && app.categoryTree ? app.categoryTree.fallbackFocusPath(tree, requestedPath) : [];
    const visibleNodes = tree && app.categoryTree
      ? app.categoryTree.visibleNodes(tree, focusPath)
      : categories;
    const visibleTopLevels = options.visibleTopLevelCategoryIds == null
      ? null
      : new Set(options.visibleTopLevelCategoryIds.map(String));
    return rings.map((ring, layerIndex) => {
      const visual = LAYER_THEME[Math.min(layerIndex, LAYER_THEME.length - 1)];
      const ringPois = pois.filter((poi) => poi.ringId === ring.ringId);
      const layerCategories = visibleNodes
        .filter((category) => {
          if (!visibleTopLevels || focusPath.length) return true;
          const rootId = category.topLevelId || category.categoryId;
          return visibleTopLevels.has(rootId);
        })
        .map((category, categoryIndex) => ({
          category,
          categoryPois: ringPois.filter((poi) => app.categoryTree?.isPoiInCategory
            ? app.categoryTree.isPoiInCategory(poi, category.categoryId)
            : poi.categoryId === category.categoryId),
          categoryIndex,
        }))
        .filter(({ categoryPois }) => categoryPois.length > 0 || categories.length <= 1)
        .map(({ category, categoryPois, categoryIndex }) => buildCategory(category, categoryPois, ring, categoryIndex, tree, focusPath));
      return {
        time: ring.outerRangeMinutes,
        ringId: ring.ringId,
        targetRadius: visual.targetRadius + layerIndex * 12,
        maxRadius: visual.maxRadius + layerIndex * 16,
        bandwidth: visual.bandwidth,
        fill: visual.fill,
        stroke: visual.stroke,
        categories: layerCategories,
      };
    });
  }

  app.panmapLayoutAdapter = Object.freeze({ buildPanmapLayers });
})(window);
