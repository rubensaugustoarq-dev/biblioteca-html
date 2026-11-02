import {landscapeFootprint} from './footprint';
import {Editor} from '../../editor';
import type {Document} from '../../api';
import type {LandscapeItem,LandscapeMode} from './types';
import {landscapeStyle} from './overlay';
import {arcStartEndDirection,tangentThroughThree,arcSweepDegrees} from '../../arc';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Collection from 'ol/Collection';
import {Style,Stroke,Fill,Circle,Text} from 'ol/style';
export function waterRing(item:LandscapeItem){
 const ring=item.geometry.coordinates[0] as number[][],points=[ring[0]];
 for(let i=0;i<ring.length-1;i++){const arc=item.arcSegments?.find(v=>v.index===i);if(arc)points.push(...arcStartEndDirection(ring[i],ring[i+1],[ring[i][0]+Math.cos(arc.directionDegrees*Math.PI/180),ring[i][1]+Math.sin(arc.directionDegrees*Math.PI/180)]).slice(1));else points.push(ring[i+1]);}
 return points;
}
export class LandscapeScene{
 editor:Editor;mode:LandscapeMode='select';draft:LandscapeItem|null=null;selected:LandscapeItem|null=null;
 temporary=new VectorSource();handles=new VectorSource();working=new VectorSource();context=new VectorSource();
 interactions:any[]=[];draw:Draw|null=null;
 constructor(target:HTMLElement,private events:{select:(id:string)=>void;place:(p:number[])=>void;save:(v:LandscapeItem)=>void;water:(g:any)=>void;arc:(i:number,angle:number)=>void;error:(s:string)=>void}){
  this.editor=new Editor(target,{geometry:()=>{},select:()=>{},coordinates:()=>{},draft:()=>{},error:events.error,arc:()=>{}});
  this.editor.map.addLayer(new VectorLayer({source:this.context,zIndex:5,style:f=>new Style({fill:new Fill({color:f.get('material')==='concrete'?'#bfc7c7':f.get('material')==='brick'?'#b98e68':'#414e56'}),stroke:new Stroke({color:'#a1b9ad',width:.7})})}));
  this.editor.map.addLayer(new VectorLayer({source:this.temporary,zIndex:35,style:landscapeStyle}));
  this.editor.map.addLayer(new VectorLayer({source:this.working,zIndex:36,style:f=>{const g=f.getGeometry(),points=g instanceof Polygon?g.getCoordinates()[0].slice(0,-1):g instanceof Point?[g.getCoordinates()]:[];return [new Style({stroke:new Stroke({color:'#8ee4c5',width:1,lineDash:[3,4]})}),...points.map((p,i)=>new Style({geometry:new Point(p),image:new Circle({radius:3,fill:new Fill({color:'#92e5c4'}),stroke:new Stroke({color:'#183b36',width:1})}),text:new Text({text:g instanceof Polygon?'P'+(i+1):'',offsetY:-11,font:'10px Arial',fill:new Fill({color:'#dff9f0'}),stroke:new Stroke({color:'#173832',width:2})})}))];}}));
  this.editor.map.addLayer(new VectorLayer({source:this.handles,zIndex:37,style:new Style({image:new Circle({radius:5,fill:new Fill({color:'#ffdc86'}),stroke:new Stroke({color:'#513f21',width:1})})})}));
  this.editor.map.on('pointermove',e=>{if(e.dragging)return;if(['tree','palm','chalet','hut'].includes(this.mode))this.showPlant(e.coordinate);});
  this.editor.map.getViewport()?.addEventListener('pointerleave',()=>{if(['tree','palm','chalet','hut'].includes(this.mode))this.temporary.clear();});
  this.editor.map.on('singleclick',e=>{
   if(['tree','palm','chalet','hut'].includes(this.mode)){this.events.place(e.coordinate);return;}
   const handle=this.editor.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>(l as VectorLayer).getSource()===this.handles,hitTolerance:7});
   if(handle&&this.mode==='edit'){const index=handle.get('index');this.events.arc(index,this.angle(index));return;}
   if(this.mode==='water')return;
   const f=this.editor.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.editor.landscape.layer,hitTolerance:5});if(f)this.events.select(String(f.getId()));
  });
 }
 update(doc:Document){const fresh=this.editor.doc?.project.id!==doc.project.id;this.editor.setDocument(doc);this.editor.tool('select');this.context.clear();const geo=new GeoJSON();for(const region of doc.infraMetrics?.regions||[]){const f=new Feature(geo.readGeometry(region.geometry)!);f.set('material',region.material);this.context.addFeature(f);}if(fresh)this.fit();}
 fit(id?:string){const f=id?this.editor.landscape.source.getFeatureById(id):null;if(f)this.editor.map.getView().fit(f.getGeometry()!.getExtent(),{padding:[60,60,60,60],maxZoom:22});else if(this.editor.landscape.source.getFeatures().length)this.editor.map.getView().fit(this.editor.landscape.source.getExtent()!,{padding:[60,60,60,60],maxZoom:22});else this.editor.fit();}
 clear(){for(const interaction of this.interactions)this.editor.map.removeInteraction(interaction);this.interactions=[];this.draw=null;this.working.clear();this.handles.clear();this.temporary.clear();for(const f of this.editor.landscape.source.getFeatures())f.setStyle(undefined);}
 tool(mode:LandscapeMode,selected:LandscapeItem|null,draft:LandscapeItem){
  this.clear();this.mode=mode;this.draft=draft;this.selected=selected?structuredClone(selected):null;
  this.editor.map.getTargetElement()!.style.cursor=['tree','palm','water','chalet','hut'].includes(mode)?'crosshair':'';
  if(['tree','palm','chalet','hut'].includes(mode)){const p=this.editor.map.getView().getCenter();if(p)this.showPlant(p);}
  if(mode==='water'){
   const draw=new Draw({type:'Polygon',style:new Style({stroke:new Stroke({color:'#80d8ee',width:2}),fill:new Fill({color:'rgba(58,160,198,.3)'}),image:new Circle({radius:3,fill:new Fill({color:'#a0e7fa'})})})});
   draw.on('drawend',e=>this.events.water(new GeoJSON().writeGeometryObject(e.feature.getGeometry()!)));this.draw=draw;this.add(draw);
   this.add(new Snap({source:this.editor.source}));this.add(new Snap({source:this.editor.landscape.source}));
  }
  if(mode==='edit'&&this.selected){
   const item=this.selected;this.editor.landscape.source.getFeatureById(item.id)?.setStyle([]);
   const geometry=new GeoJSON().readGeometry(item.geometry)!,control=new Feature(geometry);this.working.addFeature(control);
   geometry.on('change',()=>{if(item.kind==='water'){this.selected={...item,geometry:new GeoJSON().writeGeometryObject(geometry) as LandscapeItem['geometry']};this.redrawWater();}else this.showPlant((geometry as Point).getCoordinates());});
   if(item.kind!=='water')this.showPlant((geometry as Point).getCoordinates());
   const modify=new Modify({features:new Collection([control]),insertVertexCondition:()=>false,deleteCondition:()=>false});
   modify.on('modifyend',()=>{const next={...item,geometry:new GeoJSON().writeGeometryObject(geometry) as LandscapeItem['geometry']};this.events.save(next);});this.add(modify);
   if(item.kind==='water'){
    this.redrawWater();const ring=item.geometry.coordinates[0] as number[][];
    for(let i=0;i<ring.length-1;i++){const points=this.segment(i),f=new Feature(new Point(points[Math.floor(points.length/2)]));if(points.length===2)f.setGeometry(new Point([(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2]));f.set('index',i);this.handles.addFeature(f);}
    const curves=new Modify({source:this.handles,insertVertexCondition:()=>false,deleteCondition:()=>false});
    let active=-1,changing=false;
    curves.on('modifystart',e=>{active=e.features.item(0).get('index');changing=true;});
    for(const f of this.handles.getFeatures())f.getGeometry()!.on('change',()=>{if(!changing||active!==f.get('index'))return;try{const i=active,a=ring[i],b=ring[i+1],mid=(f.getGeometry() as Point).getCoordinates(),direction=tangentThroughThree(a,mid,b);item.arcSegments=[...(item.arcSegments||[]).filter(v=>v.index!==i),{index:i,directionDegrees:direction}];this.redrawWater();this.events.arc(i,arcSweepDegrees(a,b,direction));}catch{}});
    curves.on('modifyend',()=>{changing=false;this.events.save(item);});this.add(curves);
   }
  }
 }
 private add(v:any){this.editor.map.addInteraction(v);this.interactions.push(v);}
 segment(i:number){const item=this.selected!,ring=item.geometry.coordinates[0],arc=item.arcSegments?.find(v=>v.index===i);return arc?arcStartEndDirection(ring[i],ring[i+1],[ring[i][0]+Math.cos(arc.directionDegrees*Math.PI/180),ring[i][1]+Math.sin(arc.directionDegrees*Math.PI/180)]):[ring[i],ring[i+1]];}
 angle(i:number){const item=this.selected!,ring=item.geometry.coordinates[0],arc=item.arcSegments?.find(v=>v.index===i);return arc?arcSweepDegrees(ring[i],ring[i+1],arc.directionDegrees):0;}
 redrawWater(){try{const item=this.selected!,ring=waterRing(item),f=new Feature(new Polygon([ring]));f.setProperties({item,selected:true,preview:true});this.temporary.clear();this.temporary.addFeature(f);}catch{}}
 showPlant(xy:number[]){const item=this.draft;if(!item)return;const ring=landscapeFootprint(item,xy),f=new Feature(new Polygon([ring]));f.setProperties({item,preview:true});this.temporary.clear();this.temporary.addFeature(f);}
 dispose(){this.clear();this.editor.dispose();}
}
