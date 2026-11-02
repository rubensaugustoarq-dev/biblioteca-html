import type Map from 'ol/Map';
import Pointer from 'ol/interaction/Pointer';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import {Style,Fill,Stroke,Text,Circle} from 'ol/style';
import type {Layout} from './types';
import {moveLotVertex,moveLotEdge,targetRing,type LotTarget} from './lotEditing';

export class LotEditTool{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,zIndex:40,style:f=>new Style({image:new Circle({radius:f.get('active')?5:3,fill:new Fill({color:'#ffdc8b'}),stroke:new Stroke({color:'#182c36',width:1.5})}),stroke:new Stroke({color:f.get('context')?'#a2b9b0':'#ffdc8b',width:f.get('context')?1:2,lineDash:f.get('context')?[3,4]:undefined}),text:new Text({text:f.get('label'),placement:f.getGeometry() instanceof LineString?'line':'point',offsetY:-10,font:'600 11px Arial',fill:new Fill({color:'#ffebba'}),stroke:new Stroke({color:'#182c36',width:3}),overflow:true})})});
 interaction:Pointer;target:LotTarget|null=null;start:number[]|null=null;pixel:number[]|null=null;candidate:Layout|null=null;dragged=false;focusDistance=false;
 constructor(public map:Map,public layout:Layout,selected:LotTarget|null,private callbacks:{pick:(t:LotTarget|null,focus?:boolean)=>void;preview:(p:Layout)=>void;commit:(p:Layout,t:LotTarget)=>void;error:(s:string)=>void}){
  this.target=selected;this.render();map.addLayer(this.layer);
  this.interaction=new Pointer({
   handleDownEvent:e=>{
    if('button' in e.originalEvent&&e.originalEvent.button!==0)return false;
    const label=map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.layer,hitTolerance:5});
    const geometric=this.hit(e.pixel),line=label?.getGeometry();
    let labelDistance=0;
    if(line instanceof LineString){const pixels=line.getCoordinates().map(p=>map.getPixelFromCoordinate(p)),closest=new LineString(pixels).getClosestPoint(e.pixel);labelDistance=Math.hypot(closest[0]-e.pixel[0],closest[1]-e.pixel[1]);}
    this.focusDistance=line instanceof LineString&&labelDistance>3&&geometric?.kind!=='vertex';
    const hit=this.focusDistance?(label?.get('target') as LotTarget):geometric||(label?.get('target') as LotTarget|undefined);
    if(!hit)return false;
    this.target=hit;this.start=e.coordinate.slice();this.pixel=e.pixel.slice();this.dragged=false;this.candidate=null;this.render();return true;
   },
   handleDragEvent:e=>{
    if(!this.target||!this.start||!this.pixel)return;
    if(Math.hypot(e.pixel[0]-this.pixel[0],e.pixel[1]-this.pixel[1])<3&&!this.dragged)return;
    this.dragged=true;
    try{this.candidate=this.target.kind==='vertex'?moveLotVertex(layout,this.target,e.coordinate):moveLotEdge(layout,this.target,[e.coordinate[0]-this.start[0],e.coordinate[1]-this.start[1]]);callbacks.preview(this.candidate);this.render(this.candidate);}catch(error){this.candidate=null;callbacks.error(String((error as Error).message));}
   },
   handleUpEvent:()=>{const target=this.target;if(target){if(this.dragged&&this.candidate)callbacks.commit(this.candidate,target);else{callbacks.preview(layout);callbacks.pick(target,this.focusDistance);}}this.start=null;return false;},
  });map.addInteraction(this.interaction);
 }
 hit(pixel:number[]):LotTarget|null{
  const lots=[...this.layout.lots].sort((a,b)=>Number(b.id===this.target?.id)-Number(a.id===this.target?.id));
  let vertex:LotTarget|null=null,edge:LotTarget|null=null,vd=9,ed=7;
  for(const lot of lots)lot.geometry.coordinates.forEach((ring,r)=>{for(let i=0;i<ring.length-1;i++){
   const p=this.map.getPixelFromCoordinate(ring[i]),d=Math.hypot(p[0]-pixel[0],p[1]-pixel[1]);
   if(d<vd){vd=d;vertex={id:lot.id,ring:r,index:i,kind:'vertex'};}
   const q=this.map.getPixelFromCoordinate(ring[i+1]),closest=new LineString([p,q]).getClosestPoint(pixel),distance=Math.hypot(closest[0]-pixel[0],closest[1]-pixel[1]);
   if(distance<ed){ed=distance;edge={id:lot.id,ring:r,index:i,kind:'edge'};}
  }});
  if(vertex||edge)return vertex||edge;
  return null;
 }
 render(layout=this.layout){
  this.source.clear();const target=this.target;if(!target)return;
  const ring=targetRing(layout,target),n=ring.length-1;
  ring.slice(0,-1).forEach((p,index)=>{const f=new Feature(new Point(p));f.setProperties({active:target.kind==='vertex'&&target.index===index,label:`P${index+1}`,target:{...target,index,kind:'vertex'}});this.source.addFeature(f);});
  const sides=target.kind==='edge'?[(target.index+n-1)%n,target.index,(target.index+1)%n]:[(target.index+n-1)%n,target.index];
  for(const index of sides){const a=ring[index],b=ring[(index+1)%n],f=new Feature(new LineString([a,b]));f.setProperties({context:target.kind==='edge'&&index!==target.index,label:Math.hypot(b[0]-a[0],b[1]-a[1]).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m',target:target.kind==='vertex'?{...target,anchor:index===target.index?'next':'previous'}:{...target,dimension:index}});this.source.addFeature(f);}
 }
 dispose(){this.map.removeInteraction(this.interaction);this.map.removeLayer(this.layer);this.source.dispose();this.layer.dispose();}
}
