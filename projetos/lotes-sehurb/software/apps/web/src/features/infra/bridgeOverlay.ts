import {woodPattern} from './woodPattern';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Fill,Stroke} from 'ol/style';
import type {Document} from '../../api';
export class BridgeOverlay{
 source=new VectorSource();layer=new VectorLayer({source:this.source,zIndex:26,style:()=>new Style({fill:new Fill({color:woodPattern()}),stroke:new Stroke({color:'#b49a93',width:1.2})})});
 update(doc:Document,toView:(p:number[])=>number[]=p=>p){this.source.clear();const format=new GeoJSON();const convert=(value:any):any=>typeof value[0]==='number'?toView(value):value.map(convert);
 for(const item of doc.infra||[])if(item.usage==='bridge')for(const region of item.derived.regions){if(region.role!=='bridge')continue;const g=region.geometry as any;this.source.addFeatures(format.readFeatures({type:'FeatureCollection',features:[{type:'Feature',geometry:{...g,coordinates:convert(g.coordinates)},properties:{id:item.id}}]}));}}
}
