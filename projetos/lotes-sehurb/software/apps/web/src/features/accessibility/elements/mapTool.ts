import type Map from 'ol/Map';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Stroke,Circle,Fill} from 'ol/style';
import {orthogonalPathPoint} from '../../../measure';
import {unByKey} from 'ol/Observable';
export class ElementsMapTool{
 mode:'none'|'position'|'draw'|'edit'='none';orthogonal=false;draw:Draw|null=null;modify:Modify|null=null;snap:Snap|null=null;
 source=new VectorSource();layer=new VectorLayer({source:this.source,zIndex:32,style:new Style({stroke:new Stroke({color:'#70e5b3',width:1.5}),image:new Circle({radius:4,fill:new Fill({color:'#70e5b3'})})})});
 private click;private last:number[]|null=null;
 constructor(public map:Map,private callbacks:{cursor:(p:number[]|null)=>void;point:(p:number[])=>void;path:(p:number[][])=>void;select:(id:string)=>void},private elementLayer:VectorLayer,private snapSource:VectorSource){
  map.addLayer(this.layer);
  this.click=map.on('singleclick',e=>{if(this.mode==='position'){this.mode='none';this.callbacks.cursor(null);this.callbacks.point(e.coordinate);return;}if(this.mode!=='none')return;const f=map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===elementLayer,hitTolerance:6});if(f)this.callbacks.select(f.get('elementId'));});
  map.getViewport()?.addEventListener('pointermove',this.pointer);map.getViewport()?.addEventListener('pointerleave',this.leave);
 }
 private pointer=(e:PointerEvent)=>{if(this.mode!=='position')return;this.last=this.map.getCoordinateFromPixel(this.map.getEventPixel(e))||null;this.callbacks.cursor(e.buttons?null:this.last);};
 private leave=()=>this.callbacks.cursor(null);
 private set cursor(value:string){const target=this.map.getTargetElement();if(target)target.style.cursor=value;}
 clear(){if(this.draw)this.map.removeInteraction(this.draw);if(this.modify)this.map.removeInteraction(this.modify);if(this.snap)this.map.removeInteraction(this.snap);this.draw=null;this.modify=null;this.snap=null;this.mode='none';this.source.clear();this.callbacks.cursor(null);this.cursor='';}
 position(){this.clear();this.mode='position';this.cursor='crosshair';const p=this.last||this.map.getView().getCenter();if(p)this.callbacks.cursor(p);}
 path(){this.clear();this.mode='draw';this.draw=new Draw({type:'LineString',geometryFunction:(coordinates,g)=>{const c=coordinates as number[][];if(this.orthogonal&&c.length>2)c[c.length-1]=orthogonalPathPoint(c);const line=g as LineString||new LineString([]);line.setCoordinates(c);return line;}});this.draw.on('drawend',e=>{const points=(e.feature.getGeometry() as LineString).getCoordinates().map(p=>p.slice());this.clear();this.callbacks.path(points);});this.map.addInteraction(this.draw);this.snap=new Snap({source:this.snapSource});this.map.addInteraction(this.snap);}
 edit(points:number[][]){this.clear();if(points.length<2)return;this.mode='edit';const f=new Feature(new LineString(points));this.source.addFeature(f);this.modify=new Modify({source:this.source});this.modify.on('modifyend',()=>this.callbacks.path((f.getGeometry() as LineString).getCoordinates()));this.map.addInteraction(this.modify);this.snap=new Snap({source:this.snapSource});this.map.addInteraction(this.snap);}
 dispose(){this.clear();unByKey(this.click);this.map.getViewport()?.removeEventListener('pointermove',this.pointer);this.map.getViewport()?.removeEventListener('pointerleave',this.leave);this.map.removeLayer(this.layer);this.layer.dispose();this.source.dispose();}
}
