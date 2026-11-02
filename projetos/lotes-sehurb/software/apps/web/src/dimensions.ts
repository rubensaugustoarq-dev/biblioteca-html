/** Orientation computed relative to the first vertex to retain UTM precision. */
export function ringOrientation(ring:number[][]):number{
  const origin=ring[0];let area=0;
  for(let i=0;i<ring.length-1;i++)area+=(ring[i][0]-origin[0])*(ring[i+1][1]-origin[1])-(ring[i+1][0]-origin[0])*(ring[i][1]-origin[1]);
  return area>=0?1:-1;
}

export function externalDimension(a:number[],b:number[],orientation:number,resolution:number){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<1e-9)return null;
  const ux=dx/length,uy=dy/length,nx=orientation*uy,ny=-orientation*ux;
  const shift=(p:number[],distance:number)=>[p[0]+nx*distance*resolution,p[1]+ny*distance*resolution];
  const first=shift(a,22),last=shift(b,22);
  const tick=(p:number[])=>[[p[0]-(ux+nx)*3*resolution,p[1]-(uy+ny)*3*resolution],[p[0]+(ux+nx)*3*resolution,p[1]+(uy+ny)*3*resolution]];
  let rotation=-Math.atan2(dy,dx);
  if(rotation>Math.PI/2)rotation-=Math.PI;
  if(rotation<-Math.PI/2)rotation+=Math.PI;
  return {lines:[[first,last],[shift(a,4),shift(a,27)],[shift(b,4),shift(b,27)],tick(first),tick(last)],
    label:shift([(a[0]+b[0])/2,(a[1]+b[1])/2],10),rotation};
}
