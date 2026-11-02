import {rampMapNumber} from './rampLabel';
import {rampArrowStyles,rampCornerIndices} from './rampArrows';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import Point from 'ol/geom/Point';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import type Map from 'ol/Map';
import {Style,Stroke,Fill,Text,Circle} from 'ol/style';
import type {Ramp} from './types';

/** Read-only project references. Never include these features in editing or quantities. */
export class SharedRampOverlay {
  source=new VectorSource();
  layer:VectorLayer;labelLayer:VectorLayer;
  constructor(technical=false){
    this.layer=new VectorLayer({source:this.source,zIndex:24,style:(f,resolution)=>{
      const warning=f.get('warning');
      return [new Style({
        fill:new Fill({color:warning?'rgba(235,101,91,.4)':f.get('role')==='landing'||f.get('role')==='central'?'rgba(225,228,210,.9)':'rgba(188,200,188,.85)'}),
        stroke:new Stroke({color:warning?'#e96f61':technical?'#42796b':'#fff2ba',width:1.5}),
        image:new Circle({radius:5,fill:new Fill({color:'#e96f61'}),stroke:new Stroke({color:'#fff',width:1})}),
      }),...rampArrowStyles(f as Feature,resolution,technical)];
    }});
    this.labelLayer=new VectorLayer({source:this.source,zIndex:31,style:f=>f.get('label')?new Style({text:new Text({text:f.get('label'),font:'600 11px Arial',fill:new Fill({color:technical?'#294e43':'#fff5cf'}),stroke:new Stroke({color:technical?'#fff':'#233b39',width:3}),overflow:true})}):undefined});
  }
  update(ramps:Ramp[],transform:(p:number[])=>number[]=p=>p.slice()){
    this.source.clear();
    const format=new GeoJSON();
    for(const ramp of ramps){
      const invalid=ramp.derived?.status!=='dimensioned',outside=ramp.derived?.normativeStatus==='outside';
      const parts=invalid?[]:ramp.derived?.parts||[];
      const geometries=parts.length?parts.map(p=>({role:p.role,geometry:format.readGeometry(p.geometry)})):
        !invalid&&ramp.derived?.geometry?[{role:'ramp',geometry:format.readGeometry(ramp.derived.geometry)}]:
        ramp.anchor.length===2?[{role:'invalid',geometry:new Point(ramp.anchor.slice())}]:[];
      geometries.forEach(({role,geometry},index)=>{
        if(!geometry)return;
        geometry.applyTransform((input,output,stride=2)=>{
          output=output||input;
          for(let i=0;i<input.length;i+=stride){const p=transform([input[i],input[i+1]]);output[i]=p[0];output[i+1]=p[1];for(let j=2;j<stride;j++)output[i+j]=input[i+j];}
          return output;
        });
        const feature=new Feature(geometry);
        feature.setId(`${ramp.id}:${index}`);
        feature.setProperties({rampId:ramp.id,roadId:ramp.roadId,role,partIndex:index,cornerIndices:rampCornerIndices(ramp,role,geometry.getType()==='Polygon'?(geometry as any).getCoordinates()[0]:[]),warning:invalid||outside,label:index===0?rampMapNumber(ramp,ramps):''});
        this.source.addFeature(feature);
      });
    }
  }
  locate(map:Map,id:string){
    const features=this.source.getFeatures().filter(f=>f.get('rampId')===id);
    if(!features.length)return;
    const bounds=[Infinity,Infinity,-Infinity,-Infinity];
    for(const f of features){const e=f.getGeometry()!.getExtent();bounds[0]=Math.min(bounds[0],e[0]);bounds[1]=Math.min(bounds[1],e[1]);bounds[2]=Math.max(bounds[2],e[2]);bounds[3]=Math.max(bounds[3],e[3]);}
    map.getView().fit(bounds,{padding:[70,70,70,70],maxZoom:22,duration:250});
  }
}
