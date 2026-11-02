import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
await build({stdin:{contents:"export {rampArrowGeometry,rampCornerIndices,rampArrowStyles} from './apps/web/src/features/accessibility/rampArrows';export {default as Feature} from './apps/web/node_modules/ol/Feature.js';export {default as Polygon} from './apps/web/node_modules/ol/geom/Polygon.js';export {SharedRampOverlay} from './apps/web/src/features/accessibility/sharedOverlay';export {lotFrame} from './apps/web/src/features/enl/coordinates';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.runtime/shared-ramps-check.mjs'});
const {SharedRampOverlay,lotFrame,rampArrowGeometry,rampCornerIndices,rampArrowStyles,Feature,Polygon}=await import('../.runtime/shared-ramps-check.mjs');
const geometry={type:'Polygon',coordinates:[[[100,200],[104,200],[104,202],[100,202],[100,200]]]};
const ramp={id:'r1',roadId:'v1',name:'Rampa 1',anchor:[102,201],slopePercent:8.33,derived:{status:'dimensioned',parts:[{role:'central',geometry}],geometry}};
const before=JSON.stringify(ramp),world=new SharedRampOverlay(),technical=new SharedRampOverlay(true);
world.update([ramp]);
assert.deepEqual(world.source.getFeatures()[0].getGeometry().getCoordinates(),geometry.coordinates);
assert.equal(world.source.getFeatures()[0].get('rampId'),'r1');
assert.equal(world.source.getFeatures()[0].get('roadId'),'v1');
const lot={frontEdge:0,geometry:{type:'Polygon',coordinates:[[[100,200],[110,210],[100,220],[90,210],[100,200]]]}};
const frame=lotFrame(lot);technical.update([ramp],p=>frame.toLocal(p));
for(const [i,p] of technical.source.getFeatures()[0].getGeometry().getCoordinates()[0].entries()){
 const back=frame.toWorld(p);assert.ok(Math.hypot(back[0]-geometry.coordinates[0][i][0],back[1]-geometry.coordinates[0][i][1])<1e-9);
}
assert.equal(JSON.stringify(ramp),before,'render rotation must never mutate saved world geometry');
const warned=structuredClone(ramp);warned.derived.normativeStatus='outside';world.update([warned]);
assert.equal(world.source.getFeatures()[0].get('label'),'1');
assert.equal(world.source.getFeatures()[0].get('warning'),true);
const broken=structuredClone(ramp);broken.derived={status:'invalid',parts:[]};world.update([broken]);
assert.deepEqual(world.source.getFeatures()[0].getGeometry().getCoordinates(),ramp.anchor);
assert.equal(world.source.getFeatures()[0].get('label'),'1');
world.update([ramp]);let fitted;
world.locate({getView:()=>({fit:(bounds)=>{fitted=bounds;}})},'r1');assert.deepEqual(fitted,[100,200,104,202]);
world.update([]);assert.equal(world.source.getFeatures().length,0,'deletion/undo update must clear stale references');
assert.equal(JSON.stringify(ramp),before);
const source=p=>readFileSync('apps/web/src/'+p,'utf8');
assert.match(source('editor.ts'),/sharedRamps.update\(doc.accessibility\|\|\[\]\)/);
assert.match(source('features/enl/scene.ts'),/sharedRamps.update\(doc.accessibility\|\|\[\],p=>this.toView\(p\)\)/);
assert.match(source('features/accessibility/scene.ts'),/arc:\(\)=>\{\}\}\s*,false\)/,'Accessibility must disable the duplicate shared overlay');
assert.ok(source('features/infra/InfraWorkspace.tsx').indexOf('<h3>Rampas (')<source('features/infra/InfraWorkspace.tsx').indexOf('<h3>Pavimentação</h3>'));
console.log('Passed: shared IDs, project geometry immutability, rotated ENL round-trip, warnings, broken host marker, locate, removal and workspace wiring.');

const rect=[[0,0],[1.5,0],[1.5,1.8],[0,1.8],[0,0]];
const arrow=rampArrowGeometry(rect,'central',0,.05).getCoordinates()[0];
assert.ok(arrow[1][1]>arrow[0][1],'straight arrow ascends from curb to sidewalk');
assert.equal(rampArrowGeometry(rect,'landing',0,.05),null);
for(const [index,direction] of [[1,-1],[2,1]]){
 const a=rampArrowGeometry([[0,0],[3,0],[3,2.3],[0,2.3],[0,0]],'approach',index,.05).getCoordinates()[0];
 assert.ok((a[1][0]-a[0][0])*direction>0,'longitudinal arrows point away from lowered landing');
}
assert.equal(rampArrowGeometry(rect,'central',0,1),null,'hide tiny arrows instead of protruding');
const dense=[];for(let i=0;i<4;i++){const a=rect[i],b=rect[i+1],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.12);for(let j=0;j<n;j++)dense.push(a.map((v,k)=>v+(b[k]-v)*j/n));}dense.push(rect[0]);
const indices=rampCornerIndices({widthM:1.5,derived:{runM:1.8}},'central',dense);
assert.deepEqual(indices.map(i=>dense[i]),rect.slice(0,4),'densified engine boundary corners remain correct');
const f=new Feature(new Polygon([dense]));f.setProperties({role:'central',partIndex:0,cornerIndices:indices});
assert.equal(rampArrowStyles(f,.05).length,1);
const symbol=rampArrowStyles(f,.05)[0].getGeometry().getCoordinates();
assert.ok(symbol.flat().every(p=>f.getGeometry().intersectsCoordinate(p)),'all arrow strokes inside the ramp');
assert.ok(Math.hypot(...symbol[0][1].map((v,i)=>v-symbol[0][0][i]))/.05<=24.00001,'small capped symbol');
console.log('Passed: uphill directions, densified engine boundaries, interior containment, zoom hiding and 24px cap.');
