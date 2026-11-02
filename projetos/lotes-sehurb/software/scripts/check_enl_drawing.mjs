import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({stdin:{contents:"export {EnlScene} from './apps/web/src/features/enl/scene';export * from './apps/web/src/features/enl/drawing';export {default as View} from './apps/web/node_modules/ol/View.js';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.runtime/enl-drawing-check.mjs'});
const {EnlScene,View,removeEnlVertex,edgeAfterDelete,constrainDraft,exactDraftPoint}=await import('../.runtime/enl-drawing-check.mjs');
let frameId=0;const frames=new Map();globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
function flush(){const list=[...frames.values()];frames.clear();list.forEach(fn=>fn());}
const origin=[628000,8890000],point=(x,y)=>[origin[0]+x,origin[1]+y];let output,lastMeasure;
const view=new View({center:origin,resolution:1});
const scene={frontDirection:()=>[1,0],orthogonal:true,snapEnabled:false,technical:false,draftFrame:0,draftCoordinates:[],draftInput:null,drawing:false,callbacks:{draft:v=>lastMeasure=v,geometry:(_id,_kind,g)=>output=g},map:{getTargetElement:()=>({style:{}}),getPixelFromCoordinate:p=>p.map((v,i)=>(v-origin[i])*20),getView:()=>view,addInteraction:()=>{}},cancel(){this.drawing=false;},refreshSnap(){},updateVertices(){},notifyDraft:EnlScene.prototype.notifyDraft,toWorld:p=>p};
EnlScene.prototype.tool.call(scene,'building');scene.draw.getMap=()=>scene.map;
scene.draw.appendCoordinates([point(0,0)]);
scene.draw.modifyDrawing_(point(10,2));assert.deepEqual(scene.draftCoordinates.at(-1),point(10,0));flush();assert.equal(lastMeasure.length,10);
EnlScene.prototype.setDraftLength.call(scene,10);
scene.draw.modifyDrawing_(point(11,6));flush();assert.deepEqual(scene.draftCoordinates.at(-1),point(10,6));assert.equal(lastMeasure.length,6);
const placed=scene.draftCoordinates.slice(0,-1).map(p=>p.slice());
EnlScene.prototype.options.call(scene,false,false);assert.deepEqual(scene.draftCoordinates.slice(0,-1),placed);
EnlScene.prototype.options.call(scene,false,true);assert.deepEqual(scene.draftCoordinates.slice(0,-1),placed);
EnlScene.prototype.setDraftLength.call(scene,8);
scene.draw.modifyDrawing_(point(1,9));assert.deepEqual(scene.draftCoordinates.at(-1),point(1,8));
EnlScene.prototype.setDraftLength.call(scene,10);
EnlScene.prototype.finish.call(scene);flush();
assert.deepEqual(output.coordinates[0],[point(0,0),point(10,0),point(10,8),point(0,8),point(0,0)]);
assert.equal(lastMeasure,null);
const snapshot=JSON.stringify(output),removed=removeEnlVertex(output,0);
assert.deepEqual(removed.coordinates[0][0],point(10,0));assert.deepEqual(removed.coordinates[0].at(-1),point(10,0));assert.equal(removed.coordinates[0].length,4);
assert.equal(JSON.stringify(output),snapshot);assert.throws(()=>removeEnlVertex(removed,0));assert.throws(()=>exactDraftPoint([point(0,0),point(1,0)],-1,true));assert.throws(()=>exactDraftPoint([point(0,0),point(1,0)],5,false));
assert.equal(edgeAfterDelete(0,0,4),2);assert.equal(edgeAfterDelete(3,0,4),2);assert.equal(edgeAfterDelete(1,0,4),0);
const rotate=p=>[628000+.8*p[0]-.6*p[1],8890000+.6*p[0]+.8*p[1]],raw=[[0,0],[10,0],[11,6]].map(rotate),snapped=constrainDraft(raw,true);
assert.ok(Math.hypot(...snapped.at(-1).map((v,i)=>v-rotate([10,6])[i]))<1e-7);
console.log('Passed: real Draw numeric 10 x 8 rectangle, F8 toggle retaining draft, live length, rotated UTM, P1 deletion/closure, front-edge remap and minimum vertices.');

// The first segment must already follow the selected lot front, in either view.
for(const direction of [[1,0],[.8,.6],[-.6,.8]]){
 const anchor=[626000,8890000],n=[-direction[1],direction[0]];
 const cursor=[anchor[0]+direction[0]*2+n[0]*9,anchor[1]+direction[1]*2+n[1]*9];
 const snapped=constrainDraft([anchor,cursor],true,direction).at(-1);
 assert.ok(Math.hypot(snapped[0]-anchor[0]-n[0]*9,snapped[1]-anchor[1]-n[1]*9)<1e-7);
 const exact=exactDraftPoint([anchor,cursor],12,true,direction);
 assert.ok(Math.hypot(exact[0]-anchor[0]-n[0]*12,exact[1]-anchor[1]-n[1]*12)<1e-7);
 assert.deepEqual(constrainDraft([anchor,cursor],false,direction).at(-1),cursor);
}
console.log('Passed: first segment and numeric length perpendicular to lot front, technical/world/changed front, F8 off remains free.');
