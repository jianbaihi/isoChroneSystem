const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('control panel exposes native labeled controls and conditional natural settings', () => {
  assert.match(html, /aria-label="泛地图统一工作台"/);
  for (const label of ['地理方位', '随机方位', '圆形', '自然包络', '紧凑度', '字号层次', '应用并重新布局', '恢复默认']) assert.match(html, new RegExp(label));
  assert.match(html, /id="naturalEnvelopeControls" hidden/);
  assert.match(html, /allEligibleRequired" checked disabled/);
});

test('unified workspace keeps ordinary controls and gates research-only capabilities', () => {
  assert.match(html, /id="panmapDataSummary"/);
  assert.match(html, /data-panmap-preset/);
  assert.match(html, /data-panmap-density/);
  assert.match(html, /data-mode-capability="research"/);
  assert.match(css, /\[data-mode-capability="research"\] \{ display: none !important; \}/);
  assert.doesNotMatch(app, /panmapModeStore[\s\S]{0,220}applyAnalysisResultToPanmap/);
});

test('shared shell uses one width token and the panmap collapse control is removed', () => {
  assert.match(css, /--workspace-panel-width: 425px/);
  assert.match(css, /--workspace-panel-canvas-gap: 12px/);
  assert.match(css, /\.config-panel[\s\S]{0,180}var\(--workspace-panel-width\)/);
  assert.match(css, /\.app-shell\.is-panmap \.panmap-control-panel[\s\S]{0,180}var\(--workspace-panel-width\)/);
  assert.doesNotMatch(html, /id="panmapControlCollapse"/);
  assert.doesNotMatch(app, /getElementById\('panmapControlCollapse'\)/);
  assert.match(css, /:focus-visible/);
});

test('input handlers only update draft while formal layout is confined to apply callback', () => {
  assert.match(app, /input\.addEventListener\('input', \(\) => panmapControlStore\.setDraft/);
  assert.match(app, /applyPanmapControls[\s\S]*panmapControlStore\.apply\(\)/);
  assert.doesNotMatch(app, /input\.addEventListener\('input'[\s\S]{0,180}applyAnalysisResultToPanmap/);
});
