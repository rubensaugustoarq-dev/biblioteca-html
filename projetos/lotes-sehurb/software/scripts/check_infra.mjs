import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/features/infra/scene.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/infra-scene-check.mjs'});
const {InfraScene}=await import('../.runtime/infra-scene-check.mjs');
let draw;const scene={cancel:()=>{},selected:null,orthogonal:true,callbacks:{geometry:()=>{}},editor:{map:{addInteraction:i=>draw=i,removeInteraction:()=>{}}},options:(snap,ortho)=>{scene.orthogonal=ortho;}};
for(const mode of ['road','surface']){
  InfraScene.prototype.tool.call(scene,mode,false,true);
  const input=mode==='road'?[[0,0],[3,4],[0,7]]:[[[0,0],[3,4],[0,7]]];
  const geometry=draw.geometryFunction_(input);const ring=mode==='road'?geometry.getCoordinates():geometry.getCoordinates()[0];
  const a=ring[0],b=ring[1],c=ring[2];assert.ok(Math.abs((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))<1e-8);
  if(mode==='surface')assert.deepEqual(ring[0],ring.at(-1));
  const first=draw.geometryFunction_(mode==='road'?[[0,0],[3,4]]:[[[0,0],[3,4]]]);const points=mode==='road'?first.getCoordinates():first.getCoordinates()[0];assert.deepEqual(points[1],[3,4]);
}
const active=scene.draw;scene.snap=null;InfraScene.prototype.options.call(scene,false,false);assert.equal(scene.draw,active);assert.equal(scene.orthogonal,false);
console.log('Infra: primeira linha livre, F8 inclinado em eixos/áreas, fechamento e troca de trava sem cancelar desenho passaram.');

let start;
InfraScene.prototype.start.call({draw:{appendCoordinates:points=>start=points}},[42,55]);
assert.deepEqual(start,[[42,55]],'A ramificação deve preservar exatamente o ponto de conexão');
const features=[];const controlled={surfaceDimensions:{update:()=>{}},lotDimensions:{update:()=>{}},roadPoints:{update:()=>{}},roadDimensions:{update:()=>{}},editor:{setDocument:()=>{},select:()=>{}},regions:{clear:()=>{},addFeature:()=>{}},objects:{clear:()=>{},addFeature:f=>features.push(f)},controlGeometries:new Map()};
const raw={type:'LineString',coordinates:[[0,0],[10,0],[10,10]]},curve={type:'LineString',coordinates:[[0,0],[8,0],[9,1],[10,2],[10,10]]};
InfraScene.prototype.update.call(controlled,{infra:[{id:'road',name:'Via',kind:'road',geometry:raw,derived:{axisGeometry:curve}}],infraMetrics:{regions:[]}},'road','gleba');
assert.deepEqual(features[0].getGeometry().getCoordinates(),curve.coordinates);
assert.deepEqual(controlled.controlGeometries.get('road'),raw);
console.log('Infra: conexão exata e visualização de curva com eixo de controle preservado passaram.');

InfraScene.prototype.tool.call(scene,'arc',false,true);
const arcInput=[[0,0],[10,10],[20,0]];
assert.deepEqual(draw.geometryFunction_(arcInput).getCoordinates(),arcInput,'F8 não deve deformar controles do arco livre');
features.length=0;
const clipped={type:'Polygon',coordinates:[[[0,0],[5,0],[5,5],[0,5],[0,0]]]},original={type:'Polygon',coordinates:[[[-5,0],[5,0],[5,5],[-5,5],[-5,0]]]};
InfraScene.prototype.update.call(controlled,{infra:[{id:'area',name:'Área',kind:'surface',geometry:original,derived:{surfaceGeometry:clipped}}],infraMetrics:{regions:[]}},'area','gleba');
assert.deepEqual(features[0].getGeometry().getCoordinates(),clipped.coordinates);
assert.deepEqual(controlled.controlGeometries.get('area'),original);
console.log('Infra: arco livre preserva três controles sem F8 e recorte visual conserva o polígono original.');

const {arcStartEndDirection}=await import('../.runtime/infra-scene-check.mjs');
const directed=arcStartEndDirection([0,0],[20,0],[0,10]);
assert.deepEqual(directed[0],[0,0]);assert.deepEqual(directed.at(-1),[20,0]);assert.ok(Math.max(...directed.map(p=>p[1]))>9.9);
assert.throws(()=>arcStartEndDirection([0,0],[20,0],[10,0]));
let seeded;InfraScene.prototype.seed.call({draw:{appendCoordinates:p=>seeded=p}},[[0,0],[20,0]]);assert.deepEqual(seeded,[[0,0],[20,0]]);
console.log('Infra: prévia início/fim/direção e pontas fixas na edição passaram.');

