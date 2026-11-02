import type Feature from 'ol/Feature';
import Polygon from 'ol/geom/Polygon';
import MultiLineString from 'ol/geom/MultiLineString';
import {Style,Fill,Stroke,Text} from 'ol/style';

export function parkingStyle(feature:Feature,resolution:number){
 const g=feature.getGeometry();if(!(g instanceof Polygon))return [];
 const transfer=feature.get('role')==='parkingTransfer';
 const styles=[new Style({zIndex:3,fill:new Fill({color:feature.get('invalid')?'rgba(235,100,82,.16)':transfer?'rgba(255,255,255,.10)':'rgba(255,255,255,.02)'}),
  stroke:new Stroke({color:feature.get('invalid')?'#ff8d7c':feature.get('preview')?'#ffe27a':'#ffffff',width:1.5}),
  text:!transfer&&resolution<.45?new Text({text:(feature.get('parkingType')==='accessible'?'♿\n':'')+(feature.get('label')||'').replace(' · ','\n'),
   font:'bold 10px Arial',fill:new Fill({color:'#fff'}),stroke:new Stroke({color:'#243644',width:3}),
   backgroundFill:feature.get('parkingType')==='accessible'?new Fill({color:'#246db5'}):undefined,padding:[2,2,2,2],overflow:false}):undefined})];
 if(transfer&&resolution<.5){
  const e=g.getExtent(),height=e[3]-e[1],step=Math.max(.35,resolution*6),parts:number[][][]=[];
  for(let x=e[0]-height;x<e[2]&&parts.length<2000;x+=step){
   let run:number[][]=[];const samples=Math.min(500,Math.max(2,Math.ceil(height/.1)));
   for(let i=0;i<=samples;i++){const p=[x+height*i/samples,e[1]+height*i/samples];
    if(g.intersectsCoordinate(p))run.push(p);else{if(run.length>1)parts.push(run);run=[];}}
   if(run.length>1)parts.push(run);
  }
  styles.push(new Style({zIndex:4,geometry:new MultiLineString(parts),stroke:new Stroke({color:'#fff',width:1})}));
 }
 return styles;
}
