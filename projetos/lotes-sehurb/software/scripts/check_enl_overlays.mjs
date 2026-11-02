import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/features/enl/mapOverlays.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/enl-overlays-check.mjs'});
const {EnlMapOverlays}=await import('../.runtime/enl-overlays-check.mjs');
const layers=[],interactions=[];let textSelected,moved;
const lot={id:'lot',geometry:{type:'Polygon',coordinates:[[[0,0],[10,0],[10,25],[0,25],[0,0]]]},objects:[],texts:[{id:'text',text:'Rua A',x:2,y:3,size:2,angle:30,font:'Arial',bold:true,color:'#fff8dd',outline:true,outlineColor:'#17212d',outlineWidth:2}]};
const before=JSON.stringify(lot);
const scene={angleOffset:()=>20,toView:p=>p.slice(),toWorld:p=>p.slice(),mode:'select',orthogonal:false,snapEnabled:false,map:{addLayer:l=>layers.push(l),removeLayer:()=>{},on:()=>{},un:()=>{},addInteraction:i=>interactions.push(i),removeInteraction:()=>{},getPixelFromCoordinate:p=>p.slice(),forEachFeatureAtPixel:()=>overlays.texts.getFeatureById('text')}};
const overlays=new EnlMapOverlays(scene,{text:a=>textSelected=a,move:a=>moved=a,measure:()=>{},cursor:()=>{}});
overlays.update(lot,true,true,true,true,null);
assert.equal(overlays.points.getFeatures().length,4);assert.equal(overlays.edges.getFeatures().length,4);assert.equal(overlays.textLayer.getVisible(),true);assert.equal(overlays.pointLayer.getVisible(),true);
const f=overlays.texts.getFeatureById('text'),text=overlays.textLayer.getStyleFunction()(f,1).getText();assert.ok(Math.abs(text.getRotation()+10*Math.PI/180)<1e-10);assert.equal(text.getFont(),'700 2px "Arial"');
overlays.update(lot,false,false,false,false,null);assert.equal(overlays.textLayer.getVisible(),false);assert.equal(overlays.edgeLayer.getVisible(),false);assert.equal(overlays.pointLayer.getVisible(),false);
overlays.update(lot,true,false,false,false,null);
const pointer=interactions[0];assert.equal(pointer.handleDownEvent({pixel:[2,3],coordinate:[2,3],originalEvent:{altKey:true}}),true);pointer.handleDragEvent({coordinate:[5,7]});pointer.handleUpEvent({coordinate:[5,7]});assert.equal(moved.text,'Rua A 2');assert.notEqual(moved.id,'text');assert.equal(moved.x,5);assert.equal(moved.y,7);assert.equal(textSelected.id,'text');
overlays.measurement([[0,0],[10,0],[10,25],[0,25],[0,0]],null,true,250);assert.ok(overlays.measure.getFeatures().some(f=>f.get('label')==='250,00 m²'));assert.equal(JSON.stringify(lot),before);
const groupedLot={...lot,objects:[{kind:'building',geometry:{type:'Polygon',coordinates:[[[1,1],[4,1],[4,5],[1,5],[1,1]]]}},{kind:'impermeable',geometry:{type:'Polygon',coordinates:[[[5,1],[8,1],[8,3],[5,3],[5,1]]]}}]};
for(const [glebas,buildings,count] of [[true,false,4],[false,true,4],[true,true,8],[false,false,0]]){
  overlays.update(groupedLot,true,false,glebas,buildings,null);
  assert.equal(overlays.edges.getFeatures().length,count);
  assert.equal(overlays.edgeLayer.getVisible(),glebas||buildings);
  if(glebas&&!buildings)assert.deepEqual(overlays.edges.getFeatures()[0].getGeometry().getCoordinates(),[[0,0],[10,0]]);
  if(buildings&&!glebas)assert.deepEqual(overlays.edges.getFeatures()[0].getGeometry().getCoordinates(),[[1,1],[4,1]]);
}
overlays.dispose();console.log('ENL: textos com rotação relativa, visibilidade, Alt+arrastar, pontos, cotas e apresentação de área da trena passaram.');
