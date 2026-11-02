export interface LandscapeItem {
 id:string;kind:'tree'|'palm'|'water'|'chalet'|'hut';name:string;
 geometry:{type:'Point'|'Polygon';coordinates:any};diameterM?:number;sideM?:number;radiusM?:number;rotationDegrees?:number;
 arcSegments?:{index:number;directionDegrees:number}[];
 derived?:{geometry:any;areaM2:number;perimeterM:number};
}
export type LandscapeMode='select'|'tree'|'palm'|'water'|'chalet'|'hut'|'edit';
