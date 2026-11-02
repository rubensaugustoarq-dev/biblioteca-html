import type {LandscapeItem} from './features/landscape/types';
import type {AccessibilityElement} from './features/accessibility/elements/types';
import type {Ramp} from './features/accessibility/types';
import type {SubdivisionArea} from './features/infra/subdivision/types';
import type {InfraItem,InfraMetrics} from './features/infra/types';
import type {EnlLot} from './features/enl/types';
export interface FreeDimension {id:string;name:string;start:number[];end:number[];offset:number;color:string;derived?:{lengthM:number}}
export interface Annotation {id:string;text:string;x:number;y:number;angle:number;size:number;font?:string;bold?:boolean;color?:string;outline?:boolean;outlineColor?:string;outlineWidth?:number}
export interface Sheet {id:string;name:string;center:number[];scale:number;viewport:{x:number;y:number;width:number;height:number};table:{x:number;y:number;width:number};legend:{x:number;y:number;width:number};fields:Record<string,string>;showText:boolean;showPoints:boolean;showDimensions:boolean;showOrtho:boolean;signature:boolean}
export interface Entity {id:string; kind:string; locked:boolean; geometry:{type:'Polygon';coordinates:number[][][]}; attributes:{name:string}; derived:{areaM2:number;perimeterM:number;edgesM:number[];vertices:number}}
export interface CadLayer {name:string;visible:boolean;color:number;linetype:string;lineweight:number}
export interface Raster {id:string;role?:string;metadata:{layers?:CadLayer[];warnings?:string[];count?:number;name:string;sourceCrs:string;sourceProj4:string;bounds:number[];opacity:number;bands:number[];min:number;max:number;width:number;height:number;pixelSize:number[]}}
export interface Document {landscape?:LandscapeItem[];landscapeMetrics?:{trees:number;palms:number;chalets?:number;huts?:number;waterCount:number;waterAreaM2:number};project:{id:string;name:string;revision:number;crs:{authid:string;name:string;proj4:string;units:string};view:{center:number[];resolution:number}};entities:Entity[];resources:Raster[];annotations:Annotation[];dimensions?:FreeDimension[];sheets:Sheet[];enl?:EnlLot[];infra?:InfraItem[];subdivisionAreas?:SubdivisionArea[];accessibility?:Ramp[];accessibilityElements?:AccessibilityElement[];accessibilityMetrics?:Record<string,{count:number;areaM2:number;lengthM:number;byType?:Record<string,number>}>;infraMetrics?:InfraMetrics;canUndo:boolean;canRedo:boolean}
export interface Recent {modified?:number;id:string;name:string;revision:number;crs:string}
export async function request<T>(url:string, body?:unknown, method=body===undefined?'GET':'POST'):Promise<T>{
  const multipart = body instanceof FormData;
  const response = await fetch('/api'+url,{method,headers:{'X-LSEHURB':'1',...(!multipart&&body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
  const result = await response.json();
  if(!response.ok) throw new Error(typeof result.detail==='string'?result.detail:'Dados inválidos. Confira os campos preenchidos.');
  return result as T;
}
