"""A1 vector output over the user's unmodified sheet reference, with bounded raster rendering."""
from pathlib import Path
from io import BytesIO
import math
import threading
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.vrt import WarpedVRT
from rasterio.enums import ColorInterp
from rasterio.transform import from_bounds
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter
from shapely.geometry import shape
from shapely.ops import unary_union
from .store import DomainError, uid

WIDTH, HEIGHT = 841*mm, 594*mm
TEMPLATES=Path(__file__).with_name('templates')
REFERENCE=TEMPLATES/'sehurb-a1.pdf'
_render_lock=threading.RLock()
_cache={}

def render_pdf(store, project_id, sheet_id):
    # Bound memory use when a preview and download arrive together.
    with _render_lock:
        state=store.state(project_id)
        key=(str(store.folder(project_id)),state['project']['revision'],uid(sheet_id))
        if key not in _cache:
            data=_render(store,project_id,sheet_id,state)
            if len(_cache)>=2: _cache.pop(next(iter(_cache)))
            _cache[key]=data
        return _cache[key]

def _render(store,project_id,sheet_id,state):
    s=next((v for v in state['sheets'] if v['id']==uid(sheet_id)),None)
    if not s: raise DomainError('Prancha não encontrada.',404)
    if len(s['center'])!=2: raise DomainError('Informe E e N do centro da janela.')
    table=s['table']
    if table['y']+12+len(state['entities'])*6+8>580:
        raise DomainError('A tabela não cabe nesta posição. Mova-a para cima ou aumente a área disponível.')
    out=BytesIO(); c=canvas.Canvas(out,pagesize=(WIDTH,HEIGHT))
    c.setTitle(s['name']); c.setAuthor(s['fields']['author'])
    def rect(x,y,w,h,fill=False): c.rect(x*mm,HEIGHT-(y+h)*mm,w*mm,h*mm,stroke=1,fill=int(fill))
    def text(x,y,value,size=8,bold=False,max_width=None):
        value=str(value).replace('\n',' ')
        font='Helvetica-Bold' if bold else 'Helvetica'
        if max_width:
            while c.stringWidth(value,font,size)>max_width*mm and size>4: size-=.25
            if c.stringWidth(value,font,size)>max_width*mm:
                while value and c.stringWidth(value+'...',font,size)>max_width*mm: value=value[:-1]
                value+='...'
        c.setFillColorRGB(0,0,0); c.setFont(font,size); c.drawString(x*mm,HEIGHT-y*mm,value)
    def mask(x,y,w,h):
        c.setFillColorRGB(1,1,1); c.rect(x*mm,HEIGHT-(y+h)*mm,w*mm,h*mm,fill=1,stroke=0); c.setFillColorRGB(0,0,0)
    v=s['viewport']; cx,cy=s['center']; scale=s['scale']
    x,y,w,h=[v[k] for k in ('x','y','width','height')]
    bounds=(cx-w*scale/2000,cy-h*scale/2000,cx+w*scale/2000,cy+h*scale/2000)
    def point(p): return ((x+w/2+(p[0]-cx)*1000/scale)*mm,HEIGHT-(y+h/2-(p[1]-cy)*1000/scale)*mm)
    c.saveState(); clip=c.beginPath();clip.rect(x*mm,HEIGHT-(y+h)*mm,w*mm,h*mm);c.clipPath(clip,stroke=0)
    if s['showOrtho']:
        pixels_w=max(1,round(w/25.4*180));pixels_h=max(1,round(h/25.4*180))
        transform=from_bounds(*bounds,pixels_w,pixels_h)
        for r in state['resources']:
            if r['metadata']['opacity']<=0: continue
            folder=store.folder(project_id).resolve(); path=(folder/r['metadata']['derivedPath']).resolve()
            if not path.is_relative_to(folder) or not path.is_file(): raise DomainError('Arquivo da ortofoto ausente.',404)
            with rasterio.open(path) as src:
                bands=r['metadata']['bands']; array=np.zeros((len(bands),pixels_h,pixels_w),dtype='float32')
                for index,band in enumerate(bands):
                    reproject(rasterio.band(src,band),array[index],src_transform=src.transform,src_crs=src.crs,
                              dst_transform=transform,dst_crs=state['project']['crs']['authid'],dst_nodata=0,resampling=Resampling.bilinear)
                with WarpedVRT(src,crs=state['project']['crs']['authid'],transform=transform,width=pixels_w,height=pixels_h,add_alpha=ColorInterp.alpha not in src.colorinterp) as vrt:
                    valid=vrt.dataset_mask()
                low,high=r['metadata']['min'],r['metadata']['max']
                rgb=np.clip((array-low)*255/max(high-low,1e-9),0,255).astype('uint8')
                if len(rgb)==1: rgb=np.repeat(rgb,3,axis=0)
                rgba=np.dstack([np.moveaxis(rgb[:3],0,-1), (valid*r['metadata']['opacity']).astype('uint8')])
                c.drawImage(ImageReader(Image.fromarray(rgba)),x*mm,HEIGHT-(y+h)*mm,w*mm,h*mm,mask='auto')
    for entity in state['entities']:
        c.setStrokeColorRGB(.08,.4,.26);c.setLineWidth(.6)
        path=c.beginPath()
        for ring in entity['geometry']['coordinates']:
            path.moveTo(*point(ring[0]))
            for p in ring[1:]: path.lineTo(*point(p))
            path.close()
        c.drawPath(path,stroke=1,fill=0)
        geom=shape(entity['geometry']); label=geom.representative_point();px,py=point([label.x,label.y])
        c.setFillColorRGB(0,0,0);c.setFont('Helvetica-Bold',8);c.drawCentredString(px,py,entity['attributes']['name'])
        ring=entity['geometry']['coordinates'][0]
        orientation=1 if sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(ring,ring[1:]))>0 else -1
        for index,(a,b) in enumerate(zip(ring,ring[1:])):
            ax,ay=point(a);bx,by=point(b)
            if s['showPoints']:
                c.setFont('Helvetica',6);c.drawString(ax+2,ay+2,f'P{index+1}')
            if s['showDimensions']:
                angle=math.degrees(math.atan2(by-ay,bx-ax));angle=angle if -90<=angle<=90 else angle+180
                length=max(math.hypot(bx-ax,by-ay),1e-9)
                nx,ny=orientation*(by-ay)/length,-orientation*(bx-ax)/length
                c.saveState();c.translate((ax+bx)/2+nx*4,(ay+by)/2+ny*4);c.rotate(angle);c.setFont('Helvetica',6)
                c.drawCentredString(0,0,f"{entity['derived']['edgesM'][index]:.2f} m".replace('.',','));c.restoreState()
    if s['showText']:
        for a in state['annotations']:
            c.saveState();c.translate(*point([a['x'],a['y']]));c.rotate(a['angle'])
            c.setFillColorRGB(0,0,0);c.setFont('Helvetica-Bold',a['size']*1000/scale*mm)
            c.drawCentredString(0,0,a['text']);c.restoreState()
    c.restoreState();c.setStrokeColorRGB(.3,.3,.3);c.setLineWidth(.3);rect(x,y,w,h)
    # Independent movable table and legend; opaque paper background keeps them readable.
    tx,ty,tw=table['x'],table['y'],table['width'];th=20+len(state['entities'])*6
    mask(tx,ty,tw,th);rect(tx,ty,tw,th);text(tx+2,ty+4,'QUADRO DE GLEBAS',8,True)
    text(tx+2,ty+10,'Identificação',7,True);text(tx+tw*.58,ty+10,'Área (m²)',7,True);text(tx+tw*.80,ty+10,'Perímetro (m)',7,True)
    for i,e in enumerate(state['entities']):
        row=ty+16+i*6;text(tx+2,row,e['attributes']['name'],7,max_width=tw*.52)
        text(tx+tw*.58,row,f"{e['derived']['areaM2']:,.2f}".replace(',','_').replace('.',',').replace('_','.'),7)
        text(tx+tw*.80,row,f"{e['derived']['perimeterM']:.2f}".replace('.',','),7)
    union=unary_union([shape(e['geometry']) for e in state['entities']]).area
    text(tx+2,ty+th-3,f'Área da união das glebas: {union:.2f} m²'.replace('.',','),7,True)
    lx,ly,lw=[s['legend'][k] for k in ('x','y','width')];mask(lx,ly,lw,36);rect(lx,ly,lw,36)
    text(lx+2,ly+5,'LEGENDA E REFERÊNCIA',8,True);text(lx+2,ly+12,'Contornos: glebas do projeto',7)
    text(lx+2,ly+18,state['project']['crs']['authid']+' · medidas planimétricas',7,max_width=lw-4)
    text(lx+2,ly+24,f'Escala da janela 1:{scale:g} · norte para cima',7)
    text(lx+2,ly+31,s['fields']['legend'],7,max_width=lw-4)
    text(795.6,29,'N',12)
    text(653,302,'APROVAÇÕES:',8,True)
    # Replace sample project data, preserving reference institution, approvals and border.
    f=s['fields'];mask(651,383,177,21);rect(651,383,177,21)
    text(654,387,'PROJETO:',6);text(741,387,'FASE:',6)
    text(654,396,f['title'] or 'PROJETO URBANÍSTICO',11,True,82);text(741,396,f['phase'] or 'LEGAL',11,True,84)
    mask(651,404,177,47);rect(651,404,177,47)
    text(654,409,'RESPONSABILIDADE TÉCNICA:',7,True)
    logo=TEMPLATES/'governo-acre.png'
    c.drawImage(ImageReader(str(logo)),657*mm,HEIGHT-448*mm,23*mm,35*mm,preserveAspectRatio=True,mask='auto')
    c.setFillColorRGB(0,.43,.22);c.setFont('Helvetica-Bold',19);c.drawCentredString(727*mm,HEIGHT-423*mm,'SEHURB')
    c.setFont('Helvetica',8);c.drawCentredString(727*mm,HEIGHT-430*mm,'SECRETARIA DE ESTADO DE')
    c.setFont('Helvetica-Bold',10);c.drawCentredString(727*mm,HEIGHT-437*mm,'HABITAÇÃO E URBANISMO')
    for i,line in enumerate(['Dados da SEHURB:','CNPJ: 34.035.167/0001-00','Via Chico Mendes, 805 - Vila do Dner','Rio Branco / AC - CEP 69906-150','Telefone: (68) 3229-1211','gabinete.sehurb@gmail.com']):
        text(772,428+i*3,line,5,max_width=53)
    mask(651,451,177,45);rect(651,451,177,45);text(654,456,'AUTOR / RESPONSÁVEL TÉCNICO:',7)
    if s['signature']:
        signature=TEMPLATES/'assinatura.png'
        c.drawImage(ImageReader(str(signature)),698*mm,HEIGHT-479*mm,80*mm,17*mm,preserveAspectRatio=True,mask='auto')
    text(690,482,f['author'],9,True,125);text(690,487,f['profession'],7,max_width=125)
    text(690,492,f['registration'],7,max_width=125)
    mask(651,496,177,84);rect(651,496,177,84)
    rows=[('OBRA',f['work']),('ENDEREÇO',f['address']),('MUNICÍPIO / UF',f['city']),('CEP',f['cep']),('RRT / ART',f['rrt']),('CONTEÚDO',f['content'])]
    for i,(label,value) in enumerate(rows):
        yy=501+i*8;text(654,yy,label,6,True);text(690,yy,value,8,max_width=134)
    c.line(651*mm,HEIGHT-548*mm,828*mm,HEIGHT-548*mm)
    text(654,553,f'ESCALA: 1:{scale:g}',8);text(728,553,'DATA: '+f['date'],8,max_width=97)
    text(654,561,'DESENHO: '+f['drawing'],8,max_width=120)
    text(780,562,f['number'] or '01/01',15,True,44)
    text(654,570,'REVISÃO: '+f['revision'],8);text(654,577,'ÁREA DE INTERVENÇÃO: '+f'{union:.2f} m²'.replace('.',','),8)
    c.showPage();c.save()
    writer=PdfWriter();writer.add_page(PdfReader(str(REFERENCE)).pages[0])
    # Remove template sample text rather than hiding it beneath white paint.
    writer.remove_text()
    base=writer.pages[0];base.scale_to(WIDTH,HEIGHT)
    base.merge_page(PdfReader(BytesIO(out.getvalue())).pages[0])
    result=BytesIO();writer.write(result);return result.getvalue()
