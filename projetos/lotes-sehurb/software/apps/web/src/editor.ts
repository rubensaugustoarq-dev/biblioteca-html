import {BridgeOverlay} from './features/infra/bridgeOverlay';
import {LandscapeOverlay} from './features/landscape/overlay';
import {AccessibilityElementsOverlay} from './features/accessibility/elements/overlay';
import {SharedRampOverlay} from './features/accessibility/sharedOverlay';
import {FreeDimensions} from './FreeDimensions';
import Map from 'ol/Map';
import {CadView} from './cad';
import {measurePath,orthogonalPathPoint,resizeMeasureSegment,removeMeasureVertex,closeMeasureRing} from './measure';
import View from 'ol/View';
import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import {externalDimension,ringOrientation} from './dimensions';
import {arcThroughThree} from './arc';
import {nextTextName} from './textNames';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import WebGLTile from 'ol/layer/WebGLTile';
import GeoTIFF from 'ol/source/GeoTIFF';
import Draw from 'ol/interaction/Draw';
import Translate from 'ol/interaction/Translate';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Collection from 'ol/Collection';
import {Fill,Stroke,Style,Text,Circle as CircleStyle} from 'ol/style';
import {defaults as controls,ScaleLine} from 'ol/control';
import {register} from 'ol/proj/proj4';
import proj4 from 'proj4';
import type {Document,Entity,Annotation} from './api';

export type Mode='select'|'draw'|'edit'|'text'|'measure';

// Keep the imagery visible at the exact placement point. Picking tolerances
// remain independent of these visual sizes.
const precisionSketchStyle=new Style({
  stroke:new Stroke({color:'#6fe3b0',width:1}),
  fill:new Fill({color:'rgba(57,194,133,.025)'}),
  image:new CircleStyle({radius:2.5,
    fill:new Fill({color:'rgba(0,0,0,0)'}),
    stroke:new Stroke({color:'#6fe3b0',width:1})}),
});

