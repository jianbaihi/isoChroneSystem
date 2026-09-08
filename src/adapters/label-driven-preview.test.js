import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('./label-driven-preview.js',import.meta.url),'utf8'),context);
const engine=context.window.PanmapApp.labelDrivenPreview;
const make=(n=10)=>({pois:Array.from({length:n*9},(_,i)=>({poiId:String(i),name:`真实地点${i}`,displayRingId:`ring-${i%3}`,providerCategory:{level1Code:String(Math.floor(i/9)),level1Label:`类别${Math.floor(i/9)}`}}))});
test('preview preserves every input category and only uses actual names',()=>{
 const snapshot=make(16),result=engine.build(snapshot);
 assert.equal(result.clusters.length,16);
 for(const c of result.clusters){assert.ok(c.path.endsWith('Z')); for(const l of c.labels.filter(l=>!l.title))assert.ok(snapshot.pois.some(p=>p.name===l.fullText));}
});
test('preview output is deterministic and does not mutate frozen source',()=>{
 const snapshot=make();snapshot.pois.forEach(Object.freeze);Object.freeze(snapshot.pois);Object.freeze(snapshot);
 assert.equal(JSON.stringify(engine.build(snapshot)),JSON.stringify(engine.build(snapshot)));
});
test('empty input has valid extent and no invented labels',()=>{
 const result=engine.build({pois:[]});assert.equal(result.clusters.length,0);assert.equal(result.height,760);assert.equal(engine.envelope([]),'');
});
test('envelope changes with label width and encloses finite text samples',()=>{
 const label={x:0,y:0,width:20,height:16};const a=engine.envelope([label]);const b=engine.envelope([{...label,width:200}]);assert.notEqual(a,b);assert.doesNotMatch(b,/NaN|Infinity/);
});
test('long representative names never collide across clusters',()=>{
 const codes=['050000','060000','070000','080000','090000','100000','110000','140000','150000','200000'];
 const result=engine.build({pois:codes.flatMap(code=>Array.from({length:8},(_,i)=>({name:`特别长的真实地点名称${i}`,providerCategory:{level1Code:code,level1Label:'标准类别名称'}})))});
 const labels=result.clusters.flatMap(c=>c.labels);
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
  const a=labels[i],b=labels[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2 || Math.abs(a.y-b.y)>=(a.height+b.height)/2,`${a.text} overlaps ${b.text}`);
 }
});
test('real provider subtypes are ranked by frequency before POI fallback',()=>{
 const result=engine.build({pois:[['餐饮服务;中餐厅;火锅店','店一'],['餐饮服务;中餐厅;火锅店','店二'],['餐饮服务;咖啡厅','店三']].map(([typeLabel,name])=>({name,providerCategory:{level1Code:'050000',level1Label:'餐饮服务',typeLabel}}))});
 assert.equal(result.clusters[0].labels[1].text,'火锅店');assert.equal(result.clusters[0].labels[2].text,'咖啡厅');
});
