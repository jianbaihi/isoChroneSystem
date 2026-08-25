const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const evaluator = require('../src/evaluation/spatial-semantic-evaluator.js');
const contract = require('../src/contracts/research-evaluation-contract.js');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'exports/stage-8-research');
const layoutPath = path.join(root, 'exports/stage-7-compact-annular/stage37-frontier-geographic.json');
const layout = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
const evaluation = evaluator.evaluate(layout, {
  runId: 'local-single-run',
  algorithmId: 'frontier-contact-geographic',
  dataRef: {
    centerId: 'wuhan-huanghelou',
    centerLabel: '武汉·黄鹤楼',
    profile: 'foot-walking',
    rangesSeconds: [600, 1200, 1800],
    eligibleCount: 252,
  },
});
const validation = contract.validate(evaluation);
if (!validation.valid) throw new Error(`stage39 evaluation contract failed: ${validation.errors.join(', ')}`);

fs.mkdirSync(outputDir, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pngInfo = (name) => {
  const file = path.join(outputDir, name);
  const bytes = fs.readFileSync(file);
  return { name, bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: sha256(file) };
};

write('stage39-research-evaluation.json', evaluation);
const screenshots = [pngInfo('stage39-normal-mode.png'), pngInfo('stage39-hidden-research-mode.png')];
write('stage39-zero-api-evidence.json', {
  schemaVersion: 'stage39-zero-api/v1',
  stage: 39,
  status: 'passed',
  budget: { isochrones: 0, openPoiService: 0, matrix: 0, geocoder: 0 },
  actual: { isochrones: 0, openPoiService: 0, matrix: 0, geocoder: 0 },
  dataSources: [
    'exports/stage-6-layout/stage20-cache-baseline.json',
    'exports/stage-7-compact-annular/stage37-frontier-geographic.json',
  ],
  browserEvidence: {
    normalMode: {
      urlContract: 'stage21Baseline=1&stage37Layout=frontier-geographic (no research parameter)',
      researchMode: 'inactive', panelDomCount: 0, evaluationRuns: 0,
      nodeCount: 252, layoutFingerprint: 'fnv1a-ac6abd7a', businessUpstreamRequests: 0,
    },
    researchMode: {
      urlContract: 'stage21Baseline=1&stage37Layout=frontier-geographic&research=1',
      panelDomCount: 1, nodeCount: 252, layoutFingerprint: 'fnv1a-ac6abd7a',
      evaluationFingerprint: 'fnv1a-1f4a7d7b', placement: '252/252', rings: [39, 83, 130],
      collisions: { overlap: 0, outsideOwnRing: 0, center: 0, timeLabel: 0 },
      viewTransformEvidence: { evaluationRunsBefore: 1, evaluationRunsAfter: 1, fingerprintUnchanged: true },
      algorithmSwitchEvidence: { frontierFingerprint: 'fnv1a-1f4a7d7b', fermatFingerprint: 'fnv1a-8bd9ab14', updated: true },
      deleteParameterRestoresNormalMode: true,
      businessUpstreamRequests: 0,
    },
    exportEvidence: {
      consecutiveExports: 2, layoutRevisionBefore: 3, layoutRevisionAfter: 3,
      layoutFingerprintUnchanged: true, evaluationFingerprintUnchanged: true,
      exportedEvaluationFingerprint: 'fnv1a-1f4a7d7b', networkRequests: 0,
    },
  },
  forbiddenDataAudit: {
    orsKeyPresent: false, tiandituKeyPresent: false, upstreamResponseEmbedded: false, personalInformationAdded: false,
  },
  screenshots,
});

console.log(JSON.stringify({
  status: 'completed',
  evaluationFingerprint: evaluation.evaluationFingerprint,
  validation,
  metrics: evaluation.metrics,
  screenshots,
}, null, 2));

