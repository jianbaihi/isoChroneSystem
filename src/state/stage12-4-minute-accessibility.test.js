const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/api/analysis-client.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('minute action consumes PoiResult and calls only the independent minute endpoint', () => {
  const body = app.slice(app.indexOf('async function runSpatialTimeAccessibility'), app.indexOf('async function runAnalysis'));
  assert.match(body, /const poiResult = state\.data\.workflow\?\.poiResult/);
  assert.match(body, /createMinuteAccessibility\(poiResult/);
  assert.doesNotMatch(body, /createPoiQuery|createMatrixAccessibility|applyAnalysisResultToTraditionalMap|applyAnalysisResultToPanmap|setPois\(/);
});

test('minute client sends only POI references and never sends reachability or minute geometry', () => {
  const body = client.slice(client.indexOf('async function createMinuteAccessibility'), client.indexOf('async function geocode'));
  assert.match(body, /pois: \(poiResult\.pois \|\| \[\]\)\.map/);
  assert.match(body, /maxRangeMinutes: Math\.max/);
  assert.doesNotMatch(body, /baseResult|cumulativeIsochrones|minuteIsochrones|geometry/);
});

test('minute UI exposes a truthful summary and lightweight performance counters', () => {
  assert.match(html, /尚未补齐分钟级通行时间/);
  assert.match(app, /已补齐 \$\{stats\.classifiedPoiCount\} \/ \$\{stats\.totalPoiCount\} 个 POI/);
  assert.match(app, /mapRebuildCalls: 0, poiRenderCalls: 0, panmapLayoutCalls: 0/);
  assert.doesNotMatch(app.slice(app.indexOf('async function runSpatialTimeAccessibility'), app.indexOf('async function runAnalysis')), /travelTimeSeconds|networkDistanceMeters/);
});

test('detail view model is built on demand instead of precreating POI card DOM', () => {
  assert.match(app, /window\.buildPoiDetailViewModel = function buildPoiDetailViewModel/);
  assert.doesNotMatch(app, /querySelectorAll\([^)]*poi[^)]*\)\.forEach\([^)]*buildPoiDetailViewModel/);
});
