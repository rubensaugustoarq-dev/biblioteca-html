import {HomeDashboard} from './features/home/HomeDashboard';
import {LandscapeWorkspace} from './features/landscape/LandscapeWorkspace';
import {AccessibilityWorkspace} from './features/accessibility/AccessibilityWorkspace';
import {ProjectNotes} from './ProjectNotes';
import {InfraDimensionTool} from './features/infra/DimensionTool';
import {InfraWorkspace} from './features/infra/InfraWorkspace';
import {EnlWorkspace} from './features/enl/EnlWorkspace';
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Layers,Home,FolderOpen,Plus,Save,Undo2,Redo2,MousePointer2,Scan,ImagePlus,Pentagon,SquarePen,LockKeyhole,UnlockKeyhole,Trash2,Maximize,MapPin,X,Check,ArrowRight,LoaderCircle,ChevronRight,ChevronLeft,PanelRightClose,Magnet,CornerDownRight,Waypoints,Ruler,Type} from 'lucide-react';
import {request,type Document,type Entity,type Recent,type Annotation} from './api';
import {Editor,type Mode} from './editor';
import {measurePath} from './measure';
import {TapeMeasureIcon} from './TapeMeasureIcon';
import 'ol/ol.css';
import './style.css';
import {TextProperties} from './TextProperties';
import {nextTextName} from './textNames';
import {CaptureTool} from './CaptureTool';
import {captureMap,type CaptureRect} from './capture';
import {Camera,FileDown} from 'lucide-react';
import {StudyPdf} from './StudyPdf';

const number=(n:number,digits=2)=>n.toLocaleString('pt-BR',{maximumFractionDigits:digits,minimumFractionDigits:digits});
const parse=(text:string)=>Number(text.trim().replace(',','.'));
interface ShapePreview {convertedTo2D?:boolean;closedLineToPolygon?:boolean;token:string;name:string;features:number;polygons:number;sourceCrs:string;targetCrs:string;reprojected:boolean;multipartFeatures:number;expectedRevision:number}

function ToolToggle({name,description,active,onClick,icon}:{name:string;description:string;active:boolean;onClick:()=>void;icon:React.ReactNode}){
  return <button type="button" className={'symbol-tool '+(active?'enabled':'')} aria-label={name+'. '+description} aria-pressed={active} onClick={onClick}>
    {icon}<span className="symbol-help" role="tooltip"><strong>{name}</strong><span>{description}</span></span>
  </button>;
}

function TextTool({active,disabled,onToggle,onAdd}:{active:boolean;disabled:boolean;onToggle:()=>void;onAdd:()=>void}){
  const [open,setOpen]=useState(false);
  return <div className="text-tool" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocusCapture={()=>setOpen(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);e.stopPropagation();}}}>
    <button type="button" className={'symbol-tool '+(active?'enabled':'')} aria-label="Mostrar textos" aria-pressed={active} aria-expanded={open} aria-controls="text-tool-popover" onClick={onToggle}><Type/></button>
    {open&&<div id="text-tool-popover" className="text-tool-popover">
      <div className="text-tool-card">
        <button type="button" className="text-tool-add" disabled={disabled} onClick={()=>{setOpen(false);onAdd();}}><Plus size={16}/>Adicionar texto</button>
        <div className="text-tool-note"><strong>Mostrar textos</strong><p>Exibe ou oculta os nomes de ruas e outros textos do modelo.</p><p>Para inserir, clique em Adicionar texto e escolha a posição no mapa.</p></div>
      </div>
    </div>}
  </div>;
}

