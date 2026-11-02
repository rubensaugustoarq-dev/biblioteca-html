import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({stdin:{contents:`export {cursorGuide} from './apps/web/src/features/accessibility/cursorGuide';export {RampSection} from './apps/web/src/features/accessibility/RampSection';export {initialRamp,rampDefaults} from './apps/web/src/features/accessibility/types';export {renderToStaticMarkup} from './apps/web/node_modules/react-dom/server.node.js';export {createElement} from './apps/web/node_modules/react/index.js';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',banner:{js:'import {createRequire} from '+JSON.stringify('node:module')+';const require=createRequire(import.meta.url);'},outfile:'.runtime/accessibility-layout-check.mjs'});
const {cursorGuide,RampSection,initialRamp,rampDefaults,renderToStaticMarkup,createElement}=await import('../.runtime/accessibility-layout-check.mjs');
const rect=(y1,y2)=>({type:'Polygon',coordinates:[[[0,y1],[100,y1],[100,y2],[0,y2],[0,y1]]]});
const road=(id,y)=>({id,kind:'road',width:10,sidewalkLeft:4,sidewalkRight:2,derived:{axisGeometry:{type:'LineString',coordinates:[[0,y],[100,y]]},regions:[{role:'sidewalk',geometry:rect(y+5,y+9)},{role:'sidewalk',geometry:rect(y-7,y-5)}]}});
const doc={infra:[road('A',0),road('B',30)]},draft=initialRamp();assert.equal(draft.slopePercent,8.33);
doc.infra[0].derived.regions.unshift({role:'sidewalk',geometry:null});
doc.infra.unshift({id:'empty sidewalk',kind:'road',width:7,sidewalkLeft:0,sidewalkRight:0,derived:{axisGeometry:{type:'LineString',coordinates:[[0,0],[100,0]]},regions:[{role:'sidewalk',geometry:null}]}});
for(const [point,id,side] of [[[50,6],'A','left'],[[50,-6],'A','right'],[[50,36],'B','left']]){
 const guide=cursorGuide(doc,draft,point,.1);assert.equal(guide.roadId,id);assert.equal(guide.side,side);assert.equal(guide.derived.parts.length,3);assert.equal(guide.anchor,point);
 assert.ok(guide.derived.parts.every(p=>p.geometry.coordinates[0].length>=4));
}
const floating=cursorGuide(doc,draft,[50,0],.1);assert.equal(floating.roadId,'');assert.equal(floating.derived.parts.length,3,'floating block stays visible outside sidewalks without claiming a host');
assert.equal(cursorGuide(doc,draft,[500,500],.1).derived.parts.length,3,'floating block stays visible far from sidewalks');
const left=cursorGuide(doc,draft,[50,6],.1),html=renderToStaticMarkup(createElement(RampSection,{ramp:left,confirmed:true}));
for(const [point,curb] of [[[50,6],5],[[50,-6],-5]]){
 const guide=cursorGuide(doc,draft,point,.1);
 for(const wing of guide.derived.parts.filter(p=>p.role==='wing'))assert.equal(wing.geometry.coordinates[0].slice(0,-1).filter(p=>Math.abs(p[1]-curb)<1e-8).length,2,'each flare must have its broad edge at the curb');
}
assert.ok(html.includes('M96 179H184L253 213H27Z'),'panel plan must widen toward the street at the bottom');
assert.ok(html.includes('8,33'));assert.ok(html.includes('1,80'));assert.ok(html.includes('0,15'));assert.ok(html.includes('Faixa livre'));
const longitudinal={...draft,...rampDefaults('longitudinal')},longHtml=renderToStaticMarkup(createElement(RampSection,{ramp:longitudinal}));
assert.ok(longHtml.includes('5,00'));assert.ok(longHtml.includes('3,00'));assert.ok(longHtml.includes('1,50'));assert.ok(longHtml.includes('Patamar'));
const shorter={...longitudinal,sideRunM:1.8};const shortHtml=renderToStaticMarkup(createElement(RampSection,{ramp:shorter}));assert.ok(shortHtml.includes('1,80'));assert.ok(shortHtml.includes('8,33'));assert.equal(shorter.heightM,.15);
console.log('Passed: complete immediate ramp guide on either side/any road, floating block outside sidewalks, empty sidewalk regions ignored, automatic slope defaults, dimensioned straight/longitudinal SVG sections.');


