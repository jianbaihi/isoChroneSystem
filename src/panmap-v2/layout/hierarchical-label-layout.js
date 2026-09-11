(function(global){
 const v2=global.PanmapApp.panmapV2;
 const overlap=(a,b,gap=40)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
 function bounds(nodes){return {x:Math.min(...nodes.map(n=>n.x)),y:Math.min(...nodes.map(n=>n.y)),w:Math.max(...nodes.map(n=>n.x+n.w))-Math.min(...nodes.map(n=>n.x)),h:Math.max(...nodes.map(n=>n.y+n.h))-Math.min(...nodes.map(n=>n.y))};}
 function measure(text,size,weight){const ctx=global.document?.createElement('canvas').getContext('2d');if(ctx){ctx.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;return ctx.measureText(text).width;}return [...text].reduce((n,c)=>n+(/[\u0000-\u007f]/.test(c)?size*.6:size),0);}
 const move=(b,x,y)=>({...b,x:b.x+x,y:b.y+y});
 function place(group,obstacles,angle,preferred){
  if(preferred){const b=move(group.bounds,preferred.x,preferred.y);if(!obstacles.some(o=>overlap(b,o)))return preferred;}
  for(let radius=50;radius<20000;radius+=8){for(const offset of [0,...Array.from({length:12},(_,i)=>[(i+1)*Math.PI/12,-(i+1)*Math.PI/12]).flat()]){const x=Math.cos(angle+offset)*radius,y=Math.sin(angle+offset)*radius;const b=move(group.bounds,x,y);if(!obstacles.some(o=>overlap(b,o)))return{x,y};}}
  throw new Error('标签布局未收敛，请收起部分类别后重试。');
 }
 function layout(tree,expanded,previous=new Map(),focused=null){
  function subtree(id){
   const source=tree.nodes.get(id),size=source.nodeType==='POI'?16:source.categoryLevel===1?23:19;
   const w=measure(source.text,size,source.categoryLevel===1?650:500)+4,h=size+8;
   let nodes=[{...source,fontSize:size,x:-w/2,y:-h/2,w,h,expanded:expanded.has(id)}],boxes=[{x:-w/2,y:-h/2,w,h}];
   if(expanded.has(id))source.children.forEach((child,i)=>{const group=subtree(child),a=-Math.PI/2+i*2.399963;const p=place(group,boxes,a);nodes.push(...group.nodes.map(n=>move(n,p.x,p.y)));boxes.push(move(group.bounds,p.x,p.y));});
   const extent=bounds(nodes);
   // Reserve a halo from the occupied text span, independently of contour geometry.
   // A larger semantic subtree needs room for its density tails between neighbours.
   const halo=nodes.length>1?Math.max(24,Math.max(extent.w,extent.h)*.18):0;
   return {nodes,bounds:{x:extent.x-halo,y:extent.y-halo,w:extent.w+2*halo,h:extent.h+2*halo}};
  }
  let roots=tree.roots.slice();
  if(focused){let n=tree.nodes.get(focused);while(n?.parentNodeId)n=tree.nodes.get(n.parentNodeId);if(n)roots=[n.nodeId,...roots.filter(id=>id!==n.nodeId)];}
  const center={x:-62,y:-22,w:124,h:44},placed=[center],nodes=[],positions=new Map();
  roots.forEach(id=>{const group=subtree(id),a=-Math.PI/2+tree.roots.indexOf(id)*2*Math.PI/Math.max(1,roots.length);const p=place(group,placed,a,previous.get(id));nodes.push(...group.nodes.map(n=>move(n,p.x,p.y)));placed.push(move(group.bounds,p.x,p.y));positions.set(id,p);});
  return {nodes,positions,bounds:bounds([...nodes,center]),center};
 }
 function reflow(tree,expanded,previousModel,focused){
  const shrinking=v2.categoryRegistry.visible(tree,expanded).length<(previousModel?.nodes.length||0);
  return layout(tree,expanded,shrinking?new Map():(previousModel?.positions||new Map()),shrinking?null:focused);
 }
 v2.hierarchicalLabelLayout={layout,reflow,overlap,bounds};
})(window);
