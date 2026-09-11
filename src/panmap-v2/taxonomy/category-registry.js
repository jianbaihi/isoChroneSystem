(function(global){
 const app=global.PanmapApp=global.PanmapApp||{},v2=app.panmapV2=app.panmapV2||{};
 function catalogue(directory){
  if(!directory?.version||!directory.types)throw new Error('高德官方目录资源缺失');
  const nodes=new Map(),roots=[];
  for(const [code,labels] of Object.entries(directory.types)){
   const codes=[code.slice(0,2)+'0000',code.slice(0,4)+'00',code];
   labels.forEach((rawLabel,i)=>{const label=i<2?(directory.types[codes[i]]?.[i]||rawLabel):rawLabel;const id=`category:${i+1}:${codes[i]}`,parentId=i?`category:${i}:${codes[i-1]}`:null;
    if(!nodes.has(id)){nodes.set(id,{nodeId:id,code:codes[i],label,level:i+1,parentId,children:[]});if(parentId)nodes.get(parentId).children.push(id);else roots.push(id);}
    else if(nodes.get(id).label!==label)throw new Error('高德官方目录名称冲突');
   });
  }
  return {version:directory.version,nodes,roots:roots.sort(),issues:directory.issues||[]};
 }
 function build(snapshot,maxMinute=10){
  const nodes=new Map(),roots=[],entities=new Map();
  for(const poi of snapshot.pois.filter(p=>Number.isFinite(p.travelTimeMinuteEstimate)&&p.travelTimeMinuteEstimate>=0&&p.travelTimeMinuteEstimate<=maxMinute)){
   const path=poi.providerCategory.hierarchy;
   if(!path || path.length!==3)throw new Error('高德三级类别目录未就绪，请返回传统地图校正。');
   let parent=null;
   for(const category of path){
    const id=`category:${category.level}:${category.code}`;
    if(!nodes.has(id)){
     const node={nodeId:id,nodeType:'CATEGORY',categoryLevel:category.level,code:category.code,text:category.label,parentNodeId:parent,children:[],poiCount:0,topCode:path[0].code};
     nodes.set(id,node);if(parent)nodes.get(parent).children.push(id);else roots.push(id);
    }
    const node=nodes.get(id);
    if(node.parentNodeId!==parent || node.text!==category.label)throw new Error('类别目录存在冲突，请先更新传统地图数据。');
    node.poiCount++;parent=id;
   }
   const id=`poi:${poi.poiId}`;
   if(entities.has(id))throw new Error('POI身份重复');
   entities.set(id,{...poi,parentPoiId:poi.parentPoiId||null});
   nodes.set(id,{nodeId:id,nodeType:'POI',categoryLevel:null,text:poi.name,parentNodeId:parent,children:[],poiCount:1,topCode:path[0].code,poiId:poi.poiId});
   nodes.get(parent).children.push(id);
  }
  for(const node of nodes.values())node.children.sort((a,b)=>nodes.get(a).text.localeCompare(nodes.get(b).text,'zh-CN')||a.localeCompare(b));
  roots.sort();return {nodes,roots,entities,directoryVersion:snapshot.categoryDirectory?.version,maxMinute};
 }
 function visible(tree,expanded){const out=[];const visit=id=>{const n=tree.nodes.get(id);out.push({...n,visible:true,expanded:expanded.has(id)});if(expanded.has(id))n.children.forEach(visit);};tree.roots.forEach(visit);return out;}
 v2.categoryRegistry={catalogue,build,visible};
})(window);
