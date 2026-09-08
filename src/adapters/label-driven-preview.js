(function initLabelDrivenPreview(global) {
  const app = global.PanmapApp = global.PanmapApp || {};
  // Semantic anchors are editorial preview positions, never geographic directions or area shares.
  const anchors = [[345,275],[605,280],[615,570],[780,390],[405,105],[390,575],[625,95],[195,190],[230,445],[805,570]];
  const preferred = ['050000','060000','070000','080000','090000','100000','110000','140000','150000','200000'];
  const short = value => Array.from(String(value)).length > 8 ? Array.from(String(value)).slice(0,7).join('') + '…' : String(value);
  function hull(points) {
    const sorted = points.slice().sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const cross = (a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const half = rows => { const out=[]; for(const p of rows){while(out.length>1 && cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out; };
    return half(sorted).slice(0,-1).concat(half(sorted.reverse()).slice(0,-1));
  }
  function envelope(labels, padding=13) {
    const samples=[];
    labels.forEach(label=>{
      for(const x of [label.x-label.width/2,label.x+label.width/2]) for(const y of [label.y-label.height/2,label.y+label.height/2]) {
        for(let i=0;i<12;i++){const a=i*Math.PI/6;samples.push([x+padding*Math.cos(a),y+padding*Math.sin(a)]);}
      }
    });
    const points=hull(samples);
    if(!points.length)return '';
    const midpoint=(a,b)=>`${(a[0]+b[0])/2} ${(a[1]+b[1])/2}`;
    return `M ${midpoint(points.at(-1),points[0])} `+points.map((p,i)=>`Q ${p[0]} ${p[1]} ${midpoint(p,points[(i+1)%points.length])}`).join(' ')+' Z';
  }
  function build(snapshot) {
    const groups=new Map();
    for(const poi of snapshot.pois){const code=poi.providerCategory.level1Code;if(!groups.has(code))groups.set(code,[]);groups.get(code).push(poi);}
    const codes=[...groups.keys()].sort((a,b)=>{
      const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?99:ai)-(bi<0?99:bi)||a.localeCompare(b);
    });
    // Overflow groups receive additional anchors; no input category is silently dropped.
    const occupied=[{x:490,y:400,width:165,height:115}];
    codes.forEach((code,index)=>{const a=anchors[index] || [180+(index-10)%4*210,720+Math.floor((index-10)/4)*155];occupied.push({x:a[0],y:a[1],width:160,height:30});});
    const overlaps=(a,b)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+5 && Math.abs(a.y-b.y)<(a.height+b.height)/2+5;
    const clusters=codes.map((code,index)=>{
      const pois=groups.get(code);
      const anchor=anchors[index] || [180+(index-10)%4*210,720+Math.floor((index-10)/4)*155];
      const title=app.categoryStyleRegistry?.forCode(code)?.label || pois[0].providerCategory.level1Label;
      const labels=[{text:title,fullText:title,x:anchor[0],y:anchor[1],width:Array.from(title).length*17,height:24,title:true}];
      const frequencies=new Map();
      pois.forEach(p=>{
        const subtype=p.providerCategory.level2Label || p.providerCategory.typeLabel?.split(';').filter(Boolean).at(-1);
        if(subtype && subtype!==title) frequencies.set(subtype,(frequencies.get(subtype)||0)+1);
      });
      const subtypes=[...frequencies].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN')).map(([name])=>name);
      const names=[...new Set([...subtypes,...pois.map(p=>p.name).filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh-CN'))])].slice(0,6);
      const positions=[[-47,-48],[47,-44],[-49,40],[48,44],[0,-78],[0,76]];
      names.forEach((name,i)=>{
        const text=short(name);
        const candidates=[0,-12,12,-24,24].map(dy=>({text,fullText:name,x:anchor[0]+positions[i][0],y:anchor[1]+positions[i][1]+dy,width:Array.from(text).length*10,height:16,title:false}));
        const placed=candidates.find(candidate=>occupied.every(other=>!overlaps(candidate,other)));
        if(placed){labels.push(placed);occupied.push(placed);}
      });
      // Place text first; derive the padded smooth hull exclusively from text boxes.
      return {code,labels,path:envelope(labels),pois,anchor,labelSource:subtypes.length ? 'provider-subtype-with-poi-fallback' : 'poi-name'};
    });
    return {clusters,width:1000,height:Math.max(760,Math.max(0,...clusters.map(c=>c.anchor[1]+115)))};
  }
  app.labelDrivenPreview=Object.freeze({build,envelope});
})(window);
