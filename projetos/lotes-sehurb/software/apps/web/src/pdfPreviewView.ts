export type PreviewView={zoom:number;x:number;y:number};
/** Map dragging changes the print camera centre, never the scale or project coordinates. */
export function movePrintCenter(center:number[],dxMm:number,dyMm:number,scale:number,rotation:number){
 const cos=Math.cos(rotation),sin=Math.sin(rotation),factor=scale/1000;
 return [center[0]-(dxMm*cos+dyMm*sin)*factor,center[1]+(-dxMm*sin+dyMm*cos)*factor];
}
export function fitPreview(width:number,height:number,ratio:number){
 const w=Math.max(1,Math.min(width-24,(height-24)*ratio));return {width:w,height:w/ratio};
}
export function boundPreview(view:PreviewView,viewport:{width:number;height:number},sheet:{width:number;height:number}):PreviewView{
 const zoom=Math.max(.5,Math.min(6,view.zoom));
 const maxX=Math.max(0,(sheet.width*zoom-viewport.width)/2+16),maxY=Math.max(0,(sheet.height*zoom-viewport.height)/2+16);
 return {zoom,x:Math.max(-maxX,Math.min(maxX,view.x)),y:Math.max(-maxY,Math.min(maxY,view.y))};
}
export function zoomPreview(view:PreviewView,zoom:number,anchor={x:0,y:0}):PreviewView{
 const next=Math.max(.5,Math.min(6,zoom)),factor=next/view.zoom;
 return {zoom:next,x:anchor.x-(anchor.x-view.x)*factor,y:anchor.y-(anchor.y-view.y)*factor};
}
