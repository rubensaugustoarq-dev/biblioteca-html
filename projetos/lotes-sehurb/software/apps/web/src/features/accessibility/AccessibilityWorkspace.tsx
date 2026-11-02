import {ElementsTools} from './elements/ElementsTools';
import {useEffect,useRef,useState} from 'react';
import {MousePointer2,Scan,Undo2,Redo2,Save,Trash2,MapPin} from 'lucide-react';
import {StraightRampIcon,LongitudinalRampIcon} from './RampIcons';
import type {Document} from '../../api';
import {request} from '../../api';
import {AccessibilityScene} from './scene';
import {initialRamp,rampDefaults,rampDimensions,type Ramp} from './types';
import {RampSection} from './RampSection';
import {HoverPreview} from './hoverPreview';
import './accessibility.css';
function Tool({name,note,active=false,disabled=false,action,children}:any){return <button type="button" className={'symbol-tool '+(active?'enabled':'')} aria-label={name} aria-pressed={active} disabled={disabled} onClick={action}>{children}<span className="symbol-help"><strong>{name}</strong><span>{note}</span></span></button>;}
const fmt=(n:number|undefined)=>n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export function AccessibilityWorkspace({doc,commit}:{doc:Document|null;commit:(type:string,args:unknown)=>Promise<Document|undefined>}){
 const [elementsActive,setElementsActive]=useState(false),[sceneReady,setSceneReady]=useState(false),[toolbarHost,setToolbarHost]=useState<HTMLSpanElement|null>(null),[propertyHost,setPropertyHost]=useState<HTMLElement|null>(null);
 const target=useRef<HTMLDivElement>(null),scene=useRef<AccessibilityScene|null>(null),actions=useRef<any>({}),generation=useRef(0);
 const [draft,setDraft]=useState<Ramp>(()=>initialRamp()),[preview,setPreview]=useState<Ramp|null>(null),[placing,setPlacing]=useState(false),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState('');
 const hover=useRef<HoverPreview<{projectId:string;revision:number;ramp:Ramp;tolerance:number},Ramp>|null>(null),hoverPoint=useRef<number[]|null>(null);
 const [hovered,setHovered]=useState<Ramp|null>(null);
 const [hoverNote,setHoverNote]=useState('');
 const roads=(doc?.infra||[]).filter(r=>r.kind==='road'),eligible=roads.filter(r=>(r.sidewalkLeft||0)+(r.sidewalkRight||0)>0),saved=doc?.accessibility||[],selected=saved.find(r=>r.id===draft.id);
 const dimensions=rampDimensions(draft);
 const assessed=(placing?hovered:preview)||selected;
 const outside=assessed?.derived?.normativeStatus==='outside';
 const totalStraight=saved.filter(r=>r.kind==='straight').length,totalLongitudinal=saved.filter(r=>r.kind==='longitudinal').length;
 const totalOutside=saved.filter(r=>r.derived?.normativeStatus==='outside').length,totalInvalid=saved.filter(r=>r.derived?.status==='invalid').length;
 function choose(r:Ramp){setElementsActive(false);setDraft({...r,...rampDefaults(r.kind)});setPreview(null);setPlacing(false);setError('');}
 function begin(kind:Ramp['kind']){setElementsActive(false);setDraft({...initialRamp(),...rampDefaults(kind),name:'Rampa '+(saved.length+1)});setPreview(null);setPlacing(true);setError('');}
 actions.current={select:(id:string)=>{if(elementsActive)return;const ramp=saved.find(r=>r.id===id);if(ramp)choose(ramp);},position:(point:number[])=>{hover.current?.clear();setPlacing(false);setDraft(v=>({...v,anchor:point}));},move:(point:number[]|null)=>{
  hoverPoint.current=point;setHovered(null);setHoverNote('');
  if(!point||!doc||!placing){hover.current?.clear();scene.current?.showHover(null,null);return;}
  scene.current?.showGuide(draft,point);
  hover.current?.move({projectId:doc.project.id,revision:doc.project.revision,ramp:{...draft,anchor:point},tolerance:scene.current?.captureTolerance()||0});
 }};
 useEffect(()=>{if(!target.current)return;
  hover.current=new HoverPreview(value=>request<Ramp>(`/projects/${value.projectId}/accessibility/preview`,{expectedRevision:value.revision,ramp:value.ramp,autoHost:true,snapToleranceM:value.tolerance}),(value,message)=>{scene.current?.showHover(value,hoverPoint.current,!value);setHovered(value);setHoverNote(value?(value.derived?.normativeStatus==='outside'?'Fora da norma. É possível inserir; confira os alertas em vermelho.':'Encaixe conferido. Clique para fixar a posição.'):message);});
  scene.current=new AccessibilityScene(target.current,id=>actions.current.select(id),p=>actions.current.position(p),p=>actions.current.move(p));
  setSceneReady(true);return()=>{hover.current?.dispose();scene.current?.dispose();};},[]);
 useEffect(()=>{if(doc)scene.current?.update(doc);},[doc]);
 useEffect(()=>{hover.current?.clear();hoverPoint.current=null;setHovered(null);setHoverNote('');scene.current?.showHover(null,null);scene.current?.setPlacing(placing&&!elementsActive);},[placing,draft,doc,elementsActive]);
 useEffect(()=>{setDraft(initialRamp());setPreview(null);setPlacing(false);generation.current++;},[doc?.project.id]);
 useEffect(()=>{
  const token=++generation.current;setPreview(null);setError('');
  if(!doc||draft.anchor.length!==2||elementsActive){setChecking(false);return;}
  setChecking(true);const timer=setTimeout(()=>{void request<Ramp>(`/projects/${doc.project.id}/accessibility/preview`,{expectedRevision:doc.project.revision,ramp:draft,autoHost:true,snapToleranceM:scene.current?.captureTolerance()||0}).then(value=>{if(token===generation.current){setPreview(value);setError('');}}).catch(e=>{if(token===generation.current)setError(e.message);}).finally(()=>{if(token===generation.current)setChecking(false);});},30);
  return()=>{clearTimeout(timer);generation.current++;};
 },[draft,doc,elementsActive]);
 useEffect(()=>{scene.current?.showPreview(placing||elementsActive?null:preview);},[preview,placing,elementsActive]);
 async function execute(type:string,args:unknown){if(busy)return;setBusy(true);setError('');try{const next=await commit(type,args);if(next&&type==='accessibility.upsert'){const value=next.accessibility?.find(r=>r.id===draft.id);if(value)choose(value);}if(type==='accessibility.delete'){setDraft(initialRamp(draft.roadId));setPreview(null);setPlacing(false);}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 function change(values:Partial<Ramp>){setDraft({...draft,...values});}
 return <section className="acc-workspace" aria-label="Acessibilidade"><div className="acc-toolbar" role="toolbar" aria-label="Ferramentas de acessibilidade">
 <Tool name="Selecionar rampa" note="Selecione uma rampa no mapa ou na lista para ajustar suas dimensões." active={!placing&&!elementsActive} action={()=>{setElementsActive(false);setPlacing(false);}}><MousePointer2/></Tool>
 <Tool name="Rampa longitudinal" note="Rebaixa a calçada com patamar e aproximações ao longo da via. Inclinação até 5%." active={placing&&draft.kind==='longitudinal'} disabled={!eligible.length||busy} action={()=>begin('longitudinal')}><LongitudinalRampIcon/></Tool>
 <Tool name="Rampa reta com abas" note="Rebaixamento voltado à pista, com abas e faixa livre preservada atrás." active={placing&&draft.kind==='straight'} disabled={!eligible.length||busy} action={()=>begin('straight')}><StraightRampIcon/></Tool>
 <span className="acc-element-toolbar" ref={setToolbarHost}/>
 <Tool name="Enquadrar vias" note="Mostra o sistema viário do projeto." disabled={!doc} action={()=>scene.current?.fit()}><Scan/></Tool>
 <Tool name="Desfazer" note="Desfaz a última alteração gravada." disabled={!doc?.canUndo||busy} action={()=>void execute('undo',{})}><Undo2/></Tool>
 <Tool name="Refazer" note="Refaz a alteração desfeita." disabled={!doc?.canRedo||busy} action={()=>void execute('redo',{})}><Redo2/></Tool><span>Rampas sobre calçadas · metros</span></div>
 <div className="acc-body"><aside className="acc-panel">
 <section className="acc-totals" aria-label="Quadro geral de rampas"><h3>Quadro geral</h3><div className="acc-total"><span>Rampas locadas</span><strong>{saved.length.toLocaleString('pt-BR')}</strong></div><dl><div><dt>Retas com abas</dt><dd>{totalStraight}</dd></div><div><dt>Longitudinais</dt><dd>{totalLongitudinal}</dd></div><div className={'acc-total-alert '+(totalOutside?'has-alert':'')}><dt>Com alerta normativo</dt><dd>{totalOutside}</dd></div>{totalInvalid>0&&<div className="has-alert"><dt>Vínculo a revisar</dt><dd>{totalInvalid}</dd></div>}</dl><small>Somente rampas inseridas no projeto.</small></section>
 <h3>Rampas do projeto</h3>{!saved.length&&<p>Escolha um modelo e clique na calçada para posicionar.</p>}{saved.map(r=><button key={r.id} className={'acc-item '+(draft.id===r.id?'active ':'')+(r.derived?.normativeStatus==='outside'?'acc-outside':'')} onClick={()=>choose(r)}>{r.name}<small>{r.kind==='straight'?'Reta com abas':'Longitudinal'} · {r.derived?.status==='invalid'?'Revisar vínculo':r.slopePercent.toLocaleString('pt-BR')+' %'+(r.derived?.normativeStatus==='outside'?' · Fora da norma':'')}</small></button>)}
 {doc&&sceneReady&&scene.current&&toolbarHost&&propertyHost&&<ElementsTools doc={doc} scene={scene.current} active={elementsActive} onActive={v=>{setElementsActive(v);if(v)setPlacing(false);}} toolbarHost={toolbarHost} propertyHost={propertyHost} commit={commit}/>}
 {!eligible.length&&<p>Crie uma via com calçada em Infra / Urbano para começar.</p>}
 <details><summary>Referência e limites da checagem</summary><p>Verificação dimensional dos rebaixamentos conforme NBR 9050:2020, versão corrigida 2021, itens 6.12.7.3 e 6.12.7.3.4. Largura mínima 1,20 m; recomendada 1,50 m. Rampas com abas: até 8,33%; longitudinais em calçadas estreitas: até 5%.</p><p>A posição da travessia, níveis reais, alinhamento com o outro lado, ausência de ressalto e sinalização/piso tátil devem ser conferidos no projeto. A área da rampa é sobreposição e não desconta a calçada.</p><a href="https://www.confea.org.br/midias/acessibilidade_abnt_2022.pdf" target="_blank" rel="noreferrer">Consultar referência</a></details></aside>
 <div className="acc-canvas"><div ref={target} className="acc-map"/>{placing&&<div className="acc-hint" role="status">{hoverNote||'Aproxime de qualquer calçada. Amarelo: prévia; verde: encaixe conferido; vermelho: não cabe. Clique para fixar.'}</div>}</div>
 <aside className="acc-panel acc-properties" style={{display:elementsActive?'none':undefined}}><h3>{selected?'Editar rampa':'Nova rampa'}</h3><fieldset disabled={busy}>
 <label>Modelo<select value={draft.kind} onChange={e=>change({...rampDefaults(e.target.value as Ramp['kind']),sideRunM:null})}><option value="straight">Reta com abas</option><option value="longitudinal">Longitudinal</option></select></label>
 <label>Nome<input value={draft.name} maxLength={100} onChange={e=>change({name:e.target.value})}/></label>
 <div className="acc-fields">{[['heightM','Desnível (m)',.01,.5],['widthM',draft.kind==='longitudinal'?'Patamar / travessia (m)':'Largura central (m)',1.2,10]].map(([key,label,min,max])=><label key={String(key)}>{label}<input type="number" step=".01" min={Number(min)} max={Number(max)} value={draft[key as keyof Ramp] as number} onChange={e=>change({[String(key)]:Number(e.target.value)})}/></label>)}</div>
 <label>{draft.kind==='longitudinal'?'Comprimento de cada aproximação (m)':'Comprimento de cada aba (m)'}<div className="acc-length"><input aria-label="Comprimento das abas ou aproximações" type="number" step=".01" min=".1" max="100" value={Number(dimensions.sideRun.toFixed(2))} onChange={e=>change({sideRunM:Number(e.target.value)})}/><button type="button" onClick={()=>change({sideRunM:null})} title="Calcular comprimento pelo limite do modelo">Auto</button></div></label>
 <div className={'acc-auto '+(dimensions.outside?'acc-auto-invalid':'')}><strong>{fmt(dimensions.sideSlope)} % · inclinação {draft.kind==='longitudinal'?'das aproximações':'das abas'}</strong><small>{dimensions.outside?`Acima do limite de ${fmt(dimensions.limit)}%. Aumente o comprimento ou reduza o desnível. O desnível não será alterado automaticamente.`:draft.kind==='longitudinal'?'Limite de 5%. Comprimento e desnível determinam a inclinação.':'Rampa central: 8,33%. As abas acompanham o comprimento informado.'}</small></div>
 <button disabled={!eligible.length} onClick={()=>setPlacing(true)}><MapPin size={14}/>{draft.anchor.length?'Reposicionar':'Posicionar no mapa'}</button>
 </fieldset>
 {checking&&<p role="status">Conferindo encaixe e dimensões…</p>}{error&&<p className="acc-error" role="alert">{error}</p>}
 {outside&&<div className="acc-norm-warning" role="alert"><strong>Fora da norma · verificação dimensional</strong>{assessed?.derived?.warnings?.map((message,i)=><p key={i}>{message}</p>)}<small>Inserção permitida com estas ressalvas. O alerta permanece após salvar.</small></div>}
 {(placing?hovered:preview)&&<p className="acc-host">{roads.find(r=>r.id===(placing?hovered:preview)?.roadId)?.name} · calçada identificada automaticamente</p>}
 <div className="acc-actions"><button className="primary" disabled={placing||!preview||checking||busy} onClick={()=>void execute('accessibility.upsert',preview)}><Save size={14}/>{selected?'Salvar alterações':outside?'Inserir com ressalvas':'Inserir rampa'}</button>{selected&&<><button onClick={()=>scene.current?.locate(selected)}><Scan size={14}/>Localizar</button><button disabled={busy} onClick={()=>void execute('accessibility.delete',{id:selected.id})}><Trash2 size={14}/>Excluir</button></>}</div>
 <RampSection ramp={(placing?hovered:preview)||draft} confirmed={!!(placing?hovered:preview)}/>
 {preview&&!placing&&<div className={'acc-check '+(outside?'acc-norm-warning':'')}><strong>{outside?'Encaixe geométrico com ressalvas':'Dimensões conferidas'}</strong><p>Desenvolvimento: {fmt(preview.derived?.runM)} m<br/>Extensão total: {fmt(preview.derived?.totalLengthM)} m<br/>Circulação livre: {fmt(preview.derived?.freeWidthM)} m<br/>Sobreposição: {fmt(preview.derived?.overlayAreaM2)} m²</p><small>Área da calçada preservada.</small></div>}
 </aside><aside ref={setPropertyHost} className="acc-panel acc-properties" style={{display:elementsActive?undefined:'none'}}/></div></section>;
}

