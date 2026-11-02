import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import {Style,Text,Fill,Stroke} from 'ol/style';
import type {AreaGeometry} from './types';

// Deduplicate only coincident full sides, never unrelated sides of equal length.
export function lotSides(lots:{geometry:AreaGeometry}[]){
 const seen=new Set<string>(),result:{a:number[];b:number[];normal:number[];geometry:AreaGeometry;length:number}[]=[];
 const key=(p:number[])=>p.slice(0,2).map(v=>Math.round(v*1000)).join(',');
 for(const lot of lots)for(const ring of lot.geometry.coordinates){
  const signed=ring.slice(0,-1).reduce((sum,a,i)=>sum+a[0]*ring[i+1][1]-ring[i+1][0]*a[1],0);
  for(let i=0;i<ring.length-1;i++){
   const a=ring[i],b=ring[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(length<1e-6)continue;
   const id=[key(a),key(b)].sort().join('|');if(seen.has(id))continue;seen.add(id);
   const sign=(signed>=0?1:-1)*(ring===lot.geometry.coordinates[0]?1:-1);
   result.push({a,b,normal:[-dy/length*sign,dx/length*sign],geometry:lot.geometry,length});
  }
 }
 return result;
}

export class LotDimensions{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,zIndex:18,visible:false,style:(f,resolution)=>{
  const a=f.get('a') as number[],b=f.get('b') as number[],normal=f.get('normal') as number[];
  const middle=[(a[0]+b[0])/2,(a[1]+b[1])/2],polygon=f.get('polygon') as Polygon;
  let offset=9*resolution,point=middle;
  for(let i=0;i<12;i++){point=[middle[0]+normal[0]*offset,middle[1]+normal[1]*offset];if(polygon.intersectsCoordinate(point))break;offset/=2;}
  let rotation=-Math.atan2(b[1]-a[1],b[0]-a[0]);
  if(rotation>Math.PI/2)rotation-=Math.PI;if(rotation< -Math.PI/2)rotation+=Math.PI;
  return new Style({geometry:new Point(point),text:new Text({text:f.get('label'),font:'600 11px Arial',rotation,rotateWithView:true,fill:new Fill({color:'#fff0bd'}),stroke:new Stroke({color:'#182c36',width:3}),padding:[1,2,1,2]})});
 }});
 update(lots:{geometry:AreaGeometry}[]){
  this.source.clear();
  for(const side of lotSides(lots)){
   const {geometry,...properties}=side;
   const f=new Feature(new Point(side.a));f.setProperties({...properties,polygon:new Polygon(geometry.coordinates),label:side.length.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m'});this.source.addFeature(f);
  }
 }
 dispose(){this.source.dispose();this.layer.dispose();}
}
