import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import MultiLineString from 'ol/geom/MultiLineString';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import {Style,Stroke,Fill,Text} from 'ol/style';
import type {FreeDimension} from './api';
export class FreeDimensions{
 source=new VectorSource<Feature<LineString>>();
 layer=new VectorLayer({source:this.source,zIndex:24,style:(f,resolution)=>{
  const [a,b]=(f.getGeometry() as LineString).getCoordinates(),dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-8)return [];
  const nx=-dy/length,ny=dx/length,offset=f.get('offset')||0,aa=[a[0]+nx*offset,a[1]+ny*offset],bb=[b[0]+nx*offset,b[1]+ny*offset],tick=resolution*4;
  let rotation=-Math.atan2(dy,dx);if(rotation>Math.PI/2)rotation-=Math.PI;if(rotation< -Math.PI/2)rotation+=Math.PI;
  const lines=[[aa,bb],[[aa[0]-nx*tick,aa[1]-ny*tick],[aa[0]+nx*tick,aa[1]+ny*tick]],[[bb[0]-nx*tick,bb[1]-ny*tick],[bb[0]+nx*tick,bb[1]+ny*tick]]];if(offset)lines.push([a,aa],[b,bb]);
  return [new Style({geometry:new MultiLineString(lines),stroke:new Stroke({color:f.get('color')||'#ffe0a0',width:1.2})}),new Style({geometry:new Point([(aa[0]+bb[0])/2,(aa[1]+bb[1])/2]),text:new Text({text:length.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m',font:'600 11px Arial',rotation,rotateWithView:true,offsetY:-9,fill:new Fill({color:f.get('color')||'#ffe0a0'}),stroke:new Stroke({color:'#172c37',width:3})})})];
 }});
 update(values:FreeDimension[]){this.source.clear();for(const value of values){const feature=new Feature(new LineString([value.start,value.end]));feature.setId(value.id);feature.setProperties(value);this.source.addFeature(feature);}}
 dispose(){this.source.dispose();this.layer.dispose();}
}
