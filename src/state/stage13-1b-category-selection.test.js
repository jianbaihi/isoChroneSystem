import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8');
const start=source.indexOf('function updatePoiToolbarLabel() {');
const end=source.indexOf('poiMenuChecks.forEach',start);
test('category summary tolerates removed menu and preserves deselected live chips',()=>{
 const selected=[true,false,true];
 const context={document:{querySelectorAll:()=>selected.map(value=>({classList:{contains:()=>value,toggle:()=>{throw Error('must not overwrite chip selection');}}}))},poiToolbarButton:{innerHTML:''},toolbarMenuSelectAll:null};
 vm.runInNewContext(source.slice(start,end)+'; updatePoiToolbarLabel();',context);
 assert.match(context.poiToolbarButton.innerHTML,/2 项/);
});
