import {useEffect,useRef,useState} from 'react';
import Draw from 'ol/interaction/Draw';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import {dimensionSnap} from './dimensionSnap';
import Collection from 'ol/Collection';
import LineString from 'ol/geom/LineString';
import {unByKey} from 'ol/Observable';
import {X,Trash2} from 'lucide-react';
import type {Editor} from './editor';
import type {Annotation,Document,FreeDimension} from './api';
import {TextProperties} from './TextProperties';
import {nextTextName} from './textNames';
import './projectNotes.css';

export function ProjectNotes({editor,doc,commit,textRequest=0,dimensionRequest=0,manageText=false,textVisible=true,dimensionsVisible=true,suspended=false,onActive=()=>{}}:{editor:Editor;doc:Document;commit:(type:string,args?:unknown)=>Promise<Document|undefined>;textRequest?:number;dimensionRequest?:number;manageText?:boolean;textVisible?:boolean;dimensionsVisible?:boolean;suspended?:boolean;onActive?:(v:boolean)=>void}){
 const [draft,setDraft]=useState<Annotation|null>(null),[creating,setCreating]=useState(false),[placed,setPlaced]=useState(false),[dimension,setDimension]=useState<FreeDimension|null>(null),[drawing,setDrawing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=useRef({doc,commit,draft,creating,drawing,dimension,suspended});current.current={doc,commit,draft,creating,drawing,dimension,suspended};
 const last=useRef({textRequest,dimensionRequest}),queue=useRef(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|null>(null),pending=useRef<Annotation|null>(null),callbacks=useRef<any>({});
 function persist(type:string,args:unknown){const pid=doc.project.id;const task=queue.current.then(async()=>{if(current.current.doc.project.id!==pid)return;return current.current.commit(type,args);});queue.current=task.then(()=>{},e=>setError(e instanceof Error?e.message:'Não foi possível gravar.'));return task;}
 function flush(){if(timer.current)clearTimeout(timer.current);timer.current=null;const value=pending.current;pending.current=null;if(value&&current.current.doc.annotations.some(a=>a.id===value.id))void persist('annotation.upsert',value).catch(()=>{});}
 function close(){flush();setDraft(null);setDimension(null);setDrawing(false);setCreating(false);if(manageText){editor.previewText(null);editor.editText(null,()=>{});editor.tool('select');}}
 function change(a:Annotation){if(creating&&draft&&(a.x!==draft.x||a.y!==draft.y))setPlaced(true);setDraft(a);if(!creating){pending.current=a;if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(flush,350);}}
 async function saveText(a:Annotation){setBusy(true);setError('');try{const next=await persist('annotation.upsert',a);if(next){setDraft(next.annotations.find(v=>v.id===a.id)||null);setCreating(false);}}finally{setBusy(false);}}
 async function saveDimension(value:FreeDimension){setBusy(true);setError('');try{const next=await persist('dimension.upsert',value);if(next)setDimension(next.dimensions?.find(d=>d.id===value.id)||null);}catch(e){setError((e as Error).message);editor.freeDimensions.update(current.current.doc.dimensions||[]);}finally{setBusy(false);}}
 callbacks.current={pickText:(xy:number[],id:string|null)=>{const c=current.current;if(c.drawing||c.dimension||c.suspended)return;if(c.creating&&c.draft){setDraft({...c.draft,x:xy[0],y:xy[1]});setPlaced(true);return;}if(id){flush();const a=c.doc.annotations.find(a=>a.id===id);if(a){setDraft(a);setCreating(false);setPlaced(true);}}else if(c.creating&&c.draft){setDraft({...c.draft,x:xy[0],y:xy[1]});setPlaced(true);}},dimension:(value:FreeDimension)=>void saveDimension(value)};
 useEffect(()=>{
  if(last.current.textRequest===textRequest)return;last.current.textRequest=textRequest;close();setError('');const view=editor.view();setDraft({id:crypto.randomUUID(),text:'',x:view.center[0],y:view.center[1],size:Math.min(100,Math.max(.05,view.resolution*12)),angle:0,font:'Arial',bold:true,color:'#fff8dd',outline:true,outlineColor:'#17212d',outlineWidth:2});setCreating(true);setPlaced(false);
 },[textRequest]);
 useEffect(()=>{if(last.current.dimensionRequest===dimensionRequest)return;last.current.dimensionRequest=dimensionRequest;close();setError('');setDrawing(true);},[dimensionRequest]);
 useEffect(()=>{onActive(!!draft||!!dimension||drawing);},[draft,dimension,drawing]);
 useEffect(()=>{if(suspended)close();},[suspended]);
 useEffect(()=>{close();setError('');},[doc.project.id]);
 useEffect(()=>{editor.textVisible(textVisible);editor.freeDimensions.layer.setVisible(dimensionsVisible||drawing||!!dimension);},[textVisible,dimensionsVisible,drawing,dimension,doc]);
 useEffect(()=>{if(!manageText)return;const previous=editor.onText;editor.onText=(xy,id)=>callbacks.current.pickText(xy,id);return()=>{editor.onText=previous;};},[editor,manageText]);
 useEffect(()=>{
  if(!manageText||suspended)return;
  const frame=requestAnimationFrame(()=>{
   if(draft)editor.tool('select');
   editor.previewText(draft&&(!creating||placed)?draft:null);
   editor.editText(draft&&!creating?draft.id:null,(id,xy,duplicate)=>{const c=current.current,a=c.draft?.id===id?c.draft:c.doc.annotations.find(a=>a.id===id);if(!a)return;if(duplicate){void saveText({...a,id:crypto.randomUUID(),x:xy[0],y:xy[1],text:nextTextName(a.text,c.doc.annotations.map(t=>t.text))}).catch(()=>{});}else {if(c.draft?.id!==id){setCreating(false);setPlaced(true);}change({...a,x:xy[0],y:xy[1]});}},!creating&&!drawing&&!dimension);
  });return()=>cancelAnimationFrame(frame);
 },[draft,creating,placed,doc,manageText,suspended,drawing,dimension]);
 useEffect(()=>{
  if(suspended||!drawing)return;editor.tool('select');
  const draw=new Draw({type:'LineString',maxPoints:2,stopClick:true});
  draw.on('drawend',event=>{const [start,end]=(event.feature.getGeometry() as LineString).getCoordinates();setDrawing(false);callbacks.current.dimension({id:crypto.randomUUID(),name:`Cota ${(current.current.doc.dimensions?.length||0)+1}`,start,end,offset:0,color:'#ffe0a0'});});
  const snap=dimensionSnap(editor.source.getFeatures(),editor.map);editor.map.addInteraction(draw);editor.map.addInteraction(snap);
  return()=>{draw.abortDrawing();editor.map.removeInteraction(draw);editor.map.removeInteraction(snap);};
 },[drawing,suspended,editor]);
 useEffect(()=>{if(!dimension||suspended||busy)return;let modify:Modify|undefined,snap:Snap|undefined;const frame=requestAnimationFrame(()=>{const feature=editor.freeDimensions.source.getFeatureById(dimension.id);if(!feature)return;modify=new Modify({features:new Collection([feature]),insertVertexCondition:()=>false,deleteCondition:()=>false});modify.on('modifyend',()=>{const [start,end]=feature.getGeometry()!.getCoordinates();callbacks.current.dimension({...dimension,start,end});});editor.map.addInteraction(modify);snap=dimensionSnap(editor.source.getFeatures(),editor.map);editor.map.addInteraction(snap);});return()=>{cancelAnimationFrame(frame);if(modify)editor.map.removeInteraction(modify);if(snap)editor.map.removeInteraction(snap);};},[dimension,doc,suspended,busy]);
 useEffect(()=>{const key=editor.map.on('singleclick',e=>{if(current.current.suspended||current.current.drawing)return;if(manageText&&current.current.creating){callbacks.current.pickText(e.coordinate,null);return;}const feature=editor.map.forEachFeatureAtPixel(e.pixel,f=>f,{layerFilter:l=>l===editor.freeDimensions.layer,hitTolerance:8});if(feature){flush();setDraft(null);setDimension(current.current.doc.dimensions?.find(d=>d.id===feature.getId())||null);}});return()=>unByKey(key);},[editor,manageText]);
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!suspended)close();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[suspended]);
 useEffect(()=>{if(draft&&!creating&&!doc.annotations.some(a=>a.id===draft.id)){setDraft(null);}if(dimension&&!doc.dimensions?.some(d=>d.id===dimension.id))setDimension(null);},[doc]);
 useEffect(()=>()=>{flush();if(manageText){editor.editText(null,()=>{});editor.previewText(null);}},[]);
 const fmt=(n:number)=>n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 return <>{(draft||dimension||drawing||error)&&<aside className="project-notes" aria-label="Textos e cotas independentes"><header><strong>{draft?'Texto':drawing?'Adicionar cota':dimension?'Cota independente':'Informação'}</strong><button aria-label="Fechar edição de anotação" onClick={()=>{close();setError('');}}><X size={15}/></button></header>{error&&<p role="alert">{error}</p>}{draft&&<TextProperties value={draft} disabled={busy} creating={creating} placed={placed} change={change} save={a=>void saveText(a).catch(e=>setError((e as Error).message))} cancel={close} remove={()=>{void persist('annotation.delete',{id:draft.id});close();}}/>}{drawing&&<p>Marque o início e o fim da cota no mapa. Esc cancela.</p>}{dimension&&<div className="project-dimension-properties"><b>{fmt(dimension.derived?.lengthM??Math.hypot(dimension.end[0]-dimension.start[0],dimension.end[1]-dimension.start[1]))} m</b><label>Nome<input key={dimension.id+'name'} defaultValue={dimension.name} maxLength={100} disabled={busy} onBlur={e=>{if(e.target.value!==dimension.name)void saveDimension({...dimension,name:e.target.value});}}/></label><label>Afastamento da linha (m)<input key={dimension.id+'offset'+dimension.offset} type="number" step=".1" defaultValue={dimension.offset} disabled={busy} onBlur={e=>{if(Number(e.target.value)!==dimension.offset)void saveDimension({...dimension,offset:Number(e.target.value)});}}/></label><label>Cor<input type="color" value={dimension.color} disabled={busy} onChange={e=>void saveDimension({...dimension,color:e.target.value})}/></label><p>Arraste os pontos para ajustar a cota. Ela é independente dos lotes e das vias.</p><div><button disabled={busy} onClick={close}>Concluir</button><button disabled={busy} onClick={()=>{void persist('dimension.delete',{id:dimension.id});close();}}><Trash2 size={14}/>Excluir</button></div></div>}</aside>}</>;
}
