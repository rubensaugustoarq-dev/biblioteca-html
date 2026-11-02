export type XY=number[];

/** Circular arc through three points, sampled with <= 1 cm chord deviation. */
export function arcThroughThree(start:XY,middle:XY,end:XY,tolerance=.01):XY[]{
  const ax=middle[0]-start[0],ay=middle[1]-start[1],bx=end[0]-start[0],by=end[1]-start[1];
  const determinant=2*(ax*by-ay*bx),scale=Math.max(ax*ax+ay*ay,bx*bx+by*by);
  if(![...start,...middle,...end,tolerance].every(Number.isFinite)||tolerance<=0||scale===0||Math.abs(determinant)<scale*1e-9)
    throw new Error('Os três pontos devem ser distintos e não podem estar alinhados. Afaste o ponto do meio da linha entre as pontas.');
  const a2=ax*ax+ay*ay,b2=bx*bx+by*by;
  const cx=(a2*by-b2*ay)/determinant,cy=(ax*b2-bx*a2)/determinant;
  const radius=Math.hypot(cx,cy),tau=2*Math.PI;
  const angle=(p:XY)=>Math.atan2(p[1]-start[1]-cy,p[0]-start[0]-cx);
  const positive=(a:number)=>(a%tau+tau)%tau;
  const first=angle(start),mid=positive(angle(middle)-first),last=positive(angle(end)-first);
  const direction=mid<last?1:-1;
  const midSweep=direction===1?mid:tau-mid,endSweep=direction===1?last:tau-last;
  const step=Math.min(Math.PI/18,2*Math.acos(Math.max(-1,Math.min(1,1-tolerance/radius))));
  if(!Number.isFinite(step)||step<=0)throw new Error('Arco muito grande para esta precisão. Aproxime o ponto do meio.');
  const n1=Math.max(1,Math.ceil(midSweep/step)),n2=Math.max(1,Math.ceil((endSweep-midSweep)/step));
  if(n1+n2>4096)throw new Error('Arco excede 4.096 segmentos. Reduza a extensão ou a curvatura.');
  const points:XY[]=[[...start]];
  const sample=(from:number,to:number,count:number,anchor:XY)=>{
    for(let i=1;i<count;i++){const theta=first+direction*(from+(to-from)*i/count);points.push([start[0]+cx+radius*Math.cos(theta),start[1]+cy+radius*Math.sin(theta)]);}
    points.push([...anchor]);
  };
  sample(0,midSweep,n1,middle);sample(midSweep,endSweep,n2,end);
  return points;
}

/** CAD start/end/direction. Direction is a point on the outgoing start tangent. */
export function arcStartEndDirection(start:XY,end:XY,direction:XY):XY[]{
 const angle=Math.atan2(direction[1]-start[1],direction[0]-start[0]);
 if(Math.hypot(direction[0]-start[0],direction[1]-start[1])<1e-6)throw new Error('Indique uma direção distinta do início.');
 const dx=end[0]-start[0],dy=end[1]-start[1],nx=-Math.sin(angle),ny=Math.cos(angle),chord=Math.hypot(dx,dy),den=2*(dx*nx+dy*ny);
 if(chord<1e-6||Math.abs(den)<chord*1e-9)throw new Error('Mude a direção para formar um arco.');
 const offset=(dx*dx+dy*dy)/den,r=Math.abs(offset),cx=start[0]+nx*offset,cy=start[1]+ny*offset,sign=offset>0?1:-1;
 const first=Math.atan2(start[1]-cy,start[0]-cx),last=Math.atan2(end[1]-cy,end[0]-cx),tau=2*Math.PI,sweep=((sign*(last-first))%tau+tau)%tau;
 const step=Math.min(Math.PI/18,2*Math.acos(Math.max(-1,Math.min(1,1-.01/r))));
 const count=Math.max(2,Math.ceil(sweep/step));if(!Number.isFinite(count)||count>4096)throw new Error('Ajuste a direção do arco.');
 return [start,...Array.from({length:count-1},(_,i)=>{const a=first+sign*sweep*(i+1)/count;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];}),end];
}

export function tangentThroughThree(start:XY,middle:XY,end:XY):number{
 const ax=middle[0]-start[0],ay=middle[1]-start[1],bx=end[0]-start[0],by=end[1]-start[1],det=2*(ax*by-ay*bx),scale=Math.max(ax*ax+ay*ay,bx*bx+by*by);
 if(scale===0||Math.abs(det)<scale*1e-9)throw new Error('O ponto central não pode ficar alinhado às pontas do arco.');
 const cx=((ax*ax+ay*ay)*by-(bx*bx+by*by)*ay)/det,cy=(ax*(bx*bx+by*by)-bx*(ax*ax+ay*ay))/det;
 const first=Math.atan2(-cy,-cx),mid=Math.atan2(ay-cy,ax-cx),last=Math.atan2(by-cy,bx-cx),tau=2*Math.PI,positive=(a:number)=>(a%tau+tau)%tau;
 const sign=positive(mid-first)<positive(last-first)?1:-1;
 return positive(Math.atan2(-sign*cx,sign*cy))*180/Math.PI;
}
export function arcSweepDegrees(start:XY,end:XY,directionDegrees:number):number{
 const angle=directionDegrees*Math.PI/180,dx=end[0]-start[0],dy=end[1]-start[1],nx=-Math.sin(angle),ny=Math.cos(angle),den=2*(dx*nx+dy*ny),chord=Math.hypot(dx,dy);
 if(chord<1e-6||Math.abs(den)<chord*1e-9)throw new Error('Direção inválida para arco.');
 const offset=(dx*dx+dy*dy)/den,cx=start[0]+nx*offset,cy=start[1]+ny*offset,sign=offset>0?1:-1,tau=2*Math.PI;
 const sweep=((sign*(Math.atan2(end[1]-cy,end[0]-cx)-Math.atan2(start[1]-cy,start[0]-cx)))%tau+tau)%tau;
 return sign*sweep*180/Math.PI;
}
export function directionFromSweep(start:XY,end:XY,sweepDegrees:number):number{
 if(!Number.isFinite(sweepDegrees)||Math.abs(sweepDegrees)<.01||Math.abs(sweepDegrees)>=359.99)throw new Error('Informe um ângulo entre −359,98° e 359,98°, diferente de zero.');
 return (Math.atan2(end[1]-start[1],end[0]-start[0])*180/Math.PI-sweepDegrees/2+360)%360;
}
