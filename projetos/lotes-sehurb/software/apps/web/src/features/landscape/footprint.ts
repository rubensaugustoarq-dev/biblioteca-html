import type {LandscapeItem} from './types';
export function landscapeFootprint(item:LandscapeItem,xy:number[]){
 const turn=(item.rotationDegrees||0)*Math.PI/180,world=(x:number,y:number)=>[xy[0]+Math.cos(turn)*x-Math.sin(turn)*y,xy[1]+Math.sin(turn)*x+Math.cos(turn)*y];
 let ring:number[][];
 if(item.kind==='chalet'){const h=(item.sideM||3)/2;ring=[[-h,-h],[h,-h],[h,h],[-h,h]].map(p=>world(...p as [number,number]));}
 else if(item.kind==='hut'){const r=item.radiusM||2;ring=Array.from({length:8},(_,i)=>world(r*Math.cos(i*Math.PI/4),r*Math.sin(i*Math.PI/4)));}
 else{const r=(item.diameterM||4)/2;ring=Array.from({length:64},(_,i)=>[xy[0]+r*Math.cos(i*Math.PI/32),xy[1]+r*Math.sin(i*Math.PI/32)]);}
 return [...ring,ring[0].slice()];
}