const {tangentThroughThree,arcSweepDegrees,directionFromSweep}=await import('../.runtime/infra-scene-check.mjs');
assert.ok(Math.abs(tangentThroughThree([0,0],[10,10],[20,0])-90)<1e-8);
assert.ok(Math.abs(arcSweepDegrees([0,0],[20,0],90)+180)<1e-8);
assert.ok(Math.abs(directionFromSweep([0,0],[20,0],-180)-90)<1e-8);
assert.throws(()=>directionFromSweep([0,0],[20,0],0));
const {default:VectorSource}=await import('../apps/web/node_modules/ol/source/Vector.js');
features.length=0;
InfraScene.prototype.update.call(controlled,{infra:[{id:'arc',name:'Arco',kind:'road',curveType:'polyline',arcSegments:[{index:0,directionDegrees:90}],geometry:{type:'LineString',coordinates:[[0,0],[20,0]]},derived:{axisGeometry:{type:'LineString',coordinates:directed}}}],infraMetrics:{regions:[]}},'arc','gleba');
let editedArc,selectedArc;
const editable={cancel:()=>{},selected:'arc',controlGeometries:controlled.controlGeometries,objects:{getFeatureById:()=>features[0]},handles:new VectorSource(),editor:{map:{addInteraction:()=>{},removeInteraction:()=>{}}},options:()=>{},callbacks:{geometry:()=>{},arcSelect:(i,a)=>selectedArc={i,a},arcEdit:(i,a)=>editedArc={i,a},error:e=>{throw new Error(e)}}};
InfraScene.prototype.tool.call(editable,'edit',false,false);
assert.equal(editable.handles.getFeatures().length,1);
const handle=editable.handles.getFeatures()[0];
handle.getGeometry().setCoordinates([10,5]);
assert.equal(selectedArc.i,0);
editable.handleModify.dispatchEvent({type:'modifyend',features:{item:()=>handle}});
assert.equal(editedArc.i,0);assert.ok(editedArc.a>0&&editedArc.a<90);
assert.deepEqual(features[0].getGeometry().getCoordinates(),[[0,0],[20,0]],'Arrastar controle central deve preservar os extremos');
assert.equal(features[0].get('arcSegments')[0].directionDegrees,90,'Prévia não pode mutar dados persistidos');
console.log('Infra: controle central editável, ângulo, extremos fixos e prévia sem alterar o documento passaram.');

features[0].getGeometry().setCoordinates(directed);
const candidateScene={objects:{getFeatures:()=>features},editor:{map:{getCoordinateFromPixel:p=>p,getPixelFromCoordinate:p=>p}}};
const nearby=InfraScene.prototype.branchCandidate.call(candidateScene,[10,13],[999,999]);
assert.ok(nearby);assert.equal(nearby.id,'arc');assert.ok(Math.abs(nearby.point[1]-10)<.2,'Marcador deve projetar no eixo curvo exibido');
assert.equal(InfraScene.prototype.branchCandidate.call(candidateScene,[200,200],[200,200]),null);
console.log('Infra: marcador de conexão projeta no eixo curvo e desaparece fora da tolerância.');

features.length=0;
const straightRaw={type:'LineString',coordinates:[[0,0],[20,0],[40,0]]};
InfraScene.prototype.update.call(controlled,{infra:[{id:'straight',name:'Via existente',kind:'road',geometry:straightRaw,derived:{axisGeometry:straightRaw}}],infraMetrics:{regions:[]}},'straight','gleba');
editable.selected='straight';editable.handles=new VectorSource();editedArc=null;selectedArc=null;
InfraScene.prototype.tool.call(editable,'edit',false,false);
assert.equal(editable.handles.getFeatures().length,2,'each straight segment exposes a curve handle');
const straightHandle=editable.handles.getFeatures().find(f=>f.get('index')===0);
assert.deepEqual(straightHandle.getGeometry().getCoordinates(),[10,0]);
assert.equal(straightHandle.get('angle'),0);
straightHandle.getGeometry().setCoordinates([10,4]);
assert.equal(selectedArc.i,0);assert.notEqual(selectedArc.a,0);
editable.handleModify.dispatchEvent({type:'modifyend',features:{item:()=>straightHandle}});
assert.equal(editedArc.i,0);assert.ok(Number.isFinite(editedArc.a));
assert.deepEqual(features[0].getGeometry().getCoordinates(),straightRaw.coordinates,'curving a straight segment keeps every original endpoint');
assert.deepEqual(features[0].get('arcSegments'),[],'floating preview must not mutate the saved road');
assert.equal(features[0].getId(),'straight','editing must keep the existing road id');
console.log('Infra: straight-to-arc central handles, editable sweep, existing identity and unchanged neighbouring controls passed.');

features[0].getGeometry().setCoordinates(directed);features[0].set('usage','walkway');candidateScene.branchUsage='walkway';
assert.ok(InfraScene.prototype.branchCandidate.call(candidateScene,[10,13],[0,0]),'connect pedestrian branch on its actual curved axis');
candidateScene.branchUsage='road';assert.equal(InfraScene.prototype.branchCandidate.call(candidateScene,[10,13],[0,0]),null,'road branching does not silently turn a walkway into a road');
console.log('Infra: conexão de calçadas mantém categoria e eixo curvo corretos.');
