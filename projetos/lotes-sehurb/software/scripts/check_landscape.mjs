import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/features/landscape/scene.ts','apps/web/src/features/landscape/overlay.ts','apps/web/src/arc.ts'],bundle:true,platform:'node',format:'esm',outdir:'.runtime/landscape-check'});
const {LandscapeScene,waterRing}=await import('../.runtime/landscape-check/features/landscape/scene.js');
const {LandscapeOverlay,landscapeStyle}=await import('../.runtime/landscape-check/features/landscape/overlay.js');
const {directionFromSweep}=await import('../.runtime/landscape-check/arc.js');
const item={id:'water',kind:'water',name:'Lago',geometry:{type:'Polygon',coordinates:[[[0,0],[20,0],[20,20],[0,20],[0,0]]]},arcSegments:[{index:3,directionDegrees:180}]};
const ring=waterRing(item);assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.some(p=>p[0]<-9.9));assert.ok(ring.length>30);
const overlay=new LandscapeOverlay();overlay.update([{...item,derived:{geometry:{type:'Polygon',coordinates:[ring]},areaM2:557,perimeterM:91.4}}],p=>[p[1]+100,-p[0]+200]);
const geometry=overlay.source.getFeatures()[0].getGeometry();assert.deepEqual(geometry.getCoordinates()[0][0],[100,200]);assert.deepEqual(item.geometry.coordinates[0][0],[0,0]);
const scene=Object.create(LandscapeScene.prototype);scene.editor={landscape:overlay,map:{getView:()=>({getCenter:()=>[0,0]}),getTargetElement:()=>({style:{}}),addInteraction:i=>scene.interactions.push(i),removeInteraction:()=>{}}};
// Sources from real OpenLayers classes without creating a browser map.
const Source=overlay.source.constructor;scene.working=new Source();scene.handles=new Source();scene.temporary=new Source();scene.interactions=[];
scene.events={save:v=>{scene.saved=v},arc:(index,angle)=>{scene.changed={index,angle}}};
scene.tool('edit',item,item);
assert.equal(scene.handles.getFeatures().length,4,'including closing side');
assert.deepEqual(scene.working.getFeatures()[0].getGeometry().getCoordinates(),item.geometry.coordinates,'edit controls are original vertices, not sampled arc vertices');
const curves=scene.interactions.find(i=>i.source_===scene.handles);
assert.ok(curves,'curve modify interaction');
const handle=scene.handles.getFeatures()[0];
curves.dispatchEvent({type:'modifystart',features:{item:()=>handle}});
handle.getGeometry().setCoordinates([10,-5]);
curves.dispatchEvent({type:'modifyend'});
assert.equal(scene.saved.id,'water');assert.equal(scene.changed.index,0);assert.ok(scene.saved.arcSegments.some(a=>a.index===0));
assert.deepEqual(scene.saved.geometry,item.geometry,'curving never moves endpoints');
assert.deepEqual(scene.saved.arcSegments.find(a=>a.index===3),item.arcSegments[0],'other arcs retained');
const sampled=waterRing({...item,arcSegments:[{index:0,directionDegrees:directionFromSweep([0,0],[20,0],60)}]});assert.ok(sampled.length>5);
scene.draft={kind:'palm',diameterM:6,rotationDegrees:10};scene.showPlant([625000,8900000]);const plant=scene.temporary.getFeatures()[0];assert.deepEqual(plant.getGeometry().getExtent(),[624997,8899997,625003,8900003]);assert.ok(landscapeStyle(plant,.1).length>20);
scene.clear();assert.equal(scene.handles.getFeatures().length,0);assert.equal(scene.temporary.getFeatures().length,0);
console.log('Paisagismo: curva por controle central, fechamento, controles originais, projeção ENL e prévia da palmeira aprovados.');

for(const [kind,params,vertices,styles] of [['chalet',{sideM:3},4,6],['hut',{radiusM:2},8,12]]){
 scene.draft={kind,rotationDegrees:37,...params};scene.showPlant([626000,8890000]);
 const feature=scene.temporary.getFeatures()[0];assert.equal(feature.getGeometry().getCoordinates()[0].length,vertices+1);
 assert.ok(landscapeStyle(feature,.1).length>=styles,'roof ridges and downhill arrows remain inside real footprint');
}
console.log('Paisagismo: quadrado de duas águas e octógono com setas de caimento e rotação aprovados.');
