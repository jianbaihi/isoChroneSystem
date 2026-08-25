const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = { PanmapApp: {} };
for (const file of ['density-presets.js', 'density-selector.js']) vm.runInThisContext(fs.readFileSync(`${__dirname}/${file}`, 'utf8'));
const selector = window.PanmapApp.densitySelector;
const baseline = JSON.parse(fs.readFileSync(`${__dirname}/../../exports/stage-6-layout/stage20-cache-baseline.json`));
const poiById = new Map(baseline.pois.map((poi) => [poi.poiId, poi]));
const eligible = baseline.accessibility.filter((item) => item.matrixStatus === 'ok' && item.travelTimeSeconds <= 1800).map((item) => {
  const poi = poiById.get(item.poiId);
  return { poiId: item.poiId, name: poi.name, longitude: poi.location.lon, latitude: poi.location.lat, travelTimeSeconds: item.travelTimeSeconds, ringId: item.matrixBandId, importance: poi.importance };
});

test('frozen presets select exact mutually-exclusive ring quotas', () => {
  for (const [presetId, counts] of Object.entries({ concise: [10,20,30], standard: [20,40,60], rich: [30,60,90], full: [39,83,130] })) {
    const result = selector.select(eligible, { presetId });
    assert.deepEqual(result.rings.map((ring) => ring.selectedCount), counts);
    assert.equal(result.selectedCount, counts.reduce((sum, value) => sum + value, 0));
  }
});

test('underfilled and empty rings stay underfilled without cross-ring backfill or placeholders', () => {
  const sample = eligible.filter((item) => item.ringId !== 'ring-20-30').slice(0, 7);
  const result = selector.select(sample, { presetId: 'standard' });
  assert.equal(result.selectedCount, sample.length);
  assert.equal(result.rings.find((ring) => ring.ringId === 'ring-20-30').selectedCount, 0);
  assert.deepEqual(new Set(result.selectedPoiIds), new Set(sample.map((item) => item.poiId)));
});

test('over quota produces quota-hidden only and preserves original object references', () => {
  const result = selector.select(eligible, { presetId: 'concise' });
  assert.equal(result.quotaHiddenCount, 192);
  assert.equal(result.selected.length + result.quotaHidden.length, eligible.length);
  assert.ok(result.selected.every((item) => eligible.includes(item)));
});

test('preset and total poiId sets are strictly nested', () => {
  const sets = ['concise','standard','rich','full'].map((presetId) => new Set(selector.select(eligible, { presetId }).selectedPoiIds));
  for (let index = 0; index < sets.length - 1; index += 1) {
    assert.ok([...sets[index]].every((id) => sets[index + 1].has(id)));
    assert.ok(sets[index].size < sets[index + 1].size);
  }
});

test('score desc, null-last, time asc and poiId asc converge ties', () => {
  const sample = [
    {poiId:'b',ringId:'ring-0-10',travelTimeSeconds:10,rating:4},
    {poiId:'a',ringId:'ring-0-10',travelTimeSeconds:10,rating:4},
    {poiId:'c',ringId:'ring-0-10',travelTimeSeconds:1,rating:null},
    {poiId:'d',ringId:'ring-0-10',travelTimeSeconds:20,rating:5},
  ];
  assert.deepEqual(selector.select(sample,{presetId:'full'}).selectedPoiIds,['d','a','b','c']);
});

test('input shuffle does not change selection or fingerprint', () => {
  const left = selector.select(eligible, { presetId: 'rich' });
  const right = selector.select([...eligible].reverse(), { presetId: 'rich' });
  assert.deepEqual(right.selectedPoiIds, left.selectedPoiIds);
  assert.equal(right.selectionFingerprint, left.selectionFingerprint);
});

test('selection does not mutate input', () => {
  const before = JSON.stringify(eligible);
  selector.select(eligible, { presetId: 'standard' });
  assert.equal(JSON.stringify(eligible), before);
});

test('custom nonnegative quotas work and invalid quotas fail', () => {
  const result = selector.select(eligible,{presetId:'standard',customRingQuotas:{'ring-0-10':1,'ring-10-20':2,'ring-20-30':3}});
  assert.equal(result.presetId,'custom'); assert.equal(result.selectedCount,6);
  assert.throws(()=>selector.select(eligible,{customRingQuotas:{'ring-0-10':-1,'ring-10-20':2,'ring-20-30':3}}),/invalid quota/);
});

test('duplicates and cumulative-ring misuse fail closed', () => {
  assert.throws(()=>selector.select([eligible[0],eligible[0]],{presetId:'standard'}),/duplicate poiId/);
  assert.throws(()=>selector.select([{...eligible[0],ringId:'0-20'}],{presetId:'standard'}),/mutually-exclusive/);
});

test('selector performs no network and does not run layout', () => {
  const originalFetch = global.fetch; let calls = 0; global.fetch = () => { calls += 1; throw new Error('network forbidden'); };
  try { selector.select(eligible,{presetId:'concise'}); assert.equal(calls,0); } finally { global.fetch = originalFetch; }
});
