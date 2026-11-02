import type {EnlGeometry} from './types';
/** Move only the selected vertex, along its existing line from the fixed neighbour. */
export function resizeVertex(geometry:EnlGeometry,index:number,neighbour:'previous'|'next',length:number):EnlGeometry{
  const coordinates=geometry.coordinates.map(r=>r.map(p=>p.slice())),ring=coordinates[0],count=ring.length-1;
  if(!Number.isInteger(index)||index<0||index>=count||!Number.isFinite(length)||length<=0)throw new Error('Informe uma distância maior que zero e selecione um vértice.');
  const anchor=ring[(index+(neighbour==='previous'?-1:1)+count)%count],point=ring[index],old=Math.hypot(point[0]-anchor[0],point[1]-anchor[1]);
  if(old<1e-8)throw new Error('O trecho não possui direção. Arraste o vértice primeiro.');
  ring[index]=[anchor[0]+(point[0]-anchor[0])*length/old,anchor[1]+(point[1]-anchor[1])*length/old];
  if(index===0)ring[count]=ring[0].slice();return {type:'Polygon',coordinates};
}
export function adjacentLengths(geometry:EnlGeometry,index:number){
  const ring=geometry.coordinates[0],count=ring.length-1,previous=(index-1+count)%count,next=(index+1)%count,p=ring[index];
  return {previous,next,previousLength:Math.hypot(p[0]-ring[previous][0],p[1]-ring[previous][1]),nextLength:Math.hypot(p[0]-ring[next][0],p[1]-ring[next][1])};
}

/** Actual shortest distance to a finite lot edge, in project metres. */
export function pointSetback(point:number[],lot:EnlGeometry,edge:number){
  const ring=lot.coordinates[0],a=ring[edge],b=ring[edge+1];
  if(!a||!b)throw new Error('Lado do lote inválido.');
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<1e-8)throw new Error('O lado do lote não possui comprimento.');
  const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(length*length)));
  const anchor=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(point[0]-anchor[0],point[1]-anchor[1]);
  return {anchor,distance};
}
export function resizeSetback(geometry:EnlGeometry,index:number,lot:EnlGeometry,edge:number,distance:number):EnlGeometry{
  const coordinates=geometry.coordinates.map(r=>r.map(p=>p.slice())),ring=coordinates[0],count=ring.length-1;
  if(!Number.isInteger(index)||index<0||index>=count||!Number.isFinite(distance)||distance<0)throw new Error('Informe um afastamento maior ou igual a zero e selecione um vértice.');
  const point=ring[index],current=pointSetback(point,lot,edge);let direction:number[];
  if(current.distance>1e-8)direction=[(point[0]-current.anchor[0])/current.distance,(point[1]-current.anchor[1])/current.distance];
  else{
    const lotRing=lot.coordinates[0],a=lotRing[edge],b=lotRing[edge+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const origin=lotRing[0],area=lotRing.slice(0,-1).reduce((sum,p,i)=>sum+(p[0]-origin[0])*(lotRing[i+1][1]-origin[1])-(lotRing[i+1][0]-origin[0])*(p[1]-origin[1]),0),sign=area>=0?1:-1;
    direction=[-(b[1]-a[1])/length*sign,(b[0]-a[0])/length*sign];
  }
  ring[index]=[current.anchor[0]+direction[0]*distance,current.anchor[1]+direction[1]*distance];
  if(index===0)ring[count]=ring[0].slice();return {type:'Polygon',coordinates};
}
