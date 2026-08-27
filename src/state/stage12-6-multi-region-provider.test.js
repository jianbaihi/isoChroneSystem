const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const contractBody = fs.readFileSync('src/contracts/poi-detail-contract.js', 'utf8');

function loadContract() {
  const sandbox = { window: { PanmapApp: {} } };
  vm.runInNewContext(contractBody, sandbox);
  return sandbox.window.PanmapApp.poiDetailContract;
}

test('ordinary UI exposes one compact automatic provider status', () => {
  assert.equal((html.match(/id="poiProviderStatus"/g) || []).length, 1);
  assert.match(app, /POI 数据源：自动 · \$\{providerLabel\}/);
  assert.match(app, /正在通过\$\{likelyChina \? '高德地图' : 'Foursquare'\}查询 POI/);
});

test('AMap and Foursquare consume the same provider-independent detail contract', () => {
  const contract = loadContract();
  for (const [provider, label] of [['amap', '高德地图'], ['foursquare', 'Foursquare']]) {
    const result = { pois: [{ poiId: `${provider}:1`, name: 'Place', source: provider, location: { lon: 1, lat: 2 }, categoryId: 'food', ringId: 'ring-0-5' }] };
    const detail = contract.buildPoiDetailViewModel(`${provider}:1`, result, null, 'foot-walking');
    assert.equal(detail.providerLabel, label);
    assert.equal(detail.categoryLabel, '餐饮');
  }
  assert.doesNotMatch(contractBody, /if\s*\(\s*provider\s*===\s*['"](?:amap|foursquare)/);
});
