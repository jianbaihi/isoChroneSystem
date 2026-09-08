import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../view/panmap-mvp-view.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('developer workspace exposes Natural Annular v2 without removing prior modes', () => {
  for (const label of ['Bubble Baseline', 'Rectangular Elastic v0', 'Annular Elastic v1', 'Natural Annular v2']) assert.match(view, new RegExp(label));
  assert.match(view, /data-layout-mode="natural"/);
  assert.match(view, /naturalSvg\(\)/);
  assert.match(view, /naturalMetricsPanel\(\)/);
});

test('natural mode publishes audit and performance datasets', () => {
  for (const field of ['naturalGapRatio', 'naturalOverlapRatio', 'naturalBoundaryCrossings', 'naturalSelfIntersections', 'naturalWarmStart', 'naturalProviderCallCount', 'naturalBoundaryFingerprint']) assert.match(view, new RegExp(field));
  assert.match(view, /naturalAnimationDuration = 320/);
});

test('natural scripts load before the view and visuals preserve thin shared seams', () => {
  assert.ok(index.indexOf('natural-boundary/engine.js') < index.indexOf('panmap-mvp-view.js'));
  assert.match(styles, /\.natural-region path/);
  const rule = styles.match(/\.natural-region path[^}]+}/)?.[0] || '';
  assert.match(rule, /stroke-width: \.9/);
  assert.match(styles, /\.panmap-dev-toolbar \{ position: absolute;[^}]+flex-wrap: wrap/);
});
