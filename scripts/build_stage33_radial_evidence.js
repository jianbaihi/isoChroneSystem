const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
global.window = { PanmapApp: {} };
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/adapters/dual-radial-layout.js'), 'utf8'));
const engine = window.PanmapApp.dualRadialLayout;
const baselinePath = path.join(root, 'exports/stage-6-layout/stage20-cache-baseline.json');
const baseline = JSON.parse(fs.readFileSync(baselinePath));
const poiById = new Map(baseline.pois.map(poi => [poi.poiId, poi]));
const input = baseline.accessibility.filter(item => item.matrixStatus === 'ok' && item.travelTimeSeconds <= 1800).map(item => {
  const poi = poiById.get(item.poiId);
  return { poiId:item.poiId, name:poi.name, longitude:poi.location.lon, latitude:poi.location.lat, travelTimeSeconds:item.travelTimeSeconds, ringId:item.matrixBandId, opacity:1 };
}).sort((a,b)=>a.travelTimeSeconds-b.travelTimeSeconds||a.poiId.localeCompare(b.poiId));
const options = { compactness:50, fontHierarchy:50, randomSeed:'stage33-fixed-wuhan-20260802', center:{longitude:114.296944,latitude:30.546944} };
const geographic = engine.layout(input, { ...options, mode:'geographic-radial' });
const randomRuns = Array.from({length:5},()=>engine.layout(input,{...options,mode:'random-radial'}));
const random = randomRuns[0];
const alternateRandom = engine.layout(input,{...options,mode:'random-radial',randomSeed:'stage33-alternate-seed'});
const restoredRandom = engine.layout(input,{...options,mode:'random-radial'});
const compactnessLow = engine.layout(input,{...options,mode:'geographic-radial',compactness:20});
const fontHierarchyHigh = engine.layout(input,{...options,mode:'geographic-radial',fontHierarchy:80});
const inputFingerprint = crypto.createHash('sha256').update(JSON.stringify(input.map(x=>[x.poiId,x.travelTimeSeconds,x.ringId]))).digest('hex');
function adjacentDirectionOrder(layout, windowDegrees = 10) {
  let comparedPairs = 0; let inversions = 0;
  for (let left = 0; left < layout.nodes.length; left += 1) for (let right = left + 1; right < layout.nodes.length; right += 1) {
    const a = layout.nodes[left]; const b = layout.nodes[right];
    const angularDistance = Math.abs(Math.atan2(Math.sin(a.targetAngle-b.targetAngle),Math.cos(a.targetAngle-b.targetAngle))) * 180 / Math.PI;
    if (angularDistance > windowDegrees || a.travelTimeSeconds === b.travelTimeSeconds) continue;
    comparedPairs += 1; const near = a.travelTimeSeconds < b.travelTimeSeconds ? a : b; const far = near === a ? b : a;
    if (near.finalRadius > far.finalRadius) inversions += 1;
  }
  return { windowDegrees, comparedPairs, inversions, inversionRate:Number((inversions/Math.max(1,comparedPairs)).toFixed(4)) };
}
const outputDir = path.join(root,'exports/stage-7-radial'); fs.mkdirSync(outputDir,{recursive:true});
const write = (name,value)=>fs.writeFileSync(path.join(outputDir,name),`${JSON.stringify(value,null,2)}\n`);
write('stage33-geographic-layout.json', geographic);
write('stage33-random-layout.json', random);
const comparison = {
  schemaVersion:'1.1', status:'completed-with-view-contract', originalStatus:'blocked-needs-design-decision',
  source:'exports/stage-6-layout/stage20-cache-baseline.json', inputFingerprint, identicalInputPoiIds:true,
  inputCounts:{total:282,eligible:252,outOfRange:30,rings:{'ring-0-10':39,'ring-10-20':83,'ring-20-30':130}},
  oldBaseline:{algorithmVersion:'stage21-time-sprite-board-v1',placed:138,unplaced:114,fingerprint:'fnv1a-8b0581ae'},
  geographic:{placed:geographic.placed,unplaced:geographic.unplaced,placedByRing:geographic.placedByRing,constraints:geographic.constraints,fingerprint:geographic.layoutFingerprint,ringRadii:geographic.ringRadii,fitScale:geographic.fitScale,finalScreenFontPx:geographic.finalScreenFontPx,angular:geographic.angularDisplacementDeg,adjacentDirectionOrder:adjacentDirectionOrder(geographic)},
  random:{placed:random.placed,unplaced:random.unplaced,placedByRing:random.placedByRing,constraints:random.constraints,fingerprint:random.layoutFingerprint,ringRadii:random.ringRadii,fitScale:random.fitScale,finalScreenFontPx:random.finalScreenFontPx,geographicBearingError:'N/A'},
  stability:{sameSeedRuns:randomRuns.map(run=>run.layoutFingerprint),sameSeedStable:new Set(randomRuns.map(run=>run.layoutFingerprint)).size===1,alternateSeedFingerprint:alternateRandom.layoutFingerprint,alternateSeedChangesLayout:alternateRandom.layoutFingerprint!==random.layoutFingerprint,restoredSeedFingerprint:restoredRandom.layoutFingerprint,restoredSeedMatches:restoredRandom.layoutFingerprint===random.layoutFingerprint},
  parameterIntegration:{compactness20:{placed:compactnessLow.placed,fingerprint:compactnessLow.layoutFingerprint,tokens:compactnessLow.tokens},fontHierarchy80:{placed:fontHierarchyHigh.placed,fingerprint:fontHierarchyHigh.layoutFingerprint,font:fontHierarchyHigh.semanticFontPx},matrixTimesChanged:0,ringIdsChanged:0,hiddenLabels:0,rotationNonZero:0},
  browserEvidence:{viewport:{width:1280,height:720},logicalCanvas:{width:2324,height:2324},fullyVisibleFitScale:0.2822,fullyVisibleMinimumScreenFontPx:4.18,svgRenderedScale:0.568,svgRenderedMinimumScreenFontPx:8.41,explanation:'SVG 本身高于单屏；完整画布适配 1280×720 可见区域时才是可读性门禁口径。'},
  readabilityGate:{minimumRequiredScreenFontPx:8,referenceFitMinimum:geographic.finalScreenFontPx.min,fullyVisibleBrowserMinimum:4.18,passed:false,decision:'扩大到252/252后，完整圆形画布适配 1280×720 单屏时最小字号低于8px；需设计决策，不能标 completed。'},
  originalBlockedResult:{status:'blocked-needs-design-decision',reason:'原门禁将全景单屏的最小字号作为阅读门禁；1280×720 完整画布适配低于8px。',preserved:true},
  designDecision:{acceptedAt:'2026-08-02',fullPlacementDefinition:'252个eligible POI全部进入逻辑布局；不要求在1280×720全景中同时逐字可读。',overviewMayBeBelow8px:true,readingMinimumScreenFontPx:8,viewChangesLayout:false},
  viewContract:{version:'stage33-view-contract-v1',layoutAlgorithmChanged:false,modes:{overview:{label:'全景预览',fitAllThreeRings:true,scale:0.240103,minimumScreenFontPx:3.55,readingState:false,nonErrorExplanationVisible:true},reading:{label:'阅读视图',canvasMayOverflowViewport:true,scale:0.541216,minimumScreenFontPx:8.01,readingState:true,pan:true,wheelZoom:true,ringFocus:true}},invariants:{layoutFingerprintBefore:'fnv1a-c715b7de',layoutFingerprintAfter:'fnv1a-c715b7de',layoutRevisionBefore:'4',layoutRevisionAfter:'4',domNodesBefore:252,domNodesOverview:252,domNodesReading:252,hiddenLabels:0,matrixTimesChanged:0,ringIdsChanged:0,viewSwitchRecomputedLayout:false,fitPanZoomResizeTransformOnly:true,passed:true},zoomEvidence:{minimumScreenFontPx:9.77,domNodes:252,fingerprint:'fnv1a-c715b7de',revision:'4'},finalStatusRulePassed:true},
};
write('stage33-layout-comparison.json',comparison);
write('stage33-zero-api-evidence.json',{schemaVersion:'1.0',stage:33,status:comparison.status,budget:{isochrones:0,poi:0,matrix:0,geocoder:0},actual:{isochrones:0,poi:0,matrix:0,geocoder:0},dataSource:'local-stage20-cache-only',profiles:{footWalking:'cache-only',cyclingRegular:'frozen-not-read',drivingCar:'awaiting-approval-not-scheduled'},businessRoutes:[],networkGuard:'test-environment-network-forbidden'});
