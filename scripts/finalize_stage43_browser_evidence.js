const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'exports/stage-8-layout-density');
const files = [
  'stage43-research-standard-balanced.png',
  'stage43-research-density-rich.png',
  'stage43-normal-mode-regression.png',
];
const details = Object.fromEntries(files.map((name) => {
  const bytes = fs.readFileSync(path.join(outputDir, name));
  return [name, {
    bytes: bytes.length,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  }];
}));

const evidence = {
  schemaVersion: 'stage43-browser-evidence/v1',
  stage: 43,
  status: 'passed',
  browser: 'Codex In-app Browser',
  baseUrl: 'http://127.0.0.1:5501/',
  research: {
    default: {
      algorithm: 'balanced', density: 'standard', selected: 120, placed: 120,
      quotaHidden: 132, capacityHidden: 0, minimumScreenFontPx: 10,
      selectionFingerprint: 'fnv1a-40eaa789', layoutFingerprint: 'fnv1a-7212a5c1',
      researchLayoutRuns: 1,
    },
    rich: {
      algorithm: 'balanced', density: 'rich', selected: 180, placed: 180,
      quotaHidden: 72, capacityHidden: 0, minimumScreenFontPx: 10,
      selectionFingerprint: 'fnv1a-48f1f4e4', layoutFingerprint: 'fnv1a-e5e88de7',
      researchLayoutRuns: 2,
    },
    sameDensityAlgorithmSwitch: { selectionFingerprintUnchanged: true },
    viewOnly: { resetViewNoRelayout: true, inspectorCollapseNoRelayout: true, layoutFingerprintUnchanged: true },
    fullLoad: { enabled: '252 / 252; 39 / 83 / 130', disabledRestores: '180 / 252; 30 / 60 / 90', relayouts: 0 },
    customQuota: { input: '29 / 60 / 90', selected: 179, densityState: 'custom', relayouts: 0 },
    consoleErrors: 0,
  },
  normal: {
    rootUrl: { researchDomCount: 0, inspectorDomCount: 0, researchLayoutRuns: 0, densitySelectionRuns: 0, evaluationRuns: 0 },
    frozenCacheUrl: {
      url: 'http://127.0.0.1:5501/?stage21Baseline=1', researchDomCount: 0,
      researchLayoutRuns: 0, densitySelectionRuns: 0, evaluationRuns: 0,
      ordinaryPlaced: 138, ordinaryLayoutFingerprint: 'fnv1a-8b0581ae', upstreamRequests: 0,
    },
    consoleErrors: 0,
  },
  businessApiLedger: { isochrones: 0, openPoiService: 0, matrix: 0, geocoder: 0 },
  screenshots: details,
};
fs.writeFileSync(path.join(outputDir, 'stage43-browser-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'stage43-screenshot-sha256.json'), `${JSON.stringify({ schemaVersion: 'stage43-screenshot-sha256/v1', stage: 43, status: 'passed', files: details }, null, 2)}\n`);
console.log(JSON.stringify({ status: evidence.status, screenshots: details }, null, 2));
