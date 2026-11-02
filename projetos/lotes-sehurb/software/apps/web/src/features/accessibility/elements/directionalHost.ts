/** Pointer grouping only: confirmed geometry always comes from the engine. */
export function directionalHost(roads:any[],p:number[]){
 let best:{roadId:string;side:string;score:number}|null=null;
 for(const road of roads){
  if(road.kind!=='road')continue;
  const coords=road.derived?.axisGeometry?.coordinates as number[][]|undefined;
  if(!coords)continue;
  let nearest:{distance:number;side:string}|null=null;
  for(let i=1;i<coords.length;i++){
   const a=coords[i-1],b=coords[i],dx=b[0]-a[0],dy=b[1]-a[1],ll=dx*dx+dy*dy;if(!ll)continue;
   const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/ll));
   const x=p[0]-a[0]-t*dx,y=p[1]-a[1]-t*dy,distance=Math.hypot(x,y);
   if(!nearest||distance<nearest.distance)nearest={distance,side:dx*y-dy*x>=0?'left':'right'};
  }
  if(!nearest)continue;
  const width=road[nearest.side==='left'?'sidewalkLeft':'sidewalkRight'];if(!width)continue;
  const score=Math.abs(nearest.distance-(road.width/2+width/2));
  if(score>width/2+1.5)continue;
  if(!best||score<best.score)best={roadId:road.id,side:nearest.side,score};
 }
 return best;
}
