(function(g){
'use strict';const v=g.PanmapApp.panmapV2,s=v.stage90=v.stage90||{};
function create(box,{strength=7,falloff=1.3}={}){const x=box.x+box.w/2,y=box.y+box.h/2,rx=box.w/2+10,ry=box.h/2+10;return {box,anchor:{x,y},safeRadius:Math.min(rx,ry),strength,falloff,score(px,py){const d=((px-x)/rx)**2+((py-y)/ry)**2;return strength*Math.exp(-d*falloff);},core(px,py){return ((px-x)/rx)**2+((py-y)/ry)**2<.18;}};}
s.centerExclusionField={create};
})(window);
