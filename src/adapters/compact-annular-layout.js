(function initCompactAnnularLayout(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  const VERSION = 'stage37-compact-annular-v1';
  const TWO_PI = Math.PI * 2;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const RINGS = [
    { ringId: 'ring-0-10', lower: 0, upper: 600, time: 10 },
    { ringId: 'ring-10-20', lower: 600, upper: 1200, time: 20 },
    { ringId: 'ring-20-30', lower: 1200, upper: 1800, time: 30 },
  ];
  const DEFAULTS = Object.freeze({
    algorithm: 'frontier-contact', mode: 'geographic', randomSeed: 'stage37-fixed-wuhan-20260804',
    compactness: 50, fontHierarchy: 50, centerSafeRadiusPx: 62, centerGapPx: 2,
    interRingGapPx: 8, labelGapPx: 1.5, outerContourGapPx: 3, canvasMarginPx: 26,
  });

  function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
  function normalizeAngle(value) { return ((value % TWO_PI) + TWO_PI) % TWO_PI; }
  function angleDelta(left, right) { return Math.atan2(Math.sin(left - right), Math.cos(left - right)); }
  function fnv1a(text) { let hash = 0x811c9dc5; for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); } return hash >>> 0; }
  function randomFactory(seed) { let state = fnv1a(`${VERSION}|${seed}`); return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; }; }
  function geographicBearing(center, point) {
    const phi1 = center.latitude * Math.PI / 180; const phi2 = point.latitude * Math.PI / 180;
    const deltaLambda = (point.longitude - center.longitude) * Math.PI / 180;
    return normalizeAngle(Math.atan2(Math.sin(deltaLambda) * Math.cos(phi2), Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)) - Math.PI / 2);
  }
  function visualFontSize(rank, count, hierarchy = 50) {
    const q = count <= 1 ? 0 : rank / (count - 1); const strength = 0.2 + clamp(hierarchy, 0, 100) / 100 * 0.8;
    return Number(clamp(19 + 7 * strength * (1 - 2 * q), 12, 26).toFixed(2));
  }
  function measure(label, fontSize) {
    let units = 0; for (const char of String(label)) units += char.codePointAt(0) > 255 ? 1 : (char === ' ' ? 0.36 : 0.58);
    return { width: Math.max(18, Math.ceil(units * fontSize + 8)), height: Math.ceil(fontSize * 1.34 + 4) };
  }
  function rectFor(x, y, item) { return { left:x-item.width/2, right:x+item.width/2, top:y-item.height/2, bottom:y+item.height/2 }; }
  function overlaps(a, b, gap = 0) { return !(a.right + gap <= b.left || b.right + gap <= a.left || a.bottom + gap <= b.top || b.bottom + gap <= a.top); }
  function minRectRadius(rect) { const dx = rect.left > 0 ? rect.left : rect.right < 0 ? -rect.right : 0; const dy = rect.top > 0 ? rect.top : rect.bottom < 0 ? -rect.bottom : 0; return Math.hypot(dx, dy); }
  function maxRectRadius(rect) { return Math.max(Math.hypot(rect.left,rect.top),Math.hypot(rect.right,rect.top),Math.hypot(rect.left,rect.bottom),Math.hypot(rect.right,rect.bottom)); }
  function rectGap(a, b) { const dx=Math.max(a.left-b.right,b.left-a.right,0); const dy=Math.max(a.top-b.bottom,b.top-a.bottom,0); return Math.hypot(dx,dy); }
  function pointRectDistance(x,y,rect){const dx=Math.max(rect.left-x,x-rect.right,0);const dy=Math.max(rect.top-y,y-rect.bottom,0);return Math.hypot(dx,dy);}
  function tangentCandidate(item, angle, inner) {
    let low=inner, high=inner+Math.hypot(item.width,item.height)+12;
    for(let i=0;i<22;i+=1){const radius=(low+high)/2;const rect=rectFor(Math.cos(angle)*radius,Math.sin(angle)*radius,item);if(minRectRadius(rect)>=inner)high=radius;else low=radius;}
    const radius=high; const x=Math.cos(angle)*radius; const y=Math.sin(angle)*radius; return {x,y,angle:normalizeAngle(angle),rect:rectFor(x,y,item)};
  }
  function projectOutside(item, x, y, inner) {
    const angle=Math.atan2(y,x); const current=Math.hypot(x,y); const tangent=tangentCandidate(item,angle,inner); const radius=Math.max(current,Math.hypot(tangent.x,tangent.y));
    const px=Math.cos(angle)*radius; const py=Math.sin(angle)*radius; return {x:px,y:py,angle:normalizeAngle(angle),rect:rectFor(px,py,item)};
  }
  function collision(candidate, placed, gap, skipPoiId = null) { return placed.some(node=>node.poiId!==skipPoiId&&overlaps(candidate.rect,node.rect,gap)); }
  function seededShuffle(items, seed) { const random=randomFactory(seed); const result=[...items]; for(let i=result.length-1;i>0;i-=1){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];} return result; }
  function preparedInput(input, options) {
    const ranked=[...input].sort((a,b)=>a.travelTimeSeconds-b.travelTimeSeconds||a.poiId.localeCompare(b.poiId));
    return ranked.map((item,rank)=>{const fontSize=visualFontSize(rank,ranked.length,options.fontHierarchy);const size=measure(item.name,fontSize);return{...item,rank,fontSize,width:size.width,height:size.height,rotation:0,targetAngle:geographicBearing(options.center,item)};});
  }
  function frontierPlace(items, inner, options) {
    const placed=[]; let candidateChecks=0; const randomMode=options.mode==='random-match';
    const order=randomMode?seededShuffle(items,options.randomSeed):[...items].sort((a,b)=>b.width*b.height-a.width*a.height||a.rank-b.rank);
    for(const item of order){
      const candidates=[]; const phase=randomMode?(fnv1a(`${options.randomSeed}|slot|${placed.length}`)%360)*Math.PI/180:item.targetAngle;
      for(let degree=0;degree<360;degree+=4){const offset=Math.ceil(degree/8)*(degree%8===0?1:-1)*4*Math.PI/180;candidates.push(tangentCandidate(item,phase+offset,inner));}
      for(const node of placed){
        const xGap=(node.width+item.width)/2+options.labelGapPx; const yGap=(node.height+item.height)/2+options.labelGapPx;
        [[node.x+xGap,node.y],[node.x-xGap,node.y],[node.x,node.y+yGap],[node.x,node.y-yGap],
          [node.x+xGap,node.y+yGap],[node.x+xGap,node.y-yGap],[node.x-xGap,node.y+yGap],[node.x-xGap,node.y-yGap]].forEach(([x,y])=>candidates.push(projectOutside(item,x,y,inner)));
      }
      candidates.sort((a,b)=>{
        const aOuter=maxRectRadius(a.rect),bOuter=maxRectRadius(b.rect);
        const aAngle=randomMode?Math.abs(angleDelta(a.angle,phase)):Math.abs(angleDelta(a.angle,item.targetAngle));
        const bAngle=randomMode?Math.abs(angleDelta(b.angle,phase)):Math.abs(angleDelta(b.angle,item.targetAngle));
        return (aOuter+aAngle*10)-(bOuter+bAngle*10)||a.angle-b.angle;
      });
      let chosen=null; for(const candidate of candidates){candidateChecks+=1;if(!collision(candidate,placed,options.labelGapPx)){chosen=candidate;break;}}
      if(!chosen) throw new Error(`frontier placement exhausted for ${item.poiId}`);
      placed.push({...item,...chosen,finalAngle:chosen.angle,rect:chosen.rect});
    }
    return {placed,candidateChecks};
  }
  function fieldCandidates(inner, algorithm, seed, count=42000) {
    const candidates=[]; const random=randomFactory(seed); const areaStep=algorithm==='fermat'?410:360;
    for(let n=0;n<count;n+=1){
      const radius=Math.sqrt(inner*inner+(n+1)*areaStep/Math.PI);
      const angle=algorithm==='fermat'?normalizeAngle(n*GOLDEN_ANGLE):normalizeAngle(n*GOLDEN_ANGLE+(random()-.5)*0.9);
      candidates.push({x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,angle,radius,index:n});
    }
    return candidates;
  }
  function fieldPlace(items, inner, options, algorithm) {
    const placed=[];let candidateChecks=0;const candidates=fieldCandidates(inner,algorithm,`${options.randomSeed}|${algorithm}|${inner}`);
    const ordered=[...items].sort((a,b)=>b.width*b.height-a.width*a.height||a.rank-b.rank);
    for(const item of ordered){let chosen=null;for(const anchor of candidates){candidateChecks+=1;const rect=rectFor(anchor.x,anchor.y,item);if(minRectRadius(rect)<inner||collision({rect},placed,options.labelGapPx))continue;chosen={...anchor,rect};break;}if(!chosen)throw new Error(`${algorithm} field exhausted for ${item.poiId}`);placed.push({...item,x:chosen.x,y:chosen.y,finalAngle:chosen.angle,rect:chosen.rect});}
    return {placed,candidateChecks};
  }
  function compactTowardCenter(nodes, inner, gap, passes=3) {
    let moves=0;let checks=0;
    for(let pass=0;pass<passes;pass+=1){for(const node of [...nodes].sort((a,b)=>maxRectRadius(b.rect)-maxRectRadius(a.rect))){const angle=Math.atan2(node.y,node.x);let high=Math.hypot(node.x,node.y),low=Math.hypot(tangentCandidate(node,angle,inner).x,tangentCandidate(node,angle,inner).y);let best={x:node.x,y:node.y,rect:node.rect};for(let i=0;i<16;i+=1){const radius=(low+high)/2;const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,rect=rectFor(x,y,node);checks+=1;if(!collision({rect},nodes,gap,node.poiId)){best={x,y,rect};high=radius;}else low=radius;}if(Math.hypot(best.x,best.y)<Math.hypot(node.x,node.y)-.1){node.x=best.x;node.y=best.y;node.rect=best.rect;node.finalAngle=normalizeAngle(angle);moves+=1;}}}
    return {moves,checks};
  }
  function percentile(values,p){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];}
  function ringMetrics(nodes, boundary, previousOuter) {
    const minimums=nodes.map(node=>minRectRadius(node.rect));const maximums=nodes.map(node=>maxRectRadius(node.rect));const nearest=[];
    nodes.forEach((node,index)=>{let value=Infinity;for(let j=0;j<nodes.length;j+=1)if(index!==j)value=Math.min(value,rectGap(node.rect,nodes[j].rect));nearest.push(value);});
    const labelArea=nodes.reduce((sum,node)=>sum+node.width*node.height,0);const annulusArea=Math.PI*(boundary.outer*boundary.outer-boundary.inner*boundary.inner);
    const bins=new Array(720).fill(false);nodes.forEach(node=>{const angle=normalizeAngle(Math.atan2(node.y,node.x));const half=Math.atan2(Math.hypot(node.width,node.height)/2,Math.max(1,Math.hypot(node.x,node.y)));const start=Math.floor(normalizeAngle(angle-half)/TWO_PI*bins.length);const span=Math.ceil(half*2/TWO_PI*bins.length);for(let k=0;k<=span;k+=1)bins[(start+k)%bins.length]=true;});
    let longest=0,current=0;for(let i=0;i<bins.length*2;i+=1){if(!bins[i%bins.length]){current+=1;longest=Math.max(longest,current);}else current=0;}longest=Math.min(longest,bins.length);
    let largestEmptyCircleRadiusPx=0;for(let radius=boundary.inner+6;radius<boundary.outer;radius+=12){const count=Math.max(24,Math.ceil(TWO_PI*radius/12));for(let index=0;index<count;index+=1){const angle=index/count*TWO_PI,x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;let clearance=Math.min(radius-boundary.inner,boundary.outer-radius);for(const node of nodes){clearance=Math.min(clearance,pointRectDistance(x,y,node.rect));if(clearance<=largestEmptyCircleRadiusPx)break;}largestEmptyCircleRadiusPx=Math.max(largestEmptyCircleRadiusPx,clearance);}}
    return {ringId:boundary.ringId,count:nodes.length,innerRadiusPx:boundary.inner,outerRadiusPx:boundary.outer,bandWidthPx:Number((boundary.outer-boundary.inner).toFixed(2)),unusedInnerBandPx:Number((Math.min(...minimums)-boundary.inner).toFixed(2)),outerSlackPx:Number((boundary.outer-Math.max(...maximums)).toFixed(2)),gapFromPreviousRingPx:previousOuter==null?Number((boundary.inner-DEFAULTS.centerSafeRadiusPx).toFixed(2)):Number((boundary.inner-previousOuter).toFixed(2)),bandUtilization:Number((labelArea/annulusArea).toFixed(4)),voidAreaRatio:Number((1-labelArea/annulusArea).toFixed(4)),largestEmptyCircleRadiusPx:Number(largestEmptyCircleRadiusPx.toFixed(2)),nearestGapPx:{min:Number(Math.min(...nearest).toFixed(2)),median:Number(percentile(nearest,.5).toFixed(2)),p95:Number(percentile(nearest,.95).toFixed(2))},maximumAngularEmptyRunDeg:Number((longest/bins.length*360).toFixed(2))};
  }
  function audit(nodes,boundaries,centerRadius){let overlapCount=0,outsideOwnRingCount=0,centerCollisionCount=0;for(let i=0;i<nodes.length;i+=1){const boundary=boundaries.find(item=>item.ringId===nodes[i].ringId);if(minRectRadius(nodes[i].rect)<boundary.inner-.05||maxRectRadius(nodes[i].rect)>boundary.outer+.05)outsideOwnRingCount+=1;if(minRectRadius(nodes[i].rect)<centerRadius)centerCollisionCount+=1;for(let j=i+1;j<nodes.length;j+=1)if(overlaps(nodes[i].rect,nodes[j].rect,0))overlapCount+=1;}return{overlapCount,outsideOwnRingCount,centerCollisionCount,timeLabelCollisionCount:0};}
  function layout(input, supplied={}) {
    const started=Date.now();const options={...DEFAULTS,...supplied};options.center={longitude:Number(supplied.center?.longitude??114.296944),latitude:Number(supplied.center?.latitude??30.546944)};options.compactness=clamp(options.compactness,0,100);options.fontHierarchy=clamp(options.fontHierarchy,0,100);options.labelGapPx=Number((2.5-options.compactness*.02).toFixed(2));
    const algorithm=['fermat','poisson-disc','frontier-contact'].includes(options.algorithm)?options.algorithm:'frontier-contact';const mode=options.mode==='random-match'?'random-match':'geographic';const prepared=preparedInput(input,options);const boundaries=[];const allNodes=[];let inner=options.centerSafeRadiusPx+options.centerGapPx;let candidateChecks=0;let compactionMoves=0;
    for(const ring of RINGS){const items=prepared.filter(item=>item.ringId===ring.ringId);const placement=algorithm==='frontier-contact'?frontierPlace(items,inner,{...options,mode}):fieldPlace(items,inner,options,algorithm==='poisson-disc'?'poisson':'fermat');const compacted=compactTowardCenter(placement.placed,inner,options.labelGapPx,algorithm==='frontier-contact'?4:2);candidateChecks+=placement.candidateChecks+compacted.checks;compactionMoves+=compacted.moves;const outer=Math.max(...placement.placed.map(node=>maxRectRadius(node.rect)))+options.outerContourGapPx;boundaries.push({ringId:ring.ringId,time:ring.time,inner:Number(inner.toFixed(2)),outer:Number(outer.toFixed(2))});allNodes.push(...placement.placed);inner=outer+options.interRingGapPx;}
    const outermost=boundaries[2].outer;const logicalSize=Math.ceil((outermost+options.canvasMarginPx)*2);const shift=logicalSize/2;const rendered=allNodes.map(node=>({...node,x:node.x+shift,y:node.y+shift,rect:{left:node.rect.left+shift,right:node.rect.right+shift,top:node.rect.top+shift,bottom:node.rect.bottom+shift}}));const constraints=audit(allNodes,boundaries,options.centerSafeRadiusPx);const fonts=prepared.map(node=>node.fontSize);const ringStats=boundaries.map((boundary,index)=>ringMetrics(allNodes.filter(node=>node.ringId===boundary.ringId),boundary,index?boundaries[index-1].outer:null));const angles=allNodes.map(node=>Math.abs(angleDelta(node.finalAngle,node.targetAngle))*180/Math.PI);const fitScale=Math.min(1126/logicalSize,943/logicalSize,1);const placedByRing=Object.fromEntries(RINGS.map(ring=>[ring.ringId,allNodes.filter(node=>node.ringId===ring.ringId).length]));const fingerprintText=`${VERSION}|${algorithm}|${mode}|${mode==='random-match'?options.randomSeed:''}|${boundaries.map(x=>`${x.inner}:${x.outer}`).join('|')}|${rendered.map(node=>`${node.poiId}:${node.x.toFixed(2)}:${node.y.toFixed(2)}:${node.fontSize}`).sort().join('|')}`;
    return {schemaVersion:'1.0',stage:37,algorithmVersion:VERSION,algorithm,mode,randomSeed:mode==='random-match'?options.randomSeed:null,eligible:prepared.length,placed:allNodes.length,unplaced:0,placedByRing,constraints,center:{longitude:options.center.longitude,latitude:options.center.latitude,canvasX:shift,canvasY:shift,safeRadiusPx:options.centerSafeRadiusPx},canvasLogicalWidth:logicalSize,canvasLogicalHeight:logicalSize,ringRadii:boundaries,ringMetrics:ringStats,fitScale:Number(fitScale.toFixed(4)),semanticFontPx:{min:Math.min(...fonts),max:Math.max(...fonts),mean:Number((fonts.reduce((a,b)=>a+b,0)/fonts.length).toFixed(2))},finalScreenFontPx:{min:Number((Math.min(...fonts)*fitScale).toFixed(2)),max:Number((Math.max(...fonts)*fitScale).toFixed(2)),readableMinimum:8},geographicBearingError:mode==='geographic'?{mean:Number((angles.reduce((a,b)=>a+b,0)/angles.length).toFixed(2)),median:Number(percentile(angles,.5).toFixed(2)),p95:Number(percentile(angles,.95).toFixed(2)),max:Number(Math.max(...angles).toFixed(2))}:'N/A',layoutDurationMs:Date.now()-started,candidateChecks,compactionMoves,layoutFingerprint:`fnv1a-${fnv1a(fingerprintText).toString(16).padStart(8,'0')}`,tokens:{compactness:options.compactness,fontHierarchy:options.fontHierarchy,centerSafeRadiusPx:options.centerSafeRadiusPx,centerGapPx:options.centerGapPx,interRingGapPx:options.interRingGapPx,labelGapPx:options.labelGapPx,outerContourGapPx:options.outerContourGapPx,rotation:0,coordinateGeneration:algorithm==='frontier-contact'?'inner-boundary-and-placed-label-contact-frontier':algorithm==='fermat'?'golden-angle-candidate-field':'seeded-poisson-like-candidate-field',randomContract:mode==='random-match'?'seed changes label-to-constrained-slot matching only':'N/A'},nodes:rendered.map(({rect,...node})=>({...node,x:Number(node.x.toFixed(2)),y:Number(node.y.toFixed(2)),targetAngle:Number(node.targetAngle.toFixed(6)),finalAngle:Number(node.finalAngle.toFixed(6)),placed:true,status:'placed'})),unplacedNodes:[]};
  }
  app.compactAnnularLayout=Object.freeze({VERSION,RINGS,DEFAULTS,layout,measure,visualFontSize,geographicBearing,normalizeAngle,angleDelta});
})(typeof window === 'undefined' ? globalThis : window);
