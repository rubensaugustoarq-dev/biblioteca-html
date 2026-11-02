import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import {Style,Fill,Stroke,Text} from 'ol/style';
import type {Document} from '../../api';
import type {EnlLot} from './types';
export type ContextOptions={areaId:string;gleba:boolean;lots:boolean;green:boolean;roads?:boolean;surfaces?:boolean};
export function contextFeatures(doc:Document,lot:EnlLot,options:ContextOptions){
 const area=doc.subdivisionAreas?.find(a=>a.id===(options.areaId||lot.sourceSubdivisionAreaId));
 if(!area)return [];
 const features:{geometry:any;properties:{kind:string;name:string;lotId?:string}}[]=[];
 if(options.gleba&&lot.sourceEntityId===area.sourceEntityId&&lot.sourceLotId)features.push({geometry:area.geometry,properties:{kind:'gleba',name:area.name}});
 if(options.lots)for(const item of area.layout?.lots||[])if(item.id!==lot.sourceLotId)features.push({geometry:item.geometry,properties:{kind:'lot',name:item.name,lotId:item.id}});
 if(options.green)for(const zone of area.layout?.zones||[])if(zone.use==='green')features.push({geometry:zone.geometry,properties:{kind:'green',name:zone.name+'\n'+(zone.derived?.areaM2??0).toLocaleString('pt-BR',{maximumFractionDigits:2})+' m²'}});
 return features;
}
export class SubdivisionContext{
 source=new VectorSource();
 layer=new VectorLayer({source:this.source,style:f=>new Style({stroke:new Stroke({color:f.get('kind')==='green'?'#70d68e':f.get('kind')==='gleba'?'#83a8d2':'#a5bfd4',width:1,lineDash:f.get('kind')==='gleba'?[5,4]:undefined}),fill:new Fill({color:f.get('kind')==='green'?'rgba(74,168,85,.3)':'rgba(80,125,170,.035)'}),text:new Text({text:f.get('name'),font:'10px Arial',fill:new Fill({color:'#cce4da'}),stroke:new Stroke({color:'#263e40',width:3})})})});
 update(doc:Document,lot:EnlLot,options:ContextOptions,toView:(p:number[])=>number[]){
  this.source.clear();const format=new GeoJSON();
  const convert=(value:any):any=>typeof value[0]==='number'?toView(value):value.map(convert);
  for(const item of contextFeatures(doc,lot,options)){
   const f=format.readFeatures({type:'FeatureCollection',features:[{type:'Feature',geometry:{...item.geometry,coordinates:convert(item.geometry.coordinates)},properties:item.properties}]})[0];this.source.addFeature(f);
  }
 }
}
