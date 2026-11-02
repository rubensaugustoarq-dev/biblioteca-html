import type Map from 'ol/Map';
import {LotDimensions} from './lotDimensions';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Collection from 'ol/Collection';
import Polygon from 'ol/geom/Polygon';
import LineString from 'ol/geom/LineString';
import {Style,Fill,Stroke,Text,Circle} from 'ol/style';
import {unByKey} from 'ol/Observable';
import type {AreaGeometry,SubdivisionArea,Layout} from './types';
import {orthogonalPathPoint,closeMeasureRing} from '../../../measure';

export class SubdivisionScene{
 dimensions=new LotDimensions();
 source=new VectorSource();draftSource=new VectorSource();parentSource=new VectorSource();
 frontSource=new VectorSource();frontLayer=new VectorLayer({source:this.frontSource,zIndex:17,style:new Style({stroke:new Stroke({color:'#6af1b2',width:3}),text:new Text({text:'FRENTE',placement:'line',font:'600 11px Arial',offsetY:-10,fill:new Fill({color:'#b5ffdb'}),stroke:new Stroke({color:'#17312d',width:3})})})});
 parcels=new VectorSource();selectedParcel:string|null=null;parcelSelect:(id:string)=>void=()=>{};
 parcelLayer=new VectorLayer({source:this.parcels,zIndex:15.5,declutter:true,style:f=>new Style({stroke:new Stroke({color:f.getId()===this.selectedParcel?'#fff0b2':f.get('use')==='lot'?'#b9d8ff':'#b2e7a5',width:f.getId()===this.selectedParcel?2:1}),fill:new Fill({color:({lot:'rgba(118,165,221,.16)',green:'rgba(74,168,85,.5)',institutional:'rgba(183,133,209,.5)',other:'rgba(230,176,77,.45)',remainder:'rgba(190,184,158,.08)'} as Record<string,string>)[f.get('use')]}),text:new Text({text:f.get('label'),overflow:true,declutterMode:f.get('use')==='green'?'none':undefined,font:'600 10px Arial',fill:new Fill({color:'#fff7df'}),stroke:new Stroke({color:'#19313c',width:3})})})});
 selected:string|null=null;draw:Draw|null=null;modify:Modify|null=null;snap:Snap|null=null;ortho=false;
 frontPicking=false;frontChange:(index:number)=>void=()=>{};
 layer=new VectorLayer({source:this.source,zIndex:15,style:f=>new Style({stroke:new Stroke({color:f.getId()===this.selected?'#6ce2ae':'#80a8d8',width:f.getId()===this.selected?2:1.2}),fill:new Fill({color:f.getId()===this.selected?'rgba(71,184,130,.17)':'rgba(103,149,198,.04)'})})});
 draftLayer=new VectorLayer({source:this.draftSource,zIndex:16,style:new Style({stroke:new Stroke({color:'#ffd17a',width:1.5,lineDash:[5,4]}),fill:new Fill({color:'rgba(255,206,120,.13)'})})});
 parentLayer=new VectorLayer({source:this.parentSource,zIndex:14,style:new Style({stroke:new Stroke({color:'#b6cad8',width:1,lineDash:[3,5]})})});
 lotEditing=false;clickKey;drawing=false;
 constructor(public map:Map,private change:(geometry:AreaGeometry)=>void,select:(id:string)=>void){
  map.addLayer(this.dimensions.layer);map.addLayer(this.parentLayer);map.addLayer(this.layer);map.addLayer(this.parcelLayer);map.addLayer(this.draftLayer);map.addLayer(this.frontLayer);
  this.clickKey=map.on('singleclick',e=>{if(this.lotEditing)return;if(this.frontPicking){const ring=(this.parentSource.getFeatures()[0]?.getGeometry() as Polygon|undefined)?.getCoordinates()[0];let index=-1,distance=14;for(let i=0;ring&&i<ring.length-1;i++){const p=new LineString([ring[i],ring[i+1]]).getClosestPoint(e.coordinate),pixel=map.getPixelFromCoordinate(p),d=Math.hypot(pixel[0]-e.pixel[0],pixel[1]-e.pixel[1]);if(d<distance){distance=d;index=i;}}if(index>=0){this.frontPicking=false;this.frontChange(index);}return;}if(this.draw?.getActive()||this.modify)return;const parcel=map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.parcelLayer,hitTolerance:5});if(parcel){this.parcelSelect(String(parcel.getId()));return;}const f=map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.layer,hitTolerance:5});if(f)select(String(f.getId()));});
 }
 showFront(geometry:AreaGeometry|undefined,index:number){this.frontSource.clear();const ring=geometry?.coordinates[0];if(ring?.[index]&&ring[index+1])this.frontSource.addFeature(new Feature(new LineString([ring[index],ring[index+1]])));}
 updateLayout(layout:Layout,selected:string|null){
  this.dimensions.update(layout.lots);this.selectedParcel=selected;this.parcels.clear();const format=new GeoJSON();
  for(const lot of layout.lots){const f=new Feature(format.readGeometry(lot.geometry)!);f.setId(lot.id);const area=lot.derived?.areaM2??(f.getGeometry() as Polygon).getArea();f.setProperties({use:'lot',label:String(lot.number).padStart(3,'0')+(lot.locked?' 🔒':'')+'\n'+(lot.derived?'':'≈ ')+area.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m²'});this.parcels.addFeature(f);}
  for(const zone of layout.zones){const f=new Feature(format.readGeometry(zone.geometry)!);f.setId(zone.id);const area=zone.derived?.areaM2??(f.getGeometry() as Polygon).getArea();f.setProperties({use:zone.use,label:(zone.automatic&&zone.use==='green'?'Área verde':zone.name)+'\n'+(zone.derived?'':'≈ ')+area.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m²'});this.parcels.addFeature(f);}
 }
 update(areas:SubdivisionArea[],selected:string|null,parent?:AreaGeometry,draft?:AreaGeometry){
  this.selected=selected;this.source.clear();this.parentSource.clear();const format=new GeoJSON();
  for(const area of areas){const f=new Feature(format.readGeometry(area.geometry)!);f.setId(area.id);f.set('name',area.name);this.source.addFeature(f);}
  if(parent)this.parentSource.addFeature(new Feature(format.readGeometry(parent)!));
  if(!this.modify){this.draftSource.clear();if(draft)this.draftSource.addFeature(new Feature(format.readGeometry(draft)!));}
 }
 options(snap:boolean,ortho:boolean){
  this.ortho=ortho;if(this.snap){this.map.removeInteraction(this.snap);this.snap=null;}
  if(snap&&(this.draw||this.modify)){this.snap=new Snap({source:new VectorSource({features:[...this.parentSource.getFeatures(),...this.source.getFeatures(),...this.parcels.getFeatures().filter(f=>f.getId()!==this.selectedParcel)]}),pixelTolerance:10});this.map.addInteraction(this.snap);}
 }
 beginDraw(snap:boolean,ortho:boolean){
  this.cancel();this.draftSource.clear();this.ortho=ortho;
  this.draw=new Draw({type:'Polygon',style:new Style({stroke:new Stroke({color:'#ffd17a',width:1.5}),fill:new Fill({color:'rgba(255,206,120,.1)'}),image:new Circle({radius:3,fill:new Fill({color:'#ffd17a'})})}),geometryFunction:(coords,geometry)=>{
   const ring=(coords as number[][][])[0];if(this.ortho&&ring.length>1)ring[ring.length-1]=orthogonalPathPoint(ring);
   const polygon=geometry instanceof Polygon?geometry:new Polygon([]);
   const points=ring.map(p=>p.slice());
   polygon.setCoordinates([points.length?(this.ortho?closeMeasureRing(points,true):[...points,points[0].slice()]):[]]);return polygon;
  }});
  this.draw.on('drawstart',()=>{this.drawing=true;});
  this.draw.on('drawend',e=>{this.drawing=false;this.change(new GeoJSON().writeGeometryObject(e.feature.getGeometry()!) as AreaGeometry);this.draw?.setActive(false);});
  this.map.addInteraction(this.draw);this.options(snap,ortho);
 }
 edit(geometry:AreaGeometry,snap:boolean,ortho:boolean){
  this.cancel();this.draftSource.clear();const f=new Feature(new GeoJSON().readGeometry(geometry)!);this.draftSource.addFeature(f);
  this.modify=new Modify({features:new Collection([f])});this.modify.on('modifyend',()=>this.change(new GeoJSON().writeGeometryObject(f.getGeometry()!) as AreaGeometry));this.map.addInteraction(this.modify);this.options(snap,ortho);
 }
 finish(){if(this.drawing)this.draw?.finishDrawing();}
 fit(geometry:AreaGeometry){this.map.getView().fit(new GeoJSON().readGeometry(geometry)!.getExtent(),{padding:[50,50,50,50],duration:250,maxZoom:22});}
 cancel(){this.frontPicking=false;this.drawing=false;for(const tool of [this.draw,this.modify,this.snap])if(tool)this.map.removeInteraction(tool);this.draw=null;this.modify=null;this.snap=null;}
 dispose(){this.map.removeLayer(this.dimensions.layer);this.dimensions.dispose();this.cancel();unByKey(this.clickKey);for(const layer of [this.layer,this.parcelLayer,this.draftLayer,this.parentLayer,this.frontLayer]){this.map.removeLayer(layer);layer.getSource()?.dispose();layer.dispose();}}
}
