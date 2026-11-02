import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import {Style,Stroke,Fill,Circle as CircleStyle} from 'ol/style';
import type {CadLayer,Raster} from './api';

export class CadView {
  source=new VectorSource();
  layers:CadLayer[]=[];
  layer=new VectorLayer({source:this.source,style:feature=>{
    const properties=feature.getProperties();
    if(!this.layers.find(l=>l.name.toLowerCase()===String(properties.layer).toLowerCase())?.visible)return [];
    const color=properties.color||'#ffffff';
    return new Style({stroke:new Stroke({color,width:Math.max(.6,Math.min(4,(properties.lineweight||.25)*3))}),
      fill:new Fill({color}),image:new CircleStyle({radius:2,fill:new Fill({color})})});
  }});
  update(resource:Raster){this.layers=resource.metadata.layers||[];this.layer.changed();}
  async load(project:string,id:string){
    const response=await fetch(`/api/projects/${project}/cad/${id}/view`);
    if(!response.ok)throw new Error('Não foi possível carregar a referência DXF.');
    const data=await response.json();
    this.source.addFeatures(new GeoJSON().readFeatures(data));
  }
}
