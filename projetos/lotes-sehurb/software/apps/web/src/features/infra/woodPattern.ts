let cached:CanvasPattern|undefined;
/** Dark diagonal timber hatch; schematic material representation. */
export function woodPattern(){
 if(cached)return cached;const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#573a43';ctx.fillRect(0,0,24,24);ctx.strokeStyle='#251b23';ctx.lineWidth=1.5;
 for(let k=-24;k<=48;k+=8){ctx.beginPath();ctx.moveTo(k,0);ctx.lineTo(k+24,24);ctx.stroke();}
 return cached=ctx.createPattern(canvas,'repeat')!;
}
