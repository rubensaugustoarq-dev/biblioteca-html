import {BridgeOverlay} from '../infra/bridgeOverlay';
import {InfraReference} from './infraReference';
import {LandscapeOverlay} from '../landscape/overlay';
import {AccessibilityElementsOverlay} from '../accessibility/elements/overlay';
import {SharedRampOverlay} from '../accessibility/sharedOverlay';
import Map from 'ol/Map';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import WebGLTile from 'ol/layer/WebGLTile';
import GeoTIFF from 'ol/source/GeoTIFF';
import Draw from 'ol/interaction/Draw';
import PointerInteraction from 'ol/interaction/Pointer';
import Snap from 'ol/interaction/Snap';
import {constrainDraft,exactDraftPoint} from './drawing';
import {orthogonalPathPoint,orthogonalPoint,closeMeasureRing} from '../../measure';
import {pointSetback} from './vertices';
import {EnlCad} from './cadReference';
import {SubdivisionContext,type ContextOptions} from './subdivisionContext';
import type {EnlKind} from './types';
import {Style,Stroke,Fill,Text,Circle as CircleStyle} from 'ol/style';
import {register} from 'ol/proj/proj4';
import proj4 from 'proj4';
import type {Document} from '../../api';
import type {EnlGeometry,EnlLot} from './types';
import {lotFrame,pickFrontEdge} from './coordinates';

