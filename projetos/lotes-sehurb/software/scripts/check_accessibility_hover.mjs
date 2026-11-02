import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/features/accessibility/hoverPreview.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/accessibility-hover-check.mjs'});
const {HoverPreview}=await import('../.runtime/accessibility-hover-check.mjs');
const pause=()=>new Promise(resolve=>setTimeout(resolve,8));
const calls=[],results=[];
const preview=new HoverPreview(value=>new Promise((resolve,reject)=>calls.push({value,resolve,reject})),(value,error)=>results.push({value,error}),0);
preview.move('A');await pause();assert.equal(calls.length,1);
for(let i=0;i<100;i++)preview.move('B'+i);
await pause();assert.equal(calls.length,1,'pointer movement must not flood the motor');
calls[0].resolve('outdated geometry');await pause();assert.deepEqual(results,[]);
assert.equal(calls.length,2);assert.equal(calls[1].value,'B99');
calls[1].resolve('latest geometry');await pause();assert.deepEqual(results,[{value:'latest geometry',error:''}]);
preview.move('outside sidewalk');await pause();calls[2].reject(new Error('Fora da calçada'));await pause();
assert.deepEqual(results.at(-1),{value:null,error:'Fora da calçada'});
for(const boundary of ['click locks position','pointer leaves map','change ramp parameters']){
 preview.move(boundary);await pause();const request=calls.at(-1);preview.clear();request.resolve('stale');await pause();
 assert.equal(results.length,2,`late result after ${boundary}`);
}
preview.move('unmount');await pause();preview.dispose();calls.at(-1).resolve('stale');await pause();
preview.move('disposed');await pause();assert.equal(results.length,2);assert.equal(calls.length,7);
console.log('Passed: latest pointer position, one request at a time, invalid placement feedback, no stale geometry after click/leave/parameter change/unmount.');

// Exercise actual scene event wiring without a browser rendering dependency.
await build({entryPoints:['apps/web/src/features/accessibility/scene.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/accessibility-scene-check.mjs',plugins:[{name:'map-fixture',setup(b){
 b.onLoad({filter:/[\\/]src[\\/]editor\.ts$/},()=>({contents:`export class Editor{source={};constructor(){const listeners={};const viewport=new EventTarget();const target={style:{}};this.map={listeners,viewport,target,on:(name,fn)=>listeners[name]=fn,addLayer:()=>{},getViewport:()=>viewport,getTargetElement:()=>target,getView:()=>({getCenter:()=>[5,5]}),getEventPixel:e=>[e.clientX,e.clientY],getCoordinateFromPixel:p=>p,forEachFeatureAtPixel:()=>null};}dispose(){}}`,loader:'js'}));
 b.onLoad({filter:/[\\/]features[\\/]infra[\\/]scene\.ts$/},()=>({contents:`export const pattern=()=> '#888';`,loader:'js'}));
}}]});
const {AccessibilityScene}=await import('../.runtime/accessibility-scene-check.mjs');
const moves=[],positions=[];const scene=new AccessibilityScene({},()=>{},p=>positions.push(p),p=>moves.push(p));
function pointerAt(x,y,buttons=0){const e=new Event('pointermove');Object.assign(e,{clientX:x,clientY:y,buttons});scene.editor.map.getViewport().dispatchEvent(e);}
scene.setPlacing(true);assert.deepEqual(moves.at(-1),[5,5],'activating the tool immediately previews at the map center');pointerAt(10,20);
assert.deepEqual(moves.at(-1),[10,20]);assert.deepEqual(positions,[],'hover never places a ramp');
scene.showHover(null,[10,20],true);assert.deepEqual(scene.hover.getFeatures()[0].getGeometry().getCoordinates(),[10,20]);assert.equal(scene.hover.getFeatures()[0].get('invalid'),true);
pointerAt(11,21,1);assert.equal(moves.at(-1),null);
scene.editor.map.getViewport().dispatchEvent(new Event('pointerleave'));assert.equal(moves.at(-1),null);
scene.editor.map.listeners.singleclick({coordinate:[12,22]});assert.deepEqual(positions,[[12,22]]);assert.equal(scene.placing,false);assert.equal(scene.hover.getFeatures().length,0);
const count=moves.length;pointerAt(99,99);assert.equal(moves.length,count,'click freezes the position');
scene.setPlacing(true);pointerAt(13,23);assert.deepEqual(moves.at(-1),[13,23],'reposition resumes hover');
scene.dispose();console.log('Passed: real scene pointermove, invalid marker, pan/leave clearing, click locking and reposition.');

