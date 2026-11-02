import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import MultiLineString from 'ol/geom/MultiLineString';
import MultiPoint from 'ol/geom/MultiPoint';
import LineString from 'ol/geom/LineString';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Fill,Stroke,Text,Circle} from 'ol/style';
import type {AccessibilityElement} from './types';
import {parkingStyle} from './parkingStyle';

export class AccessibilityElementsOverlay{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,zIndex:28,style:(f,resolution)=>{
  const role=f.get('role'),color=f.get('invalid')?'#ef8c7c':f.get('color');
  if(role==='parking'||role==='parkingTransfer')return parkingStyle(f as Feature,resolution);
  const styles=[new Style({zIndex:role==='warning'?10:1,fill:new Fill({color:role==='vehicle'?'rgba(165,192,188,.85)':color}),stroke:new Stroke({color:f.get('warning')?'#dd6453':role==='crosswalk'?'#fff':f.get('preview')?'#ffe27a':'#6b694a',width:f.get('preview')?1.6:.65}),image:new Circle({radius:5,fill:new Fill({color:'#ef8c7c'})}),text:f.get('invalid')?new Text({text:'!',fill:new Fill({color:'#fff'}),font:'bold 10px Arial'}):undefined})];
  const g=f.getGeometry();if(!(g instanceof Polygon)||resolution>.14||!['warning','directional'].includes(role))return styles;
  // Symbols follow the actual directional axis and stay clipped to each confirmed part.
  const extent=g.getExtent(),step=Math.max(.075,resolution*4),lines:number[][][]=[],dots:number[][]=[];
  if(role==='warning'){
   for(let x=extent[0]+step/2;x<extent[2]&&dots.length<2500;x+=step)for(let y=extent[1]+step/2;y<extent[3]&&dots.length<2500;y+=step)if(g.intersectsCoordinate([x,y]))dots.push([x,y]);
   styles.push(new Style({zIndex:11,geometry:new MultiPoint(dots),image:new Circle({radius:Math.min(1.3,.012/resolution),fill:new Fill({color:'#6e622b'})})}));
  }else{
   const axis=f.get('axis');if(axis){const geometry=new GeoJSON().readGeometry(axis) as LineString|MultiLineString;
    const paths=geometry instanceof MultiLineString?geometry.getCoordinates():[geometry.getCoordinates()];
    for(const pts of paths){
    for(let i=1;i<pts.length&&lines.length<2500;i++){const a=pts[i-1],b=pts[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(!length)continue;
     for(let offset=-f.get('width')/2+step/2;offset<f.get('width')/2;offset+=step){const p=[a[0]-dy/length*offset,a[1]+dx/length*offset],q=[b[0]-dy/length*offset,b[1]+dx/length*offset];if(g.intersectsCoordinate(p)&&g.intersectsCoordinate(q))lines.push([p,q]);}
    }
   }}styles.push(new Style({zIndex:2,geometry:new MultiLineString(lines),stroke:new Stroke({color:'#6e622b',width:.8})}));
  }return styles;
 }});
 update(elements:AccessibilityElement[],transform:(p:number[])=>number[]=p=>p.slice(),preview=false){
  this.source.clear();const format=new GeoJSON();
  for(const value of elements){
   const parts=value.derived?.parts||[],invalid=value.derived?.status==='invalid';
   const transformGeometry=(json:any)=>{const g=format.readGeometry(json)!;g.applyTransform((input,output,stride=2)=>{output=output||input;for(let i=0;i<input.length;i+=stride){const p=transform([input[i],input[i+1]]);output[i]=p[0];output[i+1]=p[1];}return output;});return g;};
   parts.forEach((p,i)=>{const f=new Feature(transformGeometry(p.geometry));f.setId(value.id+':'+i);f.setProperties({elementId:value.id,role:p.role,invalid,label:p.label,parkingType:value.parkingType,warning:!!value.derived?.warnings?.length,color:value.color,preview,width:value.widthM,axis:value.derived?.axisGeometry?format.writeGeometryObject(transformGeometry(value.derived.axisGeometry)):null});this.source.addFeature(f);});
   if(invalid&&value.anchor?.length===2){const f=new Feature(new Point(transform(value.anchor)));f.setProperties({elementId:value.id,invalid:true});this.source.addFeature(f);}
  }
 }
 locate(map:import('ol/Map').default,id:string){const fs=this.source.getFeatures().filter(f=>f.get('elementId')===id);if(!fs.length)return;const box=[Infinity,Infinity,-Infinity,-Infinity];fs.forEach(f=>{const e=f.getGeometry()!.getExtent();box[0]=Math.min(box[0],e[0]);box[1]=Math.min(box[1],e[1]);box[2]=Math.max(box[2],e[2]);box[3]=Math.max(box[3],e[3]);});map.getView().fit(box,{padding:[65,65,65,65],maxZoom:22,duration:200});}
}
