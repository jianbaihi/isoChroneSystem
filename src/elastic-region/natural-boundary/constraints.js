(function initNaturalBoundaryConstraints(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const natural = app.elasticRegion.naturalBoundary;
  const TAU = Math.PI * 2;

  function enforce(input, boundaries) {
    const count = boundaries.length;
    boundaries.forEach((boundary, boundaryIndex) => {
      boundary.controls.forEach((control, controlIndex) => {
        const t = controlIndex / (boundary.controls.length - 1);
        control.radius = input.innerRadius + (input.outerRadius - input.innerRadius) * t;
        if (controlIndex === 0 || controlIndex === boundary.controls.length - 1) {
          control.angle = boundary.targetEndpointAngle;
        }
        control.point = natural.controlPoints.point(input.center, control.radius, control.angle);
      });
      boundary.order = boundaryIndex;
    });
    for (let controlIndex = 1; controlIndex < input.parameters.controlPointCount - 1; controlIndex += 1) {
      for (let index = 1; index < count; index += 1) {
        while (boundaries[index].controls[controlIndex].angle <= boundaries[index - 1].controls[controlIndex].angle) {
          boundaries[index].controls[controlIndex].angle += TAU;
        }
      }
      const wrapGap = boundaries[0].controls[controlIndex].angle + TAU - boundaries[count - 1].controls[controlIndex].angle;
      if (wrapGap <= 0.02) boundaries[count - 1].controls[controlIndex].angle -= 0.02 - wrapGap;
    }
    return boundaries;
  }

  natural.constraints = Object.freeze({ enforce });
})(window);
