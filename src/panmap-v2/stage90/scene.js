(function(g){
'use strict';const v=g.PanmapApp.panmapV2,s=v.stage90;
function build(tree,base,focus=null,previous=null){const started=performance.now();let model=base,local=null;
if(focus){const expansion=s.layout.prepare(tree,base,focus);local=s.sharedSemanticField.solve({nodes:expansion.children,labels:expansion.children,parentPolygon:expansion.budget.polygon,centerBox:expansion.parent});model=s.layout.deform(base,expansion);}
const time=v.stage88.smoothEnvelope.build([...model.nodes,model.center],{time:true,preset:'balanced',scale:'medium'}),roots=model.nodes.filter(n=>n.categoryLevel===1),field=s.sharedSemanticField.solve({nodes:roots,labels:model.nodes,parentPolygon:time.polygon,centerBox:model.center,expanded:model.expansion,previous:previous?.field});
return {model,time,field,local,durationMs:performance.now()-started,solveOrder:focus?['L2 layout','L2 shared field','local parent budget','neighbor deformation','visible labels','time envelope','L1 shared field']:['L1 compact layout','time envelope','L1 shared field']};}
s.scene={build};
})(window);
