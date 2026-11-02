import type Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import MultiLineString from 'ol/geom/MultiLineString';
import {Style,Stroke} from 'ol/style';
import type {Ramp} from './types';

export function rampCornerIndices(ramp:Ramp,role:string,ring:number[][]){
  if(ring.length===5)return [0,1,2,3];
  if(!['central','approach'].includes(role))return [];
  const along=role==='central'?ramp.widthM:ramp.derived?.sideRunM;
  const depth=role==='central'?ramp.derived?.runM:ramp.derived?.depthM;
  if(!along||!depth)return [];
  const a=Math.ceil(along/.12),b=Math.ceil(depth/.12);
  return ring.length===2*a+2*b+1?[0,a,a+b,2*a+b]:[];
}

/** Small uphill arrows, wholly inside the sloping part; no symbol on level landings. */
export function rampArrowGeometry(ring:number[][],role:string,index:number,resolution:number){
  if(ring.length<5||!['central','approach'].includes(role)||!(resolution>0))return null;
  const blend=(a:number[],b:number[],t=.5)=>a.map((v,i)=>v+(b[i]-v)*t);
  // Part vertex order is the engine contract: straight curb 0–1 / inland 3–2;
  // longitudinal approaches rise away from the lowered central landing.
  const low=role==='central'?blend(ring[0],ring[1],.25):index===1?blend(ring[1],ring[2]):blend(ring[0],ring[3]);
  const high=role==='central'?blend(ring[3],ring[2],.25):index===1?blend(ring[0],ring[3]):blend(ring[1],ring[2]);
  const dx=high[0]-low[0],dy=high[1]-low[1],run=Math.hypot(dx,dy);
  const width=role==='central'?Math.hypot(ring[1][0]-ring[0][0],ring[1][1]-ring[0][1]):Math.hypot(ring[2][0]-ring[1][0],ring[2][1]-ring[1][1]);
  const length=Math.min(run*.56,resolution*24),head=Math.min(resolution*3,length*.23,width*.12);
  if(length/resolution<7||head/resolution<.7)return null;
  const u=[dx/run,dy/run],n=[-u[1],u[0]],center=blend(low,high);
  const start=center.map((v,i)=>v-u[i]*length/2),tip=center.map((v,i)=>v+u[i]*length/2);
  const wing=(sign:number)=>tip.map((v,i)=>v-u[i]*head+n[i]*head*.65*sign);
  return new MultiLineString([[start,tip],[wing(1),tip,wing(-1)]]);
}
export function rampArrowStyles(feature:Feature,resolution:number,technical=false){
  const polygon=feature.getGeometry();if(!(polygon instanceof Polygon))return [];
  const ring=polygon.getCoordinates()[0],indices=feature.get('cornerIndices') as number[]|undefined;
  if(!indices?.length)return [];
  const corners=indices.map(i=>ring[i]);
  const geometry=rampArrowGeometry([...corners,corners[0]],feature.get('role'),feature.get('partIndex'),resolution);
  // Curved hosts may bend the footprint. Never let a chord protrude outside it.
  if(geometry&&!geometry.getCoordinates().every(line=>line.every((p,i)=>polygon.intersectsCoordinate(p)&&(!i||polygon.intersectsCoordinate(p.map((v,j)=>(v+line[i-1][j])/2))))))return [];
  return geometry?[new Style({geometry,stroke:new Stroke({color:feature.get('warning')||feature.get('invalid')?'#9d392f':technical?'#315b50':'#37584c',width:1.15,lineCap:'round',lineJoin:'round'})})]:[];
}
