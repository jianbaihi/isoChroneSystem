import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../view/panmap-mvp-view.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('one Panmap workspace owns the main canvas and real traditional mini map', () => {
  assert.equal((html.match(/class="[^"]*panmap-workspace[^"]*"/g) || []).length, 1);
  assert.match(html, /class="map-surface panmap-workspace" id="mapSurface"/);
  assert.match(html, /class="traditional-map-shell panmap-mini-map"/);
  assert.match(view, /panmap-main-canvas panmap-mvp-canvas/);
  assert.match(styles, /\.panmap-main-canvas \{ position: absolute; inset: 0;/);
});

test('Inspector is a collapsible overlay and never creates a canvas column', () => {
  assert.match(view, /data-panmap-inspector-toggle/);
  assert.match(view, /data-inspector-mode/);
  assert.match(styles, /\.panmap-inspector \{ position: absolute;/);
  assert.doesNotMatch(styles.slice(styles.indexOf('/* Stage 13.0 Panmap MVP')), /grid-template-columns:\s*minmax\(0, 1fr\)\s+286px/);
});

test('Mini Map, breadcrumb and developer switch are overlay controls', () => {
  assert.match(view, /data-panmap-mini-map-toggle/);
  assert.match(view, /panmap-breadcrumb panmap-mvp-breadcrumb/);
  assert.match(view, /panmap-dev-toolbar/);
  assert.match(styles, /\.panmap-breadcrumb \{ position: absolute;/);
  assert.match(styles, /\.panmap-dev-toolbar \{ position: absolute;/);
  assert.match(styles, /\.app-shell\.is-panmap \.panmap-mini-map \{ z-index: 20;/);
});

test('safe area and screen scaling remain view-only', () => {
  assert.match(view, /function panmapSafeArea/);
  assert.match(view, /rightInset: inspectorCollapsed \? 20 : 380/);
  assert.match(view, /leftInset: miniMapCollapsed \? 20 : 280/);
  assert.match(view, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(view, /viewBox="0 0 860 560"/);
  assert.doesNotMatch(view, /width:\s*1600|height:\s*900/);
});

test('overlay toggles and canvas pan are local interactions with no Provider work', () => {
  const interaction = view.slice(view.indexOf('function activate'), view.indexOf('function mount'));
  assert.match(interaction, /inspectorCollapsed = !inspectorCollapsed/);
  assert.match(interaction, /miniMapCollapsed = !miniMapCollapsed/);
  assert.match(view, /root\.addEventListener\('pointermove'/);
  assert.doesNotMatch(view, /analysisClient|fetch\(|XMLHttpRequest|createMinuteAccessibility/);
});

test('resize publishes geometry only and does not rebuild snapshot or solver input', () => {
  const resizeSection = view.slice(view.indexOf("global.addEventListener?.('resize'"), view.indexOf('resizeListenerMounted = true'));
  assert.match(resizeSection, /publishWorkspaceLayoutMetrics/);
  assert.doesNotMatch(resizeSection, /initializeElasticLayout|buildPanmapInputSnapshot|solver\.solve|analysisClient/);
  assert.match(view, /panmapWorkspaceMetrics/);
  assert.match(view, /panmapResizeProviderCalls = '0'/);
});
