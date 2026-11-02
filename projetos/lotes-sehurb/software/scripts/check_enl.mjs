import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({entryPoints:['apps/web/src/features/enl/coordinates.ts'],bundle:true,platform:'node',format:'esm',outfile:'.runtime/enl-coordinates-check.mjs'});
const {lotFrame}=await import('../.runtime/enl-coordinates-check.mjs');
for(const reverse of [false,true])for(const angle of [0,.3,1.5,-2]){
 const c=Math.cos(angle),s=Math.sin(angle),rotate=([x,y])=>[628000+x*c-y*s,8890000+x*s+y*c];
 let ring=[[0,0],[10,0],[10,30],[0,30],[0,0]].map(rotate);if(reverse)ring.reverse();
 const frontEdge=reverse?3:0,frame=lotFrame({geometry:{coordinates:[ring]},frontEdge});
 const a=frame.toLocal(ring[frontEdge]),b=frame.toLocal(ring[frontEdge+1]);assert.ok(Math.abs(a[1])<1e-8&&Math.abs(b[1])<1e-8);
 assert.ok(frame.toLocal(rotate([5,15]))[1]>0);
 for(const p of ring){const q=frame.toWorld(frame.toLocal(p));assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<1e-7);}
 const northWorld=frame.toWorld([0,0]);const localN=frame.toLocal([northWorld[0],northWorld[1]+1]);assert.ok(Math.abs(Math.atan2(localN[0],localN[1])*180/Math.PI-frame.northAngle)<1e-7);
}
console.log('ENL: frente alinhada, interior acima, transformação reversível e norte para ambos os sentidos de contorno passaram.');

const {pickFrontEdge}=await import('../.runtime/enl-coordinates-check.mjs');
const pixels=[[10,10],[210,10],[210,110],[10,110],[10,10]];
assert.equal(pickFrontEdge([70,14],pixels),0);
assert.equal(pickFrontEdge([215,60],pixels),1);
assert.equal(pickFrontEdge([100,116],pixels),2);
assert.equal(pickFrontEdge([4,70],pixels),3);
assert.equal(pickFrontEdge([110,60],pixels),null);
assert.equal(pickFrontEdge([240,60],pixels),null);
assert.equal(pickFrontEdge([50,0],[[0,0],[0,0],[100,0]]),1);
console.log('Definir frente: seleção de todos os lados, tolerância em pixels e rejeição de cliques afastados passaram.');