export type DraftMeasure={length:number;technical:boolean;placed:number};
export type EnlMode='select'|'building'|'permeable'|'impermeable'|'edit'|'front'|'text'|'measure'|'capture';
export class EnlScene{
  draftCoordinates:number[][]=[];draftInput:number[][]|null=null;draftFrame=0;
  bridges=new BridgeOverlay();
  landscape=new LandscapeOverlay();
  accessibilityElements=new AccessibilityElementsOverlay();
  sharedRamps:SharedRampOverlay;
  infraReference:InfraReference;
  subdivisionContext=new SubdivisionContext();
  orthogonal=false;snapEnabled=true;vertexIndex:number|null=null;dragIndex:number|null=null;dragMoved=false;snapSource=new VectorSource();vertexOverlay=new VectorSource();cad:EnlCad;mode:EnlMode='select';frontRing:number[][]=[];lotFrontEdge=0;lotBackEdge=-1;frontPreview=new VectorSource();drawing=false;map:Map;source=new VectorSource();dimensions=new VectorSource();draw:Draw|null=null;modify:PointerInteraction|null=null;snap:Snap|null=null;
  frontKey='';frame:ReturnType<typeof lotFrame>|null=null;current:string|null=null;selected:string|null=null;rasters=new globalThis.Map<string,WebGLTile>();
  constructor(target:HTMLElement,private technical:boolean,private callbacks:{draft?:(value:DraftMeasure|null)=>void;removeVertex?:(index:number)=>void;vertex:(index:number|null)=>void;distance:(anchor:'previous'|'next')=>void;setback?:(edge:number)=>void;front:(edge:number)=>void;select:(id:string|null)=>void;geometry:(id:string|null,kind:EnlKind|'lot',geometry:EnlGeometry)=>void;error:(message:string)=>void}){
    this.infraReference=new InfraReference(technical);
    this.sharedRamps=new SharedRampOverlay(technical);
    const vectors=new VectorLayer({source:this.source,style:feature=>{
      const kind=feature.get('kind'),active=feature.getId()===this.selected;
      const color=kind==='lot'?'#95b9ef':kind==='permeable'?'#74d895':kind==='impermeable'?'#bdafcf':'#ffcf7a';
      return new Style({stroke:new Stroke({color:active?'#75f0be':color,width:active?2.5:1.5}),fill:new Fill({color:kind==='lot'?'rgba(100,160,230,.025)':kind==='permeable'?'rgba(75,150,100,.25)':kind==='impermeable'?'rgba(140,130,155,.26)':'rgba(210,160,80,.24)'}),text:new Text({text:feature.get('name'),font:'11px Segoe UI',fill:new Fill({color:this.technical?'#173b36':'#f5f7f5'}),stroke:new Stroke({color:this.technical?'#ffffff':'#14232f',width:3})})});
    }});
    const labels=new VectorLayer({source:this.dimensions,style:f=>new Style({stroke:new Stroke({color:f.get('front')?'#66deb0':'#7e959c',width:f.get('front')?3:1,lineDash:f.get('front')?undefined:[4,3]}),text:new Text({text:f.get('label'),font:'11px Arial',placement:f.get('vertex')?'point':'line',offsetY:f.get('vertex')?-9:0,fill:new Fill({color:this.technical?'#31544a':'#d8ecde'}),stroke:new Stroke({color:this.technical?'white':'#172735',width:3}),overflow:true})})});
    this.cad=new EnlCad(this.technical,this.callbacks.error);
    const vertexLayer=new VectorLayer({source:this.vertexOverlay,style:f=>new Style({stroke:new Stroke({color:'#d3a94d',width:1,lineDash:[3,3]}),image:new CircleStyle({radius:f.get('active')?5:3,fill:new Fill({color:f.get('active')?'#67dfb0':'#e7c773'}),stroke:new Stroke({color:'#18302a',width:1})}),text:new Text({text:f.get('label'),placement:f.get('anchor')||f.get('setbackEdge')!==undefined?'line':'point',offsetY:f.get('anchor')||f.get('setbackEdge')!==undefined?0:-10,font:'11px Arial',fill:new Fill({color:this.technical?'#504016':'#ffe59b'}),stroke:new Stroke({color:this.technical?'#fff':'#182735',width:3}),overflow:true})})});
    this.map=new Map({target,layers:[this.bridges.layer,this.landscape.layer,this.sharedRamps.labelLayer,this.accessibilityElements.layer,this.sharedRamps.layer,this.infraReference.layer,this.subdivisionContext.layer,this.cad.layer,vectors,labels,vertexLayer,new VectorLayer({source:this.frontPreview,style:new Style({stroke:new Stroke({color:'#ffd17a',width:4}),text:new Text({text:'Clique para definir a frente',placement:'line',font:'11px Arial',fill:new Fill({color:this.technical?'#594419':'#fff1c6'}),stroke:new Stroke({color:this.technical?'white':'#172735',width:3}),overflow:true})})})],view:new View({center:[0,0],resolution:1}),controls:undefined});
    this.map.on('singleclick',event=>{if(['text','measure','capture'].includes(this.mode))return;if(this.mode==='edit'){const label=this.map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:l=>l===vertexLayer,hitTolerance:6});if(label?.get('setbackEdge')!==undefined){this.callbacks.setback?.(label.get('setbackEdge'));return;}if(label?.get('anchor')){this.callbacks.distance(label.get('anchor'));return;}return;}if(this.mode==='front'){const edge=this.pickFront(event.pixel);if(edge===null){this.callbacks.error('Clique próximo de um lado do contorno do lote.');return;}this.callbacks.front(edge);return;}if(this.draw)return;const f=this.map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:l=>l===vectors,hitTolerance:5});if(f)this.callbacks.select(String(f.getId()));else this.callbacks.select(null);});
    this.map.on('pointermove',event=>{if(this.mode!=='front')return;this.frontPreview.clear();const edge=this.pickFront(event.pixel);if(edge!==null)this.frontPreview.addFeature(new Feature(new LineString(this.frontRing.slice(edge,edge+2))));});
  }
  pickFront(pixel:number[]){return pickFrontEdge(pixel,this.frontRing.map(p=>this.map.getPixelFromCoordinate(p)));}
  angleOffset(){return this.technical?this.frame?.northAngle||0:0;}
  locate(bounds:number[]){const points=[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]]].map(p=>this.toView(p));this.map.getView().fit([Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))],{padding:[35,35,35,35]});}
  toView(p:number[]){return this.technical?this.frame!.toLocal(p):p.slice();}
  toWorld(p:number[]){return this.technical?this.frame!.toWorld(p):p.slice();}
  update(doc:Document,lot:EnlLot,selected:string|null,showDimensions:boolean,context?:ContextOptions){
    this.map.updateSize();
    const changed=this.current!==lot.id;const frontKey=JSON.stringify([lot.id,lot.frontEdge,lot.geometry.coordinates[0].slice(lot.frontEdge,lot.frontEdge+2)]);const reorient=this.frontKey!==frontKey;this.frontKey=frontKey;this.current=lot.id;this.selected=selected;this.frame=lotFrame(lot);
    this.source.clear();this.dimensions.clear();
    this.bridges.update(doc,p=>this.toView(p));this.bridges.layer.setVisible(!!context?.roads);
    this.landscape.update(doc.landscape||[],p=>this.toView(p));
    this.sharedRamps.update(doc.accessibility||[],p=>this.toView(p));
    this.accessibilityElements.update(doc.accessibilityElements||[],p=>this.toView(p));
    this.infraReference.update(doc,context||{},p=>this.toView(p));
    if(context)this.subdivisionContext.update(doc,lot,context,p=>this.toView(p));else this.subdivisionContext.source.clear();
    const add=(id:string,kind:string,name:string,geometry:EnlGeometry)=>{const feature=new Feature(new Polygon(geometry.coordinates.map(r=>r.map(p=>this.toView(p)))));feature.setId(id);feature.setProperties({kind,name});this.source.addFeature(feature);return feature;};
    const outline=add(lot.id,'lot',lot.name,lot.geometry);
    lot.objects.forEach(o=>add(o.id,o.kind,o.name,o.geometry));
    const ring=lot.geometry.coordinates[0];this.frontRing=ring.map(p=>this.toView(p));this.lotFrontEdge=lot.frontEdge;this.lotBackEdge=lot.backEdge;const front=ring.slice(lot.frontEdge,lot.frontEdge+2);
    const frontLine=new Feature(new LineString(front.map(p=>this.toView(p))));frontLine.setProperties({front:true,label:''});this.dimensions.addFeature(frontLine);

    if(showDimensions)for(const distance of lot.derived?.setbacks||[]){if(!distance.line)continue;const f=new Feature(new LineString(distance.line.map(p=>this.toView(p))));f.set('label',`${distance.distanceM!.toLocaleString('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2})} m`);this.dimensions.addFeature(f);}
    if(!this.technical){
      proj4.defs(doc.project.crs.authid,doc.project.crs.proj4);register(proj4);
      if(changed)this.map.setView(new View({projection:doc.project.crs.authid,center:doc.project.view.center,resolution:1}));
      for(const [id,layer] of this.rasters){if(!doc.resources.some(r=>r.id===id)){this.map.removeLayer(layer);this.rasters.delete(id);}}
      for(const r of doc.resources.filter(r=>r.role!=='vectorSource')){
        if(!this.rasters.has(r.id)){
          const projection='ENL_RASTER:'+r.id;proj4.defs(projection,r.metadata.sourceProj4);register(proj4);
          const source=new GeoTIFF({projection,convertToRGB:'auto',sources:[{url:`/api/projects/${doc.project.id}/resources/${r.id}/cog`,bands:r.metadata.bands,min:r.metadata.min,max:r.metadata.max}]});
          source.on('tileloaderror',()=>this.callbacks.error('Não foi possível carregar a ortofoto no ENL.'));
          const layer=new WebGLTile({source,opacity:r.metadata.opacity});this.rasters.set(r.id,layer);this.map.getLayers().insertAt(0,layer);
        }else this.rasters.get(r.id)!.setOpacity(r.metadata.opacity);
      }
    }
    this.updateVertices();this.refreshSnap();const cadReady=this.cad.update(doc,p=>this.toView(p),()=>this.refreshSnap(),JSON.stringify([doc.project.id,this.technical?frontKey:'world',doc.resources.filter(r=>r.role==='vectorSource').map(r=>[r.id,r.metadata.layers])]));this.cad.layer.set('cadReady',cadReady);
    if(changed||(this.technical&&reorient))this.map.getView().fit(outline.getGeometry()!.getExtent(),{padding:[45,45,45,45],maxZoom:24});
  }
  tool(mode:EnlMode){
    this.cancel();this.mode=mode;const target=this.map.getTargetElement();if(target)target.style.cursor=['front','text','measure'].includes(mode)?'crosshair':'';
    if(mode==='building'||mode==='permeable'||mode==='impermeable'){
      this.draw=new Draw({type:'Polygon',geometryFunction:(coords,geom)=>{const input=(coords as number[][][])[0];this.draftInput=input;const ring=constrainDraft(input,this.orthogonal,this.frontDirection());if(ring.length)input[input.length-1]=ring.at(-1)!.slice();this.draftCoordinates=ring.map(p=>p.slice());this.notifyDraft();const closed=ring.length?(this.orthogonal?closeMeasureRing(ring,true):[...ring,ring[0].slice()]):[];const polygon=geom instanceof Polygon?geom:new Polygon([]);polygon.setCoordinates([closed]);return polygon;},style:new Style({stroke:new Stroke({color:'#67dfb0',width:1.5}),fill:new Fill({color:'rgba(90,200,150,.08)'}),image:new CircleStyle({radius:3,fill:new Fill({color:'#67dfb0'})})})});
      this.draw.on('drawstart',()=>{this.drawing=true;this.notifyDraft();});
      this.draw.on('drawend',event=>{this.drawing=false;this.draftInput=null;this.draftCoordinates=[];this.notifyDraft();const geometry=event.feature.getGeometry() as Polygon;this.callbacks.geometry(null,mode,{type:'Polygon',coordinates:geometry.getCoordinates().map(r=>r.map(p=>this.toWorld(p)))});});this.map.addInteraction(this.draw);
    }else if(mode==='edit'&&this.selected){
      const feature=this.source.getFeatureById(this.selected);if(feature){
        this.modify=new PointerInteraction({handleDownEvent:event=>{
          this.dragIndex=this.nearestVertex(event.pixel);this.dragMoved=false;
          if(this.dragIndex===null)return false;if((event.originalEvent as PointerEvent|undefined)?.altKey){this.callbacks.removeVertex?.(this.dragIndex);this.dragIndex=null;return true;}this.vertexIndex=this.dragIndex;this.callbacks.vertex(this.vertexIndex);this.updateVertices();return true;
        },handleDragEvent:event=>{
          if(this.dragIndex===null)return;const geometry=feature.getGeometry() as Polygon,coordinates=geometry.getCoordinates(),ring=coordinates[0],count=ring.length-1,index=this.dragIndex;
          let point=event.coordinate.slice();if(this.orthogonal){const anchor=ring[(index-1+count)%count];point=orthogonalPoint(anchor,point,this.frontDirection());}
          ring[index]=point;if(index===0)ring[count]=point.slice();geometry.setCoordinates(coordinates);this.dragMoved=true;this.updateVertices();
        },handleUpEvent:()=>{if(this.dragIndex!==null&&this.dragMoved)this.callbacks.geometry(this.selected,feature.get('kind'),{type:'Polygon',coordinates:(feature.getGeometry() as Polygon).getCoordinates().map(r=>r.map(p=>this.toWorld(p)))});this.dragIndex=null;return false;}});
        this.map.addInteraction(this.modify);
      }
    }
    this.refreshSnap();this.updateVertices();
  }
  frontDirection(){
    const a=this.frontRing[this.lotFrontEdge],b=this.frontRing[this.lotFrontEdge+1];
    return a&&b?[b[0]-a[0],b[1]-a[1]]:[1,0];
  }
  notifyDraft(){
    if(this.draftFrame)cancelAnimationFrame(this.draftFrame);
    this.draftFrame=requestAnimationFrame(()=>{this.draftFrame=0;const p=this.draftCoordinates,a=p.at(-2),b=p.at(-1);this.callbacks.draft?.(this.drawing&&a&&b?{length:Math.hypot(b[0]-a[0],b[1]-a[1]),placed:p.length-1,technical:this.technical}:null);});
  }
  setDraftLength(length:number){
    if(!this.draw||!this.drawing)throw new Error('Inicie o desenho no mapa.');
    const point=exactDraftPoint(this.draftCoordinates,length,this.orthogonal,this.frontDirection());
    this.draw.appendCoordinates([point]);
  }
  removeDraftPoint(){this.draw?.removeLastPoint();}
  options(snap:boolean,orthogonal:boolean){
    this.snapEnabled=snap;this.orthogonal=orthogonal;
    if(this.drawing&&this.draftInput){
      this.draftCoordinates=constrainDraft(this.draftInput,orthogonal,this.frontDirection());
      this.draftInput[this.draftInput.length-1]=this.draftCoordinates.at(-1)!.slice();
      const sketch=this.draw?.getOverlay().getSource()?.getFeatures().find(f=>f.getGeometry() instanceof Polygon);
      (sketch?.getGeometry() as Polygon|undefined)?.setCoordinates([closeMeasureRing(this.draftCoordinates,orthogonal)]);
      this.notifyDraft();
    }
    this.refreshSnap();
  }
  refreshSnap(){
    if(this.snap){this.map.removeInteraction(this.snap);this.snap=null;}
    this.snapSource.clear();this.snapSource.addFeatures([...this.source.getFeatures(),...this.subdivisionContext.source.getFeatures(),...this.infraReference.source.getFeatures(),...this.cad.snapSource.getFeatures()]);
    if(this.snapEnabled&&this.mode!=='front'){this.snap=new Snap({source:this.snapSource,pixelTolerance:10});this.map.addInteraction(this.snap);}
  }
  nearestVertex(pixel:number[]){
    const feature=this.selected?this.source.getFeatureById(this.selected):null;const ring=(feature?.getGeometry() as Polygon|undefined)?.getCoordinates()[0];if(!ring)return null;
    let selected:number|null=null,distance=100;ring.slice(0,-1).forEach((p,i)=>{const q=this.map.getPixelFromCoordinate(p),d=(q[0]-pixel[0])**2+(q[1]-pixel[1])**2;if(d<=distance){selected=i;distance=d;}});return selected;
  }
  vertex(index:number|null){this.vertexIndex=index;this.updateVertices();}
  updateVertices(){
    this.vertexOverlay.clear();if(this.mode!=='edit'||!this.selected)return;const feature=this.source.getFeatureById(this.selected),ring=(feature?.getGeometry() as Polygon|undefined)?.getCoordinates()[0];if(!ring)return;const count=ring.length-1;
    ring.slice(0,-1).forEach((p,i)=>{const f=new Feature(new Point(p));f.setProperties({active:i===this.vertexIndex,label:'P'+(i+1)});this.vertexOverlay.addFeature(f);});
    const index=this.vertexIndex;if(index===null||index<0||index>=count)return;
    if(feature?.get('kind')!=='lot'&&this.frontRing?.length){
      const point=ring[index],lotGeometry:EnlGeometry={type:'Polygon',coordinates:[this.frontRing]};
      const distances=this.frontRing.slice(0,-1).map((_,edge)=>({...pointSetback(point,lotGeometry,edge),edge}));
      const lateral=distances.filter(d=>d.edge!==this.lotFrontEdge&&d.edge!==this.lotBackEdge).sort((a,b)=>a.distance-b.distance)[0];
      for(const d of distances.filter(d=>d.edge===this.lotFrontEdge||d.edge===lateral?.edge)){
        const f=new Feature(new LineString([point,d.anchor]));f.setProperties({setbackEdge:d.edge,label:`${d.distance.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} m`});this.vertexOverlay.addFeature(f);
      }
    }
    for(const anchor of ['previous','next'] as const){const neighbour=(index+(anchor==='previous'?-1:1)+count)%count,a=ring[index],b=ring[neighbour],length=Math.hypot(a[0]-b[0],a[1]-b[1]);const f=new Feature(new LineString([a,b]));f.setProperties({anchor,label:`${length.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} m`});this.vertexOverlay.addFeature(f);}
  }
  finish(){if(this.drawing)this.draw?.finishDrawing();}
  cancel(){this.draftCoordinates=[];this.draftInput=null;this.notifyDraft();this.vertexOverlay.clear();this.frontPreview.clear();this.mode='select';const target=this.map.getTargetElement();if(target)target.style.cursor='';this.drawing=false;if(this.draw){this.draw.abortDrawing();this.map.removeInteraction(this.draw);this.draw=null;}if(this.modify){this.map.removeInteraction(this.modify);this.modify=null;}if(this.snap){this.map.removeInteraction(this.snap);this.snap=null;}}
  clear(){this.bridges.source.clear();this.infraReference.source.clear();this.subdivisionContext.source.clear();this.cancel();this.cad.clear();this.source.clear();this.dimensions.clear();for(const layer of this.rasters.values())this.map.removeLayer(layer);this.rasters.clear();this.current=null;this.frontKey='';this.frontRing=[];}
  fit(){const features=this.source.getFeatures();if(features.length)this.map.getView().fit(features[0].getGeometry()!.getExtent(),{padding:[45,45,45,45]});}
  dispose(){this.cancel();if(this.draftFrame)cancelAnimationFrame(this.draftFrame);this.cad.clear();this.map.setTarget(undefined);this.map.dispose();}
}
