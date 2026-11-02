import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import {Style,Text,Fill,Stroke} from 'ol/style';
import type {Document} from '../../api';
export class RoadDimensions{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,visible:false,declutter:true,zIndex:30,style:(feature,resolution)=>{
  const line=feature.getGeometry() as LineString,mid=line.getCoordinateAt(.5),a=line.getCoordinateAt(.49),b=line.getCoordinateAt(.51),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<1e-9)return [];
  let sign=1;const distance=feature.get('offset')+10*resolution;
  let label=[mid[0]+dy/length*distance,mid[1]-dx/length*distance];
  if(feature.get('kind')==='curb'&&feature.get('pavement')?.intersectsCoordinate(label))sign=-1;
  label=[mid[0]+sign*dy/length*distance,mid[1]-sign*dx/length*distance];
  let rotation=-Math.atan2(dy,dx);if(rotation>Math.PI/2)rotation-=Math.PI;if(rotation<-Math.PI/2)rotation+=Math.PI;
  return new Style({geometry:new Point(label),text:new Text({text:feature.get('label'),font:'600 11px Arial',rotation,fill:new Fill({color:'#fff1c2'}),stroke:new Stroke({color:'#162732',width:3})})});
 }});
 update(doc:Document){
  this.source.clear();const format=new GeoJSON();
  for(const item of doc.infra||[]){if(item.kind!=='road')continue;
   const pavement=format.readGeometry(item.derived.regions.find(r=>item.usage==='bridge'?r.role==='bridge':item.usage==='walkway'?r.role==='sidewalk':r.role==='pavement'||r.role==='unpaved')!.geometry);
   for(const dimension of item.derived.dimensions||[]){
    const f=new Feature(format.readGeometry(dimension.geometry)!);
    f.setProperties({kind:dimension.kind,pavement,offset:dimension.kind==='axis'?(item.width||0)/2+Math.max(item.sidewalkLeft||0,item.sidewalkRight||0):Math.max(item.sidewalkLeft||0,item.sidewalkRight||0),label:dimension.lengthM.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m'});this.source.addFeature(f);
   }
  }
 }
}
