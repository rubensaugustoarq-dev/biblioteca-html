import {orthogonalPathPoint,orthogonalPoint} from '../../measure';
import type {EnlGeometry} from './types';
/** Preserve all placed points; constrain only the current cursor. */
export function constrainDraft(points:number[][],orthogonal:boolean,frontDirection?:number[]){
 const result=points.map(p=>p.slice());
 if(orthogonal&&result.length>1){
  if(frontDirection)result[result.length-1]=orthogonalPoint(result[result.length-2],result.at(-1)!,frontDirection);
  else if(result.length>2)result[result.length-1]=orthogonalPathPoint(result);
 }
 return result;
}
export function exactDraftPoint(points:number[][],length:number,orthogonal:boolean,frontDirection?:number[]){
 if(!orthogonal)throw new Error('Ligue F8 para informar o comprimento.');
 if(!Number.isFinite(length)||length<=0||length>100000)throw new Error('Informe uma medida maior que zero, em metros.');
 if(points.length<2)throw new Error('Marque o início do trecho no mapa.');
 const constrained=constrainDraft(points,true,frontDirection),a=constrained.at(-2)!,b=constrained.at(-1)!,d=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(d<1e-7)throw new Error('Mova o mouse para indicar a direção do trecho.');
 return [a[0]+(b[0]-a[0])*length/d,a[1]+(b[1]-a[1])*length/d];
}
export function removeEnlVertex(geometry:EnlGeometry,index:number){
 const coordinates=geometry.coordinates.map(r=>r.map(p=>p.slice())),ring=coordinates[0].slice(0,-1);
 if(!Number.isInteger(index)||index<0||index>=ring.length)throw new Error('Selecione um vértice.');
 if(ring.length<=3)throw new Error('O contorno precisa manter pelo menos três vértices.');
 ring.splice(index,1);coordinates[0]=[...ring,ring[0].slice()];return {type:'Polygon' as const,coordinates};
}
export function edgeAfterDelete(edge:number,index:number,count:number){
 if(edge<0)return -1;
 const old=edge===index?(index-1+count)%count:edge;
 return old>index?old-1:old;
}
