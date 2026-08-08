const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/api/analysis-client.js'), 'utf8');

test('cycling uses the single formal ORS profile mapping across the UI chain', () => {
  assert.match(app, /const PROFILE_BY_MODE = \{ walk: 'foot-walking', bike: 'cycling-regular', car: 'driving-car' \}/);
  assert.match(app, /\['foot-walking', 'cycling-regular'\]\.includes\(result\.profile\)/);
  assert.match(client, /profile === 'cycling-regular'[\s\S]{0,100}'X-Stage51-Job-ID'/);
  assert.match(client, /publishProfileJob\(profile, jobId/);
});

test('walking and cycling completed results use different session cache keys', () => {
  assert.match(app, /panmap\.stage45\.walking\.completed\.v1/);
  assert.match(app, /panmap\.stage51\.cycling\.completed\.v1/);
  assert.match(app, /PROFILE_RESULT_CACHE_KEYS/);
});

test('profile switching marks an unmatched previous result stale and only restores a local archive', () => {
  const body = app.slice(app.indexOf('async function switchActiveProfile'), app.indexOf('function buildAnalysisRequestFromUI'));
  assert.match(body, /setResultStale\(true\)/);
  assert.match(body, /旧结果已标记 stale/);
  assert.match(body, /fetch\(PROFILE_RESULT_ARCHIVE_PATHS\[profile\]/);
  assert.doesNotMatch(body, /createAnalysis|createNameCloud|createMatrixAccessibility|geocode/);
});

test('Stage 51 publishes only after matrix and layout readiness', () => {
  const body = app.slice(app.indexOf('async function runPanmapWorkflow'), app.indexOf("document.querySelectorAll('[data-nav=\"settings\"]')"));
  assert.match(body, /updateProfileJob\(profile, 'matrix-running'\)/);
  assert.match(body, /updateProfileJob\(profile, 'layout-ready'\)/);
  assert.ok(body.indexOf("updateProfileJob(profile, 'layout-ready')") < body.indexOf('publishProfileJob(profile, jobId)'));
  assert.match(body, /publishProfileResult\(profile, jobId, result\)/);
});
