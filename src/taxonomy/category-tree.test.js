const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/category-tree.js`, 'utf8'));
const treeApi = window.PanmapApp.categoryTree;

test('builds hierarchy and exposes only direct children', () => {
  const tree = treeApi.buildCategoryTree([
    { categoryId: 'food_and_drink', depth: 0, childCategoryIds: ['restaurant'] },
    { categoryId: 'restaurant', parentCategoryId: 'food_and_drink', depth: 1, childCategoryIds: ['hot_pot_restaurant'] },
    { categoryId: 'hot_pot_restaurant', parentCategoryId: 'restaurant', depth: 2 },
  ]);
  assert.deepEqual(treeApi.visibleNodes(tree, []).map((node) => node.categoryId), ['food_and_drink']);
  assert.deepEqual(treeApi.visibleNodes(tree, ['food_and_drink']).map((node) => node.categoryId), ['restaurant']);
  assert.deepEqual(treeApi.visibleNodes(tree, ['food_and_drink', 'restaurant']).map((node) => node.categoryId), ['hot_pot_restaurant']);
});

test('alternates are not interpreted as primary path', () => {
  const tree = treeApi.buildCategoryTree([{ categoryId: 'food_and_drink', depth: 0 }]);
  assert.equal(treeApi.isPoiInCategory({ category: { hierarchy: ['food_and_drink'], alternateIds: ['shopping'] } }, 'shopping'), false);
});

test('falls back to the deepest valid ancestor', () => {
  const tree = treeApi.buildCategoryTree([
    { categoryId: 'food_and_drink', depth: 0, childCategoryIds: ['restaurant'] },
    { categoryId: 'restaurant', parentCategoryId: 'food_and_drink', depth: 1 },
  ]);
  assert.deepEqual(treeApi.fallbackFocusPath(tree, ['food_and_drink', 'restaurant', 'missing']), ['food_and_drink', 'restaurant']);
});
