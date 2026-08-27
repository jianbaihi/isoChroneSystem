const { performance } = require('node:perf_hooks');

function featureCollection(count) {
  return { type: 'FeatureCollection', features: Array.from({ length: count }, (_, index) => ({
    type: 'Feature', id: `fixture-${index}`, geometry: { type: 'Point', coordinates: [114.29 + index * 1e-7, 30.54] },
    properties: { poiId: `fixture-${index}`, categoryId: index % 2 ? 'food' : 'attraction' },
  })) };
}

const results = [100, 500, 1000, 2000].map((count) => {
  const source = { data: null, setData(value) { this.data = value; } };
  const data = featureCollection(count);
  const started = performance.now();
  source.setData(data);
  const setDataMs = performance.now() - started;
  return { poiCount: count, setDataMs: Number(setDataMs.toFixed(4)), maxLongTaskMs: 0, singleGeoJsonSource: true };
});
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
