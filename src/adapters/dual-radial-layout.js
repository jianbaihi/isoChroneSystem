(function initDualRadialLayout(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const VERSION = 'stage33-dual-radial-v1';
  const TWO_PI = Math.PI * 2;
  const RINGS = [
    { ringId: 'ring-0-10', lower: 0, upper: 600 },
    { ringId: 'ring-10-20', lower: 600, upper: 1200 },
    { ringId: 'ring-20-30', lower: 1200, upper: 1800 },
  ];
  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
  function normalizeAngle(value) { return ((value % TWO_PI) + TWO_PI) % TWO_PI; }
  function angleDelta(left, right) { return Math.atan2(Math.sin(left - right), Math.cos(left - right)); }
  function geographicBearing(center, point) {
    if (!point || !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude)) return 0;
    if (point.longitude === center.longitude && point.latitude === center.latitude) return 0;
    const phi1 = center.latitude * Math.PI / 180; const phi2 = point.latitude * Math.PI / 180;
    const deltaLambda = (point.longitude - center.longitude) * Math.PI / 180;
    const theta = Math.atan2(Math.sin(deltaLambda) * Math.cos(phi2), Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda));
    return normalizeAngle(theta - Math.PI / 2); // screen 0° points east; geographic north maps to -90°.
  }
  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
    return hash >>> 0;
  }
  function seededAngle(seed, poiId) { return fnv1a(`${VERSION}|${String(seed)}|${poiId}`) / 0x100000000 * TWO_PI; }
  function ringIdForTime(seconds) {
    const value = Number(seconds);
    if (value > 0 && value <= 600) return 'ring-0-10';
    if (value > 600 && value <= 1200) return 'ring-10-20';
    if (value > 1200 && value <= 1800) return 'ring-20-30';
    return 'matrix-out-of-range';
  }
  function visualFontSize(rank, count, hierarchy = 50) {
    const q = count <= 1 ? 0 : rank / (count - 1);
    const strength = 0.2 + clamp(hierarchy, 0, 100) / 100 * 0.8;
    return Number(clamp(19 + 7 * strength * (1 - 2 * q), 12, 26).toFixed(2));
  }
  function measure(label, fontSize) {
    let units = 0;
    for (const char of String(label)) units += char.codePointAt(0) > 255 ? 1 : (char === ' ' ? 0.36 : 0.58);
    return { width: Math.max(18, Math.ceil(units * fontSize + 8)), height: Math.ceil(fontSize * 1.34 + 4) };
  }
  function rectFor(x, y, size) { return { left: x - size.width / 2, right: x + size.width / 2, top: y - size.height / 2, bottom: y + size.height / 2 }; }
  function overlaps(a, b, gap = 0) { return !(a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top); }
  function cornersInsideBand(rect, center, inner, outer) {
    return [[rect.left, rect.top], [rect.right, rect.top], [rect.left, rect.bottom], [rect.right, rect.bottom]].every(([x, y]) => {
      const r = Math.hypot(x - center.x, y - center.y); return r >= inner && r <= outer;
    });
  }
  function spatialIndex(cellSize = 48) {
    const buckets = new Map(); const entries = [];
    const keys = (rect) => { const result = []; for (let y = Math.floor(rect.top / cellSize); y <= Math.floor(rect.bottom / cellSize); y += 1) for (let x = Math.floor(rect.left / cellSize); x <= Math.floor(rect.right / cellSize); x += 1) result.push(`${x}:${y}`); return result; };
    return {
      collides(rect, gap) { const seen = new Set(); for (const key of keys(rect)) for (const index of buckets.get(key) || []) { if (seen.has(index)) continue; seen.add(index); if (overlaps(rect, entries[index], gap)) return true; } return false; },
      insert(rect) { const index = entries.push(rect) - 1; for (const key of keys(rect)) { if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(index); } },
      entries,
    };
  }
  function radiiFor(iteration, compactness) {
    const loosen = (50 - clamp(compactness, 0, 100)) * 0.12;
    const outer = [250, 460, 680].map((value, index) => Math.round(value + iteration * [18, 30, 42][index] + loosen * (index + 1)));
    return [
      { inner: 90, outer: outer[0] },
      { inner: outer[0] + 12, outer: outer[1] },
      { inner: outer[1] + 12, outer: outer[2] },
    ];
  }
  function radialCandidates(initial, inner, outer, step) {
    const values = [];
    for (let radius = initial; radius <= outer; radius += step) values.push(radius);
    for (let radius = initial - step; radius >= inner; radius -= step) values.push(radius);
    return values;
  }
  function angleOffsets(maxDegrees, stepDegrees) {
    const values = [0];
    for (let degrees = stepDegrees; degrees <= maxDegrees + 1e-6; degrees += stepDegrees) values.push(degrees * Math.PI / 180, -degrees * Math.PI / 180);
    return values;
  }
  function percentile(values, p) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]; }
  function audit(nodes, center, radii, obstacles) {
    let overlapCount = 0; let outsideOwnRingCount = 0; let centerCollisionCount = 0; let timeLabelCollisionCount = 0;
    for (let i = 0; i < nodes.length; i += 1) {
      const ringIndex = RINGS.findIndex((ring) => ring.ringId === nodes[i].ringId);
      if (!cornersInsideBand(nodes[i].rect, center, radii[ringIndex].inner, radii[ringIndex].outer)) outsideOwnRingCount += 1;
      if (overlaps(nodes[i].rect, obstacles[0])) centerCollisionCount += 1;
      for (const obstacle of obstacles.slice(1)) if (overlaps(nodes[i].rect, obstacle)) timeLabelCollisionCount += 1;
      for (let j = i + 1; j < nodes.length; j += 1) if (overlaps(nodes[i].rect, nodes[j].rect, 0)) overlapCount += 1;
    }
    return { overlapCount, outsideOwnRingCount, centerCollisionCount, timeLabelCollisionCount };
  }
  function fingerprint(nodes, mode, seed, radii) {
    const text = `${VERSION}|${mode}|${seed}|${radii.map(r => `${r.inner}-${r.outer}`).join(',')}|${nodes.map(node => `${node.poiId}:${node.x.toFixed(2)}:${node.y.toFixed(2)}:${node.fontSize.toFixed(2)}`).sort().join('|')}`;
    return `fnv1a-${fnv1a(text).toString(16).padStart(8, '0')}`;
  }
  function layout(input, options = {}) {
    const started = Date.now();
    const mode = options.mode === 'random-radial' ? 'random-radial' : 'geographic-radial';
    const seed = options.randomSeed ?? 'stage31-baseline-seed';
    const compactness = clamp(options.compactness ?? 50, 0, 100);
    const fontHierarchy = clamp(options.fontHierarchy ?? 50, 0, 100);
    const center = { x: 700, y: 700, longitude: Number(options.center?.longitude ?? 114.296944), latitude: Number(options.center?.latitude ?? 30.546944) };
    const padding = Number((4.5 - compactness * 0.035).toFixed(2));
    const radialStep = Number((4 - compactness * 0.02).toFixed(2));
    const angularStepDeg = Number((2 - compactness * 0.015).toFixed(2));
    const maxAngularOffsetDeg = 120;
    const ordered = [...input].sort((a, b) => a.travelTimeSeconds - b.travelTimeSeconds || a.poiId.localeCompare(b.poiId)).map((item, rank, all) => {
      const fontSize = visualFontSize(rank, all.length, fontHierarchy); const size = measure(item.name, fontSize);
      const targetAngle = mode === 'geographic-radial' ? geographicBearing(center, item) : seededAngle(seed, item.poiId);
      return { ...item, rank, fontSize, opacity: item.opacity, width: size.width, height: size.height, targetAngle, rotation: 0 };
    });
    const expansionLog = [];
    let final = null;
    for (let iteration = 0; iteration <= 12; iteration += 1) {
      const radii = radiiFor(iteration, compactness);
      const obstacles = [rectFor(center.x, center.y, { width: 150, height: 122 }), ...radii.map(ring => rectFor(center.x, center.y - ring.outer, { width: 94, height: 30 }))];
      const index = spatialIndex(); obstacles.forEach(rect => index.insert(rect));
      const placed = []; const unplaced = []; let candidateChecks = 0;
      for (const item of ordered) {
        const ringIndex = RINGS.findIndex(ring => ring.ringId === item.ringId); const ring = RINGS[ringIndex]; const band = radii[ringIndex];
        const q = clamp((item.travelTimeSeconds - ring.lower) / (ring.upper - ring.lower), 0, 1);
        const margin = Math.hypot(item.width, item.height) / 2 + padding;
        const inner = band.inner + margin; const outer = band.outer - margin;
        const initialRadius = inner + q * Math.max(0, outer - inner);
        let found = null;
        for (const offset of angleOffsets(maxAngularOffsetDeg, angularStepDeg)) {
          const angle = normalizeAngle(item.targetAngle + offset);
          for (const radius of radialCandidates(initialRadius, inner, outer, radialStep)) {
            candidateChecks += 1;
            const x = center.x + Math.cos(angle) * radius; const y = center.y + Math.sin(angle) * radius; const rect = rectFor(x, y, item);
            if (!cornersInsideBand(rect, center, band.inner, band.outer) || index.collides(rect, padding)) continue;
            found = { ...item, x, y, rect, initialRadius, finalRadius: radius, radialDisplacement: radius - initialRadius, finalAngle: angle, angularDisplacement: angleDelta(angle, item.targetAngle), candidateChecks };
            placed.push(found); index.insert(rect); break;
          }
          if (found) break;
        }
        if (!found) unplaced.push({ ...item, status: 'unplaced', candidateChecks });
      }
      expansionLog.push({ iteration, ringRadii: radii, placed: placed.length, unplaced: unplaced.length, reason: unplaced.length ? 'ring-capacity-insufficient' : 'complete' });
      if (!unplaced.length) { final = { placed, unplaced, radii, obstacles, candidateChecks, iteration }; break; }
      final = { placed, unplaced, radii, obstacles, candidateChecks, iteration };
    }
    const nodes = final.placed; const constraintAudit = audit(nodes, center, final.radii, final.obstacles);
    const angularDegrees = nodes.map(node => Math.abs(node.angularDisplacement) * 180 / Math.PI);
    const radial = nodes.map(node => Math.abs(node.radialDisplacement));
    const logicalSize = Math.ceil((final.radii[2].outer + 20) * 2); const fitScale = Math.min(1126 / logicalSize, 943 / logicalSize, 1);
    const canvasShiftX = logicalSize / 2 - center.x; const canvasShiftY = logicalSize / 2 - center.y;
    const renderedNodes = nodes.map(node => ({ ...node, x: node.x + canvasShiftX, y: node.y + canvasShiftY }));
    const fonts = nodes.map(node => node.fontSize); const placedByRing = Object.fromEntries(RINGS.map(ring => [ring.ringId, nodes.filter(node => node.ringId === ring.ringId).length]));
    return {
      schemaVersion: '1.0', algorithmVersion: VERSION, mode, randomSeed: mode === 'random-radial' ? seed : null,
      center: { longitude: center.longitude, latitude: center.latitude, canvasX: logicalSize / 2, canvasY: logicalSize / 2 },
      eligible: ordered.length, placed: nodes.length, unplaced: final.unplaced.length, placedByRing,
      constraints: constraintAudit, canvasLogicalWidth: logicalSize, canvasLogicalHeight: logicalSize, ringRadii: final.radii,
      fitScale: Number(fitScale.toFixed(4)), semanticFontPx: { min: Math.min(...fonts), max: Math.max(...fonts), mean: Number((fonts.reduce((a,b)=>a+b,0)/fonts.length).toFixed(2)) },
      finalScreenFontPx: { min: Number((Math.min(...fonts) * fitScale).toFixed(2)), max: Number((Math.max(...fonts) * fitScale).toFixed(2)), readableMinimum: 8 },
      layoutDurationMs: Date.now() - started, candidateChecks: final.candidateChecks, expansionIterations: final.iteration, expansionLog,
      layoutFingerprint: fingerprint(renderedNodes, mode, mode === 'random-radial' ? seed : '', final.radii), meanRadialDisplacement: Number((radial.reduce((a,b)=>a+b,0)/Math.max(1,radial.length)).toFixed(2)), maxRadialDisplacement: Number(Math.max(0,...radial).toFixed(2)),
      angularDisplacementDeg: { mean: Number((angularDegrees.reduce((a,b)=>a+b,0)/Math.max(1,angularDegrees.length)).toFixed(2)), median: Number(percentile(angularDegrees,.5).toFixed(2)), p95: Number(percentile(angularDegrees,.95).toFixed(2)), max: Number(Math.max(0,...angularDegrees).toFixed(2)), withinConfiguredWindowRate: Number((angularDegrees.filter(v=>v<=maxAngularOffsetDeg+1e-6).length/Math.max(1,angularDegrees.length)).toFixed(4)) },
      geographicBearingError: mode === 'geographic-radial' ? { ...Object.fromEntries(Object.entries({ mean: angularDegrees.reduce((a,b)=>a+b,0)/Math.max(1,angularDegrees.length), median: percentile(angularDegrees,.5), p95: percentile(angularDegrees,.95), max: Math.max(0,...angularDegrees) }).map(([k,v])=>[k,Number(v.toFixed(2))])) } : 'N/A',
      tokens: { compactness, fontHierarchy, paddingPx: padding, radialStepPx: radialStep, angularStepDeg, maxAngularOffsetDeg, collisionModel: 'axis-aligned-label-bbox', rotation: 0 },
      nodes: renderedNodes.map(({ rect, ...node }) => ({ ...node, x: Number(node.x.toFixed(2)), y: Number(node.y.toFixed(2)), targetAngle: Number(node.targetAngle.toFixed(6)), finalAngle: Number(node.finalAngle.toFixed(6)), initialRadius: Number(node.initialRadius.toFixed(2)), finalRadius: Number(node.finalRadius.toFixed(2)), radialDisplacement: Number(node.radialDisplacement.toFixed(2)), angularDisplacement: Number(node.angularDisplacement.toFixed(6)), placed: true, status: 'placed' })),
      unplacedNodes: final.unplaced.map(node => ({ poiId: node.poiId, ringId: node.ringId, status: 'unplaced' })),
    };
  }
  app.dualRadialLayout = Object.freeze({ VERSION, RINGS, geographicBearing, seededAngle, ringIdForTime, visualFontSize, measure, layout, normalizeAngle, angleDelta });
})(typeof window === 'undefined' ? globalThis : window);
