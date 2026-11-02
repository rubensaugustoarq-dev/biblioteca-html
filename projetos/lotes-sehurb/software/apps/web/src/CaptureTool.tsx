import {useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import {Camera,Download,X,Scan} from 'lucide-react';
import type {CaptureRect} from './capture';

type Corner='nw'|'ne'|'sw'|'se';
type Gesture={start:number[];rect:CaptureRect|null;kind:'create'|'move'|Corner};
export function CaptureTool({close,exportImage}:{close:()=>void;exportImage:(rect:CaptureRect,factor:number,format:'png'|'jpg')=>Promise<unknown>}){
  const [rect,setRect]=useState<CaptureRect|null>(null),[factor,setFactor]=useState(4),[format,setFormat]=useState<'png'|'jpg'>('png'),[saving,setSaving]=useState(false);
  const gesture=useRef<Gesture|null>(null);
  function position(e:PointerEvent<HTMLDivElement>){const b=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(b.width,e.clientX-b.left)),Math.max(0,Math.min(b.height,e.clientY-b.top))];}
  function move(e:PointerEvent<HTMLDivElement>){
    const g=gesture.current;if(!g)return;const [x,y]=position(e),[sx,sy]=g.start,b=e.currentTarget.getBoundingClientRect(),r=g.rect;
    if(g.kind==='create'){if(Math.hypot(x-sx,y-sy)<4)return;setRect({x:Math.min(sx,x),y:Math.min(sy,y),width:Math.abs(x-sx),height:Math.abs(y-sy)});return;}
    if(!r)return;
    if(g.kind==='move'){setRect({...r,x:Math.max(0,Math.min(b.width-r.width,r.x+x-sx)),y:Math.max(0,Math.min(b.height-r.height,r.y+y-sy))});return;}
    let left=r.x,right=r.x+r.width,top=r.y,bottom=r.y+r.height;
    if(g.kind.includes('w'))left=Math.max(0,Math.min(right-32,r.x+x-sx));else right=Math.min(b.width,Math.max(left+32,right+x-sx));
    if(g.kind.includes('n'))top=Math.max(0,Math.min(bottom-32,r.y+y-sy));else bottom=Math.min(b.height,Math.max(top+32,bottom+y-sy));
    setRect({x:left,y:top,width:right-left,height:bottom-top});
  }
  return <div className={'capture-overlay '+(rect?'has-selection':'')} onPointerDown={e=>{
    const target=e.target as HTMLElement;if(saving||target.closest('.capture-controls')||e.button!==0)return;
    const corner=target.closest<HTMLElement>('[data-corner]')?.dataset.corner as Corner|undefined;
    if(rect&&!corner&&!target.closest('.capture-selection'))return;
    e.preventDefault();e.stopPropagation();gesture.current={start:position(e),rect,kind:corner||(rect?'move':'create')};e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={move} onPointerUp={e=>{if(!gesture.current)return;move(e);gesture.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{gesture.current=null;}}>
    {rect&&<div className="capture-selection" style={{left:rect.x,top:rect.y,width:rect.width,height:rect.height}}><span>{Math.round(rect.width*factor)} × {Math.round(rect.height*factor)} px</span>{(['nw','ne','sw','se'] as Corner[]).map((corner,i)=><button key={corner} type="button" data-corner={corner} className={'capture-handle '+corner} aria-label={'Redimensionar canto '+['superior esquerdo','superior direito','inferior esquerdo','inferior direito'][i]} disabled={saving}/>)}</div>}
    <div className="capture-controls"><div className="capture-heading"><Camera size={16}/><strong>Captura da tela</strong><button aria-label="Fechar captura" disabled={saving} onClick={close}><X size={15}/></button></div><p>{rect?'Arraste a área para mover ou os cantos para ajustar.':'Arraste no mapa para marcar a área.'}</p>
      <div className="capture-options"><label>Formato<select aria-label="Formato da captura" value={format} disabled={saving} onChange={e=>setFormat(e.target.value as 'png'|'jpg')}><option value="png">PNG</option><option value="jpg">JPG</option></select></label><label>Resolução<select aria-label="Resolução da captura" value={factor} disabled={saving} onChange={e=>setFactor(Number(e.target.value))}><option value={1}>1× · padrão</option><option value={2}>2× · alta</option><option value={4}>4× · máxima</option></select></label></div>
      <div className="capture-actions"><button disabled={saving||!rect} onClick={()=>setRect(null)}><Scan size={13}/>Nova área</button><button className="primary" disabled={saving||!rect||rect.width<32||rect.height<32||rect.width*factor>6000||rect.height*factor>6000||rect.width*rect.height*factor*factor>24000000} onClick={async()=>{setSaving(true);try{await exportImage(rect!,factor,format);}finally{setSaving(false);}}}><Download size={14}/>{saving?'Preparando…':'Exportar'}</button></div><small>Exporta as camadas visíveis com os estilos e opacidades atuais. PNG preserva transparência; JPG usa fundo branco.</small>
    </div>
  </div>;
}
