import GeoJSON from 'ol/format/GeoJSON';
import type LineString from 'ol/geom/LineString';
import type {Document} from '../../api';
import {rampDefaults,rampDimensions,type Ramp} from './types';
/** Immediate amber guide only. Confirmed geometry always comes from the motor. */
export function cursorGuide(doc:Document,draft:Ramp,point:number[],tolerance:number):Ramp|null{
 const geo=new GeoJSON();let best:{road:any;distance:number;axis:LineString;anchor:number[]}|null=null;
 for(const road of doc.infra||[]){if(road.kind!=='road'||!road.derived.axisGeometry)continue;
  for(const region of road.derived.regions||[]){if(region.role!=='sidewalk'||!region.geometry)continue;const g=geo.readGeometry(region.geometry);if(!g)continue;
   const anchor=g.intersectsCoordinate(point)?point:g.getClosestPoint(point),distance=Math.hypot(anchor[0]-point[0],anchor[1]-point[1]);
   if(Number.isFinite(distance)&&(!best||distance<best.distance))best={road,distance,anchor,axis:geo.readGeometry(road.derived.axisGeometry!) as LineString};
  }
 }
 if(!best)return null;
 const {road,axis}=best,attached=best.distance<=tolerance,anchor=attached?best.anchor:point,coords=axis.getCoordinates();let segment:number[][]|null=null,near=Infinity;
 for(let i=1;i<coords.length;i++){const a=coords[i-1],b=coords[i],dx=b[0]-a[0],dy=b[1]-a[1],ll=dx*dx+dy*dy;if(ll<1e-12)continue;
  const t=Math.max(0,Math.min(1,((anchor[0]-a[0])*dx+(anchor[1]-a[1])*dy)/ll)),q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(q[0]-anchor[0],q[1]-anchor[1]);if(d<near){near=d;segment=[a,b,q];}
 }
 if(!segment)return null;
 const [a,b,q]=segment,angle=Math.atan2(b[1]-a[1],b[0]-a[0]),u=[Math.cos(angle),Math.sin(angle)],left=[-u[1],u[0]];
 const sign=(anchor[0]-q[0])*left[0]+(anchor[1]-q[1])*left[1]>=0?1:-1,side=sign===1?'left':'right',width=side==='left'?road.sidewalkLeft:road.sidewalkRight;
 const depth=width>0?width:3,n=left.map(v=>v*sign),defaults=rampDefaults(draft.kind),{run,sideRun,sideSlope}=rampDimensions(draft),half=draft.widthM/2;
 const base=attached&&width>0?q.map((v,i)=>v+n[i]*road.width/2):point.map((v,i)=>v-n[i]*(draft.kind==='straight'?run:depth)/2);
 if(!(run>0&&half>0))return null;
 const xy=(x:number,y:number)=>[base[0]+u[0]*x+n[0]*y,base[1]+u[1]*x+n[1]*y];
 const poly=(role:string,points:number[][])=>({role,geometry:{type:'Polygon',coordinates:[[...points,points[0]].map(p=>xy(p[0],p[1]))]}});
 const parts=draft.kind==='straight'?[poly('central',[[-half,0],[half,0],[half,run],[-half,run]]),poly('wing',[[-half-sideRun,0],[-half,0],[-half,run]]),poly('wing',[[half,0],[half+sideRun,0],[half,run]])]:[poly('landing',[[-half,0],[half,0],[half,depth],[-half,depth]]),poly('approach',[[-half-sideRun,0],[-half,0],[-half,depth],[-half-sideRun,depth]]),poly('approach',[[half,0],[half+sideRun,0],[half+sideRun,depth],[half,depth]])];
 return {...draft,...defaults,slopePercent:draft.kind==='longitudinal'?sideSlope:8.33,flankSlopePercent:sideSlope,roadId:attached?road.id:'',side,anchor,derived:{status:'dimensioned',geometry:null,parts,runM:run,sideRunM:sideRun,totalLengthM:draft.widthM+2*sideRun,depthM:draft.kind==='straight'?run:depth,freeWidthM:draft.kind==='straight'?depth-run:depth}};
}
