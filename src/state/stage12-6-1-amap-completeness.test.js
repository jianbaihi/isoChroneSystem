const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('AMap completeness UI sends explicit normalized categories and exposes audit data', () => {
  const categories = JSON.parse(fs.readFileSync('data/provider-taxonomy/amap/level1.json', 'utf8')).categories;
  assert.equal(categories.length, 20);
  assert.match(html, /id="amapCategoryGrid"/);
  assert.match(app, /data-category-count/);
  assert.match(app, /const categoryIds = selectedCategoryLabels;/);
  assert.doesNotMatch(app, /selectedCategories\.length === poiCategoryButtons\.length \? \[\]/);
  assert.match(app, /dataset\.poiCompleteness = JSON\.stringify\(audit\)/);
});
