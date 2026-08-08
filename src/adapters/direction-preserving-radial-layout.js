(function initDirectionPreservingRadialLayout(global) {
  'use strict';

  const app = global.PanmapApp = global.PanmapApp || {};
  const VERSION = 'stage41-direction-preserving-radial-v1';
  const ALGORITHM_ID = 'direction-preserving-radial';
  const TWO_PI = Math.PI * 2;
  const RINGS = [
    { ringId: 'ring-0-10', lower: 0, upper: 600 },
    { ringId: 'ring-10-20', lower: 600, upper: 1200 },
    { ringId: 'ring-20-30', lower: 1200, upper: 1800 },
  ];
  const DEFAULTS = Object.freeze({
    center: { longitude: 114.296944, latitude: 30.546944 },
    preferredAngleToleranceDeg: 30,
    angleStepDeg: 5,
    radialStepPx: 5,
    expansionStepPx: [28, 44, 62],
    maximumExpansionIterations: 24,
    initialOuterRadiiPx: [350, 650, 950],
    centerSafeRadiusPx: 76,
    centerObstacleWidthPx: 150,
    centerObstacleHeightPx: 122,
    interRingGapPx: 12,
    labelGapPx: 1.5,
    timeLabelWidthPx: 94,
    timeLabelHeightPx: 30,
    canvasMarginPx: 24,
    sourceAxisEpsilonMeters: 1,
    layoutAxisEpsilonPx: 0.5,
    fontHierarchy: 50,
    scoring: {
      angleErrorWeight: 1000,
      radialFromInnerWeight: 2,
      frontierGapWeight: 8,
      boundaryRiskWeight: 50,
    },
  });

  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
  function normalizeAngle(value) { return ((value % TWO_PI) + TWO_PI) % TWO_PI; }
  function angleDelta(left, right) { return Math.atan2(Math.sin(left - right), Math.cos(left - right)); }
  function angularErrorDeg(left, right) { return Math.abs(angleDelta(left, right)) * 180 / Math.PI; }
  function fnv1a(text) { let hash = 0x811c9dc5; for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return hash >>> 0; }
  function geographicBearing(center, point) {
    const phi1 = center.latitude * Math.PI / 180; const phi2 = point.latitude * Math.PI / 180;
    const deltaLambda = (point.longitude - center.longitude) * Math.PI / 180;
    return normalizeAngle(Math.atan2(Math.sin(deltaLambda) * Math.cos(phi2), Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)) - Math.PI / 2);
  }
  function sourceAxes(center, point, epsilonMeters = 1) {
    const metersPerDegree = 111320; const latitudeRadians = center.latitude * Math.PI / 180;
    const dx = (point.longitude - center.longitude) * Math.cos(latitudeRadians) * metersPerDegree;
    const north = (point.latitude - center.latitude) * metersPerDegree;
    const sign = (value) => Math.abs(value) <= epsilonMeters ? 0 : value < 0 ? -1 : 1;
    return { dxMeters: dx, northMeters: north, eastWest: sign(dx), northSouth: sign(north) };
  }
  function hardHalfPlaneAllowed(item, x, y, epsilonPx = 0.5) {
    if (item.sourceAxes.eastWest > 0 && x <= epsilonPx) return false;
    if (item.sourceAxes.eastWest < 0 && x >= -epsilonPx) return false;
    if (item.sourceAxes.northSouth > 0 && y >= -epsilonPx) return false;
    if (item.sourceAxes.northSouth < 0 && y <= epsilonPx) return false;
    return true;
  }
  function visualFontSize(rank, count, hierarchy = 50) {
    const q = count <= 1 ? 0 : rank / (count - 1); const strength = 0.2 + clamp(hierarchy, 0, 100) / 100 * 0.8;
    return Number(clamp(19 + 7 * strength * (1 - 2 * q), 12, 26).toFixed(2));
  }
  function measure(label, fontSize) {
    let units = 0; for (const char of String(label)) units += char.codePointAt(0) > 255 ? 1 : (char === ' ' ? 0.36 : 0.58);
    return { width: Math.max(18, Math.ceil(units * fontSize + 8)), height: Math.ceil(fontSize * 1.34 + 4) };
  }
  function rectFor(x, y, item) { return { left: x-item.width/2, right: x+item.width/2, top: y-item.height/2, bottom: y+item.height/2 }; }
  function overlaps(a, b, gap = 0) { return !(a.right+gap <= b.left || b.right+gap <= a.left || a.bottom+gap <= b.top || b.bottom+gap <= a.top); }
  function minRectRadius(rect) { const dx=rect.left>0?rect.left:rect.right<0?-rect.right:0; const dy=rect.top>0?rect.top:rect.bottom<0?-rect.bottom:0; return Math.hypot(dx,dy); }
  function maxRectRadius(rect) { return Math.max(Math.hypot(rect.left,rect.top),Math.hypot(rect.right,rect.top),Math.hypot(rect.left,rect.bottom),Math.hypot(rect.right,rect.bottom)); }
  function rectGap(a,b){const dx=Math.max(a.left-b.right,b.left-a.right,0);const dy=Math.max(a.top-b.bottom,b.top-a.bottom,0);return Math.hypot(dx,dy);}
  function exactBandAllowed(rect, band) { return minRectRadius(rect) >= band.inner && maxRectRadius(rect) <= band.outer; }
  function spatialIndex(cellSize = 52) {
    const buckets=new Map();const entries=[];
    const keys=(rect)=>{const result=[];for(let y=Math.floor(rect.top/cellSize);y<=Math.floor(rect.bottom/cellSize);y+=1)for(let x=Math.floor(rect.left/cellSize);x<=Math.floor(rect.right/cellSize);x+=1)result.push(`${x}:${y}`);return result;};
    return {entries,collides(rect,gap=0){const seen=new Set();for(const key of keys(rect))for(const index of buckets.get(key)||[]){if(seen.has(index))continue;seen.add(index);if(overlaps(rect,entries[index],gap))return true;}return false;},insert(rect){const index=entries.push(rect)-1;for(const key of keys(rect)){if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(index);}}};
  }
  function angleOffsets(limitDeg, stepDeg) { const values=[0]; for(let degree=stepDeg;degree<=limitDeg+1e-9;degree+=stepDeg)values.push(degree,-degree); return values; }
  function candidateAngles(item, options) {
    const preferred = angleOffsets(options.preferredAngleToleranceDeg, options.angleStepDeg).map(offset=>({angle:normalizeAngle(item.targetAngle+offset*Math.PI/180),relaxationLevel:offset===0?0:1,preferredWindowExceeded:false,order:Math.abs(offset)*2+(offset<0?1:0)}));
    const used=new Set(preferred.map(candidate=>candidate.angle.toFixed(9))); const relaxed=[];
    for(let degree=0;degree<360;degree+=options.angleStepDeg){const angle=degree*Math.PI/180;if(used.has(angle.toFixed(9)))continue;const probeX=Math.cos(angle)*100;const probeY=Math.sin(angle)*100;if(!hardHalfPlaneAllowed(item,probeX,probeY,options.layoutAxisEpsilonPx))continue;relaxed.push({angle,relaxationLevel:2,preferredWindowExceeded:true,order:degree});}
    relaxed.sort((a,b)=>angularErrorDeg(a.angle,item.targetAngle)-angularErrorDeg(b.angle,item.targetAngle)||a.order-b.order);
    return [preferred.filter(candidate=>hardHalfPlaneAllowed(item,Math.cos(candidate.angle)*100,Math.sin(candidate.angle)*100,options.layoutAxisEpsilonPx)),relaxed];
  }
  function radiiFor(iteration, options) {
    const outer=options.initialOuterRadiiPx.map((radius,index)=>radius+iteration*options.expansionStepPx[index]);
    return [
      {ringId:RINGS[0].ringId,inner:options.centerSafeRadiusPx,outer:outer[0]},
      {ringId:RINGS[1].ringId,inner:outer[0]+options.interRingGapPx,outer:outer[1]},
      {ringId:RINGS[2].ringId,inner:outer[1]+options.interRingGapPx,outer:outer[2]},
    ];
  }
  function obstaclesFor(radii,options){return [rectFor(0,0,{width:options.centerObstacleWidthPx,height:options.centerObstacleHeightPx}),...radii.map(ring=>rectFor(0,-ring.outer,{width:options.timeLabelWidthPx,height:options.timeLabelHeightPx}))];}
  function scoreCandidate(candidate,item,band,placed,options,radialIndex,angleIndex){
    const angleError=angularErrorDeg(candidate.angle,item.targetAngle);const radialFromInner=candidate.radius-band.inner;
    const frontierGap=placed.length?Math.min(...placed.map(node=>rectGap(candidate.rect,node.rect))):radialFromInner;
    const clearance=Math.max(.01,Math.min(minRectRadius(candidate.rect)-band.inner,band.outer-maxRectRadius(candidate.rect)));
    const weights=options.scoring;
    return angleError*weights.angleErrorWeight+radialFromInner*weights.radialFromInnerWeight+frontierGap*weights.frontierGapWeight+weights.boundaryRiskWeight/(clearance+1)+angleIndex*1e-4+radialIndex*1e-6;
  }
  function placeIteration(ordered,radii,options){
    const obstacles=obstaclesFor(radii,options);const index=spatialIndex();obstacles.forEach(rect=>index.insert(rect));
    const placed=[];const unplaced=[];let candidateChecks=0;
    for(const item of ordered){
      const ringIndex=RINGS.findIndex(ring=>ring.ringId===item.ringId);const band=radii[ringIndex];const angleGroups=candidateAngles(item,options);let found=null;
      for(let groupIndex=0;groupIndex<angleGroups.length&&!found;groupIndex+=1){
        const angles=angleGroups[groupIndex];const valid=[];
        for(let angleIndex=0;angleIndex<angles.length;angleIndex+=1){const angleInfo=angles[angleIndex];
          for(let radius=band.inner;radius<=band.outer;radius+=options.radialStepPx){candidateChecks+=1;const x=Math.cos(angleInfo.angle)*radius;const y=Math.sin(angleInfo.angle)*radius;
            if(!hardHalfPlaneAllowed(item,x,y,options.layoutAxisEpsilonPx))continue;const rect=rectFor(x,y,item);if(!exactBandAllowed(rect,band)||index.collides(rect,options.labelGapPx))continue;
            const radialIndex=Math.round((radius-band.inner)/options.radialStepPx);valid.push({...angleInfo,x,y,radius,rect,score:scoreCandidate({angle:angleInfo.angle,radius,rect},item,band,placed.filter(node=>node.ringId===item.ringId),options,radialIndex,angleIndex)});
          }
        }
        if(valid.length){valid.sort((a,b)=>a.score-b.score||a.order-b.order||a.radius-b.radius);found=valid[0];}
      }
      if(found){const finalAngularErrorDeg=angularErrorDeg(found.angle,item.targetAngle);const node={...item,x:found.x,y:found.y,rect:found.rect,finalAngle:found.angle,finalRadius:found.radius,finalAngularErrorDeg:Number(finalAngularErrorDeg.toFixed(6)),preferredWindowExceeded:found.preferredWindowExceeded,relaxationLevel:found.relaxationLevel,score:Number(found.score.toFixed(6)),status:'placed',placed:true};placed.push(node);index.insert(found.rect);}
      else unplaced.push({poiId:item.poiId,ringId:item.ringId,status:'unplaced',reason:'no-candidate-within-own-ring-and-hard-half-planes'});
    }
    return {placed,unplaced,candidateChecks,obstacles};
  }
  function audit(nodes,radii,options,obstacles){
    let overlapCount=0,outsideOwnRingCount=0,centerCollisionCount=0,timeLabelCollisionCount=0,eastWestHardViolationCount=0,northSouthHardViolationCount=0;
    for(let i=0;i<nodes.length;i+=1){const node=nodes[i];const band=radii[RINGS.findIndex(ring=>ring.ringId===node.ringId)];if(!exactBandAllowed(node.rect,band))outsideOwnRingCount+=1;if(overlaps(node.rect,obstacles[0]))centerCollisionCount+=1;for(const obstacle of obstacles.slice(1))if(overlaps(node.rect,obstacle))timeLabelCollisionCount+=1;
      const ew=node.sourceAxes.eastWest,ns=node.sourceAxes.northSouth;if((ew>0&&node.x<=options.layoutAxisEpsilonPx)||(ew<0&&node.x>=-options.layoutAxisEpsilonPx))eastWestHardViolationCount+=1;if((ns>0&&node.y>=-options.layoutAxisEpsilonPx)||(ns<0&&node.y<=options.layoutAxisEpsilonPx))northSouthHardViolationCount+=1;
      for(let j=i+1;j<nodes.length;j+=1)if(overlaps(node.rect,nodes[j].rect))overlapCount+=1;
    }
    return{overlapCount,outsideOwnRingCount,centerCollisionCount,timeLabelCollisionCount,eastWestHardViolationCount,northSouthHardViolationCount};
  }
  function percentile(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];}
  function layout(input,supplied={}){
    const started=Date.now();const options={...DEFAULTS,...supplied,center:{...DEFAULTS.center,...(supplied.center||{})},scoring:{...DEFAULTS.scoring,...(supplied.scoring||{})}};
    const sourceSnapshot=JSON.stringify(input);const ordered=[...input].sort((a,b)=>a.travelTimeSeconds-b.travelTimeSeconds||a.poiId.localeCompare(b.poiId)).map((item,rank,all)=>{const fontSize=visualFontSize(rank,all.length,options.fontHierarchy);const size=measure(item.name,fontSize);return{...item,rank,fontSize,width:size.width,height:size.height,rotation:0,targetAngle:geographicBearing(options.center,item),sourceAxes:sourceAxes(options.center,item,options.sourceAxisEpsilonMeters)};});
    const expansionLog=[];let attempt=null;let radii=null;let totalCandidateChecks=0;
    for(let iteration=0;iteration<=options.maximumExpansionIterations;iteration+=1){radii=radiiFor(iteration,options);attempt=placeIteration(ordered,radii,options);totalCandidateChecks+=attempt.candidateChecks;expansionLog.push({iteration,ringRadii:radii,placed:attempt.placed.length,unplaced:attempt.unplaced.length,candidateChecks:attempt.candidateChecks,reason:attempt.unplaced.length?'ring-capacity-insufficient-under-hard-half-planes':'complete'});if(!attempt.unplaced.length)break;}
    const constraints=audit(attempt.placed,radii,options,attempt.obstacles);const outer=radii[2].outer;const logicalSize=Math.ceil((outer+options.canvasMarginPx)*2);const shift=logicalSize/2;const nodes=attempt.placed.map(node=>({...node,x:node.x+shift,y:node.y+shift}));const placedByRing=Object.fromEntries(RINGS.map(ring=>[ring.ringId,nodes.filter(node=>node.ringId===ring.ringId).length]));const fonts=ordered.map(node=>node.fontSize);const errors=attempt.placed.map(node=>node.finalAngularErrorDeg);const relaxationLevelCounts=Object.fromEntries([0,1,2].map(level=>[String(level),attempt.placed.filter(node=>node.relaxationLevel===level).length]));const iteration=expansionLog.at(-1).iteration;
    const fingerprintText=`${VERSION}|${JSON.stringify({preferredAngleToleranceDeg:options.preferredAngleToleranceDeg,angleStepDeg:options.angleStepDeg,radialStepPx:options.radialStepPx,scoring:options.scoring})}|${radii.map(r=>`${r.inner}:${r.outer}`).join('|')}|${nodes.map(node=>`${node.poiId}:${node.x.toFixed(2)}:${node.y.toFixed(2)}:${node.fontSize.toFixed(2)}:${node.relaxationLevel}`).sort().join('|')}`;
    const totalLabelArea=nodes.reduce((sum,node)=>sum+node.width*node.height,0);const fitScale=Math.min(1126/logicalSize,943/logicalSize,1);
    const result={schemaVersion:'1.0',stage:41,algorithmId:ALGORITHM_ID,algorithmVersion:VERSION,mode:'direction-preserving-radial',parameters:{preferredAngleToleranceDeg:options.preferredAngleToleranceDeg,angleStepDeg:options.angleStepDeg,radialStepPx:options.radialStepPx,sourceAxisEpsilonMeters:options.sourceAxisEpsilonMeters,layoutAxisEpsilonPx:options.layoutAxisEpsilonPx,interRingGapPx:options.interRingGapPx,labelGapPx:options.labelGapPx,maximumExpansionIterations:options.maximumExpansionIterations,scoring:options.scoring},center:{longitude:options.center.longitude,latitude:options.center.latitude,canvasX:shift,canvasY:shift},eligible:ordered.length,placed:nodes.length,unplaced:attempt.unplaced.length,placedByRing,constraints,preferredAngleToleranceDeg:options.preferredAngleToleranceDeg,angleStepDeg:options.angleStepDeg,preferredWindowPlacedCount:attempt.placed.filter(node=>!node.preferredWindowExceeded).length,preferredWindowExceededCount:attempt.placed.filter(node=>node.preferredWindowExceeded).length,relaxationLevelCounts,ringExpansionCounts:Object.fromEntries(RINGS.map(ring=>[ring.ringId,iteration])),ringRadii:radii,expansionIterations:iteration,expansionLog,canvasLogicalWidth:logicalSize,canvasLogicalHeight:logicalSize,fitScale:Number(fitScale.toFixed(4)),effectiveCanvasUtilization:Number((totalLabelArea/(logicalSize*logicalSize)).toFixed(6)),semanticFontPx:{min:Math.min(...fonts),max:Math.max(...fonts),mean:Number((fonts.reduce((a,b)=>a+b,0)/fonts.length).toFixed(2))},finalScreenFontPx:{min:Number((Math.min(...fonts)*fitScale).toFixed(2)),max:Number((Math.max(...fonts)*fitScale).toFixed(2)),readableMinimum:8},geographicBearingError:{mean:Number((errors.reduce((a,b)=>a+b,0)/Math.max(1,errors.length)).toFixed(6)),median:Number(percentile(errors,.5).toFixed(6)),p95:Number(percentile(errors,.95).toFixed(6)),max:Number(Math.max(0,...errors).toFixed(6))},candidateChecks:totalCandidateChecks,finalIterationCandidateChecks:attempt.candidateChecks,layoutDurationMs:Date.now()-started,layoutFingerprint:`fnv1a-${fnv1a(fingerprintText).toString(16).padStart(8,'0')}`,inputMutationDetected:JSON.stringify(input)!==sourceSnapshot,nodes:nodes.map(({rect,...node})=>({...node,x:Number(node.x.toFixed(2)),y:Number(node.y.toFixed(2)),targetAngle:Number(node.targetAngle.toFixed(6)),finalAngle:Number(node.finalAngle.toFixed(6)),finalRadius:Number(node.finalRadius.toFixed(2)),sourceAxes:{dxMeters:Number(node.sourceAxes.dxMeters.toFixed(3)),northMeters:Number(node.sourceAxes.northMeters.toFixed(3)),eastWest:node.sourceAxes.eastWest,northSouth:node.sourceAxes.northSouth}})),unplacedNodes:attempt.unplaced,unplacedReasons:Object.fromEntries(attempt.unplaced.map(node=>[node.poiId,node.reason]))};
    return result;
  }
  app.directionPreservingRadialLayout=Object.freeze({VERSION,ALGORITHM_ID,RINGS,DEFAULTS,layout,geographicBearing,sourceAxes,hardHalfPlaneAllowed,angleOffsets,exactBandAllowed,measure,visualFontSize});
})(typeof window==='undefined'?globalThis:window);

