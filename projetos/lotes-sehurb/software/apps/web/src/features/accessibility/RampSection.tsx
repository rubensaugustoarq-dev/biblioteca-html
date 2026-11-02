import {useId} from 'react';
import {rampDimensions,type Ramp} from './types';
const fmt=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2});
export function RampSection({ramp,confirmed=false}:{ramp:Ramp;confirmed?:boolean}){
 const id=useId().replaceAll(':',''),long=ramp.kind==='longitudinal',{run,sideRun,sideSlope}=rampDimensions(ramp),slope=long?sideSlope:8.33;
 const free=ramp.derived?.freeWidthM;
 const dim=(x1:number,x2:number,y:number,label:string)=><g className="acc-section-dim"><path d={`M${x1},${y-5}v10 M${x2},${y-5}v10 M${x1},${y}H${x2}`}/><text x={(x1+x2)/2} y={y-5} textAnchor="middle">{label}</text></g>;
 const arrow=(x1:number,y1:number,x2:number,y2:number)=><path className="acc-section-arrow" d={`M${x1},${y1}L${x2},${y2}`} markerEnd={`url(#${id})`}/>;
 return <div className="acc-section"><div><strong>Seção da rampa</strong><small>{ramp.derived?.normativeStatus==='outside'?'Fora da norma':confirmed?'Encaixe conferido':'Esquemática'}</small></div>
 <svg viewBox="0 0 280 245" role="img" aria-label={`Seção ${long?'longitudinal':'reta com abas'}, desnível ${fmt(ramp.heightM)} metros, desenvolvimento ${fmt(run)} metros, inclinação ${fmt(slope)} por cento`}>
 <defs><marker id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#a5ead2"/></marker></defs>
 <text x="12" y="16" className="acc-section-caption">{long?'CORTE AO LONGO DA CALÇADA':'CORTE EM DIREÇÃO À PISTA'}</text>
 {long?<><path className="acc-section-ground" d="M20 60L102 93H178L260 60V108H20Z"/>{arrow(34,49,90,72)}{arrow(246,49,190,72)}<text x="61" y="43" textAnchor="middle">{fmt(slope)} %</text><text x="217" y="43" textAnchor="middle">{fmt(slope)} %</text><text x="140" y="84" textAnchor="middle">Patamar</text>{dim(20,102,126,fmt(sideRun)+' m')}{dim(102,178,126,fmt(ramp.widthM)+' m')}{dim(178,260,126,fmt(sideRun)+' m')}<path className="acc-section-dim" d="M12 60H5V93H12"/><text x="17" y="80">h</text></>:<><path className="acc-section-ground" d="M20 96H45L170 56H258V110H20Z"/>{arrow(153,43,66,72)}<text x="110" y="38" textAnchor="middle">{fmt(slope)} %</text><text x="28" y="87" textAnchor="middle">Pista</text><text x="213" y="47" textAnchor="middle">Faixa livre</text>{dim(45,170,126,fmt(run)+' m')}{dim(170,258,126,free!=null&&free>=0?fmt(free)+' m':'≥ 1,20 m')}<path className="acc-section-dim" d="M264 56H272V96H264"/><text x="260" y="83">h</text></>}
 <text x="140" y="146" textAnchor="middle">h = {fmt(ramp.heightM)} m · desnível</text>
 <text x="12" y="169" className="acc-section-caption">VISTA EM PLANTA</text>
 {long?<><path className="acc-section-plan" d="M20 179H260V212H20Z M102 179V212 M178 179V212"/>{arrow(36,196,90,196)}{arrow(244,196,190,196)}<text x="140" y="200" textAnchor="middle">Patamar</text></>:<><path className="acc-section-plan" d="M96 179H184L253 213H27Z M96 179V213 M184 179V213"/><text x="63" y="206" textAnchor="middle">{fmt(sideRun)} m</text><text x="217" y="206" textAnchor="middle">{fmt(sideRun)} m</text>{arrow(140,182,140,208)}</>}
 {dim(long?102:96,long?178:184,232,fmt(ramp.widthM)+' m')}
 </svg><small>Cotas reais em metros · desenho esquemático, altura ampliada.</small>
 </div>;
}


