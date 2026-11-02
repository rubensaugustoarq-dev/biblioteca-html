import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/measure.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/measure-check.mjs'});
const {measurePath,orthogonalPoint,orthogonalPathPoint,resizeMeasureSegment,removeMeasureVertex,closeMeasureRing}=await import('../.runtime/measure-check.mjs');
assert.deepEqual(measurePath([]),{segments:[],total:0});
assert.deepEqual(measurePath([[628000,8890000],[628003,8890004],[628003,8890016]]),{segments:[5,12],total:17});
assert.deepEqual(measurePath([[0,0],[0,0],[3,4]]),{segments:[0,5],total:5});
assert.equal(measurePath([[1,1],[-2,-3]]).total,5);
await build({entryPoints:['apps/web/src/editor.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/editor-measure-check.mjs'});
const {Editor}=await import('../.runtime/editor-measure-check.mjs');
let finished=0,error='';
const stub={mode:'measure',measureDraft:[[0,0],[1,1]],arcStage:'',draw:{finishDrawing:()=>finished++},onError:value=>error=value};
Editor.prototype.finish.call(stub);assert.equal(finished,0);assert.ok(error.includes('dois pontos'));
stub.measureDraft=[[0,0],[3,4],[5,6]];
Editor.prototype.finish.call(stub);assert.equal(finished,1);
let interaction,points,completed;
const tool={cancel:()=>{},snapEnabled:false,editMeasurement:()=>{},measureSource:undefined,measureStyle:()=>[],map:{addInteraction:value=>interaction=value},onMeasure:(value,done)=>{points=value;completed=done;}};
Editor.prototype.tool.call(tool,'measure');assert.equal(tool.mode,'measure');
const geometry={getCoordinates:()=>[[0,0],[3,4]],on:(_,callback)=>callback()};
tool.measureSource={clear:()=>{}};
interaction.dispatchEvent({type:'drawstart',feature:{getGeometry:()=>geometry}});
assert.deepEqual(points,[[0,0],[3,4]]);assert.equal(completed,false);
interaction.dispatchEvent({type:'drawend',feature:{getGeometry:()=>geometry}});
assert.equal(completed,true);assert.equal(interaction.getActive(),false);
console.log('Trena: cálculo UTM, vários trechos, zero, conclusão e eventos passaram.');
let measuredRing,areaResult,closedFeature;
const areaTool={editMeasurement:()=>{},mode:'measure',measureClosing:false,measureGeneration:1,measureComplete:null,
  measureDraft:[[628000,8890000],[628010,8890000],[628010,8890020],[999,999]],
  onMeasureArea:async ring=>{measuredRing=ring;return {areaM2:100,perimeterM:52.36};},
  draw:{setActive:()=>{}},measureSource:{clear:()=>{},addFeature:f=>closedFeature=f},
  onMeasure:(ring,done,result)=>areaResult={ring,done,result},onError:value=>error=value};
await Editor.prototype.closeMeasure.call(areaTool);
assert.deepEqual(measuredRing,[[628000,8890000],[628010,8890000],[628010,8890020],[628000,8890000]]);
assert.equal(areaResult.done,true);assert.equal(areaResult.result.areaM2,100);assert.equal(closedFeature.get('areaM2'),100);
areaTool.measureComplete=[[0,0],[4,4],[0,4],[4,0]];areaTool.onMeasureArea=async()=>{throw new Error('Linhas cruzadas');};
closedFeature=null;await Editor.prototype.closeMeasure.call(areaTool);assert.equal(error,'Linhas cruzadas');assert.equal(closedFeature,null);
areaTool.onMeasureArea=async()=>{areaTool.measureGeneration++;return {areaM2:10,perimeterM:20};};
await Editor.prototype.closeMeasure.call(areaTool);assert.equal(closedFeature,null);
console.log('Trena área: fechamento exato, exclusão do cursor, erro e cancelamento assíncrono passaram.');

assert.deepEqual(orthogonalPoint([10,20],[25,22]),[25,20]);
assert.deepEqual(orthogonalPoint([10,20],[11,40]),[10,40]);
const resized=resizeMeasureSegment([[100,200],[100+24.95,200],[150,250]],0,25,false);
assert.equal(measurePath(resized).segments[0],25);assert.deepEqual(resized[0],[100,200]);assert.deepEqual(resized[2],[150,250]);
const last=resizeMeasureSegment([[0,0],[10,0],[10,10],[0,0]],2,20,true);
assert.deepEqual(last[0],last.at(-1));assert.ok(Math.abs(measurePath(last).segments[2]-20)<1e-10);
assert.throws(()=>resizeMeasureSegment([[0,0],[0,0]],0,25,false));
assert.throws(()=>resizeMeasureSegment([[0,0],[10,0]],0,0,false));
const rectangle=closeMeasureRing([[628000,8890000],[628025,8890000],[628025,8890040]],true);
assert.deepEqual(rectangle,[[628000,8890000],[628025,8890000],[628025,8890040],[628000,8890040],[628000,8890000]]);
assert.equal(measurePath(rectangle).total,130);
assert.deepEqual(closeMeasureRing(rectangle,true),rectangle);
console.log('Trena edição: medidas exatas, ponto fixo, fechamento sincronizado e cantos ortogonais passaram.');

// Real Modify event handlers: drag, recalculate a closed ring, reject and restore.
areaTool.measureGeneration=10;areaTool.measureClosing=false;areaTool.measureComplete=rectangle;
areaTool.onMeasureArea=async()=>({areaM2:1000,perimeterM:130});
closedFeature=null;await Editor.prototype.closeMeasure.call(areaTool);
const dragFeature=closedFeature;let modifyInteraction,dragResult;
const dragTool={measureModify:null,measureClosing:false,measureGeneration:1,mode:'measure',snap:null,
  map:{addInteraction:value=>modifyInteraction=value,removeInteraction:()=>{}},
  onMeasure:(points,done,result)=>dragResult={points,done,result},onError:message=>error=message,
  onMeasureArea:async()=>({areaM2:1200,perimeterM:140}),updateMeasurement:Editor.prototype.updateMeasurement};
Editor.prototype.editMeasurement.call(dragTool,dragFeature);
modifyInteraction.dispatchEvent({type:'modifystart'});
const changed=dragFeature.getGeometry().getCoordinates();changed[1]=[628030,8890000];
dragFeature.getGeometry().setCoordinates(changed);
modifyInteraction.dispatchEvent({type:'modifyend'});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(dragResult.result.areaM2,1200);assert.equal(dragFeature.get('areaM2'),1200);
assert.deepEqual(dragTool.measureComplete[1],[628030,8890000]);
const original=dragFeature.getGeometry().getCoordinates();let validations=0;
dragTool.onMeasureArea=async()=>{if(validations++===0)throw new Error('Contorno inválido');return {areaM2:1200,perimeterM:140};};
modifyInteraction.dispatchEvent({type:'modifystart'});
const invalid=original.map(p=>p.slice());invalid[1]=[628100,8890090];dragFeature.getGeometry().setCoordinates(invalid);
modifyInteraction.dispatchEvent({type:'modifyend'});
await new Promise(resolve=>setTimeout(resolve,0));
assert.deepEqual(dragFeature.getGeometry().getCoordinates(),original);assert.equal(error,'Contorno inválido');
console.log('Trena arraste: Modify real, recálculo e restauração do contorno inválido passaram.');

const angled=[[628000,8890000],[628030,8890040]];
assert.deepEqual(orthogonalPathPoint(angled),angled[1]);
const locked=orthogonalPathPoint([...angled,[628009,8890057]]);
const ab=[30,40],bc=[locked[0]-angled[1][0],locked[1]-angled[1][1]];
assert.ok(Math.abs(ab[0]*bc[0]+ab[1]*bc[1])<1e-7);
const rotated=closeMeasureRing([...angled,locked],true);
assert.equal(rotated.length,5);assert.deepEqual(rotated[0],rotated.at(-1));
for(let i=0;i<4;i++){
  const a=rotated[i],b=rotated[(i+1)%4],c=rotated[(i+2)%4];
  assert.ok(Math.abs((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))<1e-6);
}
const repeated=orthogonalPathPoint([[0,0],[3,4],[3,4],[0,7]]);assert.ok(Math.abs(3*(repeated[0]-3)+4*(repeated[1]-4))<1e-10);
console.log('F8 relativo: primeira linha livre, perpendicular inclinada e fechamento UTM rotacionado passaram.');

const withoutFirst=removeMeasureVertex(rectangle,0,true);
assert.deepEqual(withoutFirst[0],rectangle[1]);assert.deepEqual(withoutFirst[0],withoutFirst.at(-1));
assert.equal(withoutFirst.length,4);
assert.deepEqual(removeMeasureVertex([[0,0],[1,1],[2,0]],1,false),[[0,0],[2,0]]);
assert.throws(()=>removeMeasureVertex(withoutFirst,0,true),/três/);
assert.throws(()=>removeMeasureVertex([[0,0],[1,1]],0,false),/dois/);
assert.throws(()=>removeMeasureVertex(rectangle,99,true));
console.log('Trena: exclusão de P1, ponto intermediário, fechamento e limites mínimos passaram.');
