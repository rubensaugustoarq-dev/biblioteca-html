import {useEffect,useState} from 'react';
import type {Document} from '../../api';
import type {EnlLot} from './types';
import type {ContextOptions} from './subdivisionContext';
export function SubdivisionImport({doc,lot,options,onOptions,busy,importLots,openLot,fitArea}:{doc:Document;lot?:EnlLot;options:ContextOptions;onOptions:(v:ContextOptions)=>void;busy:boolean;importLots:(areaId:string,ids:string[])=>Promise<void>;openLot:(id:string)=>void;fitArea:(id:string)=>void}){
 const areas=(doc.subdivisionAreas||[]).filter(a=>a.layout?.lots.length),area=areas.find(a=>a.id===(options.areaId||lot?.sourceSubdivisionAreaId))||areas[0];
 const [selected,setSelected]=useState<string[]>([]);
 useEffect(()=>setSelected([]),[area?.id]);
 const imported=(id:string)=>doc.enl?.find(l=>l.sourceSubdivisionAreaId===area?.id&&l.sourceLotId===id);
 const available=area?.layout?.lots.filter(l=>!imported(l.id))||[];
 const ids=selected.filter(id=>available.some(l=>l.id===id));
 function option(key:'gleba'|'lots'|'green',value:boolean){onOptions({...options,areaId:area?.id||'',[key]:value});}
 return <details className="enl-subdivision-import" open><summary>Trazer loteamento</summary>{!areas.length?<p className="enl-note">Aplique um loteamento em Infra / Urbano para trazê-lo ao ENL.</p>:<>
 <label>Loteamento<select disabled={busy} value={area?.id||''} onChange={e=>onOptions({...options,areaId:e.target.value})}>{areas.map(a=><option key={a.id} value={a.id}>{a.name} · {a.layout!.lots.length} lotes</option>)}</select></label>
 <button disabled={busy||!lot} onClick={()=>fitArea(area!.id)}>Enquadrar loteamento</button>
 <div className="enl-context-options" role="group" aria-label="Visibilidade do loteamento">{[['gleba','Gleba de origem'],['lots','Lotes'],['green','Área verde']].map(([key,label])=><label key={key}><input type="checkbox" checked={options[key as 'gleba'|'lots'|'green']} onChange={e=>option(key as 'gleba'|'lots'|'green',e.target.checked)}/>{label}</label>)}</div>
 <div className="enl-subdivision-list">{area?.layout?.lots.map(l=>{const existing=imported(l.id);return <div key={l.id}><label><input type="checkbox" disabled={busy||!!existing} checked={!!existing||ids.includes(l.id)} onChange={e=>setSelected(e.target.checked?[...ids,l.id]:ids.filter(id=>id!==l.id))}/><span>{l.name}<small>{l.derived?.areaM2.toLocaleString('pt-BR',{maximumFractionDigits:2})} m²{existing?' · no ENL':''}</small></span></label>{existing&&<button disabled={busy} onClick={()=>openLot(existing.id)}>Abrir</button>}</div>;})}</div>
 <div className="enl-subdivision-actions"><button disabled={busy||!available.length} onClick={()=>setSelected(available.map(l=>l.id))}>Selecionar todos</button><button disabled={busy||!ids.length} onClick={()=>void importLots(area!.id,ids)}>Trazer {ids.length||''} lote{ids.length===1?'':'s'}</button></div>
 <details className="enl-context-info"><summary>Informações</summary><p className="enl-note">Cada lote cria um estudo independente. A área verde é referência; não entra nos índices do lote. Alterações futuras no loteamento não substituem seus estudos ENL.</p></details>
 </>}</details>;
}
