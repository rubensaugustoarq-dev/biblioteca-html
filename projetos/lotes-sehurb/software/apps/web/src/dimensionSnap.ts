import type Map from 'ol/Map';
import type Feature from 'ol/Feature';
import Collection from 'ol/Collection';
import Snap from 'ol/interaction/Snap';

/** Use the visible lot geometries, including the current subdivision preview. */
export function dimensionSnapFeatures(base:Feature[],map:Map){
 const features=new Set<Feature>(base);
 for(const layer of map.getLayers().getArray()){
  if(!layer.getVisible())continue;
  const source=(layer as unknown as {getSource?:()=>{getFeatures?:()=>Feature[]}}).getSource?.();
  for(const feature of source?.getFeatures?.()||[])if(feature.get('use')==='lot')features.add(feature);
 }
 return [...features];
}
export function dimensionSnap(base:Feature[],map:Map){
 return new Snap({features:new Collection(dimensionSnapFeatures(base,map)),pixelTolerance:10,vertex:true,edge:true});
}
