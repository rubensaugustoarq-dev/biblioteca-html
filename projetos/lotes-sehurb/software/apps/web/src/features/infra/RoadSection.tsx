import type {Material} from './types';
const fmt=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2})+' m';
export function RoadSection({width,left,right,pavement,sidewalk}:{width:number;left:number;right:number;pavement:Material;sidewalk:Material}){
 const total=Math.max(.5,width+left+right),scale=276/total,x0=22,x1=x0+left*scale,x2=x1+width*scale,x3=298;
 const sidewalkColor=sidewalk==='brick'?'#b66a48':'#bdc3c6',pavementColor=pavement==='brick'?'#b66a48':pavement==='earth'?'#ae9471':'#35434c';
 const dimension=(a:number,b:number,y:number,label:string)=> <g key={label} className="infra-section-dim"><path d={`M ${a},${y-4} V ${y+4} M ${a},${y} H ${b} M ${b},${y-4} V ${y+4}`}/><text x={(a+b)/2} y={y-6} textAnchor="middle">{label}</text></g>;
 return <div className="infra-road-section"><div className="infra-section-heading">Seção da via <span>Prévia</span></div><svg viewBox="0 0 320 158" role="img" aria-label={`Seção: calçada esquerda ${fmt(left)}, pista ${fmt(width)}, calçada direita ${fmt(right)}; total ${fmt(total)}`}>
 <path d="M 10 111 H 310" stroke="#526577" strokeWidth="1"/>
 <path d={`M ${x0} 80 H ${x1} V 88 H ${x2} V 80 H ${x3} V 108 H ${x0} Z`} fill="#74838b"/>
 {left>0&&<><rect x={x0} y="75" width={left*scale} height="12" fill={sidewalkColor}/><path d={`M ${x0} 75 H ${x1} V 87`} stroke="#e1e8ea" fill="none"/></>}
 <rect x={x1} y="87" width={width*scale} height="9" fill={pavementColor}/><path d={`M ${x1} 87 H ${x2}`} stroke="#dae2e6"/>
 {right>0&&<><rect x={x2} y="75" width={right*scale} height="12" fill={sidewalkColor}/><path d={`M ${x2} 87 V 75 H ${x3}`} stroke="#e1e8ea" fill="none"/></>}
 {left>0&&dimension(x0,x1,42,fmt(left))}{dimension(x1,x2,58,fmt(width))}{right>0&&dimension(x2,x3,42,fmt(right))}
 {left>0&&<text x={(x0+x1)/2} y="68" textAnchor="middle" className="infra-section-label">E</text>}<text x={(x1+x2)/2} y="78" textAnchor="middle" className="infra-section-label">{pavement==='earth'?'Terra':'Pista'}</text>{right>0&&<text x={(x2+x3)/2} y="68" textAnchor="middle" className="infra-section-label">D</text>}
 {dimension(x0,x3,138,'Total '+fmt(total))}
 </svg><small>Corte esquemático · alturas ilustrativas</small></div>;
}
