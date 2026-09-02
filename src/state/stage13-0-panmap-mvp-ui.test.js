import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../app.js', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../view/panmap-mvp-view.js', import.meta.url), 'utf8');

test('panmap page has an independent MVP workspace and four-state renderer', () => {
  assert.match(html, /id="panmapMvp"/);
  assert.match(html, /panmap-input-snapshot\.js/);
  assert.match(view, /overview/);
  assert.match(view, /ring-focused/);
  assert.match(view, /category-focused/);
  assert.match(view, /poi-selected/);
});

test('panmap entry consumes workflow results and performs no provider request', () => {
  assert.match(app, /workflow\.reachabilityResult, workflow\.poiResult, workflow\.minuteResult/);
  assert.doesNotMatch(view, /analysisClient|fetch\(|XMLHttpRequest/);
  assert.match(view, /buildPoiDetailViewModel/);
});

test('category color comes only from shared CategoryStyleRegistry', () => {
  assert.match(view, /categoryStyleRegistry/);
  assert.doesNotMatch(view, /panmapCategoryColors/);
});
