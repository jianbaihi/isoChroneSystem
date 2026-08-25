(function initCategoryTree(global) {
  const app = global.PanmapApp = global.PanmapApp || {};

  function normalizeNode(category) {
    return {
      ...category,
      categoryId: String(category.categoryId),
      parentCategoryId: category.parentCategoryId ? String(category.parentCategoryId) : null,
      depth: Number(category.depth ?? category.level ?? 0),
      childCategoryIds: Array.isArray(category.childCategoryIds)
        ? [...new Set(category.childCategoryIds.map(String))]
        : [],
      matchedPoiCount: Number(category.matchedPoiCount || 0),
      returnedPoiCount: Number(category.returnedPoiCount || 0),
    };
  }

  function buildCategoryTree(categories = []) {
    const nodes = new Map();
    categories.filter(Boolean).forEach((category) => {
      const node = normalizeNode(category);
      if (!nodes.has(node.categoryId)) nodes.set(node.categoryId, node);
    });
    nodes.forEach((node) => {
      const children = new Set(node.childCategoryIds);
      nodes.forEach((candidate) => {
        if (candidate.parentCategoryId === node.categoryId) children.add(candidate.categoryId);
      });
      node.childCategoryIds = [...children].filter((id) => nodes.has(id)).sort((a, b) => {
        const left = nodes.get(a); const right = nodes.get(b);
        return (left.depth - right.depth) || a.localeCompare(b);
      });
    });
    const roots = [...nodes.values()]
      .filter((node) => !node.parentCategoryId || !nodes.has(node.parentCategoryId))
      .sort((a, b) => (a.depth - b.depth) || a.categoryId.localeCompare(b.categoryId));
    return { nodes, roots };
  }

  function pathIsValid(tree, path = []) {
    return path.every((categoryId, index) => {
      const node = tree.nodes.get(categoryId);
      if (!node) return false;
      if (index === 0) return tree.roots.some((root) => root.categoryId === categoryId);
      return tree.nodes.get(path[index - 1])?.childCategoryIds.includes(categoryId) || node.parentCategoryId === path[index - 1];
    });
  }

  function fallbackFocusPath(tree, path = []) {
    const next = [];
    for (const categoryId of path) {
      const candidate = [...next, categoryId];
      if (!pathIsValid(tree, candidate)) break;
      next.push(categoryId);
    }
    return next;
  }

  function visibleNodes(tree, path = []) {
    const validPath = fallbackFocusPath(tree, path);
    if (!validPath.length) return tree.roots;
    const parent = tree.nodes.get(validPath[validPath.length - 1]);
    return (parent?.childCategoryIds || []).map((id) => tree.nodes.get(id)).filter(Boolean);
  }

  function primaryPathForPoi(poi) {
    return poi?.category?.hierarchy || (poi?.categoryId ? [poi.categoryId] : []);
  }

  function isPoiInCategory(poi, categoryId) {
    return primaryPathForPoi(poi).includes(categoryId);
  }

  app.categoryTree = Object.freeze({
    buildCategoryTree,
    pathIsValid,
    fallbackFocusPath,
    visibleNodes,
    primaryPathForPoi,
    isPoiInCategory,
  });
})(window);
