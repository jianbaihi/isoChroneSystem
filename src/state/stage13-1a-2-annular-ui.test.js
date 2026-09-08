import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../view/panmap-mvp-view.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('developer toolbar retains both baselines and Annular Elastic v1 when later modes are appended', () => {
  assert.match(view, /Bubble Baseline/);
  assert.match(view, /Rectangular Elastic v0/);
  assert.match(view, /Annular Elastic v1/);
  assert.match(view, /data-layout-mode="annular"/);
  assert.match(view, /\['elastic', 'annular', 'natural', 'preview'\]\.includes\(nextMode\)/);
});

test('annular modules load before the view and use the existing single workspace', () => {
  const contractIndex = html.indexOf('annular/contract.js');
  const engineIndex = html.indexOf('annular/engine.js');
  const adapterIndex = html.indexOf('annular-category-adapter.js');
  const viewIndex = html.indexOf('panmap-mvp-view.js');
  assert.ok(contractIndex > 0 && contractIndex < engineIndex && engineIndex < adapterIndex && adapterIndex < viewIndex);
  assert.equal((html.match(/class="[^"]*panmap-workspace[^"]*"/g) || []).length, 1);
  assert.match(view, /viewBox="0 0 860 560"/);
});

test('focus probes cover required acceptance alpha values and animate in 280ms', () => {
  assert.match(view, /data-annular-probe="0\.25"/);
  assert.match(view, /data-annular-probe="0\.5"/);
  assert.match(view, /data-annular-probe="1"/);
  assert.match(view, /const annularAnimationDuration = 280/);
  assert.match(view, /easeInOutCubic/);
  assert.match(view, /previousState: annularResult\.previousState/);
});

test('annular interactions remain local and publish zero provider calls', () => {
  const annularSection = view.slice(view.indexOf('function initializeAnnularLayout'), view.indexOf('function breadcrumb'));
  assert.match(annularSection, /annularCategoryAdapter/);
  assert.match(annularSection, /annularProviderCallCount = '0'/);
  assert.doesNotMatch(annularSection, /analysisClient|fetch\(|XMLHttpRequest|createMinuteAccessibility|buildPanmapInputSnapshot/);
});

test('annular labels are semantic only and hover does not mutate geometry', () => {
  assert.match(view, /category-label/);
  assert.match(view, /metadata\?\.count/);
  assert.match(view, /angleShare/);
  assert.doesNotMatch(view.slice(view.indexOf('function annularSvg'), view.indexOf('function annularMetricsPanel')), /travelTimeMinuteEstimate|\blng\b|\blat\b|\baddress\b/);
  assert.match(styles, /\.annular-region:hover path/);
  const hoverRule = styles.match(/\.annular-region:hover path[^}]+}/)?.[0] || '';
  assert.doesNotMatch(hoverRule, /transform|stroke-width:\s*[2-9]/);
});
