import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../view/panmap-mvp-view.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

test('Stage 13.0 Bubble Baseline remains the default and elastic mode is developer-gated', () => {
  assert.match(view, /let layoutMode = 'bubble'/);
  assert.match(view, /elasticRegion.*=== '1'/);
  assert.match(view, /Bubble Baseline/);
  assert.match(view, /Elastic Region v0/);
  assert.match(view, /layoutMode = 'bubble'/);
});

test('elastic mode modifies only Panmap canvas and preserves inspector and breadcrumb shell', () => {
  assert.match(view, /elasticMode \? elasticSvg\(\)/);
  assert.match(view, /statsPanel\(state/);
  assert.match(view, /panmap-mvp-breadcrumb/);
  assert.match(styles, /\.elastic-region-svg/);
  assert.match(styles, /\.elastic-runtime-metrics/);
});

test('focus uses 280ms alpha animation, warm start and bounded frame iterations', () => {
  assert.match(view, /elasticAnimationDuration = 280/);
  assert.match(view, /previousState: elasticResult/);
  assert.match(view, /iterations: progress === 1 \? 72 : 6/);
  assert.match(view, /animateElastic\(1, categoryCode\)/);
  assert.match(view, /animateElastic\(0/);
});

test('elastic browser code contains no Provider client call and hides POI labels', () => {
  const elasticSection = view.slice(view.indexOf('function initializeElasticLayout'), view.indexOf('function selectedDetail'));
  assert.doesNotMatch(elasticSection, /analysisClient|fetch\(|XMLHttpRequest|createMinuteAccessibility/);
  assert.match(view, /const labelMode = !elasticMode/);
  assert.match(html, /src\/elastic-region\/solver\/elastic-region-solver\.js/);
});
