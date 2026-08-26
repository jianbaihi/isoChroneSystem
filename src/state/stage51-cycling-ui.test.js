const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/api/analysis-client.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('cycling uses the single formal ORS profile mapping across the UI chain', () => {
  assert.match(app, /const PROFILE_BY_MODE = \{ walk: 'foot-walking', bike: 'cycling-regular', car: 'driving-car' \}/);
  assert.match(app, /\['foot-walking', 'cycling-regular', 'driving-car'\]\.includes\(result\.profile\)/);
  assert.match(client, /profile === 'cycling-regular'[\s\S]{0,100}'X-Stage51-Job-ID'/);
  assert.match(client, /publishProfileJob\(profile, jobId/);
});

test('walking and cycling completed results use different session cache keys', () => {
  assert.match(app, /panmap\.stage45\.walking\.completed\.v1/);
  assert.match(app, /panmap\.stage51\.cycling\.completed\.v1/);
  assert.match(app, /PROFILE_RESULT_CACHE_KEYS/);
});

test('profile switching is a lightweight state transition without cache hydration or upstream work', () => {
  const body = app.slice(app.indexOf('async function switchActiveProfile'), app.indexOf('function buildAnalysisRequestFromUI'));
  assert.match(body, /setResultStale\(true\)/);
  assert.match(body, /旧结果已标记为 stale/);
  assert.match(body, /setPoiVisibility\(false\)/);
  assert.doesNotMatch(body, /sessionStorage\.getItem|JSON\.parse|fetch\(|applyAnalysisResultToPanmap/);
  assert.doesNotMatch(body, /createAnalysis|createNameCloud|createMatrixAccessibility|createMinuteAccessibility|geocode/);
});

test('online workflow separates isochrones, POI, minute spatial timing and local panmap layout', () => {
  for (const id of ['generateButton', 'poiQueryButton', 'matrixButton', 'nameCloudButton']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  const reachability = app.slice(app.indexOf('async function runReachabilityWorkflow'), app.indexOf('async function runPanmapWorkflow'));
  assert.match(reachability, /runAnalysis\(\)/);
  assert.doesNotMatch(reachability, /runNameCloud|runMatrixAccessibility|publishProfileJob/);
  assert.match(app, /poiQueryButton\?\.addEventListener\('click', runNameCloud\)/);
  assert.match(app, /matrixButton\?\.addEventListener\('click', runSpatialTimeAccessibility\)/);
  assert.match(app, /createMinuteAccessibility/);
  assert.doesNotMatch(app, /requestMinuteIsochroneBatch/);
  const body = app.slice(app.indexOf('async function runPanmapWorkflow'), app.indexOf("document.querySelectorAll('[data-nav=\"settings\"]')"));
  assert.match(body, /result\?\.metadata\?\.spatialTime/);
  assert.match(body, /applyAnalysisResultToPanmap\(result\)/);
  assert.doesNotMatch(body, /createAnalysis|createNameCloud|createMatrixAccessibility|publishProfileJob/);
});

test('arbitrary current thresholds drive API requests and time-layer cycling', () => {
  assert.match(app, /normalizeDraftRanges\(draft\.rangesMinutes\)/);
  assert.match(app, /result\.cumulativeIsochrones\.length === result\.rangesMinutes\.length/);
  const toolbarBody = app.slice(app.indexOf("toolbarTimeButton.addEventListener('click'"), app.indexOf("panmapArt.addEventListener('mouseover'"));
  assert.match(toolbarBody, /lastSuccessfulResult\?\.rangesMinutes/);
  assert.doesNotMatch(toolbarBody, /\['10', '20', '30'\]/);
});
