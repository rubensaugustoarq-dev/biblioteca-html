import type {PointerEvent as ReactPointerEvent} from 'react';
import type {Annotation} from './api';
import {RotateCcw,Copy,Trash2} from 'lucide-react';

const bearing=(angle:number)=>((Math.round(-angle)%360)+360)%360;
function RotationClock({angle,disabled,change}:{angle:number;disabled:boolean;change:(angle:number)=>void}){
  const giro=bearing(angle);
  function point(event:ReactPointerEvent<SVGSVGElement>){
    if(disabled)return;const box=event.currentTarget.getBoundingClientRect();
    const dx=event.clientX-box.left-box.width/2,dy=event.clientY-box.top-box.height/2;
    if(Math.hypot(dx,dy)<5)return;
    const degrees=(Math.round(Math.atan2(dx,-dy)*180/Math.PI)+360)%360;
    change(degrees>180?360-degrees:-degrees);
  }
  return <div className="rotation-row"><svg className="rotation-clock" viewBox="0 0 90 90" role="slider" tabIndex={disabled?-1:0} aria-label="Direção do topo do texto" aria-valuemin={0} aria-valuemax={359} aria-valuenow={giro} aria-valuetext={`${giro} graus no sentido horário`} aria-disabled={disabled}
    onPointerDown={e=>{if(!disabled){e.currentTarget.setPointerCapture(e.pointerId);point(e);}}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))point(e);}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
    onKeyDown={e=>{if(disabled)return;if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home'].includes(e.key)){e.preventDefault();const step=e.shiftKey?15:1;change(e.key==='Home'?0:-(giro+(['ArrowRight','ArrowUp'].includes(e.key)?step:-step)+360)%360);}}}>
    <circle cx="45" cy="45" r="30" className="clock-face"/>{[0,90,180,270].map(degree=><line key={degree} x1="45" y1="9" x2="45" y2="12" transform={`rotate(${degree} 45 45)`} className="clock-tick"/>)}
    <path d="M43 4 L45 1 L47 4" className="clock-top"/>
    <g transform={`rotate(${giro} 45 45)`}><line x1="45" y1="45" x2="45" y2="21" className="clock-hand"/><circle cx="45" cy="15" r="4" className="clock-knob"/></g><circle cx="45" cy="45" r="2" className="clock-arrow"/>
  </svg><div className="rotation-value"><label className="angle-input"><input aria-label="Giro do texto (graus)" type="number" min="0" max="359" step="1" value={giro} disabled={disabled} onChange={e=>change(-((Number(e.target.value)%360+360)%360))}/><span>°</span></label><button type="button" className="rotation-reset" disabled={disabled} onClick={()=>change(0)} title="Voltar o topo do texto para cima"><RotateCcw size={12}/>Restaurar</button><small>Arraste o ponto para girar</small></div></div>;
}

export function TextProperties({value,disabled,creating,placed,change,save,remove,cancel}:{value:Annotation;disabled:boolean;creating:boolean;placed:boolean;change:(a:Annotation)=>void;save:(a:Annotation)=>unknown;remove:()=>unknown;cancel:()=>void}){
  const a={font:'Arial',bold:true,color:'#fff8dd',outline:true,outlineColor:'#17212d',outlineWidth:2,...value};
  const patch=(values:Partial<Annotation>)=>change({...a,...values});
  return <div className="properties text-properties modern-text"><div className="text-editor-heading"><strong>{creating?'Novo texto':'Texto'}</strong><span className="auto-status">{creating?'Prévia':'Automático'}</span></div>
    <p className="text-tip">{creating?(placed?'Posição escolhida. Confirme a inserção.':'Configure e clique no mapa.'):'Edite diretamente. As alterações são salvas.'}</p>
    <section className="text-control-section"><h4>Conteúdo</h4>
    <label className="field">Texto<input autoFocus value={a.text} maxLength={200} disabled={disabled} placeholder="Ex.: Rua das Palmeiras" onChange={e=>patch({text:e.target.value})}/></label>
    <label className="field">Fonte<select aria-label="Fonte" value={a.font} disabled={disabled} onChange={e=>patch({font:e.target.value})}><option>Arial</option><option>Times New Roman</option><option>Courier New</option></select></label>
    </section><section className="text-control-section"><h4>Aparência</h4>
    <div className="text-style-row"><label className="field">Altura (m)<input type="number" min=".05" max="100" step=".1" value={Number(a.size.toFixed(3))} disabled={disabled} onChange={e=>patch({size:Number(e.target.value)})}/></label><label className="field">Cor<input aria-label="Cor do texto" type="color" value={a.color} disabled={disabled} onChange={e=>patch({color:e.target.value})}/></label><label className="text-check weight-toggle" title="Negrito"><input type="checkbox" aria-label="Negrito" checked={a.bold} disabled={disabled} onChange={e=>patch({bold:e.target.checked})}/><span>B</span></label></div>
    <div className="text-outline-row"><label className="text-check"><input type="checkbox" checked={a.outline} disabled={disabled} onChange={e=>patch({outline:e.target.checked})}/>Contorno</label><input aria-label="Cor do contorno" title="Cor do contorno" type="color" value={a.outlineColor} disabled={disabled||!a.outline} onChange={e=>patch({outlineColor:e.target.value})}/><label className="field">px<input aria-label="Espessura do contorno" type="number" min=".5" max="8" step=".5" value={a.outlineWidth} disabled={disabled||!a.outline} onChange={e=>patch({outlineWidth:Number(e.target.value)})}/></label></div>
    </section><section className="text-control-section rotation-section"><h4>Rotação <span>0° · topo para cima</span></h4><RotationClock angle={a.angle} disabled={disabled} change={angle=>patch({angle})}/></section>
    <details><summary>Posição E / N em metros</summary>{(['x','y'] as const).map(k=><label key={k} className="field">{k==='x'?'E (m)':'N (m)'}<input type="number" step="any" value={a[k]} disabled={disabled} onChange={e=>patch({[k]:Number(e.target.value)})}/></label>)}</details>
    {!creating&&<div className="text-drag-tip"><Copy size={13}/><span><kbd>Alt</kbd> + arrastar para duplicar</span></div>}
    <div className="text-apply">{creating&&<button className="primary full" disabled={disabled||!a.text.trim()||!placed} onClick={()=>save(a)}>Inserir texto</button>}<button disabled={disabled} onClick={cancel}>{creating?'Cancelar':'Fechar'}</button>{!creating&&<button className="text-delete" disabled={disabled} onClick={remove} title="Excluir texto"><Trash2 size={13}/>Excluir</button>}</div>
  </div>;
}
