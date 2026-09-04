(function initElasticRegionMinimumShare(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const elastic = app.elasticRegion = app.elasticRegion || {};

  function enforceMinimumShares(rawShares, minimums) {
    const result = rawShares.map((share, index) => Math.max(Number(share) || 0, Number(minimums[index]) || 0));
    const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
    if (minimumTotal >= 1) throw new Error('Sum of minShare values must be below 1.');
    for (let pass = 0; pass < result.length + 2; pass += 1) {
      const total = result.reduce((sum, value) => sum + value, 0);
      if (Math.abs(total - 1) < 1e-12) break;
      const adjustable = result.map((value, index) => ({ index, slack: Math.max(0, value - minimums[index]) })).filter((item) => item.slack > 1e-12);
      if (total > 1 && adjustable.length) {
        const slackTotal = adjustable.reduce((sum, item) => sum + item.slack, 0);
        adjustable.forEach((item) => { result[item.index] -= (total - 1) * item.slack / slackTotal; });
      } else if (total < 1) {
        const basis = rawShares.reduce((sum, value) => sum + Math.max(0, value), 0) || rawShares.length;
        result.forEach((value, index) => { result[index] += (1 - total) * (Math.max(0, rawShares[index]) || 1) / basis; });
      }
    }
    const total = result.reduce((sum, value) => sum + value, 0);
    return result.map((value) => value / total);
  }

  elastic.minimumShare = Object.freeze({ enforceMinimumShares });
})(window);
