import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import Polygon from 'ol/geom/Polygon';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import PointerInteraction from 'ol/interaction/Pointer';
import {Style,Text,Fill,Stroke,Circle as CircleStyle} from 'ol/style';
import {externalDimension,ringOrientation} from '../../dimensions';
import {nextTextName} from '../../textNames';
import {orthogonalPathPoint} from '../../measure';
import type {Annotation} from '../../api';
import type {EnlLot} from './types';
import type {EnlScene} from './scene';
export class EnlMapOverlays{
  texts=new VectorSource();points=new VectorSource();edges=new VectorSource();measure=new VectorSource();
  textLayer:VectorLayer;pointLayer:VectorLayer;edgeLayer:VectorLayer;measureLayer:VectorLayer;drag:PointerInteraction;
  annotations:Annotation[]=[];dragText:Annotation|null=null;start:number[]=[];duplicate=false;moved=false;
  constructor(public scene:EnlScene,private callbacks:{text:(a:Annotation|null,xy:number[],offset:number)=>void;move:(a:Annotation)=>void;measure:(p:number[],view:EnlScene)=>void;cursor:(p:number[])=>void}){
    this.textLayer=new VectorLayer({source:this.texts,style:(f,resolution)=>new Style({text:new Text({text:f.get('text'),font:`${f.get('bold')===false?'400':'700'} ${Math.max(2,Math.min(500,f.get('size')/resolution))}px "${f.get('font')||'Arial'}"`,rotation:-(f.get('angle')-this.scene.angleOffset())*Math.PI/180,rotateWithView:true,fill:new Fill({color:f.get('color')||'#fff8dd'}),stroke:f.get('outline')===false?undefined:new Stroke({color:f.get('outlineColor')||'#17212d',width:f.get('outlineWidth')||2})})})});
    this.pointLayer=new VectorLayer({source:this.points,visible:false,style:f=>new Style({image:new CircleStyle({radius:2.5,fill:new Fill({color:'#ffe09c'}),stroke:new Stroke({color:'#263b41',width:1})}),text:new Text({text:f.get('label'),offsetX:7,offsetY:-9,font:'600 11px Arial',fill:new Fill({color:'#ffe09c'}),stroke:new Stroke({color:'#263b41',width:3})})})});
    this.edgeLayer=new VectorLayer({source:this.edges,visible:false,declutter:true,style:(f,resolution)=>{const p=(f.getGeometry() as LineString).getCoordinates(),d=externalDimension(p[0],p[1],f.get('orientation'),resolution);return d?new Style({geometry:new Point(d.label),text:new Text({text:f.get('label'),rotation:d.rotation,font:'600 11px Arial',fill:new Fill({color:'#edf4ee'}),stroke:new Stroke({color:'#263b41',width:3})})}):[];}});
    this.measureLayer=new VectorLayer({source:this.measure,style:f=>new Style({stroke:new Stroke({color:'#ffd17a',width:1.5,lineDash:[5,4]}),fill:new Fill({color:'rgba(70,140,100,.16)'}),image:new CircleStyle({radius:3,fill:new Fill({color:'#ffd17a'}),stroke:new Stroke({color:'#203530',width:1})}),text:new Text({text:f.get('label')||'',placement:f.get('line')?'line':'point',font:'600 12px Arial',fill:new Fill({color:'#ffd17a'}),stroke:new Stroke({color:'#203530',width:3}),overflow:true})})});
    for(const layer of [this.textLayer,this.edgeLayer,this.pointLayer,this.measureLayer])scene.map.addLayer(layer);
    scene.map.on('singleclick',this.click);scene.map.on('pointermove',this.pointer);
    this.drag=new PointerInteraction({handleDownEvent:e=>{
      if(scene.mode!=='select'||!this.textLayer.getVisible())return false;
      const f=scene.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.textLayer,hitTolerance:5});const a=this.annotations.find(a=>a.id===f?.getId());if(!a)return false;
      this.dragText={...a};this.start=scene.toWorld(e.coordinate);this.duplicate=(e.originalEvent as PointerEvent).altKey;this.moved=false;
      if(this.duplicate)this.dragText={...a,id:crypto.randomUUID(),text:nextTextName(a.text,this.annotations.map(a=>a.text))};
      callbacks.text(a,[a.x,a.y],scene.angleOffset());return true;
    },handleDragEvent:e=>{if(!this.dragText)return;const p=scene.toWorld(e.coordinate),a={...this.dragText,x:this.dragText.x+p[0]-this.start[0],y:this.dragText.y+p[1]-this.start[1]};this.moved=true;this.preview(a);},handleUpEvent:e=>{if(this.dragText&&this.moved){const p=scene.toWorld(e.coordinate);callbacks.move({...this.dragText,x:this.dragText.x+p[0]-this.start[0],y:this.dragText.y+p[1]-this.start[1]});}this.dragText=null;return false;}});
    scene.map.addInteraction(this.drag);
  }
  click=(event:any)=>{
    if(this.scene.mode==='text'){this.callbacks.text(null,this.scene.toWorld(event.coordinate),this.scene.angleOffset());return;}
    if(this.scene.mode==='measure'){this.callbacks.measure(this.scene.toWorld(this.capturePoint(event.coordinate)),this.scene);return;}
    if(this.scene.mode==='select'&&this.textLayer.getVisible()){const f=this.scene.map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:l=>l===this.textLayer,hitTolerance:5});const a=this.annotations.find(a=>a.id===f?.getId());if(a)this.callbacks.text(a,[a.x,a.y],this.scene.angleOffset());}
  };
  pointer=(event:any)=>{if(this.scene.mode==='measure')this.callbacks.cursor(this.scene.toWorld(this.capturePoint(event.coordinate)));};
  capturePoint(p:number[]){if(!this.scene.snapEnabled)return p;const feature=this.scene.snapSource.getClosestFeatureToCoordinate(p);if(!feature)return p;const q=feature.getGeometry()!.getClosestPoint(p),a=this.scene.map.getPixelFromCoordinate(p),b=this.scene.map.getPixelFromCoordinate(q);return Math.hypot(a[0]-b[0],a[1]-b[1])<=10?q:p;}
  preview(a:Annotation){let f=this.texts.getFeatureById(a.id);if(!f){f=new Feature(new Point(this.scene.toView([a.x,a.y])));f.setId(a.id);this.texts.addFeature(f);}f.setProperties(a);(f.getGeometry() as Point).setCoordinates(this.scene.toView([a.x,a.y]));}
  update(lot:EnlLot,visible:boolean,points:boolean,lotEdges:boolean,buildingEdges:boolean,preview:Annotation|null){
    this.annotations=(lot.texts||[]).map(a=>preview?.id===a.id?preview:a);this.texts.clear();this.annotations.forEach(a=>this.preview(a));if(preview)this.preview(preview);this.textLayer.setVisible(visible);
    this.points.clear();this.edges.clear();const ring=lot.geometry.coordinates[0].map(p=>this.scene.toView(p));ring.slice(0,-1).forEach((p,i)=>{const f=new Feature(new Point(p));f.set('label','P'+(i+1));this.points.addFeature(f);});
    for(const shape of [...(lotEdges?[lot.geometry]:[]),...(buildingEdges?lot.objects.filter(o=>o.kind==='building').map(o=>o.geometry):[])]){for(const raw of shape.coordinates){const r=raw.map(p=>this.scene.toView(p)),orientation=ringOrientation(r);for(let i=0;i<r.length-1;i++){const a=r[i],b=r[i+1],f=new Feature(new LineString([a,b]));f.setProperties({orientation,label:Math.hypot(a[0]-b[0],a[1]-b[1]).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m'});this.edges.addFeature(f);}}}
    this.pointLayer.setVisible(points);this.edgeLayer.setVisible(lotEdges||buildingEdges);
  }
  measurement(points:number[][],cursor:number[]|null,closed:boolean,area:number|null){
    this.measure.clear();let world=points.map(p=>p.slice());if(cursor&&!closed){let p=cursor;if(this.scene.orthogonal&&points.length)p=orthogonalPathPoint([...points,p]);world.push(p);}const view=world.map(p=>this.scene.toView(p));
    if(view.length>1){const f=new Feature(closed?new Polygon([view]):new LineString(view));this.measure.addFeature(f);for(let i=1;i<view.length;i++){const edge=new Feature(new LineString([view[i-1],view[i]]));edge.setProperties({line:true,label:Math.hypot(world[i][0]-world[i-1][0],world[i][1]-world[i-1][1]).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m'});this.measure.addFeature(edge);}}
    view.forEach(p=>this.measure.addFeature(new Feature(new Point(p))));if(closed&&area!=null){const f=new Feature(new Polygon([view]));f.set('label',area.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m²');this.measure.addFeature(f);}
  }
  dispose(){this.scene.map.un('singleclick',this.click);this.scene.map.un('pointermove',this.pointer);this.scene.map.removeInteraction(this.drag);for(const layer of [this.textLayer,this.edgeLayer,this.pointLayer,this.measureLayer])this.scene.map.removeLayer(layer);}
}
