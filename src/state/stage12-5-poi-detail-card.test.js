const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/adapters/traditional-map-adapter.js'), 'utf8');

test('page contains exactly one hover card and one detail dialog', () => {
  assert.equal((html.match(/id="poiHoverCard"/g) || []).length, 1);
  assert.equal((html.match(/id="poiDetailCard"/g) || []).length, 1);
  assert.match(html, /id="poiHoverCard"[^>]+role="tooltip"/);
  assert.match(html, /id="poiDetailCard"[^>]+role="dialog"/);
});

test('cards lazily consume PoiDetailViewModel and never prebuild one card per POI', () => {
  assert.match(app, /const view = window\.buildPoiDetailViewModel\(poiId\)/);
  assert.doesNotMatch(app, /poiResult\.pois\.(?:map|forEach)\([^)]*(?:Card|ViewModel)/);
  assert.doesNotMatch(app, /createElement\([^)]*(?:card|dialog)/i);
});

test('hover and selected POI updates use filter-only map operations', () => {
  const body = adapter.slice(adapter.indexOf('function updatePoiInteractionFilters'), adapter.indexOf('function updatePoiVisibility'));
  assert.match(body, /setFilter\(POI_SELECTED_LAYER_ID/);
  assert.match(body, /setFilter\(POI_HOVER_LAYER_ID/);
  assert.doesNotMatch(body, /setData|buildPoiFeatures|fitBounds/);
});

test('detail supports close, Escape and optional-field hiding', () => {
  assert.match(app, /poiDetailClose\?\.addEventListener\('click', closePoiDetailCard\)/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /row\.hidden = view\[field\] == null/);
  assert.match(app, /\['http:', 'https:'\]\.includes/);
});