export class Editor {
  bridges=new BridgeOverlay();
  landscape=new LandscapeOverlay();
  accessibilityElements=new AccessibilityElementsOverlay();
  sharedRamps=new SharedRampOverlay();
  freeDimensions=new FreeDimensions();
  onMeasure:(points:number[][],finished:boolean,result?:{areaM2:number;perimeterM:number})=>void=()=>{};
  onMeasureArea:(points:number[][])=>Promise<{areaM2:number;perimeterM:number}>=async()=>{throw new Error('Medição indisponível.');};
  measureComplete:number[][]|null=null;
  measureGeneration=0;
  measureClosing=false;
  measureModify:Modify|null=null;
  onMeasureSegment:(index:number)=>void=()=>{};
  onMeasureVertex:(index:number)=>void=()=>{};
  measureDraft:number[][]=[];
  measureSource=new VectorSource<Feature<LineString>>();
  measureLayer=new VectorLayer({source:this.measureSource,style:f=>this.measureStyle(f as Feature)});
  measureStyle(feature:Feature){
    const geometry=feature.getGeometry();
    if(!(geometry instanceof LineString))return precisionSketchStyle;
    const points=geometry.getCoordinates(),values=measurePath(points);
    const styles=[new Style({stroke:new Stroke({color:'#ffdb8b',width:1.5,lineDash:[5,4]})})];
    if(feature.get('areaM2')!==undefined){
      const polygon=new Polygon([points]);
      styles.unshift(new Style({geometry:polygon,fill:new Fill({color:'rgba(255,219,139,.09)'})}));
      styles.push(new Style({geometry:polygon.getInteriorPoint(),text:new Text({text:feature.get('areaM2').toLocaleString('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2})+' m²',font:'600 12px Segoe UI',fill:new Fill({color:'#ffdb8b'}),stroke:new Stroke({color:'#17212d',width:3})})}));
    }
    points.forEach((p,index)=>styles.push(new Style({geometry:new Point(p),image:new CircleStyle({radius:feature.get('selectedVertex')===index?4:2.5,fill:new Fill({color:feature.get('selectedVertex')===index?'#82e7bb':'#ffdb8b'}),stroke:new Stroke({color:'#17212d',width:1})})})));
    values.segments.forEach((length,i)=>{
      if(length<.001)return;
      const a=points[i],b=points[i+1];let rotation=-Math.atan2(b[1]-a[1],b[0]-a[0]);
      if(rotation>Math.PI/2)rotation-=Math.PI;if(rotation<-Math.PI/2)rotation+=Math.PI;
      styles.push(new Style({geometry:new Point([(a[0]+b[0])/2,(a[1]+b[1])/2]),text:new Text({text:length.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m',font:'600 11px Segoe UI',rotation,offsetY:-10,fill:new Fill({color:'#ffdb8b'}),stroke:new Stroke({color:'#17212d',width:3})})}));
    });return styles;
  }
  map:Map;
  source=new VectorSource<Feature<Polygon>>();
  vectors:VectorLayer<VectorSource<Feature<Polygon>>>;
  vertexSource=new VectorSource<Feature<Point>>();
  dimensionSource=new VectorSource<Feature<LineString>>();
  dimensionLayer=new VectorLayer({source:this.dimensionSource,visible:false,declutter:true,style:(f,resolution)=>{
    const coordinates=(f.getGeometry() as LineString).getCoordinates();
    const dimension=externalDimension(coordinates[0],coordinates[1],f.get('orientation'),resolution);
    if(!dimension)return [];
    return [new Style({geometry:new Point(dimension.label),text:new Text({text:f.get('label'),font:'600 11px Segoe UI',rotation:dimension.rotation,
        fill:new Fill({color:'#e7f3fa'}),stroke:new Stroke({color:'#17212d',width:3})})})];
  }});
  vertexLayer=new VectorLayer({source:this.vertexSource,visible:false,style:f=>new Style({
    image:new CircleStyle({radius:2.5,fill:new Fill({color:'#ffe09c'}),stroke:new Stroke({color:'#17212d',width:1})}),
    text:new Text({text:f.get('label'),font:'600 11px Segoe UI',offsetX:7,offsetY:-9,textAlign:'left',
      fill:new Fill({color:'#ffe09c'}),stroke:new Stroke({color:'#17212d',width:3})}),
  })});
  rasters=new globalThis.Map<string,WebGLTile>();
  cadViews=new globalThis.Map<string,CadView>();
  textSource=new VectorSource<Feature<Point>>();
  textLayer=new VectorLayer({source:this.textSource,zIndex:30,style:(f,resolution)=>new Style({text:new Text({text:f.get('text'),font:`${f.get('bold')===false?'400':'700'} ${Math.max(2,Math.min(500,f.get('size')/resolution))}px "${f.get('font')||'Arial'}"`,rotation:-f.get('angle')*Math.PI/180,rotateWithView:true,fill:new Fill({color:f.get('color')||'#fff8dd'}),stroke:f.get('outline')===false?undefined:new Stroke({color:f.get('outlineColor')||'#17212d',width:f.get('outlineWidth')||2})})})});
  onText:(xy:number[],id:string|null)=>void=()=>{};
  textTranslate:Translate|null=null;
  doc:Document|null=null;
  selected:string|null=null;
  mode:Mode='select';
  draw:Draw|null=null;
  modify:Modify|null=null;
  snap:Snap|null=null;
  orthogonal=false;
  snapEnabled=true;
  ignoreClicksUntil=0;
  draftCoordinates:number[][]=[];
  arcBase:number[][]=[];
  arcPoints:number[][]=[];
  arcStage='';
  arcSource=new VectorSource();
  arcLayer=new VectorLayer({source:this.arcSource,style:precisionSketchStyle});
  arcModify:Modify|null=null;
  arcLine:Feature<LineString>|null=null;
  arcHandle:Feature<Point>|null=null;
  onArc:(stage:string)=>void;
  onGeometry:(id:string|null,coordinates:number[][][])=>void;
  onSelect:(id:string|null)=>void;
  onCoordinates:(xy:number[])=>void;
  onDraft:(area:number,vertices:number)=>void;
  onError:(text:string)=>void;
  constructor(target:HTMLElement,events:{geometry:Editor['onGeometry'];select:Editor['onSelect'];coordinates:Editor['onCoordinates'];draft:Editor['onDraft'];error:Editor['onError'];arc:Editor['onArc']},sharedRamps=true){
    this.onGeometry=events.geometry;this.onSelect=events.select;this.onCoordinates=events.coordinates;this.onDraft=events.draft;this.onError=events.error;
    this.onArc=events.arc;
    this.sharedRamps.layer.setVisible(sharedRamps);this.sharedRamps.labelLayer.setVisible(sharedRamps);
    this.vectors=new VectorLayer({source:this.source,style:f=>{
      const chosen=f.getId()===this.selected;
      return new Style({stroke:new Stroke({color:chosen?'#6fe3b0':'#93b9ff',width:chosen?3:2,lineDash:f.get('locked')?[6,5]:undefined}),fill:new Fill({color:chosen?'rgba(57,194,133,.16)':'rgba(86,143,230,.12)'}),image:new CircleStyle({radius:5,fill:new Fill({color:'#6fe3b0'}),stroke:new Stroke({color:'#11231d',width:2})}),text:new Text({text:f.get('label'),font:'600 12px Segoe UI',fill:new Fill({color:'#f3f6ff'}),stroke:new Stroke({color:'#122136',width:4}),overflow:false})});
    }});
    this.map=new Map({target,layers:[this.bridges.layer,this.landscape.layer,this.sharedRamps.labelLayer,this.accessibilityElements.layer,this.sharedRamps.layer,this.vectors,this.dimensionLayer,this.vertexLayer,this.arcLayer,this.textLayer,this.measureLayer,this.freeDimensions.layer],view:new View({center:[0,0],zoom:3}),controls:controls({rotate:false}).extend([new ScaleLine({units:'metric'})])});
    this.map.on('pointermove',event=>this.onCoordinates(event.coordinate));
    this.map.on('singleclick',event=>{
      if(Date.now()<this.ignoreClicksUntil)return;
      if(this.mode==='measure'&&this.measureComplete&&!this.measureClosing){
        const points=this.measureComplete;
        const vertex=points.findIndex(p=>{const pixel=this.map.getPixelFromCoordinate(p);return Math.hypot(pixel[0]-event.pixel[0],pixel[1]-event.pixel[1])<12;});
        if(vertex>=0){this.onMeasureVertex(vertex===points.length-1&&this.measureSource.getFeatures()[0]?.get('measureClosed')?0:vertex);return;}
        let index=-1,best=20;
        points.slice(0,-1).forEach((p,i)=>{const q=points[i+1],pixel=this.map.getPixelFromCoordinate([(p[0]+q[0])/2,(p[1]+q[1])/2]);const distance=Math.hypot(pixel[0]-event.pixel[0],pixel[1]-10-event.pixel[1]);if(distance<best){index=i;best=distance;}});
        if(index>=0)this.onMeasureSegment(index);return;
      }
      if(this.mode==='text'){this.onText(event.coordinate,null);return;}
      if(this.mode==='select'){const t=this.map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:l=>l===this.textLayer,hitTolerance:5});if(t){this.onText(event.coordinate,String(t.getId()));return;}}
      if(this.arcStage&&this.arcStage!=='adjust'){this.arcPoint(event.coordinate);return;}
      if(this.mode!=='select'||Date.now()<this.ignoreClicksUntil||(event.originalEvent.target as HTMLElement)?.closest('button,input,select'))return;
      const feature=this.map.forEachFeatureAtPixel(event.pixel,f=>f,{layerFilter:l=>l===this.vectors,hitTolerance:8});
      this.select(feature?String(feature.getId()):null);this.onSelect(this.selected);
    });
  }
  setDocument(doc:Document){
    this.freeDimensions.update(doc.dimensions||[]);
    this.bridges.update(doc);
    this.landscape.update(doc.landscape||[]);
    this.sharedRamps.update(doc.accessibility||[]);
    this.accessibilityElements.update(doc.accessibilityElements||[]);
    const changed=this.doc?.project.id!==doc.project.id;
    this.doc=doc;
    proj4.defs(doc.project.crs.authid,doc.project.crs.proj4);register(proj4);
    if(changed){
      this.cancel();this.selected=null;
      this.vectors.setVisible(true);
      this.rasters.forEach(layer=>this.map.removeLayer(layer));this.rasters.clear();
      this.cadViews.forEach(v=>this.map.removeLayer(v.layer));this.cadViews.clear();
      this.map.setView(new View({projection:doc.project.crs.authid,center:doc.project.view.center,resolution:doc.project.view.resolution,minResolution:.01,maxResolution:10000}));
    }
    this.textSource.clear();
    (doc.annotations||[]).forEach(a=>{const f=new Feature(new Point([a.x,a.y]));f.setId(a.id);f.setProperties(a);this.textSource.addFeature(f);});
    this.source.clear();
    this.vertexSource.clear();
    this.dimensionSource.clear();
    doc.entities.forEach(e=>{
      const f=new Feature(new Polygon(e.geometry.coordinates));f.setId(e.id);f.set('locked',e.locked);
      f.set('label',`${e.attributes.name}\n${e.derived.areaM2.toLocaleString('pt-BR',{maximumFractionDigits:2})} m²`);this.source.addFeature(f);
      const updateVertices=()=>{
        this.vertexSource.getFeatures().filter(v=>v.get('entityId')===e.id).forEach(v=>this.vertexSource.removeFeature(v));
        f.getGeometry()!.getCoordinates().forEach((ring,ringIndex)=>ring.slice(0,-1).forEach((coordinate,index)=>{
          const vertex=new Feature(new Point(coordinate));vertex.setId(`${e.id}:${ringIndex}:${index+1}`);
          vertex.set('entityId',e.id);vertex.set('label',`P${index+1}`);
          this.vertexSource.addFeature(vertex);
        }));
      };
      updateVertices();f.getGeometry()!.on('change',updateVertices);
      const updateDimensions=(preview=false)=>{
        this.dimensionSource.getFeatures().filter(d=>d.get('entityId')===e.id).forEach(d=>this.dimensionSource.removeFeature(d));
        const ring=f.getGeometry()!.getCoordinates()[0],orientation=ringOrientation(ring);
        ring.slice(0,-1).forEach((a,index)=>{
          const b=ring[index+1],edge=new Feature(new LineString([a,b]));
          const length=preview?Math.hypot(b[0]-a[0],b[1]-a[1]):e.derived.edgesM[index];
          edge.set('entityId',e.id);edge.set('orientation',orientation);
          edge.set('label',`${preview?'≈ ':''}${length.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} m`);
          this.dimensionSource.addFeature(edge);
        });
      };
      updateDimensions();f.getGeometry()!.on('change',()=>updateDimensions(true));
    });
    if(!doc.entities.some(e=>e.id===this.selected))this.selected=null;
    for(const [id,layer] of this.rasters){if(!doc.resources.some(r=>r.id===id)){this.map.removeLayer(layer);this.rasters.delete(id);}}
    for(const [id,view] of this.cadViews){if(!doc.resources.some(r=>r.id===id)){this.map.removeLayer(view.layer);this.cadViews.delete(id);}}
    for(const resource of doc.resources.filter(r=>r.role==='vectorSource')){
      let view=this.cadViews.get(resource.id);
      if(!view){view=new CadView();this.cadViews.set(resource.id,view);this.map.getLayers().insertAt(this.map.getLayers().getArray().indexOf(this.vectors),view.layer);const current=view;
        const ready=current.load(doc.project.id,resource.id);current.layer.set('cadReady',ready);
        void ready.catch(e=>{if(this.cadViews.get(resource.id)===current)this.onError(e.message);});}
      view.update(resource);
    }
    for(const resource of doc.resources.filter(r=>r.role!=='vectorSource')){
      if(!this.rasters.has(resource.id)){
        const projection='RASTER:'+resource.id;
        proj4.defs(projection,resource.metadata.sourceProj4);register(proj4);
        const source=new GeoTIFF({projection,convertToRGB:'auto',sources:[{url:`/api/projects/${doc.project.id}/resources/${resource.id}/cog`,bands:resource.metadata.bands,min:resource.metadata.min,max:resource.metadata.max}]});
        source.on('tileloaderror',()=>this.onError('Falha ao exibir a ortofoto. Confira se os arquivos do projeto continuam disponíveis.'));
        const layer=new WebGLTile({source,opacity:resource.metadata.opacity});layer.set('resourceId',resource.id);this.rasters.set(resource.id,layer);this.map.getLayers().insertAt(0,layer);
      } else this.rasters.get(resource.id)!.setOpacity(resource.metadata.opacity);
    }
    this.tool(this.mode);
  }
  previewTextId:string|null=null;
  previewText(a:Annotation|null){
    const old=this.textSource.getFeatureById('__text_preview__');if(old)this.textSource.removeFeature(old);
    if(this.previewTextId){const original=this.doc?.annotations.find(v=>v.id===this.previewTextId),f=this.textSource.getFeatureById(this.previewTextId);if(original&&f){f.setProperties({font:'Arial',bold:true,color:'#fff8dd',outline:true,outlineColor:'#17212d',outlineWidth:2,...original});f.getGeometry()!.setCoordinates([original.x,original.y]);}this.previewTextId=null;}
    if(a){const existing=this.textSource.getFeatureById(a.id);if(existing){existing.setProperties(a);existing.getGeometry()!.setCoordinates([a.x,a.y]);this.previewTextId=a.id;}else{const f=new Feature(new Point([a.x,a.y]));f.setProperties(a);f.setId('__text_preview__');this.textSource.addFeature(f);}}
  }

  textVisible(visible:boolean){this.textLayer.setVisible(visible);}
  editText(id:string|null,save:(id:string,xy:number[],duplicate:boolean)=>void,all=false){
    if(this.textTranslate){this.map.removeInteraction(this.textTranslate);this.textTranslate=null;}
    if(!id&&!all)return;
    // Resolve the current source feature on pointer-down: document refreshes replace features.
    let f:Feature<Point>|null=null,gestureId='',duplicate=false,start:number[]=[],ghost:Feature<Point>|null=null,originalText='';
    this.textTranslate=new Translate({layers:[this.textLayer],filter:feature=>{
      const key=String(feature.getId());
      return !key.startsWith('__')&&(all||key===id)&&this.textSource.getFeatureById(key)===feature;
    },hitTolerance:5,condition:e=>this.mode==='select'&&(e.originalEvent as PointerEvent).button===0});
    this.textTranslate.on('translatestart',e=>{
      f=e.features.item(0) as Feature<Point>;gestureId=String(f.getId());
      duplicate=e.mapBrowserEvent.originalEvent.altKey;start=[...f.getGeometry()!.getCoordinates()];originalText=f.get('text');
      if(duplicate){ghost=f.clone();ghost.setId('__text_copy_origin__');this.textSource.addFeature(ghost);f.set('text',nextTextName(originalText,this.doc?.annotations.map(a=>a.text)||[]));}
    });
    this.textTranslate.on('translateend',()=>{
      if(!f)return;
      const xy=[...f.getGeometry()!.getCoordinates()];this.ignoreClicksUntil=Date.now()+300;
      if(ghost){this.textSource.removeFeature(ghost);ghost=null;f.getGeometry()!.setCoordinates(start);f.set('text',originalText);}
      if(Math.hypot(xy[0]-start[0],xy[1]-start[1])>0)save(gestureId,xy,duplicate);
      f=null;
    });
    this.map.addInteraction(this.textTranslate);
  }
  select(id:string|null){this.selected=id;this.vectors.changed();if(this.mode==='edit')this.tool('edit');}
  drawingOptions(snap:boolean,orthogonal:boolean){
    this.snapEnabled=snap;this.orthogonal=orthogonal;
    if(this.snap){this.map.removeInteraction(this.snap);this.snap=null;}
    if(snap){this.snap=new Snap({source:this.source,pixelTolerance:12});this.map.addInteraction(this.snap);}
  }
  tool(mode:Mode){
    this.cancel();this.mode=mode;
    if(mode==='measure'){
      this.draw=new Draw({type:'LineString',source:this.measureSource,freehandCondition:()=>false,condition:event=>{
        if(this.measureClosing||(event.originalEvent as PointerEvent).button!==0)return false;
        if(this.measureDraft.length>=4){const initial=this.map.getPixelFromCoordinate(this.measureDraft[0]);
          if(Math.hypot(initial[0]-event.pixel[0],initial[1]-event.pixel[1])<=10){void this.closeMeasure();return false;}}
        return (event.originalEvent as PointerEvent).button===0;
      },geometryFunction:(coords,geometry)=>{
        const points=coords as number[][];
        if(this.orthogonal&&points.length>1)points[points.length-1]=orthogonalPathPoint(points);
        const line=geometry instanceof LineString?geometry:new LineString([]);line.setCoordinates(points);return line;
      },style:f=>this.measureStyle(f as Feature)});
      this.draw.on('drawstart',event=>{
        this.measureSource.clear();
        event.feature.getGeometry()!.on('change',()=>{this.measureDraft=(event.feature.getGeometry() as LineString).getCoordinates();this.onMeasure(this.measureDraft,false);});
      });
      this.draw.on('drawend',event=>{this.ignoreClicksUntil=Date.now()+500;this.measureComplete=(event.feature.getGeometry() as LineString).getCoordinates();this.onMeasure(this.measureComplete,true);this.draw?.setActive(false);this.editMeasurement(event.feature as Feature<LineString>);});
      this.map.addInteraction(this.draw);
    } else if(mode==='draw'){
      this.draw=new Draw({type:'Polygon',style:precisionSketchStyle,geometryFunction:(coords,geom)=>{
        const input=(coords as number[][][])[0];
        this.draftCoordinates=input.slice(0,-1).map(p=>[...p]);
        if(this.orthogonal&&input.length>1){const locked=orthogonalPathPoint(input);input[input.length-1][0]=locked[0];input[input.length-1][1]=locked[1];}
        const ring=input.map(p=>[...p]);
        const closed=ring.length?(this.orthogonal?closeMeasureRing(ring,true):[...ring,ring[0]]):[];
        const geometry=geom instanceof Polygon?geom:new Polygon([]);geometry.setCoordinates([closed]);return geometry;
      }});
      this.draw.on('drawstart',event=>event.feature.getGeometry()!.on('change',()=>{const g=event.feature.getGeometry() as Polygon;this.onDraft(g.getArea(),Math.max(0,g.getCoordinates()[0].length-2));}));
      this.draw.on('drawend',event=>{this.ignoreClicksUntil=Date.now()+500;this.onDraft(0,0);this.onGeometry(null,(event.feature.getGeometry() as Polygon).getCoordinates());});
      this.map.addInteraction(this.draw);
    } else if(mode==='edit'&&this.selected){
      const feature=this.source.getFeatureById(this.selected);
      if(feature&&!feature.get('locked')){
        this.modify=new Modify({features:new Collection([feature]),style:precisionSketchStyle});
        this.modify.on('modifyend',()=>this.onGeometry(this.selected,feature.getGeometry()!.getCoordinates()));this.map.addInteraction(this.modify);
      }
    }
    if(this.snapEnabled){this.snap=new Snap({source:this.source,pixelTolerance:12});this.map.addInteraction(this.snap);}
  }
  clearArc(){if(this.arcModify){this.map.removeInteraction(this.arcModify);this.arcModify=null;}this.arcSource.clear();this.arcStage='';this.arcPoints=[];this.arcLine=null;this.arcHandle=null;this.onArc('');}
  cancel(){if(this.measureModify){this.map.removeInteraction(this.measureModify);this.measureModify=null;}this.clearArc();this.draftCoordinates=[];if(this.draw){this.draw.abortDrawing();this.map.removeInteraction(this.draw);this.draw=null;}if(this.modify){this.map.removeInteraction(this.modify);this.modify=null;}if(this.snap){this.map.removeInteraction(this.snap);this.snap=null;}this.measureSource.clear();this.measureDraft=[];this.measureComplete=null;this.measureGeneration++;this.measureClosing=false;this.onMeasure([],false);this.onDraft(0,0);}
  startArc(){
    if(this.mode!=='draw'||this.arcStage)return;
    this.arcBase=this.draftCoordinates.map(p=>[...p]);
    if(this.draw){this.draw.abortDrawing();this.map.removeInteraction(this.draw);this.draw=null;}
    this.arcStage='start';this.onArc(this.arcStage);
  }
  arcPoint(point:number[]){
    if(this.arcStage==='adjust')return;
    this.arcPoints.push([...point]);
    this.arcSource.addFeature(new Feature(new Point(point)));
    if(this.arcPoints.length<3){this.arcStage=this.arcPoints.length===1?'middle':'end';this.onArc(this.arcStage);return;}
    try{
      const points=arcThroughThree(...this.arcPoints as [number[],number[],number[]]);
      this.arcLine=new Feature(new LineString(points));this.arcSource.addFeature(this.arcLine);
      this.arcHandle=new Feature(new Point(this.arcPoints[1]));
      // Only the middle handle is editable; endpoints never enter Modify.
      this.arcSource.clear();this.arcSource.addFeatures([this.arcLine,new Feature(new Point(this.arcPoints[0])),new Feature(new Point(this.arcPoints[2])),this.arcHandle]);
      this.arcHandle.setStyle(new Style({image:new CircleStyle({radius:4,fill:new Fill({color:'#ffcd70'}),stroke:new Stroke({color:'#14212e',width:1})})}));
      this.arcHandle.getGeometry()!.on('change',()=>{
        const middle=this.arcHandle!.getGeometry()!.getCoordinates();
        try{const sampled=arcThroughThree(this.arcPoints[0],middle,this.arcPoints[2]);this.arcPoints[1]=[...middle];this.arcLine!.getGeometry()!.setCoordinates(sampled);}catch{/* Retain the last valid arc until the handle is released. */}
      });
      this.arcModify=new Modify({features:new Collection([this.arcHandle]),style:precisionSketchStyle});
      this.arcModify.on('modifyend',()=>{this.arcHandle!.getGeometry()!.setCoordinates(this.arcPoints[1]);});
      this.map.addInteraction(this.arcModify);this.arcStage='adjust';this.onArc(this.arcStage);
    }catch(error){this.onError((error as Error).message);this.arcPoints=[];this.arcSource.clear();this.arcStage='start';this.onArc(this.arcStage);}
  }
  applyArc(){
    if(this.arcStage!=='adjust'||!this.arcLine)return;
    const points=this.arcLine.getGeometry()!.getCoordinates(),base=this.arcBase.map(p=>[...p]);
    if(base.length&&Math.hypot(base.at(-1)![0]-points[0][0],base.at(-1)![1]-points[0][1])<1e-8)points.shift();
    this.tool('draw');this.draw!.appendCoordinates([...base,...points]);
  }
  cancelArc(){const base=this.arcBase.map(p=>[...p]);this.tool('draw');if(base.length)this.draw!.appendCoordinates(base);}
  point(point:number[]){if(this.arcStage)this.arcPoint(point);else if(this.draw)this.draw.appendCoordinates([point]);}
  async closeMeasure(){
    if(this.mode!=='measure'||this.measureClosing)return;
    let points=(this.measureComplete||this.measureDraft.slice(0,-1)).map(p=>p.slice());
    if(points.length<3){this.onError('Clique em pelo menos três pontos distintos para medir a área.');return;}
    points=closeMeasureRing(points,this.orthogonal);
    const generation=this.measureGeneration;this.measureClosing=true;
    try{
      const result=await this.onMeasureArea(points);
      if(generation!==this.measureGeneration||this.mode!=='measure')return;
      this.draw?.setActive(false);this.measureSource.clear();
      const feature=new Feature(new LineString(points));feature.set('areaM2',result.areaM2);feature.set('measureClosed',true);this.measureSource.addFeature(feature);
      this.measureComplete=points;this.ignoreClicksUntil=Date.now()+500;this.onMeasure(points,true,result);this.editMeasurement(feature);
    }catch(error){if(generation===this.measureGeneration)this.onError(error instanceof Error?error.message:'Não foi possível medir a área.');}
    finally{if(generation===this.measureGeneration)this.measureClosing=false;}
  }
  editMeasurement(feature:Feature<LineString>){
    if(this.measureModify)this.map.removeInteraction(this.measureModify);
    let before:number[][]=[];
    this.measureModify=new Modify({features:new Collection([feature]),pixelTolerance:9,insertVertexCondition:()=>false,deleteCondition:()=>false,
      condition:event=>!this.measureClosing&&(event.originalEvent as PointerEvent).button===0,style:precisionSketchStyle});
    this.measureModify.on('modifystart',()=>{before=feature.getGeometry()!.getCoordinates().map(p=>p.slice());this.ignoreClicksUntil=Date.now()+500;});
    feature.getGeometry()!.on('change',()=>{
      if(before.length){feature.unset('areaM2');this.onMeasure(feature.getGeometry()!.getCoordinates(),true);}
    });
    this.measureModify.on('modifyend',()=>{
      const points=feature.getGeometry()!.getCoordinates().map(p=>p.slice());
      if(feature.get('measureClosed')){
        if(points[0][0]!==before[0][0]||points[0][1]!==before[0][1])points[points.length-1]=points[0].slice();
        else points[0]=points.at(-1)!.slice();
      }
      const previous=before;before=[];this.ignoreClicksUntil=Date.now()+500;void this.updateMeasurement(feature,points,previous);
    });
    this.map.addInteraction(this.measureModify);
    if(this.snap){this.map.removeInteraction(this.snap);this.map.addInteraction(this.snap);}
  }
  async updateMeasurement(feature:Feature<LineString>,points:number[][],before:number[][]){
    if(this.measureClosing)return;
    const closed=!!feature.get('measureClosed'),generation=this.measureGeneration;
    this.measureClosing=true;
    try{
      const result=closed?await this.onMeasureArea(points):undefined;
      if(generation!==this.measureGeneration||this.mode!=='measure')return;
      feature.getGeometry()!.setCoordinates(points);if(result)feature.set('areaM2',result.areaM2);
      this.measureComplete=points;this.onMeasure(points,true,result);
    }catch(error){
      if(generation===this.measureGeneration){
        feature.getGeometry()!.setCoordinates(before);this.measureComplete=before;
        try{const result=closed?await this.onMeasureArea(before):undefined;if(generation===this.measureGeneration){if(result)feature.set('areaM2',result.areaM2);this.onMeasure(before,true,result);}}catch{this.onMeasure(before,true);}
        this.onError(error instanceof Error?error.message:'Não foi possível ajustar a medição.');
      }
    }finally{if(generation===this.measureGeneration)this.measureClosing=false;}
  }
  async resizeMeasurement(index:number,length:number){
    const feature=this.measureSource.getFeatures()[0];
    if(!feature||!this.measureComplete||this.measureClosing)return;
    try{const before=this.measureComplete.map(p=>p.slice());const points=resizeMeasureSegment(before,index,length,!!feature.get('measureClosed'));await this.updateMeasurement(feature,points,before);}
    catch(error){this.onError(error instanceof Error?error.message:'Comprimento inválido.');}
  }
  async removeMeasurementVertex(index:number){
    const feature=this.measureSource.getFeatures()[0];
    if(!feature||!this.measureComplete||this.measureClosing)return;
    try{const before=this.measureComplete.map(p=>p.slice());const points=removeMeasureVertex(before,index,!!feature.get('measureClosed'));await this.updateMeasurement(feature,points,before);}
    catch(error){this.onError(error instanceof Error?error.message:'Não foi possível excluir o vértice.');}
  }
  finish(){if(this.measureClosing)return;if(this.mode==='measure'&&this.measureDraft.length<3){this.onError('Clique em pelo menos dois pontos para concluir a medição.');return;}if(this.arcStage){this.onError('Aplique ou cancele o arco antes de concluir a gleba.');return;}this.draw?.finishDrawing();}
  removeLast(){if(this.arcStage){this.cancelArc();return;}this.draw?.removeLastPoint();}
  fit(id?:string){
    if(id){const e=this.source.getFeatureById(id);if(e)this.map.getView().fit(e.getGeometry()!.getExtent(),{padding:[70,70,70,70],duration:250,maxZoom:22});return;}
    const bounds=this.source.getExtent()||[Infinity,Infinity,-Infinity,-Infinity];
    const items=this.doc?.resources.map(r=>r.metadata.bounds)||[];
    for(const a of this.doc?.annotations||[]){
      const r=a.angle*Math.PI/180,halfW=a.text.length*a.size*.32,halfH=a.size;
      const dx=Math.abs(Math.cos(r)*halfW)+Math.abs(Math.sin(r)*halfH),dy=Math.abs(Math.sin(r)*halfW)+Math.abs(Math.cos(r)*halfH);
      items.push([a.x-dx,a.y-dy,a.x+dx,a.y+dy]);
    }
    for(const b of items){bounds[0]=Math.min(bounds[0],b[0]);bounds[1]=Math.min(bounds[1],b[1]);bounds[2]=Math.max(bounds[2],b[2]);bounds[3]=Math.max(bounds[3],b[3]);}
    if(bounds.every(Number.isFinite))this.map.getView().fit(bounds,{padding:[70,70,70,70],duration:250});
  }
  visible(yes:boolean){this.vectors.setVisible(yes);}
  verticesVisible(yes:boolean){this.vertexLayer.setVisible(yes);}
  dimensionsVisible(yes:boolean){this.dimensionLayer.setVisible(yes);}
  resourceVisible(id:string,yes:boolean){this.rasters.get(id)?.setVisible(yes);}
  opacity(id:string,value:number){this.rasters.get(id)?.setOpacity(value);}
  view(){return {center:this.map.getView().getCenter()!,resolution:this.map.getView().getResolution()!};}
  dispose(){this.cancel();this.map.setTarget(undefined);this.map.dispose();}
}
