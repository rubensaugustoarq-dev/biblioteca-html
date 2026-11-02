import {useEffect,useRef,useState} from 'react';
import {ZoomIn,ZoomOut,Scan,Move,RotateCcw,Hand} from 'lucide-react';
import {boundPreview,fitPreview,zoomPreview,type PreviewView} from './pdfPreviewView';
import './pdfPreview.css';
export type PrintFraming={page:number[];map:number[];fixed:number[][]};
export function PdfPreview({src,mapSrc,framing,busy=false,onMapMove,onResetMap,printScale}:{src:string;mapSrc?:string;framing?:PrintFraming;busy?:boolean;onMapMove?:(dx:number,dy:number)=>Promise<unknown>;onResetMap?:()=>Promise<unknown>;printScale?:number}){
 const host=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:900,height:600}),[ratio,setRatio]=useState(420/297),[view,setView]=useState<PreviewView>({zoom:1,x:0,y:0}),[imageError,setImageError]=useState(false),[dragging,setDragging]=useState(false),[adjusting,setAdjusting]=useState(false),[mapDelta,setMapDelta]=useState({x:0,y:0}),[applying,setApplying]=useState(false);
 const drag=useRef<{id:number;x:number;y:number;view:PreviewView;map:boolean;width:number;height:number}|null>(null),current=useRef({size,view,ratio});current.current={size,view,ratio};
 const sheet=fitPreview(size.width,size.height,ratio),blocked=busy||applying;
 function reset(){setView({zoom:1,x:0,y:0});drag.current=null;setDragging(false);}
 function zoom(value:number,anchor={x:0,y:0}){setView(old=>boundPreview(zoomPreview(old,value,anchor),size,sheet));}
 useEffect(()=>{if(!adjusting)reset();setMapDelta({x:0,y:0});setImageError(false);},[src]);
 useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(([entry])=>{const next={width:entry.contentRect.width,height:entry.contentRect.height};setSize(next);setView(v=>boundPreview(v,next,fitPreview(next.width,next.height,current.current.ratio)));});observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{const element=host.current;if(!element)return;
  const wheel=(event:WheelEvent)=>{event.preventDefault();if(drag.current)return;const state=current.current,rect=element.getBoundingClientRect(),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
   setView(old=>boundPreview(zoomPreview(old,old.zoom*Math.exp(-Math.max(-200,Math.min(200,delta))*.002),{x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2}),state.size,fitPreview(state.size.width,state.size.height,state.ratio)));
  };element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
 },[]);
 async function finish(event:React.PointerEvent<HTMLDivElement>){
  const active=drag.current;if(!active||active.id!==event.pointerId)return;drag.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  if(active.map&&onMapMove){const dx=(event.clientX-active.x)/active.view.zoom/active.width*420,dy=(event.clientY-active.y)/active.view.zoom/active.height*297;
   if(Math.hypot(dx,dy)>.05){setApplying(true);try{await onMapMove(dx,dy);}finally{setApplying(false);setMapDelta({x:0,y:0});}}else setMapDelta({x:0,y:0});
  }
 }
 function cancel(){drag.current=null;setDragging(false);setMapDelta({x:0,y:0});}
 const percent=(box:number[])=>({left:box[0]/420*100+'%',top:box[1]/297*100+'%',width:box[2]/420*100+'%',height:box[3]/297*100+'%'});
 return <div className="pdf-inspector">
  <div className="pdf-inspector-toolbar" role="toolbar" aria-label="Visualização e enquadramento PDF"><span className="pdf-inspector-hint">{adjusting?`Arraste o mapa · escala fixa 1:${printScale?.toLocaleString('pt-BR')}`:'Role para ampliar · arraste para visualizar'}</span><div>{onMapMove&&mapSrc&&framing&&<><button className={'pdf-framing-toggle '+(adjusting?'enabled':'')} type="button" aria-pressed={adjusting} disabled={blocked} title="Mover o mapa na folha sem alterar a escala" onClick={()=>{cancel();setAdjusting(v=>!v);}}>{adjusting?<Move size={15}/>:<Hand size={15}/>}<span>{adjusting?'Concluir ajuste':'Ajustar enquadramento'}</span></button>{adjusting&&onResetMap&&<button type="button" disabled={blocked} title="Restaurar a posição do mapa mantendo a escala" aria-label="Restaurar posição do mapa" onClick={()=>{void onResetMap();}}><RotateCcw size={15}/></button>}</>}<button type="button" title="Diminuir zoom" aria-label="Diminuir zoom da prévia" disabled={view.zoom<=.5} onClick={()=>zoom(view.zoom/1.25)}><ZoomOut size={16}/></button><output aria-live="polite" aria-label="Zoom da prévia">{Math.round(view.zoom*100)}%</output><button type="button" title="Aumentar zoom" aria-label="Aumentar zoom da prévia" disabled={view.zoom>=6} onClick={()=>zoom(view.zoom*1.25)}><ZoomIn size={16}/></button><button type="button" title="Enquadrar folha" aria-label="Enquadrar folha inteira" onClick={reset}><Scan size={16}/></button></div></div>
  <div ref={host} className={'pdf-inspector-viewport '+(dragging?'dragging':'')} tabIndex={0} aria-busy={blocked} aria-label={adjusting?'Arraste o mapa para ajustar sua posição na folha':'Prévia PDF: use a roda para zoom e arraste para mover'} onDoubleClick={reset}
   onPointerDown={event=>{if(event.button!==0||blocked)return;
    if(adjusting&&framing){const rect=event.currentTarget.getBoundingClientRect(),x=((event.clientX-rect.left-rect.width/2-view.x)/view.zoom+sheet.width/2)/sheet.width*420,y=((event.clientY-rect.top-rect.height/2-view.y)/view.zoom+sheet.height/2)/sheet.height*297;
     const inside=(b:number[])=>x>=b[0]&&x<=b[0]+b[2]&&y>=b[1]&&y<=b[1]+b[3];if(!inside(framing.map)||framing.fixed.some(inside))return;
    }
    event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,view,map:adjusting,width:sheet.width,height:sheet.height};setDragging(true);
   }} onPointerMove={event=>{const active=drag.current;if(!active||active.id!==event.pointerId)return;if(active.map)setMapDelta({x:(event.clientX-active.x)/active.view.zoom,y:(event.clientY-active.y)/active.view.zoom});else setView(boundPreview({...active.view,x:active.view.x+event.clientX-active.x,y:active.view.y+event.clientY-active.y},size,sheet));}}
   onPointerUp={event=>void finish(event)} onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
   onKeyDown={event=>{if(['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))event.preventDefault();if(event.key==='+'||event.key==='=')zoom(view.zoom*1.25);if(event.key==='-')zoom(view.zoom/1.25);if(event.key==='0')reset();if(event.key.startsWith('Arrow'))setView(old=>boundPreview({...old,x:old.x+(event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0),y:old.y+(event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0)},size,sheet));}}>
   <div className="pdf-preview-sheet" style={{width:sheet.width,height:sheet.height,transform:`translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}>
    <img className="pdf-page-raster" alt="Prévia da folha A3 com mapa, tabelas e carimbo" draggable={false} src={src} onError={()=>setImageError(true)} onLoad={event=>{setImageError(false);setRatio(event.currentTarget.naturalWidth/event.currentTarget.naturalHeight);}}/>
    {adjusting&&framing&&mapSrc&&<><div className="pdf-framing-map" style={percent(framing.map)}><img alt="Mapa em ajuste de enquadramento" src={mapSrc} style={{transform:`translate(${mapDelta.x}px, ${mapDelta.y}px)`}}/></div>{framing.fixed.map((box,i)=><div className="pdf-fixed-element" style={percent(box)} key={i}><img alt="" src={src} style={{width:sheet.width,height:sheet.height,left:-box[0]/420*sheet.width,top:-box[1]/297*sheet.height}}/></div>)}</>}
   </div>{imageError&&!blocked&&<div className="pdf-framing-status" role="alert">Não foi possível carregar esta folha. Volte em Ajustar prancha e gere a prévia novamente.</div>}{blocked&&<div className="pdf-framing-status" role="status">Atualizando enquadramento…</div>}
  </div>
 </div>;
}
