import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Fill,Stroke,Text,Circle} from 'ol/style';
import type {LandscapeItem} from './types';
export function landscapeStyle(f:any,resolution:number){
 const item=f.get('item') as LandscapeItem;if(!item)return [];
 const selected=f.get('selected'),preview=f.get('preview'),water=item.kind==='water';
 const outline=selected||preview?'#ffe19a':water?'#6cdbed':'#c1e9a2';
 const styles=[new Style({fill:new Fill({color:water?'rgba(48,161,195,.48)':item.kind==='tree'?'rgba(61,120,69,.65)':'rgba(92,147,70,.32)'}),stroke:new Stroke({color:outline,width:selected||preview?2:1.1,lineDash:preview?[5,3]:undefined})})];
 if(item.kind==='chalet'||item.kind==='hut'){
  const ring=(f.getGeometry() as Polygon).getCoordinates()[0].slice(0,-1),center=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]),mid=(a:number[],b:number[])=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  styles[0]=new Style({fill:new Fill({color:item.kind==='chalet'?'rgba(187,111,72,.65)':'rgba(188,157,94,.65)'}),stroke:new Stroke({color:outline,width:selected||preview?2:1.2})});
  const line=(points:number[][],width=1)=>styles.push(new Style({geometry:new LineString(points),stroke:new Stroke({color:'#fff0c2',width})}));
  const arrow=(a:number[],b:number[])=>{line([a,b]);const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy),h=n*.25;if(n>0)line([[b[0]-dx/n*h-dy/n*h*.45,b[1]-dy/n*h+dx/n*h*.45],b,[b[0]-dx/n*h+dy/n*h*.45,b[1]-dy/n*h-dx/n*h*.45]]);};
  if(item.kind==='chalet'){line([mid(ring[0],ring[1]),mid(ring[2],ring[3])],1.4);for(const edge of [[0,3],[1,2]]){const e=mid(ring[edge[0]],ring[edge[1]]);arrow([center[0]+(e[0]-center[0])*.18,center[1]+(e[1]-center[1])*.18],[center[0]+(e[0]-center[0])*.8,center[1]+(e[1]-center[1])*.8]);}}
  else{for(let i=0;i<8;i++)line([center,ring[i]],.7);for(const i of [0,2,4,6]){const e=mid(ring[i],ring[(i+1)%8]);arrow([center[0]+(e[0]-center[0])*.35,center[1]+(e[1]-center[1])*.35],[center[0]+(e[0]-center[0])*.78,center[1]+(e[1]-center[1])*.78]);}}
  return styles;
 }
 if(!water){
  const c=(f.getGeometry() as Polygon).getInteriorPoint().getCoordinates(),r=(item.diameterM||4)/2;
  const turn=(item.rotationDegrees||0)*Math.PI/180;
  for(let i=0;i<(item.kind==='palm'?10:7);i++){
   const a=turn+i*2*Math.PI/(item.kind==='palm'?10:7),end=[c[0]+Math.cos(a)*r*.94,c[1]+Math.sin(a)*r*.94];
   if(item.kind==='palm'){
    styles.push(new Style({geometry:new LineString([c,[c[0]+Math.cos(a-.12)*r*.5,c[1]+Math.sin(a-.12)*r*.5],end]),stroke:new Stroke({color:'#d6ec9c',width:1.5})}));
    for(const t of [.4,.65])for(const side of [-1,1])styles.push(new Style({geometry:new LineString([[c[0]+Math.cos(a)*r*t,c[1]+Math.sin(a)*r*t],[c[0]+Math.cos(a+side*.24)*r*(t+.2),c[1]+Math.sin(a+side*.24)*r*(t+.2)]]),stroke:new Stroke({color:'#a8d580',width:.8})}));
   }else styles.push(new Style({geometry:new Point([c[0]+Math.cos(a)*r*.47,c[1]+Math.sin(a)*r*.47]),image:new Circle({radius:Math.max(1,r*.45/resolution),fill:new Fill({color:'rgba(121,176,94,.22)'}),stroke:new Stroke({color:'rgba(190,222,145,.65)',width:.7})})}));
  }
  styles.push(new Style({geometry:new Point(c),image:new Circle({radius:2,fill:new Fill({color:'#e0c79a'})})}));
 }else styles.push(new Style({geometry:(f.getGeometry() as Polygon).getInteriorPoint(),text:new Text({text:preview?'Prévia · '+item.name:item.name+'\n'+(item.derived?.areaM2||0).toLocaleString('pt-BR',{maximumFractionDigits:2})+' m²',font:'600 11px Arial',fill:new Fill({color:'#e1f9ff'}),stroke:new Stroke({color:'#183b46',width:3})})}));
 return styles;
}
export class LandscapeOverlay{
 source=new VectorSource();layer=new VectorLayer({source:this.source,zIndex:24,style:landscapeStyle});
 update(items:LandscapeItem[],transform:(p:number[])=>number[]=p=>p){
  this.source.clear();const geo=new GeoJSON();
  for(const item of items){if(!item.derived?.geometry)continue;const geometry=geo.readGeometry(item.derived.geometry)!;geometry.applyTransform((input,output,dimension)=>{output=output||[];for(let i=0;i<input.length;i+=(dimension||2)){const p=transform([input[i],input[i+1]]);output[i]=p[0];output[i+1]=p[1];}return output;});const f=new Feature(geometry);f.setId(item.id);f.set('item',item);this.source.addFeature(f);}
 }
}
