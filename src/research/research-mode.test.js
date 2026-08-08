const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const contract = require('../contracts/research-evaluation-contract.js');

const source = fs.readFileSync(`${__dirname}/research-mode.js`, 'utf8');
const html = fs.readFileSync(`${__dirname}/../../index.html`, 'utf8');

test('research capability mounts once and is controlled by the shared mode store', () => {
  assert.doesNotMatch(source, /new URLSearchParams|location\.search/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /function setEnabled\(active\)/);
  assert.match(source, /mount\(\);/);
});

test('page exposes the explicit accessible ordinary and research switch', () => {
  assert.doesNotMatch(html, /id="hiddenResearchPanel"/);
  assert.match(html, /class="panmap-research-switch" id="panmapModeSwitch"/);
  assert.match(html, /role="switch" aria-checked="false"/);
  assert.match(html, /<span>普通<\/span>/);
  assert.match(html, /<span>研究<\/span>/);
  assert.match(html, /src\/research\/research-mode\.js/);
  assert.doesNotMatch(html, />方位保持径向（实验）</);
});

test('shared workspace owns presets and density while research adds parameter schemas', () => {
  for (const label of ['地理优先','均衡模式','紧凑优先','精简','标准','丰富']) assert.match(html, new RegExp(label));
  assert.match(source, /parameterSchemas/);
  assert.match(source, /stage47AlgorithmParameters/);
  assert.match(source, /dataset\.modeCapability = 'research'/);
});

test('mode visibility and export perform no network or automatic experiment run', () => {
  assert.match(source, /stage33-radial-layout-ready/);
  assert.doesNotMatch(source, /stage33-radial-view-resize/);
  const exportBody = source.slice(source.indexOf('function exportExperiment'), source.indexOf('function updateCurrentBaseline'));
  assert.doesNotMatch(exportBody, /fetch\(|rebuildPanmapLayout/);
  assert.doesNotMatch(exportBody, /\.run\(/);
  const visibilityBody = source.slice(source.indexOf('function setEnabled'), source.indexOf('mount();'));
  assert.doesNotMatch(visibilityBody, /fetch\(|runExperiment\(|applyReadableView\(/);
});

test('generated stage39 JSON satisfies the research evaluation contract', () => {
  const evaluation = JSON.parse(fs.readFileSync(`${__dirname}/../../exports/stage-8-research/stage39-research-evaluation.json`, 'utf8'));
  assert.deepEqual(contract.validate(evaluation), { valid: true, errors: [] });
  assert.equal(evaluation.metrics.completeness.placedCount, 252);
});
