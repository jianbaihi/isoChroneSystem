const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(`${__dirname}/center-presets.js`, 'utf8'));

test('freezes the confirmed Wuhan default and Paris live preset', () => {
  const centers = window.PanmapApp.centerPresets;
  assert.equal(window.PanmapApp.defaultCenterPresetId, 'wuhan-huanghelou');
  assert.deepEqual([centers['wuhan-huanghelou'].lon, centers['wuhan-huanghelou'].lat], [114.296944, 30.546944]);
  assert.deepEqual([centers['paris-eiffel-tower'].lon, centers['paris-eiffel-tower'].lat], [2.294478, 48.858297]);
  assert.equal(centers['wuhan-huanghelou'].label, '武汉·黄鹤楼');
  assert.equal(centers['paris-eiffel-tower'].label, '巴黎·埃菲尔铁塔');
});
