import Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import {Style,Text,Fill,Stroke} from 'ol/style';
import type {Document} from '../../api';
import {lotSides} from './subdivision/lotDimensions';
import type {AreaGeometry} from './subdivision/types';

export class SurfaceDimensions{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,visible:false,zIndex:30,declutter:true,style:(f,resolution)=>{
  const a=f.get('a'),b=f.get('b'),n=f.get('normal'),polygon=f.get('polygon') as Polygon;
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];let distance=12*resolution;
  let point=[mid[0]-n[0]*distance,mid[1]-n[1]*distance];
  for(let i=0;i<12&&polygon.intersectsCoordinate(point);i++){distance/=2;point=[mid[0]-n[0]*distance,mid[1]-n[1]*distance];}
  let rotation=-Math.atan2(b[1]-a[1],b[0]-a[0]);
  if(rotation>Math.PI/2)rotation-=Math.PI;if(rotation< -Math.PI/2)rotation+=Math.PI;
  return new Style({geometry:new Point(point),text:new Text({text:f.get('label'),font:'600 11px Arial',rotation,rotateWithView:true,
   fill:new Fill({color:'#fff1c2'}),stroke:new Stroke({color:'#162732',width:3}),padding:[1,2,1,2]})});
 }});
 update(doc:Document){
  this.source.clear();const polygons:{geometry:AreaGeometry}[]=[];
  for(const item of doc.infra||[]){
   if(item.kind!=='surface')continue;
   const g=item.derived.surfaceGeometry as any;if(!g)continue;
   if(g.type==='Polygon')polygons.push({geometry:g});
   else if(g.type==='MultiPolygon')for(const coordinates of g.coordinates)polygons.push({geometry:{type:'Polygon',coordinates}});
  }
  for(const side of lotSides(polygons)){
   const {geometry,...properties}=side;
   const f=new Feature(new Point(side.a));f.setProperties({...properties,polygon:new Polygon(geometry.coordinates),
    label:side.length.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m'});this.source.addFeature(f);
  }
 }
 dispose(){this.layer.dispose();this.source.dispose();}
}
