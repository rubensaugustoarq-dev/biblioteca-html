import {woodPattern} from './woodPattern';
import {arcThroughThree,arcStartEndDirection,tangentThroughThree,arcSweepDegrees} from '../../arc';
import {Editor} from '../../editor';
import {RoadDimensions} from './roadDimensions';
import {SurfaceDimensions} from './surfaceDimensions';
import {LotDimensions} from './subdivision/lotDimensions';
import {RoadPoints} from './roadPoints';
import type {Document} from '../../api';
import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Collection from 'ol/Collection';
import Geometry from 'ol/geom/Geometry';
import Point from 'ol/geom/Point';
import Polygon from 'ol/geom/Polygon';
import MultiPoint from 'ol/geom/MultiPoint';
import LineString from 'ol/geom/LineString';
import {Style,Stroke,Fill,Text,Circle as CircleStyle} from 'ol/style';
import {orthogonalPathPoint,closeMeasureRing} from '../../measure';
import type {InfraMode,Material} from './types';
export function pattern(material:Material){
  if(material==='wood')return woodPattern();
  const canvas=document.createElement('canvas');canvas.width=material==='brick'?64:32;canvas.height=canvas.width;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=material==='asphalt'?'#30363b':material==='concrete'?'#bfc7c7':material==='brick'?'#b66a48':material==='earth'?'#ae9471':'#b19878';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle=material==='asphalt'?'#84929d':material==='brick'?'#e0bc98':'#899592';ctx.lineWidth=.7;
  if(material==='brick'){
    // Seamless 2:1 bricks laid perpendicular in a 45-degree herringbone bond.
    const unit=64/Math.sqrt(32),tones=['#c7825e','#cb8864','#d18f6b','#c27c59'];
    ctx.save();ctx.translate(32,32);ctx.rotate(Math.PI/4);ctx.strokeStyle='#805c47';ctx.lineWidth=.8;
    for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++){
      const band=((x-y)%4+4)%4;if(band!==0&&band!==3)continue;
      const w=band===0?unit*2:unit,h=band===0?unit:unit*2;
      ctx.fillStyle=tones[((x+y)%4+4)%4];ctx.fillRect(x*unit,y*unit,w,h);ctx.strokeRect(x*unit,y*unit,w,h);
      ctx.strokeStyle='#dfaa85';ctx.lineWidth=.35;ctx.strokeRect(x*unit+.9,y*unit+.9,w-1.8,h-1.8);ctx.strokeStyle='#805c47';ctx.lineWidth=.8;
    }
    ctx.restore();
  }
  else if(material==='pavers'){for(let y=0;y<=32;y+=8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(32,y);ctx.stroke();for(let x=(y%16?8:0);x<32;x+=16){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+8);ctx.stroke();}}}
  else if(material==='earth'){const shades=['#bda37f','#947957','#c3ab89'];for(let i=0;i<35;i++){ctx.fillStyle=shades[i%3];ctx.fillRect((i*13)%32,(i*19)%32,i%3+1,1);}}
  else if(material==='concrete'){/* Smooth concrete, without floor tile joints. */}
  else {ctx.fillStyle='#87919a';for(let i=0;i<13;i++)ctx.fillRect((i*13)%31,(i*7)%31,1,1);}
  return ctx.createPattern(canvas,'repeat')!;
}
export class InfraScene{
  lotDimensions=new LotDimensions();
  roadDimensions=new RoadDimensions();
  surfaceDimensions=new SurfaceDimensions();
  roadPoints=new RoadPoints();
  editor:Editor;regions=new VectorSource();objects=new VectorSource();draw:Draw|null=null;modify:Modify|null=null;snap:Snap|null=null;mode:InfraMode='select';orthogonal=false;selected:string|null=null;drafting=false;controlGeometries=new Map<string,any>();
  regionLayer:VectorLayer;objectLayer:VectorLayer;handles=new VectorSource();handleLayer:VectorLayer;handleModify:Modify|null=null;branchPreview=new VectorSource();branchMarker=new Feature(new Point([0,0]));branchLayer:VectorLayer;
  constructor(target:HTMLElement,private callbacks:{gleba:(id:string|null)=>void;select:(id:string|null)=>void;geometry:(id:string|null,kind:'road'|'surface',geometry:any)=>void;error:(s:string)=>void;branch:(id:string,point:number[])=>void;corner:(vertex:number)=>void;arcSelect:(index:number,angle:number)=>void;arcEdit:(index:number,direction:number)=>void}){
    this.editor=new Editor(target,{geometry:()=>{},select:id=>callbacks.gleba(id),coordinates:()=>{},draft:()=>{},error:callbacks.error,arc:()=>{}});
    const patterns={asphalt:pattern('asphalt'),concrete:pattern('concrete'),pavers:pattern('pavers'),brick:pattern('brick'),earth:pattern('earth'),wood:pattern('wood')};
    this.regionLayer=new VectorLayer({source:this.regions,opacity:.75,style:f=>new Style({fill:new Fill({color:patterns[f.get('material') as Material]}),stroke:new Stroke({color:f.get('role')==='sidewalk'?'#d3ded7':'#b3bec9',width:1})})});
    this.objectLayer=new VectorLayer({source:this.objects,style:f=>new Style({stroke:new Stroke({color:f.getId()===this.selected?'#72e9b7':'#e7c373',width:1.5,lineDash:f.get('kind')==='road'?[5,4]:undefined}),fill:new Fill({color:'rgba(0,0,0,0)'}),text:new Text({text:f.get('name'),font:'11px Arial',placement:f.get('kind')==='road'?'line':'point',fill:new Fill({color:'#fff5d6'}),stroke:new Stroke({color:'#162732',width:3})})})});
    this.editor.map.addLayer(this.regionLayer);this.editor.map.addLayer(this.objectLayer);
    this.editor.map.addLayer(this.roadDimensions.layer);
    this.editor.map.addLayer(this.surfaceDimensions.layer);
    this.editor.map.addLayer(this.lotDimensions.layer);
    this.editor.map.addLayer(this.roadPoints.layer);
    this.handleLayer=new VectorLayer({source:this.handles,style:new Style({image:new CircleStyle({radius:6,fill:new Fill({color:'#ffd07b'}),stroke:new Stroke({color:'#193541',width:2})})})});this.editor.map.addLayer(this.handleLayer);
    this.branchLayer=new VectorLayer({source:this.branchPreview,zIndex:100,style:f=>[new Style({image:new CircleStyle({radius:8,fill:new Fill({color:'rgba(20,40,46,.8)'}),stroke:new Stroke({color:'#74f0bc',width:2})}),text:new Text({text:'Conectar · '+f.get('name'),font:'12px Arial',offsetY:-22,fill:new Fill({color:'#c9ffe7'}),stroke:new Stroke({color:'#142631',width:4})})}),new Style({image:new CircleStyle({radius:2.5,fill:new Fill({color:'#74f0bc'})})})]});this.editor.map.addLayer(this.branchLayer);
    this.editor.map.on('pointermove',e=>{if(this.mode!=='branch'||e.dragging){this.branchPreview.clear();return;}const candidate=this.branchCandidate(e.pixel,e.coordinate);if(!candidate){this.branchPreview.clear();return;}this.branchMarker.setGeometry(new Point(candidate.point));this.branchMarker.set('name',candidate.name);if(!this.branchPreview.hasFeature(this.branchMarker))this.branchPreview.addFeature(this.branchMarker);});
    this.editor.map.getViewport()?.addEventListener('pointerleave',this.clearBranchPreview);
    this.editor.map.on('singleclick',e=>{if(this.mode==='edit'){const f=this.editor.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.handleLayer,hitTolerance:8});if(f)this.callbacks.arcSelect(f.get('index'),f.get('angle'));return;}if(this.mode==='corner'&&this.selected){const raw=this.controlGeometries.get(this.selected)?.coordinates as number[][];if(raw){let nearest=-1,distance=12;for(let i=1;i<raw.length-1;i++){const p=this.editor.map.getPixelFromCoordinate(raw[i]);const d=Math.hypot(p[0]-e.pixel[0],p[1]-e.pixel[1]);if(d<distance){distance=d;nearest=i;}}if(nearest>=0)this.callbacks.corner(nearest);else this.callbacks.error('Clique em um ponto interno do eixo para escolher a concordância.');}return;}if(this.mode!=='select'&&this.mode!=='branch')return;const f=this.editor.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===this.objectLayer,hitTolerance:8});if(this.mode==='branch'){const candidate=this.branchCandidate(e.pixel,e.coordinate);if(candidate){this.callbacks.branch(candidate.id,candidate.point);}else this.callbacks.error('Clique sobre o eixo de uma via existente para iniciar a conexão.');return;}this.callbacks.select(f?String(f.getId()):null);});
  }
  bridgeDrawing=false;bridgeLengthM=6;bridgeWidthM=2;
  branchUsage:'road'|'walkway'|'bridge'='road';
  clearBranchPreview=()=>{this.branchPreview.clear();};
  branchCandidate(pixel:number[],coordinate:number[]){
    const location=this.editor.map.getCoordinateFromPixel(pixel)||coordinate;let nearest:{id:string;name:string;point:number[]}|null=null,threshold=12;
    for(const feature of this.objects.getFeatures()){
      if(feature.get('kind')!=='road'||!((this.branchUsage==='bridge'||this.branchUsage==='walkway')?['walkway','bridge'].includes(feature.get('usage')):(feature.get('usage')||'road')==='road'))continue;
      const point=(feature.getGeometry() as LineString).getClosestPoint(location).slice(0,2),screen=this.editor.map.getPixelFromCoordinate(point),distance=Math.hypot(screen[0]-pixel[0],screen[1]-pixel[1]);
      if(distance<threshold){threshold=distance;nearest={id:String(feature.getId()),name:feature.get('name'),point};}
    }
    return nearest;
  }
  update(doc:Document,selected:string|null,gleba:string){
    this.roadDimensions.update(doc);
    this.surfaceDimensions.update(doc);
    this.lotDimensions.update((doc.subdivisionAreas||[]).flatMap(a=>a.layout?.lots||[]));
    this.roadPoints.update(doc);
    this.editor.setDocument(doc);this.editor.select(gleba);this.selected=selected;this.regions.clear();this.objects.clear();this.controlGeometries.clear();const format=new GeoJSON();
    for(const region of doc.infraMetrics?.regions||[]){const f=new Feature(format.readGeometry(region.geometry)!);f.setProperties({material:region.material,role:region.role});this.regions.addFeature(f);}
    for(const item of doc.infra||[]){const f=new Feature(format.readGeometry(item.derived.axisGeometry||item.derived.surfaceGeometry||item.geometry)!);this.controlGeometries.set(item.id,item.geometry);f.setId(item.id);f.setProperties({name:item.name,kind:item.kind,usage:item.usage,curveType:item.usage==='bridge'?'bridge':item.curveType,hasArcs:!!item.arcSegments?.length,arcSegments:item.arcSegments||[]});this.objects.addFeature(f);}
  }
  tool(mode:InfraMode,snapping:boolean,ortho:boolean){
    this.cancel();this.mode=mode;this.orthogonal=ortho;
    if(mode==='measure'){this.editor.tool('measure');this.editor.drawingOptions(snapping,ortho);this.options(snapping,ortho);return;}
    const sketch=new Style({stroke:new Stroke({color:'#72e9b7',width:1.2}),fill:new Fill({color:'rgba(110,230,180,.07)'}),image:new CircleStyle({radius:3,fill:new Fill({color:'#72e9b7'})})});
    if(mode==='road'||mode==='surface'||mode==='arc'||mode==='extend'){
      this.draw=new Draw({type:mode==='surface'?'Polygon':'LineString',maxPoints:this.bridgeDrawing?2:mode==='arc'?3:undefined,style:this.bridgeDrawing?f=>{const g=f.getGeometry();if(!(g instanceof LineString))return sketch;const p=g.getCoordinates();if(p.length<2)return sketch;const a=p[0],b=p[1],n=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!n)return sketch;const x=-(b[1]-a[1])/n*this.bridgeWidthM/2,y=(b[0]-a[0])/n*this.bridgeWidthM/2;return new Style({geometry:new Polygon([[[a[0]+x,a[1]+y],[b[0]+x,b[1]+y],[b[0]-x,b[1]-y],[a[0]-x,a[1]-y],[a[0]+x,a[1]+y]]]),fill:new Fill({color:woodPattern()}),stroke:new Stroke({color:'#e1c8b0',width:1.4})});}:mode==='arc'?f=>{const raw=(f.getGeometry() as LineString)?.getCoordinates();let geometry:Geometry|undefined;if(raw?.length===3){try{geometry=new LineString(arcStartEndDirection(raw[0],raw[1],raw[2]));}catch{}}return new Style({geometry,stroke:new Stroke({color:'#72e9b7',width:1.5}),image:new CircleStyle({radius:3,fill:new Fill({color:'#72e9b7'})})});}:sketch,geometryFunction:(coords,geometry)=>{
        const input=mode!=='surface'?coords as number[][]:(coords as number[][][])[0];
        if(mode!=='arc'&&this.orthogonal&&input.length>1)input[input.length-1]=orthogonalPathPoint(input);
        if(this.bridgeDrawing&&input.length>1){const a=input[0],b=input[1],n=Math.hypot(b[0]-a[0],b[1]-a[1]);if(n>1e-8)input[1]=[a[0]+(b[0]-a[0])*this.bridgeLengthM/n,a[1]+(b[1]-a[1])*this.bridgeLengthM/n];}
        const points=input.map(p=>p.slice());
        if(mode!=='surface'){const line=geometry instanceof LineString?geometry:new LineString([]);line.setCoordinates(points);return line;}
        const polygon=geometry instanceof Polygon?geometry:new Polygon([]);polygon.setCoordinates([points.length?(this.orthogonal?closeMeasureRing(points,true):[...points,points[0].slice()]):[]]);return polygon;
      }});
      this.draw.on('drawstart',()=>{this.drafting=true;});
      this.draw.on('drawend',e=>{this.drafting=false;const geo=new GeoJSON().writeGeometryObject(e.feature.getGeometry()!);this.callbacks.geometry(null,mode==='surface'?'surface':'road',geo);});
      this.editor.map.addInteraction(this.draw);
    }else if((mode==='edit'||mode==='corner')&&this.selected){
      const feature=this.objects.getFeatureById(this.selected);if(feature){
        feature.setGeometry(new GeoJSON().readGeometry(this.controlGeometries.get(this.selected))!);
        if(mode==='corner'){feature.setStyle([new Style({stroke:new Stroke({color:'#72e9b7',width:1,lineDash:[3,4]}),}),new Style({geometry:new MultiPoint((feature.getGeometry() as LineString).getCoordinates()),image:new CircleStyle({radius:5,fill:new Fill({color:'#72e9b7'})})})]);return;}
        this.modify=new Modify({features:new Collection([feature]),style:sketch,...(feature.get('curveType')==='bridge'||feature.get('curveType')==='threePoint'||feature.get('hasArcs')?{insertVertexCondition:()=>false,deleteCondition:()=>false}:{})});
        if(feature.get('curveType')==='threePoint')feature.setStyle(()=>{const points=(feature.getGeometry() as LineString).getCoordinates();let geometry:Geometry=feature.getGeometry()!;try{geometry=new LineString([...arcThroughThree(points[0],points[1],points[2]),...points.slice(3)]);}catch{}return [new Style({geometry,stroke:new Stroke({color:'#72e9b7',width:1.5})}),new Style({geometry:new MultiPoint(points),image:new CircleStyle({radius:4,fill:new Fill({color:'#72e9b7'})})})];});
        if(feature.get('kind')==='road'&&feature.get('curveType')!=='threePoint'&&feature.get('curveType')!=='bridge'){
          const controls=()=> (feature.getGeometry() as LineString).getCoordinates();
          const segments=(feature.get('arcSegments') as {index:number;directionDegrees:number}[]).map(a=>({...a}));
          const preview=()=>{
            const points=controls(),sampled:number[][]=[];
            for(let i=0;i<points.length-1;i++){
              const arc=segments.find(a=>a.index===i);let part=[points[i],points[i+1]];
              if(arc){try{const theta=arc.directionDegrees*Math.PI/180;part=arcStartEndDirection(points[i],points[i+1],[points[i][0]+Math.cos(theta),points[i][1]+Math.sin(theta)]);}catch{}}
              sampled.push(...(i?part.slice(1):part));
            }
            return new LineString(sampled);
          };
          feature.setStyle(()=>[new Style({geometry:preview(),stroke:new Stroke({color:'#72e9b7',width:1.5})}),new Style({geometry:new MultiPoint(controls()),image:new CircleStyle({radius:4,fill:new Fill({color:'#72e9b7'})})})]);
          for(let index=0;index<controls().length-1;index++){const points=controls(),a=points[index],b=points[index+1],existing=segments.find(arc=>arc.index===index);
            const arc=existing||{index,directionDegrees:Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI};
            let middle=[(a[0]+b[0])/2,(a[1]+b[1])/2],angle=0;
            if(existing){const theta=arc.directionDegrees*Math.PI/180,sampled=arcStartEndDirection(a,b,[a[0]+Math.cos(theta),a[1]+Math.sin(theta)]);middle=sampled[Math.floor(sampled.length/2)];angle=arcSweepDegrees(a,b,arc.directionDegrees);}
            const handle=new Feature(new Point(middle));handle.setProperties({index,angle});this.handles.addFeature(handle);
            handle.getGeometry()!.on('change',()=>{try{const current=controls();arc.directionDegrees=tangentThroughThree(current[index],handle.getGeometry()!.getCoordinates(),current[index+1]);if(!segments.includes(arc))segments.push(arc);handle.set('angle',arcSweepDegrees(current[index],current[index+1],arc.directionDegrees));feature.changed();this.callbacks.arcSelect(index,handle.get('angle'));}catch{/* Keep the last valid preview until release. */}});
          }
          this.handleModify=new Modify({source:this.handles,pixelTolerance:12,insertVertexCondition:()=>false,deleteCondition:()=>false,style:new Style({image:new CircleStyle({radius:6,fill:new Fill({color:'#ffd07b'})})})});
          this.handleModify.on('modifystart',e=>{const f=e.features.item(0);if(f)this.callbacks.arcSelect(f.get('index'),f.get('angle'));});
          this.handleModify.on('modifyend',e=>{const f=e.features.item(0);if(!f)return;const index=f.get('index') as number,points=controls();try{const angle=tangentThroughThree(points[index],(f.getGeometry() as Point).getCoordinates(),points[index+1]);this.callbacks.arcEdit(index,angle);}catch(error){this.callbacks.error(error instanceof Error?error.message:'Arco inválido.');this.tool('edit',snapping,ortho);}});
          this.editor.map.addInteraction(this.handleModify);
        }
        this.modify.on('modifyend',()=>this.callbacks.geometry(this.selected,feature.get('kind'),new GeoJSON().writeGeometryObject(feature.getGeometry() as Geometry)));
        this.editor.map.addInteraction(this.modify);if(this.handleModify){this.editor.map.removeInteraction(this.handleModify);this.editor.map.addInteraction(this.handleModify);}
      }
    }
    this.options(snapping,ortho);
  }
  options(snapping:boolean,ortho:boolean){
    if(this.mode==='measure')this.editor.drawingOptions(snapping,ortho);
    this.orthogonal=ortho;if(this.snap){this.editor.map.removeInteraction(this.snap);this.snap=null;}
    if(snapping){const source=new VectorSource({features:[...this.editor.source.getFeatures(),...this.objects.getFeatures().filter(f=>this.mode!=='edit'||f.getId()!==this.selected)]});this.snap=new Snap({source,pixelTolerance:10});this.editor.map.addInteraction(this.snap);}
  }
  cancel(){if(this.editor.mode==='measure')this.editor.tool('select');this.drafting=false;this.branchPreview.clear();this.handles.clear();if(this.handleModify){this.editor.map.removeInteraction(this.handleModify);this.handleModify=null;}if(this.draw){this.draw.abortDrawing();this.editor.map.removeInteraction(this.draw);this.draw=null;}if(this.modify){this.editor.map.removeInteraction(this.modify);this.modify=null;}if(this.snap){this.editor.map.removeInteraction(this.snap);this.snap=null;}}
  start(point:number[]){this.draw?.appendCoordinates([point]);}
  seed(points:number[][]){this.draw?.appendCoordinates(points);}
  finish(){if(this.drafting)this.draw?.finishDrawing();}
  fit(gleba?:string){this.editor.fit(gleba);}
  dispose(){this.cancel();this.editor.map.getViewport()?.removeEventListener('pointerleave',this.clearBranchPreview);this.surfaceDimensions.dispose();this.lotDimensions.dispose();this.editor.dispose();}
}

export {arcStartEndDirection,tangentThroughThree,arcSweepDegrees,directionFromSweep} from '../../arc';