function App(){
  const [homeOpen,setHomeOpen]=useState(true);
  const [pdfOpen,setPdfOpen]=useState(false);
  const cadInput=useRef<HTMLInputElement>(null);
  const [cadFile,setCadFile]=useState<File|null>(null),[cadConfirmed,setCadConfirmed]=useState(false);
  async function importCad(){if(!cadFile)return;await run('Importando DXF',async()=>{
    const current=docRef.current!,data=new FormData();data.append('file',cadFile);data.append('expected_revision',String(current.project.revision));data.append('command_id',crypto.randomUUID());data.append('confirmed',String(cadConfirmed));
    const next=await request<Document>(`/projects/${current.project.id}/cad/import`,data);setDoc(next);setCadFile(null);setMode('select');
    const warnings=next.resources.filter(r=>r.role==='vectorSource').at(-1)?.metadata.warnings||[];
    setNotice('DXF importado como referência não editável. Controle as camadas em CAD / Referências.'+(warnings.length?' Avisos: '+warnings.join(' '):''));
  });}
  async function exportCad(){if(workspaceTab==='infra'&&infraAreaDraft){setError('Aplique ou descarte a prévia do loteamento antes de exportar o DXF.');return;}if(workspaceTab==='infra'&&infraNotesActive){setError('Conclua a edição do texto ou da cota antes de exportar o DXF.');return;}await run('Exportando DXF',async()=>{
    const current=docRef.current!;
    let legendQuery='';
    const dimensionGroups=(workspaceTab==='infra'?[[infraGlebaDimensions,'glebas'],[infraRoadDimensions,'roads'],[infraSurfaceDimensions,'surfaces'],[infraLotDimensions,'lots'],[freeDimensionsVisible,'independent']]:[[showDimensions,'glebas'],[freeDimensionsVisible,'independent']]).filter(([visible])=>visible).map(([,name])=>name).join(',');
    {
      const entries:{label:string;color:string}[]=[];let saved=false;
      for(const prefix of workspaceTab==='infra'?['sehurb-infra-a3-','sehurb-loteamento-a3-']:['sehurb-a3-']){
        try{const raw=localStorage.getItem(prefix+current.project.id);if(!raw)continue;const fields=JSON.parse(raw);saved=true;
          if(fields.legendEnabled!==false)for(const item of fields.legendItems||[]){const label=String(item.label||'').trim(),color=item.color||'#80a8d8';if(label&&!entries.some(e=>e.label===label&&e.color===color))entries.push({label,color});}
        }catch{/* Invalid local preferences do not prevent geometry export. */}
      }
      if(saved)legendQuery='&legend='+encodeURIComponent(JSON.stringify(entries));
    }
    const response=await fetch(`/api/projects/${current.project.id}/cad/export?texts=${textVisible}&points=${workspaceTab==='infra'?infraGlebaPoints||infraRoadPoints:showVertices}&dimensions=${workspaceTab==='infra'?infraGlebaDimensions||infraRoadDimensions||infraSurfaceDimensions||infraLotDimensions:showDimensions}&infra=${workspaceTab==='infra'}${legendQuery}&dimension_groups=${encodeURIComponent(dimensionGroups)}`);
    if(!response.ok){const result=await response.json();throw new Error(result.detail||'Não foi possível exportar o DXF.');}
    const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=workspaceTab==='infra'?'SEHURB-infra-urbano.dxf':'SEHURB-estudo.dxf';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    setNotice(workspaceTab==='infra'?'DXF exportado: glebas, eixos, pistas, calçadas, lotes e áreas de uso em layers separadas, com hachuras e quadros de resumo ao lado do projeto. Contornos fechados nas coordenadas do projeto.':'DXF do Estudo exportado com glebas, hachuras, cotas habilitadas, legenda e resumo geral em layers separadas.');
  });}
  const [workspaceTab,setWorkspaceTab]=useState<'study'|'enl'|'infra'|'accessibility'|'landscape'>('study');
  const [exchangeGroup,setExchangeGroup]=useState<'qgis'|'cad'>('qgis');
  const toggleExchange=()=>setExchangeGroup(group=>group==='qgis'?'cad':'qgis');
  const [infraAreaDraft,setInfraAreaDraft]=useState(false);
  function changeWorkspace(tab:'study'|'enl'|'infra'|'accessibility'|'landscape'){if(workspaceTab==='infra'&&infraAreaDraft){setError('Salve ou descarte a área de loteamento antes de mudar de aba.');return;}if(mode==='draw'||mode==='text'){setError('Conclua ou cancele a inserção antes de mudar de aba.');return;}setMode('select');setCapturing(false);setWorkspaceTab(tab);if(tab==='study')requestAnimationFrame(()=>editor.current?.map.updateSize());}
  const [capturing,setCapturing]=useState(false);
  const [infraPdfOpen,setInfraPdfOpen]=useState(false);
  const [infraCapturing,setInfraCapturing]=useState(false);
  async function exportCapture(rect:CaptureRect,factor:number,format:'png'|'jpg'){
    setError('');
    try{
      const name=docRef.current?.project.name||'mapa';
      const blob=await captureMap(editor.current!.map,rect,factor,format),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`${name}-captura.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice('Imagem exportada com as camadas e opacidades visíveis.');
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível exportar a captura.');}
  }
  const [doc,setDoc]=useState<Document|null>(null),[recent,setRecent]=useState<Recent[]>([]);
  const [dialog,setDialog]=useState<'new'|'open'|null>(null),[selected,setSelected]=useState<string|null>(null);
  const [mode,setMode]=useState<Mode>('select'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{if(mode!=='select')setCapturing(false);},[mode]);
  const [xy,setXY]=useState<number[]>([0,0]),[draft,setDraft]=useState({area:0,vertices:0}),[snap,setSnap]=useState(true),[ortho,setOrtho]=useState(false);
  const [east,setEast]=useState(''),[north,setNorth]=useState(''),[layerVisible,setLayerVisible]=useState(true);
  const mapElement=useRef<HTMLDivElement>(null),editor=useRef<Editor|null>(null),fileInput=useRef<HTMLInputElement>(null);
  const docRef=useRef(doc),actionRef=useRef<(id:string|null,c:number[][][])=>void>(()=>{}),busyRef=useRef(false);
  docRef.current=doc;
  const [textPlaced,setTextPlaced]=useState(false);
  const [textVisible,setTextVisible]=useState(true),[textSelection,setTextSelection]=useState<Annotation|null>(null);
  const pendingText=useRef<{projectId:string;value:Annotation}|null>(null),textSaveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const flushTextRef=useRef<()=>Promise<void>>(async()=>{});
  function scheduleTextSave(a:Annotation){
    const current=docRef.current;
    if(!current?.annotations.some(v=>v.id===a.id))return;
    if(!a.text.trim()||!Number.isFinite(a.size)||a.size<.05||a.size>100||![a.x,a.y,a.angle].every(Number.isFinite)||(a.outlineWidth!==undefined&&(a.outlineWidth<.5||a.outlineWidth>8)))return;
    pendingText.current={projectId:current.project.id,value:a};
    if(textSaveTimer.current)clearTimeout(textSaveTimer.current);
    textSaveTimer.current=setTimeout(()=>void flushTextRef.current(),350);
  }
  async function flushText(){
    if(textSaveTimer.current)clearTimeout(textSaveTimer.current);textSaveTimer.current=null;
    if(!pendingText.current)return;
    if(busyRef.current){textSaveTimer.current=setTimeout(()=>void flushTextRef.current(),100);return;}
    const pending=pendingText.current;pendingText.current=null;
    if(docRef.current?.project.id!==pending.projectId||!docRef.current.annotations.some(a=>a.id===pending.value.id))return;
    await run('Gravando texto automaticamente',()=>command('annotation.upsert',pending.value));
    if(pendingText.current)textSaveTimer.current=setTimeout(()=>void flushTextRef.current(),100);
  }
  flushTextRef.current=flushText;
  async function duplicateText(a:Annotation,xy:number[]){
    const projectId=docRef.current?.project.id;
    await flushText();
    const deadline=Date.now()+5000;
    while(busyRef.current&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(busyRef.current||docRef.current?.project.id!==projectId){setError('Aguarde a operação atual antes de duplicar o texto.');return;}
    await run('Duplicando texto',async()=>{
      const copy={...a,id:crypto.randomUUID(),x:xy[0],y:xy[1],text:nextTextName(a.text,docRef.current!.annotations.map(v=>v.text))};
      const next=await command('annotation.upsert',copy);
      if(next){setSelected(null);setMode('select');setTextSelection(next.annotations.find(v=>v.id===copy.id)||null);setNotice(`Texto duplicado: ${copy.text}`);}
    });
  }
  const textAction=useRef<(xy:number[],id:string|null)=>void>(()=>{});
  textAction.current=(xy,id)=>{const existing=docRef.current?.annotations.find(a=>a.id===id);setSelected(null);setTextPlaced(true);if(existing){setMode('select');setTextSelection(existing);}else{setTextSelection(a=>({...a!,x:xy[0],y:xy[1]}));}};
  function beginText(){const view=editor.current?.view();if(!view)return;setSelected(null);setTextPlaced(false);setTextVisible(true);setTextSelection({id:crypto.randomUUID(),text:'',x:view.center[0],y:view.center[1],size:Math.min(100,Math.max(.05,view.resolution*12)),angle:0,font:'Arial',bold:true,color:'#fff8dd',outline:true,outlineColor:'#17212d',outlineWidth:2});setMode('text');}
  function cancelText(){void flushText();editor.current?.previewText(null);setTextSelection(null);setMode('select');}

  const [arcStage,setArcStage]=useState('');
  const [showVertices,setShowVertices]=useState(false);
  const [showDimensions,setShowDimensions]=useState(false);
  const [infraGlebaPoints,setInfraGlebaPoints]=useState(false),[infraRoadPoints,setInfraRoadPoints]=useState(false);
  const [infraGlebaDimensions,setInfraGlebaDimensions]=useState(false),[infraRoadDimensions,setInfraRoadDimensions]=useState(false),[infraLotDimensions,setInfraLotDimensions]=useState(false),[infraSurfaceDimensions,setInfraSurfaceDimensions]=useState(false);
  const [infraMeasuring,setInfraMeasuring]=useState(false),[infraNotesActive,setInfraNotesActive]=useState(false);
  const [infraTextRequest,setInfraTextRequest]=useState(0),[infraDimensionRequest,setInfraDimensionRequest]=useState(0),[studyDimensionRequest,setStudyDimensionRequest]=useState(0),[freeDimensionsVisible,setFreeDimensionsVisible]=useState(true);
  const [measurement,setMeasurement]=useState<{points:number[][];finished:boolean;areaM2?:number;perimeterM?:number}>({points:[],finished:false});
  const measured=measurePath(measurement.points);
  const [measureEdge,setMeasureEdge]=useState<number|null>(null),[measureLength,setMeasureLength]=useState('');
  const [measureVertex,setMeasureVertex]=useState<number|null>(null);
  useEffect(()=>{editor.current?.measureSource.getFeatures()[0]?.set('selectedVertex',measureVertex);},[measureVertex,measurement.points.length]);
  async function deleteMeasureVertex(){if(measureVertex===null)return;await editor.current?.removeMeasurementVertex(measureVertex);setMeasureVertex(null);setMeasureEdge(null);}
  async function createGlebaFromMeasure(){const instance=editor.current;if(!instance?.measureComplete||instance.measureClosing||measurement.areaM2===undefined){setError('Feche e conclua a medição antes de criar a gleba.');return;}await geometry(null,[instance.measureComplete.map(point=>point.slice())]);}
  function editMeasureEdge(index:number){if(!measurement.finished)return;setMeasureEdge(index);setMeasureLength(measured.segments[index].toFixed(2).replace('.',','));}
  async function applyMeasureLength(){if(measureEdge===null)return;const length=Number(measureLength.replace(',','.'));if(!Number.isFinite(length)||length<=0){setError('Informe um comprimento maior que zero.');return;}await editor.current?.resizeMeasurement(measureEdge,length);setMeasureEdge(null);}
  useEffect(()=>{if(mode!=='measure'||!measurement.points.length){setMeasureEdge(null);setMeasureVertex(null);}},[mode,measurement.points.length]);
  const entity=doc?.entities.find(e=>e.id===selected)||null;
  const knownTexts=useRef(new Set<string>());
  useEffect(()=>{if(textSelection&&knownTexts.current.has(textSelection.id)&&!doc?.annotations.some(a=>a.id===textSelection.id))setTextSelection(null);knownTexts.current=new Set(doc?.annotations.map(a=>a.id)||[]);},[doc]);
  useEffect(()=>{if(selected)setTextSelection(null);},[selected]);
  const [shapePreview,setShapePreview]=useState<ShapePreview|null>(null);
  async function run<T>(label:string,action:()=>Promise<T>):Promise<T|undefined>{
    if(busyRef.current)return;busyRef.current=true;setBusy(label);setError('');setNotice('');
    try{return await action();}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir a operação.');if(docRef.current)editor.current?.setDocument(docRef.current);}
    finally{busyRef.current=false;setBusy('');}
  }
  async function refreshRecent(){try{setRecent(await request<Recent[]>('/projects'));}catch(e){setError('Não foi possível acessar o motor local. Inicie pelo arquivo Iniciar Lotes SEHURB.cmd.');}}
  function load(next:Document){setHomeOpen(false);setWorkspaceTab('study');setCapturing(false);setDoc(next);setSelected(null);setTextSelection(null);setMode('select');setLayerVisible(true);localStorage.setItem('lsehurb:lastProject',next.project.id);}
  async function command(type:string,parameters:unknown={}){
    const current=docRef.current;if(!current)return;
    const next=await request<Document>(`/projects/${current.project.id}/commands`,{commandId:crypto.randomUUID(),expectedRevision:current.project.revision,type,parameters});
    docRef.current=next;setDoc(next);
    if(type==='undo'||type==='redo'){
      pendingText.current=null;if(textSaveTimer.current)clearTimeout(textSaveTimer.current);
      setTextSelection(a=>a?next.annotations.find(v=>v.id===a.id)||null:null);
    }
    return next;
  }
  async function geometry(id:string|null,coordinates:number[][][]){
    await run('Confirmando perímetro',async()=>{
      const current=docRef.current;if(!current)return;
      const object=current.entities.find(e=>e.id===id);
      const objectId=id||crypto.randomUUID();
      await command('boundary.upsert',{id:objectId,name:object?.attributes.name||`Gleba ${current.entities.length+1}`,geometry:{type:'Polygon',coordinates}});
      setMode('select');setSelected(objectId);setNotice('Perímetro confirmado e gravado no projeto.');
    });
  }
  actionRef.current=geometry;
  useEffect(()=>{
    if(!mapElement.current)return;
    const instance=new Editor(mapElement.current,{geometry:(id,c)=>actionRef.current(id,c),select:id=>{setSelected(id);setTextSelection(null);},coordinates:setXY,arc:setArcStage,draft:(area,vertices)=>setDraft({area,vertices}),error:setError});editor.current=instance;instance.onMeasure=(points,finished,result)=>setMeasurement({points:points.map(p=>p.slice()),finished,...result});instance.onMeasureVertex=index=>{setMeasureVertex(index);setMeasureEdge(null);};instance.onMeasureSegment=index=>{const points=instance.measureComplete;if(points){setMeasureEdge(index);setMeasureLength(measurePath(points).segments[index].toFixed(2).replace('.',','));}};instance.onMeasureArea=points=>request(`/projects/${docRef.current!.project.id}/measure/area`,{points});instance.onText=(xy,id)=>textAction.current(xy,id);
    refreshRecent();

    return()=>instance.dispose();
  },[]);
  useEffect(()=>{if(doc)editor.current?.setDocument(doc);},[doc]);
  useEffect(()=>{if(!homeOpen)requestAnimationFrame(()=>editor.current?.map.updateSize());},[homeOpen]);
  useEffect(()=>{editor.current?.textVisible(textVisible);},[textVisible]);
  useEffect(()=>{editor.current?.editText(mode==='select'?textSelection?.id||null:null,(id,xy,duplicate)=>{const a=textSelection?.id===id?textSelection:docRef.current?.annotations.find(v=>v.id===id);if(a){if(duplicate){void duplicateText(a,xy);return;}const moved={...a,x:xy[0],y:xy[1]};setTextSelection(moved);scheduleTextSave(moved);}});},[textSelection,doc,mode]);
  useEffect(()=>{editor.current?.previewText(textSelection&&(mode==='select'||(mode==='text'&&textPlaced))?textSelection:null);},[textSelection,textPlaced,mode,doc]);
  useEffect(()=>{editor.current?.verticesVisible(showVertices);},[showVertices]);
  useEffect(()=>{editor.current?.dimensionsVisible(showDimensions);},[showDimensions]);
  useEffect(()=>{editor.current?.select(selected);},[selected]);
  useEffect(()=>{editor.current?.tool(mode);},[mode]);
  useEffect(()=>{editor.current?.drawingOptions(snap,ortho);},[snap,ortho]);
  async function checkpoint(){if(mode==='draw'){setError('Conclua ou cancele o desenho antes de salvar um checkpoint. A prévia ainda não é parte do projeto.');return;}await run('Salvando checkpoint',async()=>{const current=docRef.current;if(!current)return;await request(`/projects/${current.project.id}/view`,editor.current!.view());await request(`/projects/${current.project.id}/checkpoint`,{});setNotice('Checkpoint salvo. Seu projeto e seu histórico estão protegidos na pasta local.');});}
  async function saveAs(){
    if(mode==='draw'){setError('Conclua ou cancele o desenho antes de salvar como.');return;}
    await run('Salvar como · escolha a pasta na janela do Windows',async()=>{
      const current=docRef.current;if(!current)return;
      await request(`/projects/${current.project.id}/view`,editor.current!.view());
      const result=await request<{document:Document;folder:string}|{cancelled:true}>(`/projects/${current.project.id}/save-as`,{expectedRevision:current.project.revision});
      if('cancelled' in result)return;
      setDoc(result.document);setNotice('Projeto completo salvo em '+result.folder+'. As próximas alterações serão gravadas nessa pasta.');
    });
  }
  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      if(homeOpen||workspaceTab!=='study')return;
      if(event.key==='F8'){event.preventDefault();setOrtho(value=>!value);return;}
      if((event.target as HTMLElement).matches('input,textarea,select,[contenteditable]'))return;
      if(event.key==='Escape'){setCapturing(false);editor.current?.cancel();if(mode==='text')cancelText();else setMode('select');}
      if(event.key==='Delete'&&mode==='measure'&&measureVertex!==null){event.preventDefault();void deleteMeasureVertex();return;}
      if(event.key==='Enter'&&(mode==='draw'||mode==='measure')){event.preventDefault();editor.current?.finish();}
      if(event.key==='Backspace'&&(mode==='draw'||mode==='measure')){event.preventDefault();editor.current?.removeLast();}
      if(event.ctrlKey&&event.key.toLowerCase()==='s'){event.preventDefault();checkpoint();}
      if(event.ctrlKey&&event.key.toLowerCase()==='z'){event.preventDefault();if(mode==='draw'||mode==='measure')editor.current?.removeLast();else run('Desfazendo',()=>command(event.shiftKey?'redo':'undo'));}
      if(event.ctrlKey&&event.key.toLowerCase()==='y'){event.preventDefault();run('Refazendo',()=>command('redo'));}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[mode,measureVertex,workspaceTab,homeOpen]);
  async function importRaster(file:File){
    await run('Preparando ortofoto · aguarde a leitura e otimização',async()=>{
      if(!docRef.current)return;const current=docRef.current;
      const data=new FormData();data.append('file',file);data.append('expected_revision',String(current.project.revision));data.append('command_id',crypto.randomUUID());
      const next=await request<Document>(`/projects/${current.project.id}/orthophotos`,data);setDoc(next);setMode('select');setNotice('Ortofoto importada. O original foi preservado; a visualização respeita o CRS do projeto.');
      requestAnimationFrame(()=>{editor.current?.setDocument(next);editor.current?.fit();});
    });
  }
  async function openLocalShape(){
    await run('Escolha o .shp na janela do Windows',async()=>{
      const current=docRef.current;if(!current)return;
      const result=await request<ShapePreview|{cancelled:true}>(`/projects/${current.project.id}/shapefile/open-local`,{});
      if(!('cancelled' in result))setShapePreview(result);
    });
  }
  async function applyShapes(){
    await run('Importando glebas',async()=>{
      const current=docRef.current;if(!current||!shapePreview)return;
      const next=await request<Document>(`/projects/${current.project.id}/shapefile/apply`,{token:shapePreview.token,commandId:crypto.randomUUID(),expectedRevision:shapePreview.expectedRevision});
      setDoc(next);setMode('select');setSelected(null);setShapePreview(null);
      setNotice('Glebas importadas e gravadas. Você pode desfazer a importação inteira.');
      requestAnimationFrame(()=>{editor.current?.setDocument(next);editor.current?.fit();});
    });
  }
  async function exportShapes(){
    await run('Exportando Shapefile',async()=>{
      const current=docRef.current;if(!current)return;
      const response=await fetch(`/api/projects/${current.project.id}/shapefile/export?separate=true&include_vertices=${showVertices}`);
      if(!response.ok){const result=await response.json();throw new Error(result.detail||'Falha na exportação.');}
      const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');
      link.href=url;link.download='glebas-shapefile.zip';document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);setNotice(showVertices?'Download iniciado: glebas separadas e camada de pontos identificados.':'Download iniciado: ZIP com um Shapefile separado por gleba, CRS e medidas.');
    });
  }
  function addPoint(){if(!east.trim()||!north.trim()||!Number.isFinite(parse(east))||!Number.isFinite(parse(north))){setError('Informe as coordenadas E e N em metros.');return;}editor.current?.point([parse(east),parse(north)]);setEast('');setNorth('');}
  async function openHome(){
    if(busyRef.current)return;
    if(mode==='draw'||mode==='text'||infraAreaDraft||infraNotesActive){setError('Conclua ou cancele a edição atual antes de voltar ao início.');return;}
    await flushText();setError('');setNotice('');setCapturing(false);setInfraCapturing(false);setInfraMeasuring(false);setMode('select');setHomeOpen(true);void refreshRecent();
  }
  async function openSaved(id:string){await run('Abrindo projeto',async()=>{load(await request<Document>(`/projects/${id}`));});}
  return <div className={'application '+(homeOpen?'home-active':'')} onKeyDownCapture={event=>{if(homeOpen)event.stopPropagation();}}>
    <input ref={cadInput} type="file" accept=".dxf" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file){setCadConfirmed(false);setCadFile(file);}}}/>
    {cadFile&&doc&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-label="Importar referência DXF"><h2>Importar referência DXF</h2><p>{cadFile.name}</p><p>Desenho do Model, com camadas, cores, tipos de linha e textos. Os objetos importados ficam apenas para visualização.</p><p>O DXF precisa estar em metros e nas coordenadas de <strong>{doc.project.crs.authid}</strong>. Arquivos com origem local precisam ser posicionados no CAD antes de importar. Sem escala ou reprojeção automática.</p><label className="cad-confirm"><input type="checkbox" checked={cadConfirmed} onChange={e=>setCadConfirmed(e.target.checked)}/>Confirmo as unidades e coordenadas do desenho</label><div className="modal-footer"><button disabled={!!busy} onClick={()=>setCadFile(null)}>Cancelar</button><button className="primary" disabled={!cadConfirmed||!!busy} onClick={importCad}>Importar DXF</button></div>{error&&<p role="alert">{error}</p>}</section></div>}
    <header className="header"><div className="brand"><div className="brand-icon"><Layers size={25}/></div><div><strong>LOTES <span>SEHURB</span></strong><small>Bancada de projeto</small></div></div><div className="project-title">{homeOpen?<span>Painel de projetos · versão 1.0.0</span>:doc?<><span className="live-dot"/><strong>{doc.project.name}</strong><span className="revision">Rev. {doc.project.revision}</span></>:<span>Seu próximo projeto começa aqui</span>}</div><div className="header-actions"><button className="home-link" disabled={homeOpen||!!busy} onClick={()=>void openHome()}><Home size={16}/>Início</button><button onClick={()=>{setError('');setDialog('new');}} disabled={!!busy}><Plus size={16}/>Novo</button><button onClick={()=>{refreshRecent();setDialog('open');}} disabled={!!busy}><FolderOpen size={16}/>Abrir</button><button className="primary" disabled={!doc||!!busy} onClick={checkpoint}><Save size={16}/>Salvar</button><button disabled={!doc||!!busy||mode==='draw'} onClick={saveAs}><FolderOpen size={16}/>Salvar como</button></div></header>
    {homeOpen&&<HomeDashboard projects={recent} currentId={doc?.project.id} lastId={localStorage.getItem('lsehurb:lastProject')} busy={!!busy} error={error} onNew={()=>{setError('');setDialog('new');}} onOpen={id=>void openSaved(id)} onRefresh={()=>void refreshRecent()}/>}
    <nav className="ribbon"><div className="ribbon-label" role="tablist" aria-label="Ambientes do projeto"><button type="button" role="tab" aria-selected={workspaceTab==='study'} className={workspaceTab==='study'?'active-tab':''} disabled={!!busy} onClick={()=>changeWorkspace('study')}>Estudo</button><button type="button" role="tab" aria-selected={workspaceTab==='enl'} className={workspaceTab==='enl'?'active-tab':''} disabled={!!busy} onClick={()=>changeWorkspace('enl')}>Estudo ENL</button><button type="button" role="tab" aria-selected={workspaceTab==='infra'} className={workspaceTab==='infra'?'active-tab':''} disabled={!!busy} onClick={()=>changeWorkspace('infra')}>Infra / Urbano</button><button type="button" role="tab" aria-selected={workspaceTab==='accessibility'} className={workspaceTab==='accessibility'?'active-tab':''} disabled={!!busy} onClick={()=>changeWorkspace('accessibility')}>Acessibilidade</button><button type="button" role="tab" aria-selected={workspaceTab==='landscape'} className={workspaceTab==='landscape'?'active-tab':''} disabled={!!busy} onClick={()=>changeWorkspace('landscape')}>Paisagismo</button></div><div className="ribbon-tools" style={{display:workspaceTab==='study'?undefined:'none'}}><div className="tool-group"><button className={mode==='select'?'active':''} title="Selecionar objeto" disabled={!doc||!!busy} onClick={()=>setMode('select')}><MousePointer2/>Selecionar</button><button className={mode==='draw'?'active':''} disabled={!doc||!!busy} onClick={()=>{setSelected(null);setMode('draw');}}><Pentagon/>Desenhar gleba</button><button className={mode==='edit'?'active':''} disabled={!entity||entity.locked||!!busy} onClick={()=>setMode('edit')}><SquarePen/>Editar vértices</button></div><div className="tool-group"><button disabled={!doc||!!busy} onClick={()=>fileInput.current?.click()}><ImagePlus/>Importar ortofoto</button><button disabled={!doc||!!busy} onClick={()=>editor.current?.fit()}><Maximize/>Enquadrar tudo</button></div><div className="tool-group compact"><button title="Desfazer · Ctrl+Z" aria-label="Desfazer" disabled={!doc?.canUndo||!!busy} onClick={()=>run('Desfazendo',()=>command('undo'))}><Undo2/></button><button title="Refazer · Ctrl+Y" aria-label="Refazer" disabled={!doc?.canRedo||!!busy} onClick={()=>run('Refazendo',()=>command('redo'))}><Redo2/></button></div><div className="mode-controls"><ToolToggle name="Captura de vértices" description="Encaixa o cursor nos pontos e lados de glebas existentes quando você aproxima o mouse." active={snap} onClick={()=>setSnap(!snap)} icon={<Magnet/>}/><ToolToggle name="Travar em 90° · F8" description="Liga ou desliga com F8. Na Trena e nas glebas, a primeira linha define a direção. Os próximos trechos seguem paralelos ou perpendiculares à linha anterior, inclusive inclinada." active={ortho} onClick={()=>setOrtho(!ortho)} icon={<CornerDownRight/>}/></div></div></nav>
    <div className="gis-tools" style={{display:workspaceTab==='enl'||workspaceTab==='accessibility'||workspaceTab==='landscape'?'none':undefined}}><div className="exchange-carousel" aria-label="Grupos de troca de arquivos"><div className="exchange-switch"><button type="button" aria-label="Grupo anterior" title="Trocar entre QGIS e AutoCAD" onClick={toggleExchange}><ChevronLeft size={14}/></button><select aria-label="Troca de arquivos" value={exchangeGroup} onChange={e=>setExchangeGroup(e.target.value as 'qgis'|'cad')}><option value="qgis">QGIS</option><option value="cad">AutoCAD</option></select><button type="button" aria-label="Próximo grupo" title="Trocar entre QGIS e AutoCAD" onClick={toggleExchange}><ChevronRight size={14}/></button></div><div className="exchange-tools" key={exchangeGroup} role="toolbar" aria-label={exchangeGroup==='qgis'?'Troca com QGIS':'Troca com AutoCAD'}>{exchangeGroup==='qgis'?<><button disabled={!doc||!!busy||mode==='draw'} onClick={openLocalShape}><FolderOpen size={16}/>Abrir SHP</button><button disabled={!doc?.entities.length||!!busy||mode==='draw'} onClick={exportShapes}><Save size={16}/>Exportar SHP</button>{(workspaceTab==='study'||workspaceTab==='infra')&&<button disabled={!doc||!!busy||mode==='draw'||mode==='text'} onClick={()=>{if(workspaceTab==='infra'){if(infraNotesActive){setError('Conclua a edição do texto ou da cota antes de gerar o PDF.');return;}if(infraAreaDraft){setError('Aplique ou descarte a prévia de loteamento antes de gerar o PDF.');return;}setInfraCapturing(false);setInfraMeasuring(false);setInfraPdfOpen(true);return;}setCapturing(false);setPdfOpen(true);}}><FileDown size={16}/>PDF A3</button>}</>:<><button disabled={!doc||!!busy||mode!=='select'} onClick={()=>cadInput.current?.click()}><FolderOpen size={16}/>Abrir DXF</button><button disabled={!doc||!!busy||mode!=='select'} onClick={exportCad}><Save size={16}/>Exportar DXF</button></>}</div></div><div className="mode-controls"><ToolToggle name="Captura da tela" description="Selecione uma área do mapa e exporte em PNG ou JPG com alta resolução e as opacidades atuais." active={workspaceTab==='infra'?infraCapturing:capturing} onClick={()=>{if(doc&&!busy){if(workspaceTab==='infra'){setInfraMeasuring(false);setInfraCapturing(!infraCapturing);return;}cancelText();setMode('select');setCapturing(!capturing);}}} icon={<Camera/>}/><TextTool active={textVisible} disabled={!doc||!!busy} onToggle={()=>setTextVisible(!textVisible)} onAdd={()=>{if(workspaceTab==='infra'){setTextVisible(true);setInfraMeasuring(false);setInfraCapturing(false);setInfraTextRequest(v=>v+1);}else beginText();}}/>{workspaceTab==='infra'?<InfraDimensionTool points glebas={infraGlebaPoints} vias={infraRoadPoints} onGlebas={setInfraGlebaPoints} onVias={setInfraRoadPoints}/>:<ToolToggle name="Mostrar pontos e identificação" description="Mostra os vértices como P1, P2, P3… Quando ativado, inclui os pontos na exportação para o QGIS." active={showVertices} onClick={()=>setShowVertices(!showVertices)} icon={<Waypoints/>}/>}{workspaceTab==='infra'?<InfraDimensionTool independent={freeDimensionsVisible} onIndependent={setFreeDimensionsVisible} onAdd={()=>{setFreeDimensionsVisible(true);setInfraMeasuring(false);setInfraCapturing(false);setInfraDimensionRequest(v=>v+1);}} pavimentacao={infraSurfaceDimensions} onPavimentacao={setInfraSurfaceDimensions} lotes={infraLotDimensions} onLotes={setInfraLotDimensions} glebas={infraGlebaDimensions} vias={infraRoadDimensions} onGlebas={setInfraGlebaDimensions} onVias={setInfraRoadDimensions}/>:<InfraDimensionTool includeVias={false} glebas={showDimensions} vias={false} onGlebas={setShowDimensions} onVias={()=>{}} independent={freeDimensionsVisible} onIndependent={setFreeDimensionsVisible} onAdd={()=>{cancelText();setMode('select');setCapturing(false);setFreeDimensionsVisible(true);setStudyDimensionRequest(v=>v+1);}}/>}<ToolToggle name="Trena" description="Meça entre dois ou mais pontos. Cada trecho e o total aparecem em metros. Enter ou duplo clique conclui; Esc cancela." active={workspaceTab==='infra'?infraMeasuring:mode==='measure'} onClick={()=>{if(doc&&!busy){if(workspaceTab==='infra'){setInfraCapturing(false);setInfraMeasuring(!infraMeasuring);return;}cancelText();setCapturing(false);setSelected(null);setMode(mode==='measure'?'select':'measure');}}} icon={<TapeMeasureIcon/>}/></div></div>
    {pdfOpen&&doc&&editor.current&&<StudyPdf doc={doc} map={editor.current.map} close={()=>setPdfOpen(false)}/>}
    {shapePreview&&<div className="modal-backdrop"><section className="modal"><div className="modal-title"><h2>Importar {shapePreview.name}</h2><button disabled={!!busy} onClick={()=>setShapePreview(null)} aria-label="Fechar prévia"><X/></button></div><p>{shapePreview.features} feições → {shapePreview.polygons} glebas</p><p>Origem: <strong>{shapePreview.sourceCrs}</strong><br/>Projeto: <strong>{shapePreview.targetCrs}</strong></p><p>{shapePreview.reprojected?'As coordenadas serão transformadas para o CRS do projeto ao confirmar.':'As coordenadas usam o mesmo CRS do projeto.'}</p>{shapePreview.multipartFeatures>0&&<p>{shapePreview.multipartFeatures} feições com várias partes serão separadas em glebas, preservando os atributos e os furos.</p>}<>{shapePreview.convertedTo2D&&<p>O arquivo contém Z/M. A gleba usará somente X/Y; alturas e medidas adicionais ficam preservadas no arquivo original, sem serem usadas no desenho 2D.</p>}{shapePreview.closedLineToPolygon&&<p>Linhas fechadas serão convertidas em polígonos. Cada contorno será uma gleba independente.</p>}</><p className="muted">As glebas existentes serão mantidas. O conjunto original e os atributos serão preservados no projeto. Nenhuma geometria foi reparada automaticamente.</p>{error&&<p className="inline-error">{error}</p>}<div className="modal-footer"><button disabled={!!busy} onClick={()=>setShapePreview(null)}>Cancelar</button><button className="primary" disabled={!!busy} onClick={applyShapes}>Confirmar importação</button></div></section></div>}
    <input ref={fileInput} type="file" accept=".tif,.tiff" hidden onChange={e=>{const file=e.target.files?.[0];if(file)importRaster(file);e.target.value='';}}/>
    {workspaceTab==='enl'&&<EnlWorkspace doc={doc} importCad={async(file,confirmed)=>{if(busyRef.current)throw new Error('Aguarde a gravação atual.');busyRef.current=true;setBusy('Importando DXF');try{const current=docRef.current!;const data=new FormData();data.append('file',file);data.append('confirmed',String(confirmed));data.append('expected_revision',String(current.project.revision));data.append('command_id',crypto.randomUUID());const next=await request<Document>(`/projects/${current.project.id}/cad/import`,data);docRef.current=next;setDoc(next);return next;}finally{busyRef.current=false;setBusy('');}}} commit={async(type,args={})=>{if(busyRef.current)throw new Error('Aguarde a gravação atual.');busyRef.current=true;setBusy('Gravando ENL');try{return await command(type,args);}finally{busyRef.current=false;setBusy('');}}}/>}
    {workspaceTab==='landscape'&&<LandscapeWorkspace doc={doc} commit={async(type,args)=>{if(busyRef.current)throw new Error('Aguarde a gravação.');busyRef.current=true;setBusy('Gravando paisagismo');try{return await command(type,args);}finally{busyRef.current=false;setBusy('');}}}/>}
    {workspaceTab==='accessibility'&&<AccessibilityWorkspace doc={doc} commit={async(type,args)=>{if(busyRef.current)throw new Error('Aguarde a gravação.');busyRef.current=true;setBusy('Gravando acessibilidade');try{return await command(type,args);}finally{busyRef.current=false;setBusy('');}}}/>}
    {workspaceTab==='infra'&&<InfraWorkspace onNotesActive={setInfraNotesActive} textVisible={textVisible} textRequest={infraTextRequest} dimensionRequest={infraDimensionRequest} freeDimensionsVisible={freeDimensionsVisible} doc={doc} onSubdivisionDraftChange={setInfraAreaDraft} pdfOpen={infraPdfOpen} onPdfOpen={setInfraPdfOpen} capturing={infraCapturing} onCapturing={setInfraCapturing} glebaPoints={infraGlebaPoints} roadPoints={infraRoadPoints} measuring={infraMeasuring} onMeasuring={setInfraMeasuring} glebaDimensions={infraGlebaDimensions} roadDimensions={infraRoadDimensions} surfaceDimensions={infraSurfaceDimensions} lotDimensions={infraLotDimensions} commit={async(type,args={})=>{if(busyRef.current)throw new Error('Aguarde a gravação atual.');busyRef.current=true;setBusy('Gravando infraestrutura');try{return await command(type,args);}finally{busyRef.current=false;setBusy('');}}}/>}
    <div className="workspace" style={{display:workspaceTab!=='study'?'none':undefined}}><aside className="sidebar"><div className="panel-heading"><Layers size={16}/><strong>Camadas e objetos</strong><span>{doc?doc.entities.length+doc.resources.length+doc.annotations.length+(doc.accessibility?.length||0)+(doc.accessibilityElements?.length||0):0}</span></div><div className="project-tree"><div className="tree-category"><ChevronRight size={13}/>PROJETO</div>{doc?<><div className="tree-project"><MapPin size={15}/>{doc.project.name}</div><div className="crs-chip">{doc.project.crs.authid} · metros</div></>:<p className="muted empty-panel">Crie ou abra um projeto para organizar suas bases e desenhos.</p>}</div>{doc&&<><div className="tree-category"><ChevronRight size={13}/>GLEBAS <label className="layer-toggle" title="Visibilidade das glebas"><input type="checkbox" checked={layerVisible} onChange={e=>{setLayerVisible(e.target.checked);editor.current?.visible(e.target.checked);}}/></label></div>{doc.entities.length===0?<p className="empty-panel muted">Desenhe o perímetro no mapa ou insira coordenadas.</p>:doc.entities.map(e=><button key={e.id} className={'tree-object '+(selected===e.id?'selected':'')} onClick={()=>{setSelected(e.id);setMode('select');}} onDoubleClick={()=>editor.current?.fit(e.id)}><Pentagon size={16}/><span>{e.attributes.name}<small>{number(e.derived.areaM2)} m²</small></span>{e.locked&&<LockKeyhole size={13}/>}</button>)}{!!doc.accessibility?.length&&<><div className="tree-category"><ChevronRight size={13}/>RAMPAS · {doc.accessibility.length}</div>{doc.accessibility.map(r=><button key={r.id} className="tree-object" title="Localizar rampa · edite na aba Acessibilidade" onClick={()=>{const view=editor.current;if(view)view.sharedRamps.locate(view.map,r.id);}}><MapPin size={15}/><span>{r.name}<small>{r.kind==='straight'?'Reta com abas':'Longitudinal'}{r.derived?.status!=='dimensioned'?' · revisar vínculo':r.derived?.normativeStatus==='outside'?' · fora da norma':''}</small></span></button>)}</>}
{!!doc.accessibilityElements?.length&&<><div className="tree-category"><ChevronRight size={13}/>PISOS E ACESSOS</div>{doc.accessibilityElements.map(e=><button key={e.id} className="tree-object" title="Localizar · editar em Acessibilidade" onClick={()=>{const view=editor.current;if(view)view.accessibilityElements.locate(view.map,e.id);}}><MapPin size={15}/><span>{e.name}<small>{e.derived?.status==='invalid'?'Revisar vínculo':number(e.derived?.areaM2||0)+' m²'}</small></span></button>)}</>}
<div className="tree-category"><Type size={13}/>TEXTOS</div>{doc.annotations.map(a=><button className={'tree-object '+(textSelection?.id===a.id?'selected':'')} key={a.id} onClick={()=>{setSelected(null);setMode('select');setTextSelection(a);}}><Type size={16}/><span>{a.text}</span></button>)}<div className="tree-category"><Layers size={13}/>CAD / REFERÊNCIAS</div>{doc.resources.filter(r=>r.role==='vectorSource').map(r=><details className="cad-reference" key={r.id} open><summary title="Referência CAD · somente visualização">{r.metadata.name}<small>{r.metadata.count} objetos · referência</small></summary><div className="cad-reference-actions"><button disabled={!!busy} onClick={()=>editor.current?.map.getView().fit(r.metadata.bounds,{padding:[60,60,60,60],duration:250})}>Localizar</button><button title="Remover referência · reversível com Desfazer" disabled={!!busy||mode!=='select'} onClick={()=>run('Removendo DXF',()=>command('resource.delete',{id:r.id}))}><Trash2 size={13}/></button></div>{r.metadata.layers?.map(l=><label className="cad-layer" key={l.name} title={`Tipo de linha: ${l.linetype} · Espessura CAD: ${l.lineweight}`}><input type="checkbox" aria-label={'Camada CAD '+l.name} checked={l.visible} disabled={!!busy} onChange={e=>run('Atualizando camada CAD',()=>command('cad.layer',{id:r.id,name:l.name,visible:e.target.checked}))}/><span>{l.name}</span></label>)}</details>)}<div className="tree-category"><ChevronRight size={13}/>ORTOFOTOS</div>{doc.resources.filter(r=>r.role!=='vectorSource').length===0?<button className="import-empty" onClick={()=>fileInput.current?.click()} disabled={!!busy}><ImagePlus size={17}/>Adicionar GeoTIFF</button>:doc.resources.filter(r=>r.role!=='vectorSource').map(r=><div className="raster-object" key={r.id}><div><input type="checkbox" defaultChecked aria-label={'Exibir '+r.metadata.name} onChange={e=>editor.current?.resourceVisible(r.id,e.target.checked)}/><span title={r.metadata.name}>{r.metadata.name}</span><button className="raster-delete" title={'Excluir ortofoto '+r.metadata.name} aria-label={'Excluir ortofoto '+r.metadata.name} disabled={!!busy||mode==='draw'} onClick={()=>run('Excluindo ortofoto',async()=>{await command('resource.delete',{id:r.id});setNotice('Ortofoto removida do projeto. Use Desfazer para restaurar.');})}><Trash2 size={14}/></button></div><small>{r.metadata.width} × {r.metadata.height} px · {r.metadata.sourceCrs}</small><label>Opacidade<input aria-label={'Opacidade '+r.metadata.name} type="range" min="0" max="100" defaultValue={r.metadata.opacity*100} key={`${r.id}-${r.metadata.opacity}`} disabled={!!busy} onChange={e=>editor.current?.opacity(r.id,Number(e.target.value)/100)} onPointerUp={e=>{const opacity=Number(e.currentTarget.value)/100;run('Gravando opacidade',()=>command('resource.opacity',{id:r.id,opacity}));}} onKeyUp={e=>{if(e.key.startsWith('Arrow'))run('Gravando opacidade',()=>command('resource.opacity',{id:r.id,opacity:Number(e.currentTarget.value)/100}));}}/></label></div>)}</>}
    <div className="sidebar-bottom"><span className="small-badge">VERSÃO 1.0 · BANCADA DE PROJETO</span><p>Vias, loteamentos, acessibilidade e paisagismo estão nas abas do projeto.</p><button className="text-button" onClick={()=>setNotice('Os projetos começam na pasta projects. Salvar como permite escolher outra pasta. Preserve a pasta completa, incluindo project.sqlite, assets e checkpoints.')}><FolderOpen size={14}/>Onde meu projeto fica salvo?</button></div></aside>
    <main className="map-region"><div ref={mapElement} className="map"/>{doc&&editor.current&&<ProjectNotes editor={editor.current} doc={doc} commit={command} dimensionRequest={studyDimensionRequest} textVisible={textVisible} dimensionsVisible={freeDimensionsVisible} suspended={workspaceTab!=='study'||mode!=='select'||capturing||pdfOpen}/> }{mode==='measure'&&<section className="measure-card" aria-label="Medição livre"><header><strong>Trena</strong><button aria-label="Fechar trena" onClick={()=>setMode('select')}><X size={15}/></button></header><div className="measure-total"><small>{measurement.areaM2!==undefined?'PERÍMETRO':'TOTAL'}</small><strong>{number(measurement.perimeterM??measured.total)} <span>m</span></strong></div>{measurement.areaM2!==undefined&&<div className="measure-area"><small>ÁREA</small><strong>{number(measurement.areaM2)} <span>m²</span></strong></div>}{measured.segments.length>0&&<div className="measure-segments">{measured.segments.map((length,i)=><div key={i}><span>P{i+1} → P{measurement.areaM2!==undefined&&i===measured.segments.length-1?1:i+2}</span><button className="measure-edge-length" disabled={!measurement.finished} title="Editar comprimento deste trecho" onClick={()=>editMeasureEdge(i)}>{number(length)} m</button></div>)}</div>}{measurement.finished&&<div className="measure-vertex-actions"><select aria-label="Vértice da Trena" value={measureVertex??''} onChange={event=>{setMeasureVertex(event.target.value===''?null:Number(event.target.value));setMeasureEdge(null);}}><option value="">Selecionar vértice</option>{measurement.points.slice(0,measurement.areaM2!==undefined?-1:undefined).map((point,index)=><option key={index} value={index}>P{index+1}</option>)}</select><button type="button" title="Excluir vértice selecionado · Delete" aria-label="Excluir vértice da Trena" disabled={measureVertex===null||!!busy} onClick={()=>void deleteMeasureVertex()}><Trash2 size={14}/></button></div>}{measureEdge!==null&&<form className="measure-length-editor" onSubmit={event=>{event.preventDefault();void applyMeasureLength();}}><label>P{measureEdge+1} → P{measurement.areaM2!==undefined&&measureEdge===measured.segments.length-1?1:measureEdge+2}<span>Comprimento (m)</span><input autoFocus key={measureEdge} aria-label="Comprimento do trecho em metros" value={measureLength} onChange={event=>setMeasureLength(event.target.value)} onFocus={event=>event.currentTarget.select()}/></label><div><button type="submit">Ajustar</button><button type="button" onClick={()=>setMeasureEdge(null)}>Cancelar</button></div><small>O ponto inicial fica fixo; o final se move na direção do trecho. Os lados vizinhos acompanham o novo vértice.</small></form>}<p>{measurement.finished?'Arraste para ajustar; clique no vértice e use a lixeira ou Delete para excluir. Clique na medida para editar o comprimento.':'Clique para medir. Volte ao ponto inicial para fechar e medir a área. Enter conclui aberto; Esc cancela.'}</p><div className="measure-actions"><button disabled={measurement.points.length<3||measurement.finished} onClick={()=>editor.current?.finish()}>Concluir</button><button onClick={()=>editor.current?.tool('measure')}>Limpar / Nova</button></div>{measurement.areaM2===undefined&&<button className="measure-close-area" disabled={measurement.points.length<(measurement.finished?3:4)} onClick={()=>void editor.current?.closeMeasure()}>Fechar e medir área</button>}{measurement.areaM2!==undefined&&<button className="measure-create-gleba primary" disabled={!!busy} onClick={()=>void createGlebaFromMeasure()}><Pentagon size={14}/>Criar gleba desta medição</button>}<small className="measure-note">Medida planimétrica temporária · não altera o projeto.</small></section>}<div className="map-top"><span className="canvas-tag"><span className="live-dot"/>{doc?'Espaço de projeto':'Lotes SEHURB'}</span>{doc&&<span className="canvas-tag light">{doc.project.crs.authid}</span>}</div>{!doc&&<div className="welcome"><div className="welcome-symbol"><Pentagon size={44}/></div><span className="eyebrow">DA BASE AO PROJETO</span><h1>Um espaço para<br/>desenhar o seu loteamento.</h1><p>Comece pelas coordenadas, traga sua ortofoto<br/>e trace o perímetro com medidas reais.</p><div><button className="primary large" onClick={()=>{setError('');setDialog('new');}}>Criar projeto <ArrowRight size={18}/></button><button className="large" onClick={()=>{refreshRecent();setDialog('open');}}><FolderOpen size={18}/>Abrir projeto</button></div><small>Arquivos locais · Coordenadas em metros · Histórico preservado</small></div>}
    {!homeOpen&&doc&&doc.entities.length===0&&doc.resources.length===0&&doc.annotations.length===0&&!textSelection&&mode==='select'&&<div className="canvas-hint"><ImagePlus size={26}/><h3>Traga a base do seu projeto</h3><p>Importe um GeoTIFF georreferenciado ou comece desenhando a gleba.</p><button onClick={()=>fileInput.current?.click()}>Importar ortofoto</button></div>}
    {capturing&&<CaptureTool close={()=>setCapturing(false)} exportImage={exportCapture}/>}
    {mode==='draw'&&<div className="drawing-bar"><div><Pentagon size={18}/><strong>Desenhar gleba</strong><span>{draft.vertices} vértices · prévia {number(draft.area)} m²</span></div><div className="coordinate-inputs">{!arcStage?<button onClick={()=>editor.current?.startArc()}>Arco · 3 pontos</button>:<><span>{arcStage==='start'?'Clique no início':arcStage==='middle'?'Clique no ponto de passagem':arcStage==='end'?'Clique no fim':'Arraste o ponto amarelo; pontas fixas'}</span>{arcStage==='adjust'&&<button onClick={()=>editor.current?.applyArc()}>Aplicar arco</button>}<button onClick={()=>editor.current?.cancelArc()}>Cancelar arco</button></>}<label>E<input aria-label="Coordenada E" placeholder="Metros" value={east} onChange={e=>setEast(e.target.value)}/></label><label>N<input aria-label="Coordenada N" placeholder="Metros" value={north} onChange={e=>setNorth(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addPoint();}}/></label><button onClick={addPoint} disabled={!!busy}><Plus size={15}/>Ponto</button><button className="primary" onClick={()=>editor.current?.finish()} disabled={draft.vertices<3||!!busy||!!arcStage}><Check size={15}/>Concluir</button><button aria-label="Cancelar desenho" onClick={()=>setMode('select')}><X size={16}/></button></div></div>}
    {mode==='text'&&<div className="edit-instruction"><Type size={16}/>Configure o texto em Propriedades e clique no mapa para escolher sua posição.<button onClick={cancelText}>Cancelar</button></div>}
    {mode==='edit'&&<div className="edit-instruction"><SquarePen size={16}/>Arraste um vértice. A geometria será validada e gravada ao soltar.<button onClick={()=>setMode('select')}>Concluir edição</button></div>}
    {(error||notice)&&<div className={'message '+(error?'error':'success')} role={error?'alert':'status'}><span>{error||notice}</span><button aria-label="Fechar mensagem" onClick={()=>{setError('');setNotice('');}}><X size={16}/></button></div>}
    {busy&&busy!=='Gravando texto automaticamente'&&<div className="busy-overlay" role="status"><LoaderCircle className="spin" size={28}/><strong>{busy}</strong><span>O projeto permanece protegido durante a operação.</span></div>}
    </main><aside className="inspector"><div className="panel-heading"><SquarePen size={16}/><strong>Propriedades</strong><PanelRightClose size={16}/></div>{textSelection?<TextProperties value={textSelection} disabled={!!busy&&busy!=='Gravando texto automaticamente'} creating={!doc?.annotations.some(a=>a.id===textSelection.id)} placed={textPlaced} change={a=>{if(textSelection&&(a.x!==textSelection.x||a.y!==textSelection.y))setTextPlaced(true);setTextSelection(a);scheduleTextSave(a);}} cancel={cancelText} save={a=>run('Gravando texto',async()=>{const next=await command('annotation.upsert',a);if(next){setTextSelection(next.annotations.find(v=>v.id===a.id)||null);setMode('select');}})} remove={()=>run('Excluindo texto',async()=>{if(doc?.annotations.some(a=>a.id===textSelection.id))await command('annotation.delete',{id:textSelection.id});setTextSelection(null);})}/>:entity?<Inspector entity={entity} disabled={!!busy} save={(name,c)=>run('Aplicando coordenadas',()=>command('boundary.upsert',{id:entity.id,name,geometry:{type:'Polygon',coordinates:c}}))} lock={()=>run('Atualizando trava',()=>command('entity.lock',{id:entity.id,locked:!entity.locked}))} remove={()=>run('Excluindo perímetro',async()=>{await command('entity.delete',{id:entity.id});setSelected(null);})} fit={()=>editor.current?.fit(entity.id)}/>:<div className="inspector-empty"><MousePointer2 size={31}/><h3>{doc?'Selecione um objeto':'Projeto georreferenciado'}</h3><p>{doc?'As medidas e coordenadas aparecem aqui. Clique em uma gleba no mapa ou na árvore de camadas.':'Defina o local e o sistema de coordenadas ao criar seu projeto.'}</p>{doc&&<div className="project-facts"><small>SISTEMA DE COORDENADAS</small><strong>{doc.project.crs.name}</strong><small>MEDIÇÃO</small><strong>Planimétrica · metros</strong><small>SALVAMENTO</small><strong>Automático após cada edição</strong></div>}</div>}</aside></div>
    <footer><span><span className="live-dot"/>{busy?'Processando':doc?'Gravado · revisão '+doc.project.revision:'Motor local conectado'}</span><span>{mode==='draw'?'Clique para inserir pontos · Enter conclui · Esc cancela':mode==='edit'?'Edição de vértices':'Selecionar · roda do mouse para zoom · arraste para navegar'}</span><span className="coordinates">E {number(xy[0])} · N {number(xy[1])}{doc?' m':''}</span></footer>
    {dialog==='new'&&<NewProject error={error} close={()=>setDialog(null)} disabled={!!busy} create={async values=>{await run('Criando projeto',async()=>{load(await request<Document>('/projects',values));setDialog(null);refreshRecent();});}}/>}
    {dialog==='open'&&<div className="modal-backdrop"><section className="modal"><div className="modal-title"><div><span className="eyebrow">SEUS ARQUIVOS LOCAIS</span><h2>Abrir projeto</h2></div><button onClick={()=>setDialog(null)} aria-label="Fechar"><X/></button></div>{recent.length?recent.map(item=><button className="recent-item" key={item.id} disabled={!!busy} onClick={()=>run('Abrindo projeto',async()=>{load(await request<Document>(`/projects/${item.id}`));setDialog(null);})}><FolderOpen size={23}/><span><strong>{item.name}</strong><small>{item.crs} · revisão {item.revision}</small></span><ArrowRight size={17}/></button>):<p>Nenhum projeto salvo ainda. Crie o primeiro projeto para começar.</p>}<p className="muted">Os projetos são guardados na pasta local do aplicativo, com bases e histórico.</p>{error&&<p className="inline-error">{error}</p>}</section></div>}
  </div>;
}

function Inspector({entity,disabled,save,lock,remove,fit}:{entity:Entity;disabled:boolean;save:(name:string,c:number[][][])=>unknown;lock:()=>unknown;remove:()=>unknown;fit:()=>void}){
  const [name,setName]=useState(entity.attributes.name),[points,setPoints]=useState<string[][]>([]);
  useEffect(()=>{setName(entity.attributes.name);setPoints(entity.geometry.coordinates[0].slice(0,-1).map(p=>p.map(String)));},[entity]);
  function apply(){const ring=points.map(p=>p.map(parse));save(name,[[...ring,ring[0]],...entity.geometry.coordinates.slice(1)]);}
  return <div className="properties"><span className="eyebrow">GLEBA · {entity.locked?'TRAVADA':'EDITÁVEL'}</span><label className="field">Nome<input value={name} disabled={disabled||entity.locked} onChange={e=>setName(e.target.value)}/></label><div className="metrics"><div><small>ÁREA</small><strong>{number(entity.derived.areaM2)}<span>m²</span></strong></div><div><small>PERÍMETRO</small><strong>{number(entity.derived.perimeterM)}<span>m</span></strong></div></div><p className="confirmed"><Check size={14}/>Medidas confirmadas pelo motor</p><div className="property-actions"><button onClick={fit}><Maximize size={14}/>Localizar</button><button onClick={lock} disabled={disabled}>{entity.locked?<UnlockKeyhole size={14}/>:<LockKeyhole size={14}/>} {entity.locked?'Destravar':'Travar'}</button></div><div className="section-title"><strong>Vértices</strong><span>{entity.derived.vertices}</span></div><p className="muted">E / N em metros no CRS do projeto.</p><div className="vertex-list">{points.map((p,i)=><div key={i} className="vertex-row"><span>{i+1}</span><input aria-label={`Vértice ${i+1} E`} disabled={disabled||entity.locked} value={p[0]} onChange={e=>setPoints(points.map((q,j)=>j===i?[e.target.value,q[1]]:q))}/><input aria-label={`Vértice ${i+1} N`} disabled={disabled||entity.locked} value={p[1]} onChange={e=>setPoints(points.map((q,j)=>j===i?[q[0],e.target.value]:q))}/></div>)}</div><button className="primary full" onClick={apply} disabled={disabled||entity.locked}><Check size={15}/>Aplicar coordenadas e nome</button><div className="section-title"><strong>Comprimento dos lados</strong></div><div className="edge-list">{entity.derived.edgesM.map((v,i)=><div key={i}><span>{i+1} → {(i+1)%entity.derived.vertices+1}</span><strong>{number(v)} m</strong></div>)}</div><button className="danger-button full" disabled={disabled||entity.locked} onClick={remove}><Trash2 size={15}/>Excluir gleba</button><small className="muted">Exclusão reversível com Desfazer.</small></div>;
}

function NewProject({close,create,disabled,error}:{close:()=>void;create:(values:unknown)=>void;disabled:boolean;error:string}){
  const [name,setName]=useState(''),[datum,setDatum]=useState('sirgas'),[zone,setZone]=useState('19'),[hemisphere,setHemisphere]=useState('south');
  const [lat,setLat]=useState('-9,974'),[lon,setLon]=useState('-67,81'),[custom,setCustom]=useState(''),[advanced,setAdvanced]=useState(false);
  function code(){const z=Number(zone);if(datum==='wgs84')return 'EPSG:'+((hemisphere==='south'?32700:32600)+z);return 'EPSG:'+((hemisphere==='south'?31960:31954)+z);}
  const authid=advanced?custom:code();
  function submit(e:React.FormEvent){e.preventDefault();create({name,authid,longitude:parse(lon),latitude:parse(lat)});}
  return <div className="modal-backdrop"><form className="modal new-project" onSubmit={submit}>{error&&<p className="inline-error" role="alert">{error}</p>}<div className="modal-title"><div><span className="eyebrow">UM DOCUMENTO, UMA REFERÊNCIA</span><h2>Novo projeto</h2></div><button type="button" onClick={close} aria-label="Fechar"><X/></button></div><label className="field">Nome do projeto<input autoFocus required maxLength={100} placeholder="Ex.: Loteamento — estudo inicial" value={name} onChange={e=>setName(e.target.value)}/></label><div className="section-title"><MapPin size={16}/><strong>Localização e coordenadas</strong></div><p className="muted">Os valores iniciais são um exemplo de Rio Branco/AC. Confira o local da sua obra.</p><div className="form-row"><label className="field">Latitude<input required value={lat} onChange={e=>setLat(e.target.value)}/></label><label className="field">Longitude<input required value={lon} onChange={e=>setLon(e.target.value)}/></label></div><button className="text-button" type="button" onClick={()=>{const z=Math.min(60,Math.max(1,Math.floor((parse(lon)+180)/6)+1));setZone(String(z));setHemisphere(parse(lat)<0?'south':'north');}}>Sugerir zona UTM pela localização</button><div className="form-row"><label className="field">Datum<select value={datum} onChange={e=>setDatum(e.target.value)}><option value="sirgas">SIRGAS 2000</option><option value="wgs84">WGS 84</option></select></label><label className="field">Zona UTM<input type="number" min={datum==='sirgas'?(hemisphere==='south'?17:11):1} max={datum==='sirgas'?(hemisphere==='south'?25:22):60} value={zone} onChange={e=>setZone(e.target.value)}/></label><label className="field">Hemisfério<select value={hemisphere} onChange={e=>setHemisphere(e.target.value)}><option value="south">Sul</option><option value="north">Norte</option></select></label></div><label className="advanced-check"><input type="checkbox" checked={advanced} onChange={e=>setAdvanced(e.target.checked)}/>Informar outro EPSG projetado</label>{advanced&&<label className="field">Código EPSG<input required placeholder="EPSG:31979" value={custom} onChange={e=>setCustom(e.target.value)}/></label>}<div className="crs-summary"><span>Referência do projeto</span><strong>{authid||'Informe o EPSG'}</strong><small>Geometria e medidas em metros · área planimétrica</small></div><p className="muted">O projeto será salvo na pasta local do aplicativo. Nesta versão, o CRS é definido na criação; mudar a referência de um desenho existente exige transformação e será uma ferramenta própria.</p><div className="modal-footer"><button type="button" onClick={close}>Cancelar</button><button className="primary" disabled={disabled} type="submit">{disabled?'Criando…':'Criar projeto'}<ArrowRight size={16}/></button></div></form></div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
