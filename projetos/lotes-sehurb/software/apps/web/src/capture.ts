import Map from 'ol/Map';
import View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import WebGLTile from 'ol/layer/WebGLTile';
import type Style from 'ol/style/Style';
import type BaseLayer from 'ol/layer/Base';
import type Feature from 'ol/Feature';

export interface CaptureRect {x:number;y:number;width:number;height:number}
function scaledStyle(original:Style,factor:number):Style{
  const style=original.clone(),text=style.getText(),stroke=style.getStroke(),image=style.getImage();
  if(stroke){stroke.setWidth((stroke.getWidth()||1)*factor);const dash=stroke.getLineDash();if(dash)stroke.setLineDash(dash.map(v=>v*factor));}
  if(image){const scale=image.getScaleArray();image.setScale(scale.map(v=>v*factor));}
  if(text){text.setFont((text.getFont()||'10px sans-serif').replace(/([\d.]+)px/,(_,n)=>`${Number(n)*factor}px`));text.setOffsetX(text.getOffsetX()*factor);text.setOffsetY(text.getOffsetY()*factor);const outline=text.getStroke();if(outline)outline.setWidth((outline.getWidth()||1)*factor);}
  return style;
}

export function captureLayers(originals:BaseLayer[],factor:number,vectorOnly=false):BaseLayer[]{
  return originals.filter(l=>l.getVisible()&&!l.get('captureExclude')).flatMap<BaseLayer>(layer=>{
    if(layer instanceof WebGLTile)return vectorOnly?[]:[new WebGLTile({source:layer.getSource()!,opacity:layer.getOpacity(),zIndex:layer.getZIndex()})];
    if(layer instanceof VectorLayer){
      const styleFunction=layer.getStyleFunction();
      return [new VectorLayer({source:new VectorSource({features:(layer.getSource()!.getFeatures() as Feature[]).filter(f=>!String(f.getId()).startsWith('__text_copy')).map(f=>{const clone=f.clone();clone.setId(f.getId());return clone;})}),opacity:layer.getOpacity(),zIndex:layer.getZIndex(),declutter:layer.getDeclutter(),style:(feature,resolution)=>{
        const styles=styleFunction?.(feature,resolution*factor);return (Array.isArray(styles)?styles:styles?[styles]:[]).map(s=>scaledStyle(s,factor));
      }})];
    }
    return [];
  });
}

/** Render a fresh map at higher resolution; never enlarge a screen bitmap. */
export async function captureMap(original:Map,rect:CaptureRect,factor:number,format:'png'|'jpg',framing?:{center:number[];resolution:number;rotation:number;vectorOnly?:boolean}):Promise<Blob>{
  await Promise.all(original.getLayers().getArray().filter(l=>l.getVisible()&&l.get('cadReady')).map(l=>l.get('cadReady')));
  const width=Math.round(rect.width*factor),height=Math.round(rect.height*factor);
  if(width<32||height<32||width>6000||height>6000||width*height>24000000)throw new Error('Ajuste a área ou a resolução. Limite: 6.000 px por lado e 24 milhões de pixels.');
  const view=original.getView(),center=framing?.center||original.getCoordinateFromPixel([rect.x+rect.width/2,rect.y+rect.height/2]);
  const target=document.createElement('div');target.style.cssText=`position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;document.body.appendChild(target);
  const layers=captureLayers(original.getLayers().getArray(),factor,!!framing?.vectorOnly);
  const map=new Map({target,layers,controls:[],interactions:[],pixelRatio:1,view:new View({projection:view.getProjection(),center,resolution:(framing?.resolution||view.getResolution()!)/factor,rotation:framing?.rotation??view.getRotation()})});
  let composite:HTMLCanvasElement|null=null;
  try{
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('A imagem não terminou de carregar. Reduza a área ou a resolução e tente novamente.')),45000);map.once('rendercomplete',()=>{clearTimeout(timer);resolve();});map.renderSync();});
    const canvas=document.createElement('canvas');composite=canvas;canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;
    if(format==='jpg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);}
    map.getViewport()!.querySelectorAll<HTMLCanvasElement>('canvas').forEach(layerCanvas=>{
      if(!layerCanvas.width)return;
      ctx.save();const container=layerCanvas.parentElement!;ctx.globalAlpha=Number(layerCanvas.classList.contains('ol-layer')?layerCanvas.style.opacity||1:container.style.opacity||layerCanvas.style.opacity||1);
      const transform=layerCanvas.style.transform.match(/^matrix\(([^)]+)\)$/);if(transform)ctx.setTransform(...transform[1].split(',').map(Number) as [number,number,number,number,number,number]);
      ctx.drawImage(layerCanvas,0,0);ctx.restore();
    });
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar a imagem.')),format==='png'?'image/png':'image/jpeg',.98));
  }finally{
    const canvases=Array.from(map.getViewport()?.querySelectorAll<HTMLCanvasElement>('canvas')||[]);
    map.setTarget(undefined);map.dispose();
    canvases.forEach(c=>{c.width=0;c.height=0;});if(composite){composite.width=0;composite.height=0;}
    layers.forEach(layer=>{if(layer instanceof VectorLayer)layer.getSource()?.dispose();layer.dispose();});target.remove();
  }
}
