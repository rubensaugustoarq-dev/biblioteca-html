import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({stdin:{contents:`export {nextAlertAngle,isAlertRotationKey} from './apps/web/src/features/accessibility/elements/alertRotation';export {directionalHost} from './apps/web/src/features/accessibility/elements/directionalHost';export {ElementsMapTool} from './apps/web/src/features/accessibility/elements/mapTool';export {AccessibilityElementsOverlay} from './apps/web/src/features/accessibility/elements/overlay';export {default as View} from './apps/web/node_modules/ol/View.js';export {default as Observable} from './apps/web/node_modules/ol/Observable.js';export {default as Source} from './apps/web/node_modules/ol/source/Vector.js';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'.runtime/accessibility-elements-check.mjs'});
const {nextAlertAngle,isAlertRotationKey,directionalHost,ElementsMapTool,AccessibilityElementsOverlay,View,Observable,Source}=await import('../.runtime/accessibility-elements-check.mjs');
const polygon={type:'Polygon',coordinates:[[[100,200],[105,200],[105,201],[100,201],[100,200]]]};
const value={id:'one',kind:'tactileWarning',anchor:[102,200],widthM:.5,color:'#e6c64a',derived:{status:'dimensioned',parts:[{role:'warning',geometry:polygon}],geometry:polygon}};
const before=JSON.stringify(value),overlay=new AccessibilityElementsOverlay();overlay.update([value],p=>[p[1]-200,100-p[0]]);
assert.deepEqual(overlay.source.getFeatures()[0].getGeometry().getExtent(),[0,-5,1,0]);assert.equal(JSON.stringify(value),before);
let styles=overlay.layer.getStyleFunction()(overlay.source.getFeatures()[0],.05);assert.ok(styles.length>1,'warning dots at readable scale');
assert.equal(overlay.layer.getStyleFunction()(overlay.source.getFeatures()[0],1).length,1,'do not clutter small scales');
// Hover and fixed previews must have exactly the saved parts and material colors.
for(const role of ['warning','vehicle','crosswalk']){
 const item={...value,color:role==='crosswalk'?'#ffffff':value.color,derived:{...value.derived,parts:[{role,geometry:polygon},{role,geometry:{...polygon,coordinates:polygon.coordinates.map(r=>r.map(p=>[p[0]+7,p[1]]))}}]}};
 overlay.update([item]);
 const geometry=overlay.source.getFeatures().map(f=>f.getGeometry().getCoordinates());
 const fills=overlay.source.getFeatures().map(f=>overlay.layer.getStyleFunction()(f,1)[0].getFill().getColor());
 overlay.update([item],undefined,true);
 assert.deepEqual(overlay.source.getFeatures().map(f=>f.getGeometry().getCoordinates()),geometry,'preview keeps each separate bar/transition');
 assert.deepEqual(overlay.source.getFeatures().map(f=>overlay.layer.getStyleFunction()(f,1)[0].getFill().getColor()),fills,'preview preserves final material color');
}
overlay.update([{...value,derived:{status:'invalid',parts:[]}}]);assert.equal(overlay.source.getFeatures()[0].get('invalid'),true);
overlay.update([]);assert.equal(overlay.source.getFeatures().length,0);
class FakeMap extends Observable{constructor(){super();this.viewport=new EventTarget();this.target={style:{}};this.view=new View({center:[0,0],resolution:1});this.interactions=[];}addLayer(){}removeLayer(){}getViewport(){return this.viewport;}getTargetElement(){return this.target;}getView(){return this.view;}getEventPixel(e){return [e.clientX,e.clientY];}getCoordinateFromPixel(p){return p;}getPixelFromCoordinate(p){return p;}forEachFeatureAtPixel(){return null;}addInteraction(i){this.interactions.push(i);}removeInteraction(i){this.interactions=this.interactions.filter(v=>v!==i);}}
const map=new FakeMap();let point,path,cursor;
const tool=new ElementsMapTool(map,{point:p=>point=p,path:p=>path=p,cursor:p=>cursor=p,select:()=>{}},overlay.layer,new Source());
tool.position();assert.deepEqual(cursor,[0,0]);const event=new Event('pointermove');Object.assign(event,{clientX:10,clientY:20,buttons:0});map.viewport.dispatchEvent(event);assert.deepEqual(cursor,[10,20]);
map.dispatchEvent({type:'singleclick',coordinate:[10,20]});assert.deepEqual(point,[10,20]);assert.equal(tool.mode,'none');
tool.path();tool.orthogonal=true;tool.draw.getMap=()=>map;tool.draw.appendCoordinates([[0,0],[10,0]]);tool.draw.modifyDrawing_([13,8]);
assert.deepEqual(tool.draw.sketchCoords_.at(-1),[10,8]);tool.draw.finishDrawing();assert.deepEqual(path,[[0,0],[10,0]],'Concluir retains clicked vertices and drops the floating cursor');
tool.edit(path);const feature=tool.source.getFeatures()[0];feature.getGeometry().setCoordinates([[0,0],[12,0],[12,8]]);tool.modify.dispatchEvent({type:'modifyend'});assert.deepEqual(path,[[0,0],[12,0],[12,8]]);
tool.dispose();assert.equal(map.interactions.length,0);
console.log('Passed: shared/rotated overlays, immutable coordinates, adaptive tactile symbols, invalid host marker, live positioning, drawing F8, editable vertices, completion and cleanup.');

const roads=[{id:'road',kind:'road',width:7,sidewalkLeft:2,sidewalkRight:2,derived:{axisGeometry:{type:'LineString',coordinates:[[0,0],[100,0],[100,100]]}}}];
assert.equal(directionalHost(roads,[20,4]).side,'left');
assert.equal(directionalHost(roads,[70,4]).side,'left','moving along the same sidewalk keeps a stable preview group');
assert.equal(directionalHost(roads,[70,-4]).side,'right');
assert.equal(directionalHost(roads,[96,60]).side,'left','use closest segment, not first-to-last tangent');
assert.equal(directionalHost(roads,[500,500]),null);
const multi={...value,kind:'tactileDirectional',derived:{...value.derived,parts:[{role:'directional',geometry:polygon}],axisGeometry:{type:'MultiLineString',coordinates:[[[100,200.5],[102,200.5]],[[103,200.5],[105,200.5]]]}}};
overlay.update([multi],undefined,true);
assert.ok(overlay.layer.getStyleFunction()(overlay.source.getFeatures()[0],.05).length>1,'disjoint paths keep their directional relief');
console.log('Passed: stable sidewalk hover groups on straight/curved roads, both sides, remote pointer and multipart directional symbols.');

assert.deepEqual([0,90,180,-90].map(nextAlertAngle),[90,-180,-90,0]);
const key={key:'r',ctrlKey:false,metaKey:false,altKey:false,repeat:false};
assert.equal(isAlertRotationKey(key),true);assert.equal(isAlertRotationKey({...key,key:'R'}),true);
for(const name of ['ctrlKey','metaKey','altKey','repeat'])assert.equal(isAlertRotationKey({...key,[name]:true}),false);
assert.equal(isAlertRotationKey({...key,key:'x'}),false);
console.log('Passed: R quarter-turn sequence and modifier/repeat protection.');

const bay={...value,kind:'parking',parkingType:'accessible',derived:{...value.derived,parts:[{role:'parking',label:'001 · PCD',geometry:polygon},{role:'parkingTransfer',geometry:{...polygon,coordinates:polygon.coordinates.map(r=>r.map(p=>[p[0]+6,p[1]]))}}]}};
overlay.update([bay],undefined,true);
const bayFeatures=overlay.source.getFeatures();assert.equal(bayFeatures.length,2);
const bayFeature=bayFeatures.find(f=>f.get('role')==='parking');
assert.equal(overlay.layer.getStyleFunction()(bayFeature,.05)[0].getFill().getColor(),'rgba(255,255,255,.02)','parking preserves base pavement');
assert.ok(overlay.layer.getStyleFunction()(bayFeature,.05)[0].getText().getText().includes('PCD'));
assert.ok(overlay.layer.getStyleFunction()(bayFeatures.find(f=>f.get('role')==='parkingTransfer'),.05).length>1,'transfer strip hatching');
console.log('Passed: parking numbering/type, transparent pavement overlay and transfer hatch.');

// A row that no longer fits must remain drawn, with all bays in red.
const invalidRow={...bay,derived:{...bay.derived,status:'invalid',error:'Ultrapassa a pavimentação',parts:Array.from({length:4},(_,i)=>({role:'parking',label:String(i+1),geometry:{...polygon,coordinates:polygon.coordinates.map(r=>r.map(p=>[p[0]+i*6,p[1]]))}}))}};
overlay.update([invalidRow],undefined,true);
const invalidBays=overlay.source.getFeatures().filter(f=>f.get('role')==='parking');
assert.equal(invalidBays.length,4);
for(const f of invalidBays){assert.equal(f.get('invalid'),true);assert.equal(overlay.layer.getStyleFunction()(f,.05)[0].getStroke().getColor(),'#ff8d7c');}
console.log('Passed: out-of-bounds parking preview retains every bay, highlighted in red.');
