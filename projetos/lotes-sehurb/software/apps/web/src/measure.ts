/** Temporary planimetric distances in the project's metre coordinates. */
export function measurePath(points:number[][]){
  const segments:number[]=[];
  for(let i=1;i<points.length;i++)segments.push(Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  return {segments,total:segments.reduce((sum,value)=>sum+value,0)};
}

export function orthogonalPoint(previous:number[],point:number[],direction:number[]=[1,0]){
  const length=Math.hypot(direction[0],direction[1]);if(length<1e-8)return point.slice();
  const ux=direction[0]/length,uy=direction[1]/length,dx=point[0]-previous[0],dy=point[1]-previous[1];
  const parallel=dx*ux+dy*uy,perpendicular=-dx*uy+dy*ux;
  return Math.abs(parallel)>=Math.abs(perpendicular)?[previous[0]+parallel*ux,previous[1]+parallel*uy]:[previous[0]-perpendicular*uy,previous[1]+perpendicular*ux];
}

/** The moving cursor is last. Use the last nonzero placed segment as the axes. */
export function orthogonalPathPoint(points:number[][]){
  const cursor=points.at(-1)!;
  for(let i=points.length-2;i>0;i--){
    const direction=[points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]];
    if(Math.hypot(...direction)>1e-8)return orthogonalPoint(points[points.length-2],cursor,direction);
  }
  return cursor.slice(); // First segment sets the bearing freely.
}

/** Keep the start of the edited edge fixed, move its end along the same bearing. */
export function resizeMeasureSegment(points:number[][],index:number,length:number,closed:boolean){
  if(!Number.isFinite(length)||length<=0||index<0||index>=points.length-1)throw new Error('Informe um comprimento maior que zero.');
  const copy=points.map(p=>p.slice()),a=copy[index],b=copy[index+1],old=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(old<1e-8)throw new Error('Este trecho não tem direção. Arraste um vértice primeiro.');
  copy[index+1]=[a[0]+(b[0]-a[0])*length/old,a[1]+(b[1]-a[1])*length/old];
  if(closed&&index===copy.length-2)copy[0]=copy[index+1].slice();
  return copy;
}

export function removeMeasureVertex(points:number[][],index:number,closed:boolean){
  const vertices=(closed?points.slice(0,-1):points).map(p=>p.slice());
  if(!Number.isInteger(index)||index<0||index>=vertices.length)throw new Error('Selecione um vértice da medição.');
  if(vertices.length<=(closed?3:2))throw new Error(closed?'Uma área precisa manter pelo menos três vértices.':'A medição precisa manter pelo menos dois pontos.');
  vertices.splice(index,1);
  if(closed)vertices.push(vertices[0].slice());
  return vertices;
}

/** Right-angle closing uses at most one corner, keeping all placed points fixed. */
export function closeMeasureRing(points:number[][],orthogonal:boolean){
  const copy=points.map(p=>p.slice());if(copy.length<3)return copy;
  const first=copy[0],last=copy.at(-1)!;
  if(first[0]===last[0]&&first[1]===last[1])return copy;
  if(orthogonal){
    const reference=copy.find(p=>Math.hypot(p[0]-first[0],p[1]-first[1])>1e-8);
    if(reference){
      const length=Math.hypot(reference[0]-first[0],reference[1]-first[1]),ux=(reference[0]-first[0])/length,uy=(reference[1]-first[1])/length;
      const local=(p:number[])=>[(p[0]-first[0])*ux+(p[1]-first[1])*uy,-(p[0]-first[0])*uy+(p[1]-first[1])*ux];
      const end=local(last),previous=local(copy.at(-2)!);
      if(Math.abs(end[0])>1e-8&&Math.abs(end[1])>1e-8){
        const corner=Math.abs(end[0]-previous[0])>Math.abs(end[1]-previous[1])?[end[0],0]:[0,end[1]];
        copy.push([first[0]+corner[0]*ux-corner[1]*uy,first[1]+corner[0]*uy+corner[1]*ux]);
      }
    }
  }
  copy.push(first.slice());return copy;
}
