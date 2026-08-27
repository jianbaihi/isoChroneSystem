const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('AMap completeness UI sends explicit normalized categories and exposes audit data', () => {
  const categories = ['attraction', 'nature', 'food', 'lodging', 'transport', 'education', 'health', 'shopping', 'entertainment', 'service', 'public', 'other'];
  for (const category of categories) assert.match(html, new RegExp(`data-poi="${category}"`));
  assert.equal((html.match(/data-category-count/g) || []).length, categories.length);
  assert.match(app, /const categoryIds = selectedCategoryLabels\.map/);
  assert.doesNotMatch(app, /selectedCategories\.length === poiCategoryButtons\.length \? \[\]/);
  assert.match(app, /dataset\.poiCompleteness = JSON\.stringify\(audit\)/);
});
