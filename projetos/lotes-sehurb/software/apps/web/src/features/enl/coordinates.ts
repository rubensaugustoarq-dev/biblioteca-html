import type {EnlLot} from './types';
/** A local view transform only: original UTM geometry is never rotated in storage. */
export function lotFrame(lot:EnlLot){
  const ring=lot.geometry.coordinates[0],a=ring[lot.frontEdge],b=ring[lot.frontEdge+1];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(length<1e-8)throw new Error('O lado de frente precisa ter comprimento.');
  const origin=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  let area=0;for(let i=0;i<ring.length-1;i++)area+=(ring[i][0]-a[0])*(ring[i+1][1]-a[1])-(ring[i+1][0]-a[0])*(ring[i][1]-a[1]);
  const sign=area>=0?1:-1,ux=(b[0]-a[0])/length*sign,uy=(b[1]-a[1])/length*sign;
  return {northAngle:Math.atan2(uy,ux)*180/Math.PI,
    toLocal:(p:number[])=>[(p[0]-origin[0])*ux+(p[1]-origin[1])*uy,-(p[0]-origin[0])*uy+(p[1]-origin[1])*ux],
    toWorld:(p:number[])=>[origin[0]+p[0]*ux-p[1]*uy,origin[1]+p[0]*uy+p[1]*ux]};
}

/** Pick a boundary segment in screen pixels, independent of zoom and view rotation. */
export function pickFrontEdge(pixel:number[],ring:(number[]|null)[],tolerance=12):number|null{
  let best:number|null=null,distance=tolerance*tolerance;
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1];if(!a||!b)continue;
    const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;if(length<1e-12)continue;
    const t=Math.max(0,Math.min(1,((pixel[0]-a[0])*dx+(pixel[1]-a[1])*dy)/length));
    const d=(pixel[0]-a[0]-t*dx)**2+(pixel[1]-a[1]-t*dy)**2;
    if(d<=distance){distance=d;best=i;}
  }
  return best;
}
