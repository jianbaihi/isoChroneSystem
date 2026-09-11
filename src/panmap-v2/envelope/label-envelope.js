(function(global){
 const v2=global.PanmapApp.panmapV2;
 function samples(boxes,pad=0,step=8){const out=[];for(const b of boxes){const nx=Math.max(1,Math.ceil((b.w+2*pad)/step)),ny=Math.max(1,Math.ceil((b.h+2*pad)/step));for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++)out.push([b.x-pad+i*(b.w+2*pad)/nx,b.y-pad+j*(b.h+2*pad)/ny]);}return out;}
 function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 function covers(poly,boxes,pad=8){
  if(!samples(boxes,pad,8).every(p=>inside(p,poly)))return false;
  // A contour edge must not enter any expanded bbox between sample points.
  for(const box of boxes){const b={x:box.x-pad,y:box.y-pad,w:box.w+2*pad,h:box.h+2*pad};for(let i=0;i<poly.length-1;i++){const a=poly[i],q=poly[i+1],dx=q[0]-a[0],dy=q[1]-a[1];let lo=0,hi=1;for(const [p,r] of [[-dx,a[0]-b.x],[dx,b.x+b.w-a[0]],[-dy,a[1]-b.y],[dy,b.y+b.h-a[1]]]){if(p===0){if(r<0){lo=2;break;}}else if(p<0)lo=Math.max(lo,r/p);else hi=Math.min(hi,r/p);}if(lo<hi&&lo<=1&&hi>=0)return false;}}
  return true;
 }
 function density(boxes,bandwidth,cell){
  const extent=v2.hierarchicalLabelLayout.bounds(boxes),pad=bandwidth*4+20;
  const origin=[extent.x-pad,extent.y-pad],w=Math.ceil((extent.w+2*pad)/cell),h=Math.ceil((extent.h+2*pad)/cell),field=new Float32Array(w*h);
  const points=samples(boxes,0,Math.max(6,cell)),radius=Math.ceil(bandwidth*3/cell),sigma=bandwidth/cell;
  for(const [x,y] of points){const cx=(x-origin[0])/cell,cy=(y-origin[1])/cell;for(let j=Math.max(0,Math.floor(cy-radius));j<Math.min(h,cy+radius);j++)for(let i=Math.max(0,Math.floor(cx-radius));i<Math.min(w,cx+radius);i++)field[j*w+i]+=Math.exp(-((i+.5-cx)**2+(j+.5-cy)**2)/(2*sigma*sigma));}
  return{field,w,h,origin,cell,sampleCount:points.length};
 }
 function buildRaw(boxes,{padding=10,resolution=180,initialBandwidth=12,coverPolygons=[],boundaryPadding=3}={}){
  if(!boxes.length)return null;
  if(!global.d3?.contours)throw new Error('D3 contours 依赖未就绪');
  const extent=v2.hierarchicalLabelLayout.bounds(boxes);
  let bandwidth=initialBandwidth;
  for(let pass=0;pass<7;pass++,bandwidth*=1.6){
   const cell=Math.max(2,(Math.max(extent.w,extent.h)+bandwidth*8)/resolution),grid=density(boxes,bandwidth,cell);
   const max=grid.field.reduce((m,v)=>Math.max(m,v),0),generator=global.d3.contours().size([grid.w,grid.h]).smooth(true);
   // Search descending thresholds above the kernel truncation noise floor.
   // If tails cannot connect at that density, increase bandwidth instead of drawing blocky near-zero support edges.
   for(let k=0;k<18;k++){
    const threshold=max*Math.pow(.78,k),contour=generator.contour(grid.field,threshold);
    if(contour.coordinates.length!==1||contour.coordinates[0].length!==1)continue;
    const polygon=contour.coordinates[0][0].map(([x,y])=>[x*cell+grid.origin[0],y*cell+grid.origin[1]]);
    if(covers(polygon,boxes,padding)&&coverPolygons.every(inner=>containsPolygon(polygon,inner,boundaryPadding)))return{polygon,path:path(polygon),threshold,bandwidth,padding,connected:true,holes:0,sampleCount:grid.sampleCount};
   }
  }
  throw new Error('未找到完整包住标签的连通等值线，请收起部分标签后重试。');
 }
 const cache=new Map();
 function build(boxes,options={}) {
  if(!boxes.length)return null;
  const b=v2.hierarchicalLabelLayout.bounds(boxes),normalized=boxes.map(n=>({x:n.x-b.x,y:n.y-b.y,w:n.w,h:n.h}));
  const normalizedOptions={...options,...(options.coverPolygons?{coverPolygons:options.coverPolygons.map(poly=>poly.map(p=>[p[0]-b.x,p[1]-b.y]))}:{})};
  const key=JSON.stringify([normalized.map(n=>Object.values(n).map(v=>Math.round(v*100)/100)),normalizedOptions]);
  let result=cache.get(key);
  if(!result){result=buildRaw(normalized,normalizedOptions);cache.set(key,result);if(cache.size>256)cache.delete(cache.keys().next().value);}
  const polygon=result.polygon.map(p=>[p[0]+b.x,p[1]+b.y]);return {...result,polygon,path:path(polygon)};
 }
 function path(poly){return poly.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('')+'Z';}
 function containsPolygon(outer,inner,padding=2){
  return covers(outer,inner.map(p=>({x:p[0],y:p[1],w:0,h:0})),padding);
 }
 function scene(model,tree){
  const descendants=id=>model.nodes.filter(n=>{let cursor=n;while(cursor){if(cursor.nodeId===id)return true;cursor=tree.nodes.get(cursor.parentNodeId);}return false;});
  const groups=[];
  for(const n of model.nodes.filter(n=>n.nodeType==='CATEGORY').sort((a,b)=>b.categoryLevel-a.categoryLevel)){
   const labels=descendants(n.nodeId),children=groups.filter(g=>tree.nodes.get(g.id).parentNodeId===n.nodeId);
   const shape=build(labels,{padding:8,resolution:150,initialBandwidth:10,coverPolygons:children.map(g=>g.shape.polygon),boundaryPadding:2});
   groups.push({id:n.nodeId,level:n.categoryLevel,code:n.topCode,shape});
  }
  // Density comes only from visible label bboxes. Nested outlines are containment
  // constraints, never extra density samples or a replacement layout container.
  const time=build([...model.nodes,model.center],{padding:18,resolution:190,coverPolygons:groups.map(g=>g.shape.polygon),boundaryPadding:3});
  return {groups,time};
 }
 v2.labelEnvelope={samples,density,inside,covers,containsPolygon,build,path,scene};
})(window);
