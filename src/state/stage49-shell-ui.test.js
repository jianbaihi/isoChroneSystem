const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const panmapLayout = fs.readFileSync(path.join(root, 'panmap-layout.js'), 'utf8');
const mapAdapter = fs.readFileSync(path.join(root, 'src/adapters/traditional-map-adapter.js'), 'utf8');

test('panmap entry exposes the four-state view transition and a neutral full-canvas skeleton', () => {
  for (const state of ['map-view', 'panmap-entering-skeleton', 'panmap-entering-panel', 'panmap-ready']) {
    assert.match(`${html}\n${css}\n${app}`, new RegExp(state));
  }
  assert.match(html, /id="panmapSkeleton"/);
  assert.match(css, /\.panmap-skeleton[\s\S]{0,220}background: #f3f6f8/);
  const skeletonBlock = css.slice(css.indexOf('.panmap-skeleton'), css.indexOf('.map-legend { gap: 9px; }'));
  assert.doesNotMatch(skeletonBlock, /#f00\b|#ff0000\b|rgb\(255\s*,\s*0\s*,\s*0\)/i);
  assert.match(app, /transitionend/);
  assert.match(app, /stage49ShellTransition/);
  assert.match(css, /panmap-entering-skeleton \.config-panel[\s\S]{0,180}display: none/);
  assert.match(app, /!appShell\.classList\.contains\('is-panmap'\)[\s\S]{0,120}rect\.width < 2/);
  assert.match(panmapLayout, /!shell\?\.classList\.contains\('panmap-ready'\)[\s\S]{0,120}rect\.width < 2/);
});

test('favicon and compact workbench switch use one DOM root', () => {
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg"/);
  assert.equal((html.match(/id="panmapControlPanel"/g) || []).length, 1);
  assert.equal((html.match(/class="panmap-research-switch"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="panmap-mode-switch"/);
});

test('map picking uses one center-selection entry and never calls an upstream client', () => {
  const pickBody = app.slice(app.indexOf('function updateDraftCenterFromMap'), app.indexOf('function startMapPickMode'));
  assert.match(pickBody, /setCenterSelection/);
  assert.match(pickBody, /source: 'map-pick'/);
  assert.doesNotMatch(pickBody, /fetch\(|geocode|createAnalysis|runAnalysis|runNameCloud|runMatrix/);
  assert.match(app, /resultStale/);
  assert.match(html, /id="staleResultBanner"/);
  assert.match(html, /id="centerSelectionLive" role="status" aria-live="polite"/);
  assert.match(mapAdapter, /map\.dragPan\.disable/);
  assert.match(mapAdapter, /map-pick-cursor\.svg/);
});

test('palette is the only source for threshold and MapLibre ring colors', () => {
  assert.match(html, /src\/config\/isochrone-palette\.js/);
  assert.match(app, /ISOCHRONE_PALETTE\?\.paletteForRanges/);
  assert.match(mapAdapter, /ISOCHRONE_PALETTE\.maplibreMatchExpression/);
  assert.doesNotMatch(app, /const thresholdPalette =/);
});
