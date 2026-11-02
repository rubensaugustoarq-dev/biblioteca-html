import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Text,Fill,Stroke,Circle} from 'ol/style';
import type {Document} from '../../api';
export class RoadPoints{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,visible:false,zIndex:31,declutter:true,style:f=>new Style({image:new Circle({radius:2.5,fill:new Fill({color:'#ffe29a'}),stroke:new Stroke({color:'#193541',width:1})}),text:new Text({text:f.get('label'),font:'600 11px Arial',offsetX:7,offsetY:-9,fill:new Fill({color:'#ffe29a'}),stroke:new Stroke({color:'#172735',width:3})})})});
 update(doc:Document){
  this.source.clear();
  for(const item of doc.infra||[]){
   if(item.kind!=='road')continue;
   const axis=new LineString((item.derived.axisGeometry||item.geometry).coordinates as number[][]);
   for(const [index,coordinate] of (item.geometry.coordinates as number[][]).entries()){
    // Identify control stations on the smoothed axis, not tessellation samples.
    const f=new Feature(new Point(axis.getClosestPoint(coordinate).slice(0,2)));
    f.setProperties({roadId:item.id,index,label:'P'+(index+1)});this.source.addFeature(f);
   }
  }
 }
}
