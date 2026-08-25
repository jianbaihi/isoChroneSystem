const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'app-config.js'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function loadConfig(runtimeConfig) {
  const window = runtimeConfig
    ? { APP_RUNTIME_CONFIG: runtimeConfig, PanmapApp: {} }
    : { PanmapApp: {} };
  vm.runInNewContext(source, { window });
  return window.PanmapApp.config;
}

test('local development defaults API requests to the FastAPI server, not the static server', () => {
  assert.equal(loadConfig().apiBaseUrl, 'http://127.0.0.1:8000/api/v1');
});

test('runtime API override remains supported and trailing slashes are removed', () => {
  assert.equal(
    loadConfig({ apiBaseUrl: 'https://example.test/panmap/api/v1/' }).apiBaseUrl,
    'https://example.test/panmap/api/v1',
  );
});

test('HTML cache-busts both API configuration and client together', () => {
  const configVersion = html.match(/src\/config\/app-config\.js\?v=([^"']+)/)?.[1];
  const clientVersion = html.match(/src\/api\/analysis-client\.js\?v=([^"']+)/)?.[1];
  assert.equal(configVersion, '20260825-online-api-fix');
  assert.equal(clientVersion, configVersion);
});
