import {useState} from 'react';
import {X,FileDown,Eye,ArrowLeft,Plus,Trash2,RotateCcw} from 'lucide-react';
import type Map from 'ol/Map';
import type {Document} from './api';
import {captureMap} from './capture';
import {PdfPreview,type PrintFraming} from './PdfPreview';
import {movePrintCenter} from './pdfPreviewView';

export function StudyPdf({doc,map,close,infra=false,subdivision=false,subdivisionAreaId}:{doc:Document;map:Map;close:()=>void;infra?:boolean;subdivision?:boolean;subdivisionAreaId?:string}){
  const key=(subdivision?'sehurb-loteamento-a3-':infra?'sehurb-infra-a3-':'sehurb-a3-')+doc.project.id;
  const [fields,setFields]=useState(()=>{
    const defaults={title:doc.project.name,content:subdivision?'LOTEAMENTO':infra?'VIAS E PAVIMENTAÇÃO':'ESTUDO DE GLEBA',location:'',author:'',registration:'',area:'',date:new Date().toLocaleDateString('pt-BR'),revision:'00',sheet:'01/01',showTitleBlock:true,legendEnabled:true,legendItems:[{label:'POLIGONAL DE INTERVENÇÃO',color:''}]};
    try{return {...defaults,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return defaults;}
  });
  const [frame,setFrame]=useState<'glebas'|'view'>(doc.entities.length?'glebas':'view'),[manual,setManual]=useState(false),[scale,setScale]=useState(1000);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[pdf,setPdf]=useState(''),[previewImage,setPreviewImage]=useState('');
  const [previews,setPreviews]=useState<string[]>([]),[previewPage,setPreviewPage]=useState(0);
  const [mapPreview,setMapPreview]=useState(''),[framing,setFraming]=useState<PrintFraming|undefined>(),[printCenter,setPrintCenter]=useState<number[]|null>(null),[rendered,setRendered]=useState<{center:number[];scale:number;rotation:number}|null>(null);

  const view=map.getView(),rotation=view.getRotation(),size=map.getSize()||[800,600];
  let center=view.getCenter()!.slice(),width=size[0]*view.getResolution()!,height=size[1]*view.getResolution()!;
  if(frame==='glebas'&&doc.entities.length){
    const area=subdivision?doc.subdivisionAreas?.find(a=>a.id===subdivisionAreaId):undefined;
    const points=area?area.geometry.coordinates.flat().map(p=>p.slice()):doc.entities.flatMap(e=>e.geometry.coordinates.flat());
    if(infra&&!subdivision){const collect=(coordinates:any):void=>{if(typeof coordinates?.[0]==='number'){points.push(coordinates);return;}for(const part of coordinates||[])collect(part);};for(const region of doc.infraMetrics?.regions||[])collect((region.geometry as any).coordinates);for(const item of [...(doc.accessibility||[]),...(doc.accessibilityElements||[]),...(doc.landscape||[])])collect((item.derived?.geometry as any)?.coordinates);}

    const cos=Math.cos(rotation),sin=Math.sin(rotation);
    const rotated=points.map(p=>[p[0]*cos+p[1]*sin,-p[0]*sin+p[1]*cos]);
    const xs=rotated.map(p=>p[0]),ys=rotated.map(p=>p[1]);
    const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
    const x=(xmin+xmax)/2,y=(ymin+ymax)/2;
    center=[x*cos-y*sin,x*sin+y*cos];width=Math.max(1,xmax-xmin)*1.18;height=Math.max(1,ymax-ymin)*1.18;
  }
  const autoScale=Math.max(10,Math.ceil(Math.max(width/(infra?.285:.39),height/.277)/25)*25),denominator=manual?scale:autoScale;
  function update(name:string,value:string){setFields((old:typeof fields)=>({...old,[name]:value}));setError('');}
  const visibleLayers=map.getLayers().getArray().filter(l=>l.getVisible());
  const glebaLayer=visibleLayers.find(l=>{const source=(l as any).getSource?.();return doc.entities.some(e=>source?.getFeatureById?.(e.id));});
  let defaultLineColor='#aecfff';
  if(glebaLayer&&doc.entities.length){const feature=(glebaLayer as any).getSource().getFeatureById(doc.entities[0].id);const styles=(glebaLayer as any).getStyleFunction()?.(feature,view.getResolution());const style=Array.isArray(styles)?styles[0]:styles;const color=style?.getStroke()?.getColor();if(typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))defaultLineColor=color;}
  const legendItems=fields.legendItems as {label:string;color:string}[];
  function changeLegend(index:number,value:Partial<{label:string;color:string}>){setFields((old:typeof fields)=>({...old,legendItems:old.legendItems.map((item:{label:string;color:string},i:number)=>i===index?{...item,...value}:item)}));}
  async function preview(placement?:{center:number[];scale:number;rotation:number}){
    if(busy)return false;setBusy(true);setError('');
    const targetScale=placement?.scale??denominator,targetRotation=placement?.rotation??rotation,targetCenter=placement?.center??printCenter??(infra?[center[0]-targetScale*.0525*Math.cos(targetRotation),center[1]-targetScale*.0525*Math.sin(targetRotation)]:center);
    try{
      if(subdivision&&!doc.subdivisionAreas?.find(a=>a.id===subdivisionAreaId)?.layout?.lots.length)throw new Error('Aplique o loteamento desta gleba antes de gerar o PDF A3.');
      if(!fields.title.trim()||!Number.isFinite(targetScale)||targetScale<10||targetScale>10000000)throw new Error('Preencha o título e uma escala válida.');
      const pixelWidth=Math.round(390/25.4*300),pixelHeight=Math.round(277/25.4*300);
      const factor=pixelWidth/size[0];
      const image=await captureMap(map,{x:0,y:0,width:size[0],height:pixelHeight/factor},factor,'png',{
        center:targetCenter,resolution:targetScale*.39/size[0],rotation:targetRotation,vectorOnly:true});
      const data=new FormData();data.append('image',image,'mapa.png');
      const rasters=visibleLayers.filter(l=>l.get('resourceId')).map(l=>({id:l.get('resourceId'),opacity:l.getOpacity()}));
      const entries=legendItems.filter(item=>item.label.trim()).map(item=>({label:item.label.trim(),color:item.color||defaultLineColor}));
      data.append('fields',JSON.stringify({...fields,infraReport:subdivision?'subdivision':'roads',subdivisionAreaId:subdivision?subdivisionAreaId:undefined,center:targetCenter,rasters,scale:targetScale,rotation:targetRotation,expectedRevision:doc.project.revision,legend:fields.legendEnabled&&entries.length>0,legendItems:entries,lineColor:defaultLineColor}));
      const response=await fetch(`/api/projects/${doc.project.id}/${infra?'infra':'study'}/pdf?preview=true&preview_mode=lazy`,{method:'POST',headers:{'X-LSEHURB':'1'},body:data});
      if(!response.ok){const result=await response.json();throw new Error(result.detail||'Não foi possível gerar o PDF.');}
      const result=await response.json();
      if(!result.pdfUrl||!result.previewUrl)throw new Error('Resposta da prévia inválida. Recarregue a página e tente novamente.');
      setPdf(result.pdfUrl);setPreviewImage(result.previewUrl);setPreviews(result.previews||[]);setPreviewPage(old=>placement?Math.min(old,Math.max(0,(result.pageCount||1)-1)):0);setMapPreview(result.mapPreviewUrl||'');setFraming(result.framing);setRendered({center:targetCenter.slice(),scale:targetScale,rotation:targetRotation});if(placement)setPrintCenter(targetCenter.slice());
      localStorage.setItem(key,JSON.stringify(fields));return true;
    }catch(e){setError(e instanceof Error?e.message:'Falha na exportação A3.');return false;}finally{setBusy(false);}
  }
  async function reframeMap(dx:number,dy:number){
    if(!rendered||busy)return;const updated=movePrintCenter(rendered.center,dx,dy,rendered.scale,rendered.rotation);
    if(await preview({...rendered,center:updated})){setScale(rendered.scale);setManual(true);}
  }
  async function resetMap(){
    if(!rendered||busy)return;const scale=rendered.scale,rotation=rendered.rotation,position=infra?[center[0]-scale*.0525*Math.cos(rotation),center[1]-scale*.0525*Math.sin(rotation)]:center;
    if(await preview({center:position,scale,rotation})){setPrintCenter(null);setScale(scale);setManual(true);}
  }
  function download(){const link=document.createElement('a');link.href=pdf;link.download=subdivision?'SEHURB-loteamento-A3.pdf':infra?'SEHURB-infra-A3.pdf':'SEHURB-estudo-A3.pdf';link.click();}
  const labels=[['title','Título'],['content','Conteúdo'],['location','Local'],['author','Responsável / CAU ou CREA'],['registration','Matrícula'],['area','Área (m²)']];
  return <div className="modal-backdrop"><section className={'modal study-pdf '+(pdf?'with-preview':'')} role="dialog" aria-modal="true" aria-label="Exportar estudo A3">
    <div className="modal-title"><div><span className="eyebrow">{subdivision?'LOTEAMENTO · SEHURB':infra?'INFRA / URBANO · SEHURB':'ESTUDO · SEHURB'}</span><h2>PDF A3</h2></div><button disabled={busy} onClick={close} aria-label="Fechar PDF A3"><X/></button></div>
    {pdf?<><PdfPreview src={previews[previewPage]||previewImage} mapSrc={mapPreview} framing={framing} busy={busy} printScale={rendered?.scale} onMapMove={reframeMap} onResetMap={resetMap}/>{error&&<p className="inline-error" role="alert">{error}</p>}<div className="pdf-preview-footer"><button disabled={busy} onClick={()=>setPdf('')}><ArrowLeft size={15}/>Ajustar prancha</button><small>Imprimir em A3 · tamanho real / 100%</small>{previews.length>1&&<><button disabled={busy||previewPage===0} onClick={()=>setPreviewPage(v=>v-1)}>Anterior</button><span>{previewPage+1}/{previews.length}</span><button disabled={busy||previewPage===previews.length-1} onClick={()=>setPreviewPage(v=>v+1)}>Próxima</button></>}<button className="primary" disabled={busy} onClick={download}><FileDown size={16}/>Baixar PDF</button></div></>:<>
      <div className="a3-layout-hint"><div className="a3-mini-page"><span>N ↑</span><i>Mapa</i><small>Legenda</small>{fields.showTitleBlock&&<b>SEHURB<br/>Carimbo</b>}</div><p>A3 horizontal · 420 × 297 mm<br/>Ortofoto e desenho em 300 dpi.<br/>Textos, cotas e opacidades como estão visíveis.</p></div>
      {subdivision&&<p className="a3-note">Exporta o loteamento aplicado desta gleba: quadro geral de utilização do solo e uma tabela compacta com nome, área e perímetro de cada lote. Listagens extensas continuam em folhas numeradas.</p>}
      {infra&&!subdivision&&<p className="a3-note">Quadro lateral: glebas, quantitativos confirmados, vias, calçadas, pontes e seções. Inclui os dados gerais de Acessibilidade e Paisagismo e a legenda dos elementos do projeto. Conteúdo extenso continua em folhas numeradas.</p>}
      <div className="a3-title-block-toggle"><label><input type="checkbox" checked={fields.showTitleBlock} disabled={busy} onChange={e=>setFields({...fields,showTitleBlock:e.target.checked})}/>Mostrar carimbo</label><small>Desmarque para projetos pessoais. Oculta apenas o carimbo; mantém mapa, moldura, norte, legenda e quadros.</small></div>
      {fields.showTitleBlock&&<><div className="a3-fields">{labels.map(([name,label])=><label className={'field '+(['title','content','location','author','registration','area'].includes(name)?'wide':'')} key={name}>{label}<input maxLength={name==='location'?180:name==='registration'?90:name==='area'?30:['revision','sheet','date'].includes(name)?16:140} disabled={busy} value={fields[name]} onChange={e=>update(name,e.target.value)}/></label>)}</div>
      <div className="a3-meta-fields">{[['date','Data'],['revision','Revisão'],['sheet','Folha']].map(([name,label])=><label className="field" key={name}>{label}<input maxLength={16} disabled={busy} value={fields[name]} onChange={e=>update(name,e.target.value)}/></label>)}</div>
      </>}
      <div className="a3-framing"><label className="field">Enquadramento<select disabled={busy} value={frame} onChange={e=>{setFrame(e.target.value as typeof frame);setPrintCenter(null);}}><option value="glebas" disabled={!doc.entities.length}>{subdivision?'Gleba do loteamento':infra?'Projeto completo':'Todas as glebas'}</option><option value="view">Vista atual do mapa</option></select></label><label className="field">Escala<select disabled={busy} value={manual?'fixed':'auto'} onChange={e=>{setManual(e.target.value==='fixed');setScale(autoScale);}}><option value="auto">Automática · 1:{autoScale.toLocaleString('pt-BR')}</option><option value="fixed">Informar escala</option></select></label>{manual&&<label className="field">1 :<input disabled={busy} type="number" min="10" max="10000000" value={scale} onChange={e=>setScale(Number(e.target.value))}/></label>}</div>
      <section className="a3-legend-editor" aria-label="Editar legenda">
        <div className="a3-legend-heading"><label><input type="checkbox" checked={fields.legendEnabled} disabled={busy} onChange={e=>setFields({...fields,legendEnabled:e.target.checked})}/>Legenda</label><span>Linha / cor</span><button type="button" disabled={busy||legendItems.length>=20} onClick={()=>setFields({...fields,legendEnabled:true,legendItems:[...legendItems,{label:'',color:''}]})} aria-label="Adicionar item à legenda" title="Adicionar item"><Plus size={15}/></button></div>
        <div className="a3-legend-items">{legendItems.map((item,index)=><div className="a3-legend-row" key={index}>
          <input aria-label={`Legenda ${index+1}`} maxLength={120} placeholder="Descrição da representação" disabled={busy||!fields.legendEnabled} value={item.label} onChange={e=>changeLegend(index,{label:e.target.value})}/>
          <label className="a3-legend-color" title={item.color?'Cor escolhida para a legenda':'Cor padrão do desenho'}><span style={{backgroundColor:item.color||defaultLineColor}}/><input type="color" aria-label={`Cor da linha ${index+1}`} disabled={busy||!fields.legendEnabled} value={item.color||defaultLineColor} onInput={e=>changeLegend(index,{color:e.currentTarget.value})} onChange={e=>changeLegend(index,{color:e.target.value})}/></label>
          <button type="button" disabled={busy||!item.color} aria-label={`Usar cor do desenho no item ${index+1}`} title="Usar cor do desenho" onClick={()=>changeLegend(index,{color:''})}><RotateCcw size={13}/></button>
          <button type="button" disabled={busy} aria-label={`Excluir item ${index+1} da legenda`} title="Excluir item" onClick={()=>setFields({...fields,legendItems:legendItems.filter((_,i)=>i!==index)})}><Trash2 size={13}/></button>
        </div>)}</div>
        <small>A cor vale para a linha da legenda. Itens sem descrição não aparecem na prancha.</small>
      </section>
      <p className="a3-note">Confira o enquadramento na prévia. O carimbo pode ser ocultado sem alterar a escala ou os demais elementos da prancha.</p>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <div className="modal-footer"><button disabled={busy} onClick={close}>Cancelar</button><button disabled={busy} className="primary" onClick={()=>void preview()}><Eye size={16}/>{busy?'Preparando folha…':'Prévia A3'}</button></div>
    </>}
  </section></div>;
}
