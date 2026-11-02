"""A3 study sheet based on the user's QGIS reference, without modifying the project."""
from io import BytesIO
from pathlib import Path
from typing import Literal
import math
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from .store import DomainError


class StudyRaster(BaseModel):
    id: str
    opacity: float = Field(ge=0, le=1, allow_inf_nan=False)


class StudyLegendItem(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')


class StudyFields(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    content: str = Field(default='ESTUDO DE GLEBA', max_length=140)
    location: str = Field(default='', max_length=180)
    author: str = Field(default='', max_length=140)
    registration: str = Field(default='', max_length=90)
    area: str = Field(default='', max_length=30)
    date: str = Field(max_length=24)
    revision: str = Field(default='00', max_length=16)
    sheet: str = Field(default='01/01', max_length=24)
    scale: float = Field(ge=10, le=10000000, allow_inf_nan=False)
    rotation: float = Field(default=0, allow_inf_nan=False)
    expectedRevision: int = Field(ge=0)
    showTitleBlock: bool = True
    legend: bool = True
    lineColor: str = Field(default='#aecfff', pattern=r'^#[0-9a-fA-F]{6}$')
    legendItems: list[StudyLegendItem] | None = Field(default=None, max_length=20)
    center: tuple[float,float] | None = None
    rasters: list[StudyRaster] = Field(default_factory=list, max_length=20)
    infraReport: Literal['roads','subdivision'] = 'roads'
    subdivisionAreaId: str | None = Field(default=None,max_length=36)


def render_rasters(store, state, fields, image_bytes):
    """Read local COGs at the requested print grid, independently of browser tile queues."""
    if not fields.rasters:
        return image_bytes
    if not fields.center or not all(math.isfinite(v) for v in fields.center):
        raise DomainError('Centro do enquadramento inválido.')
    import numpy as np
    import rasterio
    from rasterio.vrt import WarpedVRT
    from rasterio.enums import Resampling, ColorInterp
    from affine import Affine
    try:
        image=Image.open(BytesIO(image_bytes));w,h=image.size
        if image.format!='PNG' or w*h>24000000 or max(w,h)>6000 or min(w,h)<100 or abs(w/h-390/277)>.002:
            raise DomainError('Imagem fora dos limites da folha A3.')
        foreground=image.convert('RGBA')
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError):
        raise DomainError('Imagem de mapa inválida.')
    resolution=fields.scale*.39/w
    cos,sin=math.cos(fields.rotation),math.sin(fields.rotation)
    cx,cy=fields.center
    transform=Affine(resolution*cos,resolution*sin,cx-resolution*(w*cos+h*sin)/2,
                     resolution*sin,-resolution*cos,cy-resolution*(w*sin-h*cos)/2)
    folder=store.folder(state['project']['id']).resolve()
    background=Image.new('RGBA',(w,h))
    for requested in fields.rasters:
        resource=next((r for r in state['resources'] if r['id']==requested.id),None)
        if not resource: raise DomainError('Ortofoto não encontrada no projeto.',404)
        if requested.opacity==0: continue
        meta=resource['metadata'];path=(folder/meta['derivedPath']).resolve()
        if not path.is_relative_to(folder) or not path.is_file():
            raise DomainError('Arquivo da ortofoto ausente.',404)
        with rasterio.open(path) as source:
            with WarpedVRT(source,crs=state['project']['crs']['authid'],transform=transform,width=w,height=h,
                           add_alpha=ColorInterp.alpha not in source.colorinterp,resampling=Resampling.bilinear) as vrt:
                values=vrt.read(meta['bands'],out_dtype='float32')
                valid=vrt.dataset_mask()
        rgb=np.clip((values-meta['min'])*255/max(meta['max']-meta['min'],1e-9),0,255).astype('uint8')
        if len(rgb)==1: rgb=np.repeat(rgb,3,axis=0)
        rgba=np.dstack([np.moveaxis(rgb[:3],0,-1),(valid.astype('float32')*requested.opacity).round().astype('uint8')])
        background.alpha_composite(Image.fromarray(rgba))
        del values,valid,rgb,rgba
    background.alpha_composite(foreground)
    out=BytesIO();background.save(out,format='PNG');return out.getvalue()


def render_study(state, image_bytes, fields, overlay=None, map_overlay=None):
    if state['project']['revision'] != fields.expectedRevision:
        raise DomainError('O projeto mudou durante a exportação. Gere a prévia novamente.', 409)
    try:
        image = Image.open(BytesIO(image_bytes))
        w, h = image.size
        if image.format != 'PNG' or w*h > 24000000 or max(w,h) > 6000 or min(w,h)<100:
            raise DomainError('Imagem PNG fora dos limites da folha A3.')
        if abs(w/h - 390/277) > .002:
            raise DomainError('O enquadramento da imagem deve acompanhar a proporção A3.')
        image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise DomainError('Imagem de mapa inválida.')
    out=BytesIO(); c=canvas.Canvas(out, pagesize=(420*mm,297*mm))
    c.setTitle(fields.title); c.setAuthor(fields.author); c.setSubject('Estudo de gleba — SEHURB A3')
    c.setLineWidth(.2*mm)
    def rect(x,y,w,h,fill=False):
        c.setFillColorRGB(1,1,1); c.setStrokeColorRGB(0,0,0)
        c.rect(x*mm,(297-y-h)*mm,w*mm,h*mm,fill=int(fill),stroke=1)
    def label(value,x,y,w,h,size=7,bold=False,border=True):
        if border: rect(x,y,w,h,True)
        font='Helvetica-Bold' if bold else 'Helvetica'
        value=' '.join(str(value).split())
        # Keep all field content, wrapping long labels into at most two lines.
        words=value.split(); lines=['']
        for word in words:
            candidate=(lines[-1]+' '+word).strip()
            if c.stringWidth(candidate,font,size)>(w-2.4)*mm and lines[-1]: lines.append(word)
            else: lines[-1]=candidate
        while len(lines)>2 and size>4.5:
            size-=.25; lines=['']
            for word in words:
                candidate=(lines[-1]+' '+word).strip()
                if c.stringWidth(candidate,font,size)>(w-2.4)*mm and lines[-1]: lines.append(word)
                else: lines[-1]=candidate
        if len(lines)>2 or any(c.stringWidth(v,font,size)>(w-2.4)*mm for v in lines):
            raise DomainError('Um campo do carimbo é longo demais. Abrevie o conteúdo.')
        c.setFillColorRGB(0,0,0); c.setFont(font,size)
        top=(297-y)*mm; leading=size*1.15
        baseline=top-h*mm/2+(len(lines)-1)*leading/2-size*.35
        for i,line in enumerate(lines): c.drawString((x+1.2)*mm,baseline-i*leading,line)
    # Fresh 300 dpi browser rendering retains visible text, dimensions and alpha.
    c.drawImage(ImageReader(image),20*mm,10*mm,390*mm,277*mm,mask='auto')
    if map_overlay:map_overlay(c)
    rect(20,10,390,277)
    rect(24,14,17,29,True)
    c.saveState(); c.translate(32.5*mm,269*mm); c.rotate(-math.degrees(fields.rotation))
    c.setFillColorRGB(0,0,0); c.setFont('Helvetica-Bold',10); c.drawCentredString(0,8*mm,'N')
    p=c.beginPath(); p.moveTo(0,5*mm); p.lineTo(-4.5*mm,-9*mm); p.lineTo(0,-5.5*mm);p.lineTo(4.5*mm,-9*mm);p.close()
    c.setFillColorRGB(1,1,1);c.drawPath(p,fill=1,stroke=1)
    p=c.beginPath();p.moveTo(0,5*mm);p.lineTo(-4.5*mm,-9*mm);p.lineTo(0,-5.5*mm);p.close();c.setFillColorRGB(0,0,0);c.drawPath(p,fill=1,stroke=0)
    c.restoreState();label('Quadrícula',24,38,17,5,5,border=False)
    items=fields.legendItems if fields.legendItems is not None else [StudyLegendItem(label='POLIGONAL DE INTERVENÇÃO',color=fields.lineColor)]
    if fields.legend and items:
        width=min(180,max(72,max(c.stringWidth(item.label,'Helvetica',7)/mm+16 for item in items)))
        rows=[]
        for item in items:
            lines=['']
            for word in item.label.split():
                candidate=(lines[-1]+' '+word).strip()
                if c.stringWidth(candidate,'Helvetica',7)>(width-15)*mm and lines[-1]: lines.append(word)
                else: lines[-1]=candidate
            rows.append((item,lines,max(6,len(lines)*3+2)))
        height=8+sum(row[2] for row in rows)
        top=282-height
        rect(25,top,width,height,True);label('LEGENDA',26,top+1,width-2,5,8,True,False)
        row_y=top+7
        for item,lines,row_h in rows:
            c.setStrokeColor(item.color);c.setLineWidth(.65*mm)
            c.line(27*mm,(297-row_y-2.5)*mm,35*mm,(297-row_y-2.5)*mm);c.setLineWidth(.2*mm)
            label('\n'.join(lines),36,row_y,width-12,row_h,7,border=False)
            row_y+=row_h
    if fields.showTitleBlock:
        x,y=250,229
        rect(x,y,160,58,True)
        label('SEHURB',x,y,130,8,13,True,False)
        label('SECRETARIA DE ESTADO DE HABITAÇÃO E URBANISMO',x,y+8,130,6,7,border=False)
        label(fields.title,x,y+14,130,8,9,True)
        label(fields.content,x,y+22,130,7,8)
        label('LOCAL: '+fields.location,x,y+29,130,8)
        label('RESP. TÉCNICO / REGISTRO: '+fields.author,x,y+37,130,8)
        label('DATA: '+fields.date+'  |  REV.: '+fields.revision,x,y+45,65,6)
        scale=f'{fields.scale:,.0f}'.replace(',','.')
        label('ESCALA 1:'+scale,x+65,y+45,65,6)
        area=fields.area.strip()
        label('MATRÍCULA: '+fields.registration,x,y+51,60,7)
        label('ÁREA: '+area+' m²' if area else '',x+60,y+51,45,7)
        label('FOLHA: '+fields.sheet,x+105,y+51,25,7)
        rect(x+130,y,30,45,True)
        logo=Path(__file__).with_name('templates')/'governo-acre.png'
        c.drawImage(str(logo),(x+132)*mm,(297-y-42)*mm,26*mm,39*mm,preserveAspectRatio=True,anchor='c',mask='auto')
        label('A3',x+130,y+45,30,7,11,True)
        label('420 × 297 mm',x+130,y+52,30,6)
    if overlay:overlay(c)
    c.showPage();c.save();return out.getvalue()
