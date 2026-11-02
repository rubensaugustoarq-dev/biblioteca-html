import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({stdin:{contents:"export {Editor} from './apps/web/src/editor'; export {default as Feature} from './apps/web/node_modules/ol/Feature.js'; export {default as Point} from './apps/web/node_modules/ol/geom/Point.js';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.runtime/editor-check.mjs'});
await build({entryPoints:['apps/web/src/textNames.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/text-names-check.mjs'});
const {nextTextName}=await import('../.runtime/text-names-check.mjs');
assert.equal(nextTextName('Rua',['Rua']),'Rua 2');
assert.equal(nextTextName('Rua 2',['Rua','Rua 2']),'Rua 3');
assert.equal(nextTextName('Rua',['Rua','Rua 2','Rua 4']),'Rua 5');
assert.equal(nextTextName('A'.repeat(200),[]).length,200);
const {Editor,Feature,Point}=await import('../.runtime/editor-check.mjs');
// Exercise the real editor gesture handlers without constructing a browser map.
const f=new Feature(new Point([10,20]));f.setId('source');f.set('text','Rua');
const features=new Map([['source',f]]);let interaction,call;
const stub={mode:'select',textLayer:{},textTranslate:null,textSource:{getFeatureById:id=>features.get(id),addFeature:v=>features.set(v.getId(),v),removeFeature:v=>features.delete(v.getId())},map:{addInteraction:v=>interaction=v,removeInteraction:()=>{}},doc:{annotations:[{text:'Rua'},{text:'Rua 2'}]}};
Editor.prototype.editText.call(stub,'source',(id,xy,duplicate)=>call={id,xy,duplicate});
interaction.dispatchEvent({type:'translatestart',features:{item:()=>f},mapBrowserEvent:{originalEvent:{altKey:true}}});
assert.equal(features.size,2);assert.equal(f.get('text'),'Rua 3');
f.getGeometry().setCoordinates([40,60]);
interaction.dispatchEvent({type:'translateend'});
assert.deepEqual(call,{id:'source',xy:[40,60],duplicate:true});
assert.deepEqual(f.getGeometry().getCoordinates(),[10,20]);assert.equal(f.get('text'),'Rua');assert.equal(features.size,1);
interaction.dispatchEvent({type:'translatestart',features:{item:()=>f},mapBrowserEvent:{originalEvent:{altKey:false}}});
f.getGeometry().setCoordinates([50,70]);interaction.dispatchEvent({type:'translateend'});
assert.equal(call.duplicate,false);assert.deepEqual(f.getGeometry().getCoordinates(),[50,70]);
console.log('Passed: numbered names, copy-of-copy, collisions, length, Alt copy preview/original preservation, normal movement.');

// A rebuilt document supplies a new feature object. Pointer-down must find that
// object by identity in the live source, rather than retain the previous object.
let picked=f;
const classes={remove(){},add(){}};
const map={getViewport:()=>({classList:classes}),forEachFeatureAtPixel:(_pixel,callback,options)=>options.layerFilter(stub.textLayer)?callback(picked,stub.textLayer):undefined};
Editor.prototype.editText.call(stub,'source',(id,xy,duplicate)=>call={id,xy,duplicate});
const replacement=new Feature(new Point([10,20]));replacement.setId('source');replacement.set('text','Rua');features.set('source',replacement);picked=replacement;
const down={originalEvent:{button:0,altKey:true},pixel:[0,0],coordinate:[10,20],map};
assert.equal(interaction.handleDownEvent(down),true);
replacement.getGeometry().setCoordinates([70,80]);interaction.handleUpEvent({...down,coordinate:[70,80]});
assert.deepEqual(call,{id:'source',xy:[70,80],duplicate:true});
assert.deepEqual(replacement.getGeometry().getCoordinates(),[10,20]);
// Infra accepts a saved text immediately, including after closing its properties.
Editor.prototype.editText.call(stub,null,(id,xy,duplicate)=>call={id,xy,duplicate},true);
assert.equal(interaction.handleDownEvent(down),true);
replacement.getGeometry().setCoordinates([90,100]);interaction.handleUpEvent({...down,coordinate:[90,100]});
assert.deepEqual(call,{id:'source',xy:[90,100],duplicate:true});
assert.equal(features.size,1);
const transient=new Feature(new Point([0,0]));transient.setId('__text_preview__');picked=transient;
assert.equal(interaction.handleDownEvent(down),false);
picked=replacement;stub.mode='measure';assert.equal(interaction.handleDownEvent(down),false);
console.log('Passed: real Alt pointer-down after source rebuild, unselected saved text, transient/mode guards.');
