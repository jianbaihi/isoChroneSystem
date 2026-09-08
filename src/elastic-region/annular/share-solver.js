(function initAnnularShareSolver(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const annular = app.elasticRegion = app.elasticRegion || {};
  const api = annular.annular = annular.annular || {};

  function waterFill(weights, minima, total = 1) {
    const output = minima.slice();
    const minimumTotal = output.reduce((sum, value) => sum + value, 0);
    if (minimumTotal > total + 1e-12) throw new RangeError('minimum shares exceed the available total');
    const residual = Math.max(0, total - minimumTotal);
    const excessWeights = weights.map((weight, index) => Math.max(0, weight - minima[index]));
    const weightTotal = excessWeights.reduce((sum, value) => sum + value, 0);
    const fallbackTotal = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
    output.forEach((_, index) => {
      const ratio = weightTotal > 0
        ? excessWeights[index] / weightTotal
        : fallbackTotal > 0 ? Math.max(0, weights[index]) / fallbackTotal : 1 / output.length;
      output[index] += residual * ratio;
    });
    const correction = total - output.reduce((sum, value) => sum + value, 0);
    output[output.length - 1] += correction;
    return output;
  }

  function baseShares(regions) {
    const sum = regions.reduce((total, region) => total + region.baseWeight, 0);
    const normalized = regions.map((region) => sum > 0 ? region.baseWeight / sum : 1 / regions.length);
    return waterFill(normalized, regions.map((region) => region.minShare), 1);
  }

  function solve(input) {
    const baseline = baseShares(input.regions);
    const focus = input.focus;
    const focusIndex = focus ? input.regions.findIndex((region) => region.id === focus.id) : -1;
    if (focusIndex < 0 || focus.alpha <= 0) return baseline;
    const minimums = input.regions.map((region) => region.minShare);
    const maximumAllowed = 1 - minimums.reduce((sum, value, index) => index === focusIndex ? sum : sum + value, 0);
    const desired = Math.min(focus.maxShare, maximumAllowed, baseline[focusIndex] * (1 + (focus.expansionFactor - 1) * focus.alpha));
    if (desired <= baseline[focusIndex]) return baseline;
    const remainingIndexes = input.regions.map((_, index) => index).filter((index) => index !== focusIndex);
    const remainingShares = waterFill(
      remainingIndexes.map((index) => baseline[index]),
      remainingIndexes.map((index) => minimums[index]),
      1 - desired,
    );
    const result = new Array(input.regions.length);
    result[focusIndex] = desired;
    remainingIndexes.forEach((index, position) => { result[index] = remainingShares[position]; });
    result[result.length - 1] += 1 - result.reduce((sum, value) => sum + value, 0);
    return result;
  }

  api.shareSolver = Object.freeze({ waterFill, baseShares, solve });
})(window);
