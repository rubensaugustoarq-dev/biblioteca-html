import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import Geometry from 'ol/geom/Geometry';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import {Style,Stroke,Fill,Circle as CircleStyle} from 'ol/style';
import type {Document} from '../../api';
/** Rendering cache and native capture geometry remain separate. CAD is read-only. */
export class EnlCad {
  source=new VectorSource();snapSource=new VectorSource();
  layer=new VectorLayer({source:this.source,style:f=>{
    let color=f.get('color')||'#91b9cf';if(this.technical&&/^#(fff|ffffff)$/i.test(color))color='#567078';
    return new Style({stroke:new Stroke({color,width:1}),fill:new Fill({color}),image:new CircleStyle({radius:2,fill:new Fill({color})})});
  }});
  private raw=new Map<string,{view:Feature<Geometry>[];snap:Feature<Geometry>[]} >();
  private generation=0;private lastKey='';
  private loading=new Map<string,Promise<void>>();
  constructor(private technical:boolean,private error:(s:string)=>void){}
  async update(doc:Document,transform:(p:number[])=>number[],changed:()=>void,key:string){
    if(key===this.lastKey)return;
    const generation=++this.generation;
    try{
      const resources=doc.resources.filter(r=>r.role==='vectorSource');
      await Promise.all(resources.map(async r=>{
        if(this.raw.has(r.id))return;
        if(this.loading.has(r.id)){await this.loading.get(r.id);return;}
        const loading=(async()=>{const results=await Promise.all([fetch(`/api/projects/${doc.project.id}/cad/${r.id}/view`),fetch(`/api/projects/${doc.project.id}/cad/${r.id}/snap`)]);
        if(results.some(r=>!r.ok))throw new Error('Não foi possível carregar o DXF para visualização e captura.');
        const [view,snap]=await Promise.all(results.map(r=>r.json()));const format=new GeoJSON();
        this.raw.set(r.id,{view:format.readFeatures(view),snap:format.readFeatures(snap)});})();
        this.loading.set(r.id,loading);try{await loading;}finally{this.loading.delete(r.id);}
      }));
      if(generation!==this.generation)return;
      const view:Feature<Geometry>[]=[],snap:Feature<Geometry>[]=[];
      for(const r of resources){const raw=this.raw.get(r.id)!;const visible=(f:Feature)=>r.metadata.layers?.some(l=>l.visible&&l.name.toLowerCase()===String(f.get('layer')).toLowerCase());
        const convert=(f:Feature<Geometry>)=>{const copy=f.clone();copy.getGeometry()?.applyTransform((input,output,stride=2)=>{output=output||input;for(let i=0;i<input.length;i+=stride){const p=transform([input[i],input[i+1]]);output[i]=p[0];output[i+1]=p[1];for(let j=2;j<stride;j++)output[i+j]=input[i+j];}return output;});return copy;};
        view.push(...raw.view.filter(visible).map(convert));snap.push(...raw.snap.filter(visible).map(convert));
      }
      this.source.clear();this.source.addFeatures(view);this.snapSource.clear();this.snapSource.addFeatures(snap);this.lastKey=key;changed();
    }catch(e){if(generation===this.generation)this.error(e instanceof Error?e.message:'Erro no CAD.');}
  }
  clear(){this.generation++;this.lastKey='';this.source.clear();this.snapSource.clear();}
}
