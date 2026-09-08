(function initNaturalBoundaryControlPoints(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;
  const TAU = Math.PI * 2;

  function radii(input) {
    const count = input.parameters.controlPointCount;
    return Array.from({ length: count }, (_, index) => input.innerRadius + (input.outerRadius - input.innerRadius) * index / (count - 1));
  }

  function weightedBasis(radiiList, innerRadius, outerRadius) {
    const span = outerRadius - innerRadius;
    const raw = radiiList.map((radius) => Math.sin(TAU * (radius - innerRadius) / span));
    const correction = radiiList.map((radius) => Math.sin(Math.PI * (radius - innerRadius) / span));
    let rawIntegral = 0;
    let correctionIntegral = 0;
    for (let index = 0; index < radiiList.length - 1; index += 1) {
      const dr = radiiList[index + 1] - radiiList[index];
      rawIntegral += dr * (radiiList[index] * raw[index] + radiiList[index + 1] * raw[index + 1]) / 2;
      correctionIntegral += dr * (radiiList[index] * correction[index] + radiiList[index + 1] * correction[index + 1]) / 2;
    }
    const ratio = correctionIntegral ? rawIntegral / correctionIntegral : 0;
    return raw.map((value, index) => value - ratio * correction[index]);
  }

  function cumulativeAngles(input, shares) {
    let angle = input.startAngle;
    return shares.map((_, index) => {
      const current = angle;
      angle += shares[index] * TAU;
      return current;
    });
  }

  function point(center, radius, angle) {
    return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
  }

  function createTarget(input, shares, pressures) {
    const radial = radii(input);
    const basis = weightedBasis(radial, input.innerRadius, input.outerRadius);
    const angles = cumulativeAngles(input, shares);
    const focusIndex = input.focus ? input.regions.findIndex((region) => region.id === input.focus.id) : -1;
    return input.regions.map((region, index) => {
      const phase = Math.sin((index + 1) * 1.61803398875) * input.parameters.naturalAmplitude;
      const leftIndex = (index - 1 + input.regions.length) % input.regions.length;
      const localPressure = (pressures[leftIndex].delta - pressures[index].delta) * TAU;
      const distance = focusIndex < 0 ? Infinity : Math.min(
        natural.pressure.cyclicDistance(index, focusIndex, input.regions.length),
        natural.pressure.cyclicDistance(leftIndex, focusIndex, input.regions.length),
      );
      const locality = Number.isFinite(distance) ? Math.exp(-distance * 1.15) : 0;
      const amplitude = Math.max(-0.095, Math.min(0.095,
        phase + localPressure * input.parameters.pressureAmplitude * locality,
      ));
      return {
        id: `boundary-${index}`,
        order: index,
        leftRegionId: input.regions[leftIndex].id,
        rightRegionId: region.id,
        graphDistance: distance,
        amplitude,
        controls: radial.map((radius, controlIndex) => {
          const endpoint = controlIndex === 0 || controlIndex === radial.length - 1;
          const angle = endpoint ? angles[index] : angles[index] + amplitude * basis[controlIndex];
          return { radius, angle, point: point(input.center, radius, angle) };
        }),
      };
    });
  }

  natural.controlPoints = Object.freeze({ radii, weightedBasis, cumulativeAngles, point, createTarget });
})(window);
