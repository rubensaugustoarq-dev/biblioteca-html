import {useState} from 'react';
import {Ruler,Waypoints,Check,Plus} from 'lucide-react';
import './dimensionTool.css';
export function InfraDimensionTool({glebas,vias,onGlebas,onVias,lotes=false,onLotes,pavimentacao=false,onPavimentacao,independent=false,onIndependent,onAdd,includeVias=true,points=false}:{glebas:boolean;vias:boolean;onGlebas:(v:boolean)=>void;onVias:(v:boolean)=>void;pavimentacao?:boolean;onPavimentacao?:(v:boolean)=>void;lotes?:boolean;onLotes?:(v:boolean)=>void;independent?:boolean;onIndependent?:(v:boolean)=>void;onAdd?:()=>void;includeVias?:boolean;points?:boolean}){
 const [open,setOpen]=useState(false);
 const name=points?'Mostrar pontos e identificação':'Mostrar cotas externas',menuId=points?'infra-points-menu':'infra-dimension-menu';
 return <div className="text-tool infra-dimension-tool" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)} onFocusCapture={()=>setOpen(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
  <button type="button" className={'symbol-tool '+(glebas||vias||lotes||pavimentacao||independent?'enabled':'')} aria-label={name} aria-pressed={glebas||vias||lotes||pavimentacao||independent} aria-expanded={open} aria-controls={menuId} onClick={()=>{const next=!(glebas||vias||lotes||pavimentacao||independent);onGlebas(next);onVias(next);onLotes?.(next);onPavimentacao?.(next);onIndependent?.(next);}}>{points?<Waypoints/>:<Ruler/>}</button>
  {open&&<div id={menuId} className="text-tool-popover"><div className="text-tool-card">
   <div className="infra-dimension-options">{[['Glebas',glebas,onGlebas],...(includeVias?[['Vias / Calçadas',vias,onVias]]:[]),...(!points&&onPavimentacao?[['Pavimentação',pavimentacao,onPavimentacao]]:[]),...(!points&&onLotes?[['Lotes',lotes,onLotes]]:[]),...(!points&&onIndependent?[['Independentes',independent,onIndependent]]:[])].map(([name,active,set])=><button key={String(name)} type="button" className={active?'active':''} aria-pressed={!!active} onClick={()=>(set as (v:boolean)=>void)(!active)}><span>{String(name)}</span><Check size={16} style={{visibility:active?'visible':'hidden'}}/></button>)}</div>
   {!points&&onAdd&&<button type="button" className="text-tool-add" onClick={()=>{setOpen(false);onAdd();}}><Plus size={16}/>Adicionar cota</button>}
   <div className="text-tool-note"><strong>{name}</strong><p>{points?'Exibe P1, P2, P3… nas glebas ou nos eixos das vias. Cada via tem sua própria numeração.':'Glebas, vias, pavimentação e lotes podem ser ligados separadamente. Pavimentação mostra as medidas por fora dos contornos. Lotes mostram as medidas internamente, sem repetir divisas coincidentes. Vias e calçadas independentes mostram comprimentos por fora da faixa.'}</p></div>
  </div></div>}
 </div>;
}
