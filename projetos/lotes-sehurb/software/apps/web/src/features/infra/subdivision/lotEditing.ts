import type {Layout,AreaGeometry} from './types';
export type LotTarget={id:string;ring:number;index:number;kind:'vertex'|'edge';anchor?:'previous'|'next';dimension?:number};
const distance=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:number[],b:number[])=>a[0]*b[1]-a[1]*b[0];
function intersection(a:number[],u:number[],b:number[],v:number[]){
 const denominator=cross(u,v);if(Math.abs(denominator)<1e-10)throw new Error('Este lado não pode ser deslocado mantendo os lados vizinhos paralelos.');
 const t=cross([b[0]-a[0],b[1]-a[1]],v)/denominator;return [a[0]+u[0]*t,a[1]+u[1]*t];
}
export function targetRing(layout:Layout,target:LotTarget){
 const lot=layout.lots.find(l=>l.id===target.id);if(!lot)throw new Error('Selecione um lote.');
 const ring=lot.geometry.coordinates[target.ring];if(!ring||!ring[target.index])throw new Error('Selecione um lado ou vértice válido.');return ring;
}
// Update coincident vertices and any intervening vertices on a shared divisa.
function replaceBoundary(layout:Layout,moves:{from:number[];to:number[]}[],segment?:[number[],number[]]):Layout{
 const changed=(g:AreaGeometry)=>{let touched=false;const coordinates=g.coordinates.map(r=>r.map(p=>{
  let next=moves.find(m=>distance(m.from,p)<1e-4)?.to;
  if(!next&&segment){const [a,b]=segment,u=[b[0]-a[0],b[1]-a[1]],d=u[0]**2+u[1]**2,t=((p[0]-a[0])*u[0]+(p[1]-a[1])*u[1])/d;
   if(t>0&&t<1&&distance(p,[a[0]+t*u[0],a[1]+t*u[1]])<1e-4)next=[moves[0].to[0]+t*(moves[1].to[0]-moves[0].to[0]),moves[0].to[1]+t*(moves[1].to[1]-moves[0].to[1])];
  }
  if(next&&distance(next,p)>1e-8){touched=true;return next.slice();}return p.slice();
 }));return {geometry:{...g,coordinates},touched};};
 return {...layout,derived:undefined,lots:layout.lots.map(l=>{const result=changed(l.geometry);if(!result.touched)return l;if(l.locked)throw new Error('A divisa pertence também a um lote travado. Destrave-o antes de editar.');return {...l,geometry:result.geometry,derived:undefined};}),zones:layout.zones.map(z=>{const result=changed(z.geometry);return result.touched?{...z,geometry:result.geometry,derived:undefined}:z;})};
}
export function moveLotVertex(layout:Layout,target:LotTarget,point:number[]){const ring=targetRing(layout,target);return replaceBoundary(layout,[{from:ring[target.index],to:point}]);}
export function moveLotEdge(layout:Layout,target:LotTarget,delta:number[]){
 const ring=targetRing(layout,target),n=ring.length-1,i=target.index,a=ring[i],b=ring[(i+1)%n],prev=ring[(i+n-1)%n],next=ring[(i+2)%n],u=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...u);
 const normal=[-u[1]/length,u[0]/length],offset=delta[0]*normal[0]+delta[1]*normal[1],shifted=[a[0]+normal[0]*offset,a[1]+normal[1]*offset];
 const start=intersection(shifted,u,prev,[a[0]-prev[0],a[1]-prev[1]]),end=intersection(shifted,u,b,[next[0]-b[0],next[1]-b[1]]);
 return replaceBoundary(layout,[{from:a,to:start},{from:b,to:end}],[a,b]);
}
export function resizeLotSide(layout:Layout,target:LotTarget,length:number,anchor:'previous'|'next'='previous'){
 if(!Number.isFinite(length)||length<=.001)throw new Error('Informe uma distância positiva em metros.');
 const ring=targetRing(layout,target),n=ring.length-1;
 // An adjacent dimension controls the position of the originally selected edge.
 // Keep its selection and bearing; slide both endpoints along the adjoining sides.
 if(target.kind==='edge'&&target.dimension!==undefined&&target.dimension!==target.index){
  const previous=(target.index+n-1)%n,next=(target.index+1)%n;
  if(target.dimension!==previous&&target.dimension!==next)throw new Error('Escolha uma cota lateral da linha selecionada.');
  const moving=target.dimension===previous?target.index:next,fixed=target.dimension===previous?previous:(target.index+2)%n;
  const a=ring[fixed],b=ring[moving],old=distance(a,b);if(old<1e-8)throw new Error('Lado sem comprimento.');
  return moveLotEdge(layout,target,[(b[0]-a[0])*(length/old-1),(b[1]-a[1])*(length/old-1)]);
 }
 // Resize a side by moving the following boundary as a pair, keeping its bearing.
 // For a rectangle this preserves all four right angles and both equal opposite sides.
 if(target.kind==='edge'){
  const a=ring[target.index],b=ring[(target.index+1)%n],old=distance(a,b);if(old<1e-8)throw new Error('Lado sem comprimento.');
  const delta=[(b[0]-a[0])*(length/old-1),(b[1]-a[1])*(length/old-1)];
  return moveLotEdge(layout,{...target,index:(target.index+1)%n},delta);
 }
 // Vertex editing remains local to the selected point and its coincident neighbours.
 const moving=target.index,fixed=(moving+(anchor==='previous'?n-1:1))%n;
 const a=ring[fixed],b=ring[moving],old=distance(a,b);if(old<1e-8)throw new Error('Lado sem comprimento.');
 return moveLotVertex(layout,{...target,index:moving,kind:'vertex'},[a[0]+(b[0]-a[0])*length/old,a[1]+(b[1]-a[1])*length/old]);
}
export class DraftHistory<T>{
 past:T[]=[];future:T[]=[];
 push(value:T){this.past.push(structuredClone(value));if(this.past.length>100)this.past.shift();this.future=[];}
 undo(value:T){const previous=this.past.pop();if(previous===undefined)return;this.future.push(structuredClone(value));return previous;}
 redo(value:T){const next=this.future.pop();if(next===undefined)return;this.past.push(structuredClone(value));return next;}
 clear(){this.past=[];this.future=[];}
}
