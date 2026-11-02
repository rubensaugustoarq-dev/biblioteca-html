import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
for(const [name,source] of [['editor','editor.ts'],['scene','features/infra/scene.ts'],['shortcut','features/infra/orthoShortcut.ts']]){
 await build({entryPoints:['apps/web/src/'+source],bundle:true,platform:'node',format:'esm',outfile:'.runtime/f8-'+name+'.mjs'});
}
const {Editor}=await import('../.runtime/f8-editor.mjs');
const {InfraScene}=await import('../.runtime/f8-scene.mjs');
const {orthoShortcut}=await import('../.runtime/f8-shortcut.mjs');
let canceled=0,prevented=0;
const editor={cancel:()=>canceled++,measureStyle:()=>[],map:{addInteraction:()=>{},removeInteraction:()=>{}},drawingOptions(...args){Editor.prototype.drawingOptions.call(this,...args);}};
Editor.prototype.tool.call(editor,'measure');
const originalDraw=editor.draw,scene={mode:'measure',editor,snap:null,orthogonal:false};
const points=[[626000,8890000],[626030,8890040],[626009,8890057]];
const geometry=()=>originalDraw.geometryFunction_(points.map(p=>p.slice())).getCoordinates();
InfraScene.prototype.options.call(scene,false,false);assert.deepEqual(geometry(),points);
const event={key:'F8',repeat:false,target:{tagName:'INPUT'},preventDefault:()=>prevented++};
const toggle=()=>InfraScene.prototype.options.call(scene,false,!scene.orthogonal);
assert.equal(orthoShortcut(event,toggle),true);assert.equal(scene.orthogonal,true);assert.equal(editor.orthogonal,true);
const constrained=geometry(),a=constrained[0],b=constrained[1],c=constrained[2];
assert.deepEqual(constrained.slice(0,2),points.slice(0,2),'F8 preserves placed points and the free first bearing');
assert.ok(Math.abs((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]))<1e-6,'Next segment is perpendicular to the tilted first segment');
orthoShortcut({...event,repeat:true},toggle);assert.equal(scene.orthogonal,true,'Holding F8 does not toggle repeatedly');
orthoShortcut(event,toggle);assert.equal(scene.orthogonal,false);assert.deepEqual(geometry(),points);
assert.equal(orthoShortcut({...event,key:'a'},toggle),false);assert.equal(prevented,3);
assert.equal(editor.draw,originalDraw);assert.equal(canceled,1,'Toggling does not restart the measurement');
console.log('Trena F8: foco em campo, repetição da tecla, eixos inclinados, desligamento e preservação da medição passaram.');
