import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {Style,Fill,Stroke,Text} from 'ol/style';
import type {Document} from '../../api';
import type {Region} from '../infra/types';
export type InfraReferenceOptions={roads?:boolean;surfaces?:boolean};
export function infraReferenceFeatures(doc:Document,options:InfraReferenceOptions){
 const features:{geometry:any;properties:{role:string;material?:string;name?:string}}[]=[];
 if(!options.roads&&!options.surfaces)return features;
 const items=(doc.infra||[]).filter(item=>item.kind==='road'?options.roads:options.surfaces);
 // With both categories visible, use the engine's final union/difference surfaces.
 // These preserve the same intersections and material priority as Infra / Urbano.
 const regions:Region[]=options.roads&&options.surfaces&&doc.infraMetrics?.regions?doc.infraMetrics.regions:items.slice().reverse().flatMap(item=>item.derived.regions||[]).sort((a,b)=>(a.role==='sidewalk'?0:1)-(b.role==='sidewalk'?0:1));
 for(const region of regions)if(region.geometry)features.push({geometry:region.geometry,properties:{role:region.role,material:region.material}});
 if(options.roads)for(const item of items)if(item.kind==='road'&&item.derived.axisGeometry)features.push({geometry:item.derived.axisGeometry,properties:{role:'axis',name:item.name}});
 return features;
}
export class InfraReference{
 source=new VectorSource();layer:VectorLayer;
 constructor(technical=false){
  const colors:Record<string,string>=technical?{asphalt:'rgba(90,108,117,.45)',concrete:'rgba(187,195,194,.65)',brick:'rgba(181,134,94,.55)',pavers:'rgba(167,150,120,.5)',earth:'rgba(182,158,118,.5)',wood:'rgba(87,58,67,.8)'}:{asphalt:'#414b51',concrete:'#bfc7c7',brick:'#b98b66',pavers:'#a8977c',earth:'#b19b77',wood:'#573a43'};
  this.layer=new VectorLayer({source:this.source,style:f=>f.get('role')==='axis'?new Style({stroke:new Stroke({color:technical?'#927c3c':'#ecd18b',width:1,lineDash:[5,4]}),text:new Text({text:f.get('name'),placement:'line',font:'10px Arial',fill:new Fill({color:technical?'#35483e':'#fff6dc'}),stroke:new Stroke({color:technical?'#fff':'#25352e',width:2})})}):new Style({fill:new Fill({color:colors[f.get('material')]||colors.concrete}),stroke:new Stroke({color:technical?'#809a97':'#b0c6b9',width:.6})})});
 }
 update(doc:Document,options:InfraReferenceOptions,toView:(p:number[])=>number[]){
  this.source.clear();const format=new GeoJSON();
  const convert=(value:any):any=>typeof value[0]==='number'?toView(value):value.map(convert);
  for(const item of infraReferenceFeatures(doc,options)){
   if(!item.geometry.coordinates?.length)continue;
   const geometry={...item.geometry,coordinates:convert(item.geometry.coordinates)};
   const features=format.readFeatures({type:'FeatureCollection',features:[{type:'Feature',geometry,properties:item.properties}]});
   this.source.addFeatures(features);
  }
 }
}
