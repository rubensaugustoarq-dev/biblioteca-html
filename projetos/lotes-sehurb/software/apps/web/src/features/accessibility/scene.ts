import {rampMapNumber} from './rampLabel';
import {rampArrowStyles,rampCornerIndices} from './rampArrows';
import {Editor} from '../../editor';
import {pattern} from '../infra/scene';
import type {Material} from '../infra/types';
import type {Document} from '../../api';
import type {Ramp} from './types';
import {cursorGuide} from './cursorGuide';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Stroke,Fill,Text,Circle} from 'ol/style';
export class AccessibilityScene{
 editor:Editor;regions=new VectorSource();roads=new VectorSource();ramps=new VectorSource();preview=new VectorSource();hover=new VectorSource();rampLayer:VectorLayer;
 constructor(target:HTMLElement,private select:(id:string)=>void,private position:(p:number[])=>void,private move:(p:number[]|null)=>void){
  this.editor=new Editor(target,{geometry:()=>{},select:()=>{},coordinates:()=>{},draft:()=>{},error:()=>{},arc:()=>{}} ,false);
  const patterns=Object.fromEntries(['asphalt','concrete','brick','pavers','earth','wood'].map(m=>[m,pattern(m as Material)]));
  this.editor.map.addLayer(new VectorLayer({source:this.regions,opacity:.8,style:f=>new Style({fill:new Fill({color:patterns[f.get('material')]}),stroke:new Stroke({color:'#9ebbb0',width:.7})})}));
  this.editor.map.addLayer(new VectorLayer({source:this.roads,style:f=>new Style({stroke:new Stroke({color:'#d9c37e',width:1,lineDash:[5,4]}),text:new Text({text:f.get('name'),placement:'line',font:'10px Arial',fill:new Fill({color:'#fff8dd'}),stroke:new Stroke({color:'#203232',width:3})})})}));
  const style=(f:any,resolution:number)=>[new Style({fill:new Fill({color:f.get('invalid')?'rgba(235,101,91,.35)':f.get('tentative')?'rgba(244,203,103,.4)':f.get('preview')?'rgba(104,226,174,.55)':f.get('role')==='landing'||f.get('role')==='central'?'rgba(225,228,210,.85)':'rgba(188,200,188,.8)'}),stroke:new Stroke({color:f.get('invalid')?'#ff9b8d':f.get('tentative')?'#f4d277':f.get('preview')?'#75eab8':'#fff2ba',width:1.5,lineDash:f.get('tentative')?[4,3]:undefined}),image:new Circle({radius:5,fill:new Fill({color:'#fb8e79'})}),text:new Text({text:f.get('label')||'',font:'600 11px Arial',fill:new Fill({color:'#fff5cf'}),stroke:new Stroke({color:'#233b39',width:3}),overflow:true})}),...rampArrowStyles(f,resolution)];
  this.editor.map.addLayer(new VectorLayer({source:this.ramps,zIndex:31,style:f=>f.get('label')?new Style({text:new Text({text:f.get('label'),font:'600 11px Arial',fill:new Fill({color:'#fff5cf'}),stroke:new Stroke({color:'#233b39',width:3}),overflow:true})}):undefined}));
  this.rampLayer=new VectorLayer({source:this.ramps,zIndex:25,style});this.editor.map.addLayer(this.rampLayer);this.editor.map.addLayer(new VectorLayer({source:this.preview,zIndex:26,style}));
  this.editor.map.addLayer(new VectorLayer({source:this.hover,zIndex:27,style:(f,resolution)=>f.getGeometry() instanceof Point?new Style({image:new Circle({radius:6,fill:new Fill({color:f.get('invalid')?'#ed7b70':'#f0d580'}),stroke:new Stroke({color:'#fff',width:1.5})})}):style(f,resolution)}));
  this.editor.map.on('movestart',()=>{if(this.placing)this.move(null);});
  this.editor.map.on('moveend',()=>{if(this.placing&&this.lastPixel)this.move(this.editor.map.getCoordinateFromPixel(this.lastPixel));});
  this.editor.map.getViewport()?.addEventListener('pointermove',this.pointerMove);
  this.editor.map.getViewport()?.addEventListener('pointerleave',this.leave);
  this.editor.map.on('singleclick',e=>{if(this.placing){this.setPlacing(false);this.move(null);this.position(e.coordinate);return;}const f=this.editor.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.rampLayer,hitTolerance:7});if(f)this.select(f.get('rampId'));});
 }
 private lastPixel:number[]|null=null;
 private pointerMove=(e:PointerEvent)=>{this.lastPixel=this.editor.map.getEventPixel(e);if(this.placing)this.move(e.buttons?null:this.editor.map.getCoordinateFromPixel(this.lastPixel));};
 private leave=()=>{this.lastPixel=null;this.move(null);};
 placing=false;
 setPlacing(value:boolean){this.placing=value;const target=this.editor.map.getTargetElement();if(target)target.style.cursor=value?'crosshair':'';if(!value)this.hover.clear();else if(value){const point=this.lastPixel?this.editor.map.getCoordinateFromPixel(this.lastPixel):this.editor.map.getView().getCenter();if(point)this.move(point);}}
 update(doc:Document){
  this.document=doc;
  const fresh=this.project!==doc.project.id;this.project=doc.project.id;this.editor.setDocument(doc);this.editor.tool('select');this.regions.clear();this.roads.clear();this.ramps.clear();const geo=new GeoJSON();
  for(const region of doc.infraMetrics?.regions||[]){const f=new Feature(geo.readGeometry(region.geometry)!);f.set('material',region.material);this.regions.addFeature(f);}
  for(const road of doc.infra||[])if(road.kind==='road'){const f=new Feature(geo.readGeometry(road.derived.axisGeometry!)!);f.set('name',road.name);this.roads.addFeature(f);}
  for(const ramp of doc.accessibility||[])this.addRamp(this.ramps,ramp,false);
  if(fresh)this.fit();
 }
 project='';
 document:Document|null=null;
 addRamp(source:VectorSource,ramp:Ramp,preview:boolean){
  const geo=new GeoJSON();const parts=ramp.derived?.parts||[];
  if(!parts.length&&ramp.anchor.length===2){const f=new Feature(new Point(ramp.anchor));f.setProperties({rampId:ramp.id,label:rampMapNumber(ramp,this.document?.accessibility||[]),invalid:true});source.addFeature(f);return;}
  const outside=ramp.derived?.normativeStatus==='outside';
  parts.forEach((part,i)=>{const f=new Feature(geo.readGeometry(part.geometry)!);f.setProperties({rampId:ramp.id,preview,invalid:outside,role:part.role,partIndex:i,cornerIndices:rampCornerIndices(ramp,part.role,part.geometry.coordinates[0]),label:i===0?rampMapNumber(ramp,this.document?.accessibility||[]):''});source.addFeature(f);});
 }
 showPreview(ramp:Ramp|null){this.preview.clear();if(ramp)this.addRamp(this.preview,ramp,true);}
 captureTolerance(){return Math.min(1.5,Math.max(.05,(this.editor.map.getView().getResolution()||.1)*8));}
 showGuide(draft:Ramp,point:number[]){const guide=this.document?cursorGuide(this.document,draft,point,this.captureTolerance()):null;this.hover.clear();if(guide){this.addRamp(this.hover,guide,true);for(const f of this.hover.getFeatures())f.set('tentative',true);}else this.showHover(null,point);}
 showHover(ramp:Ramp|null,point:number[]|null,invalid=false){if(!ramp&&point&&invalid&&this.hover.getFeatures().some(f=>f.get('tentative'))){for(const f of this.hover.getFeatures())f.set('invalid',true);return;}this.hover.clear();if(ramp)this.addRamp(this.hover,ramp,true);else if(point){const f=new Feature(new Point(point));f.set('invalid',invalid);this.hover.addFeature(f);}}
 fit(){const source=this.roads.getFeatures().length?this.roads:this.editor.source;if(source.getFeatures().length)this.editor.map.getView().fit(source.getExtent()!,{padding:[50,50,50,50],maxZoom:22});}
 locate(ramp:Ramp){if(ramp.derived?.geometry)this.editor.map.getView().fit(new GeoJSON().readGeometry(ramp.derived.geometry)!.getExtent(),{padding:[60,60,60,60],maxZoom:22});}
 dispose(){this.editor.map.getViewport()?.removeEventListener('pointermove',this.pointerMove);this.editor.map.getViewport()?.removeEventListener('pointerleave',this.leave);this.editor.dispose();}
}



