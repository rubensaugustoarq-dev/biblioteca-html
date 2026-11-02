"""ENL export: original project coordinates and a separate rigid technical copy."""
import io
import json
import math
import zipfile
import ezdxf
from ezdxf import xref, transform
from ezdxf.math import Matrix44
from shapely.geometry import shape
from ..store import DomainError, uid
from ..cad import reference
from ..cad_dimensions import NativeDimensions
from ..cad_fills import behind
from .cad_presentation import converted,fills,report


def frame(lot):
    ring=lot['geometry']['coordinates'][0];a,b=ring[lot['frontEdge']:lot['frontEdge']+2]
    length=math.dist(a,b);origin=((a[0]+b[0])/2,(a[1]+b[1])/2)
    area=sum((p[0]-a[0])*(q[1]-a[1])-(q[0]-a[0])*(p[1]-a[1]) for p,q in zip(ring,ring[1:]))
    sign=1 if area>=0 else -1;ux=(b[0]-a[0])/length*sign;uy=(b[1]-a[1])/length*sign
    return origin,math.atan2(uy,ux)


def export(store,project_id,lot_id,revision=None,texts=True,points=False,glebas=False,buildings=False,setbacks=True):
    state=store.state(project_id)
    if revision is not None and state['project']['revision']!=revision:
        raise DomainError('O projeto mudou. Aguarde o salvamento e exporte novamente.',409)
    lot=next((l for l in state.get('enl',[]) if l['id']==uid(lot_id)),None)
    if lot is None:raise DomainError('Selecione um lote do ENL para exportar.',404)
    origin,rotation=frame(lot);c,s=math.cos(rotation),math.sin(rotation)
    def local(p):return ((p[0]-origin[0])*c+(p[1]-origin[1])*s,-(p[0]-origin[0])*s+(p[1]-origin[1])*c)
    refs=[r for r in state['resources'] if r['role']=='vectorSource']
    rasters=[r for r in state['resources'] if r['role']=='orthophoto' and r['metadata']['opacity']>0]
    all_points=[p for g in [lot['geometry'],*[o['geometry'] for o in lot['objects']]] for ring in g['coordinates'] for p in ring]
    if texts:
        for a in lot.get('texts',[]):
            radius=a['size']*(len(a['text'])+2)
            all_points.extend([[a['x']-radius,a['y']-radius],[a['x']+radius,a['y']+radius]])
    for r in refs+rasters:
        x1,y1,x2,y2=r['metadata']['bounds'];all_points.extend([[x1,y1],[x1,y2],[x2,y1],[x2,y2]])
    minx=min(p[0] for p in all_points);maxx=max(p[0] for p in all_points);miny=min(p[1] for p in all_points);maxy=max(p[1] for p in all_points)
    # Include the complete reference extent, not just the lot, when arranging copies.
    local_points=[local(p) for p in all_points];gap=max(50.,.25*max(maxx-minx,maxy-miny))
    offset=(maxx+gap-min(p[0] for p in local_points),miny-min(p[1] for p in local_points))
    def technical(p):q=local(p);return (q[0]+offset[0],q[1]+offset[1])
    doc=ezdxf.new('R2010');doc.header['$INSUNITS']=6;doc.header['$MEASUREMENT']=1
    doc.header['$PDMODE']=35;doc.header['$PDSIZE']=-2
    msp=doc.modelspace();warnings=[];images={}
    doc.appids.new('SEHURB_ENL')
    doc.rootdict.add_xrecord('SEHURB_ENL').extend([(1,state['project']['crs']['authid']),(1,project_id),(1,lot_id),(90,state['project']['revision']),(40,-math.degrees(rotation)),(10,(offset[0],offset[1],0))])
    colors={'GLEBAS':0x95b9ef,'EDIFICACOES':0xffcf7a,'IMPERMEAVEL':0xbdafcf,'PERMEAVEL':0x74d895,'TEXTOS':0xfff8dd,'PONTOS':0xffe09c,'COTAS_GLEBAS':0x95b9ef,'COTAS_EDIFICACOES':0xffcf7a,'AFASTAMENTOS':0x66deb0,'FRENTE':0x66deb0,'IDENTIFICACAO':0xffffff,'NORTE':0x66deb0,'ORTOFOTOS':0xffffff}
    for prefix in ('BASE','IMPLANTACAO'):
        for name,color in colors.items():doc.layers.new(prefix+'_'+name,dxfattribs={'true_color':color})
    text_height=max(.25,min(2,math.sqrt(lot['derived']['lotAreaM2'])/50))
    def text(value,p,layer,height=None,angle=0,**attrs):
        return msp.add_text(value,dxfattribs={'layer':layer,'insert':p,'height':height or text_height,'rotation':angle,**attrs})
    native_style=None;hatches=[]
    for prefix,convert,angle_offset in [('BASE',lambda p:p,0),('IMPLANTACAO',technical,math.degrees(rotation))]:
        native=NativeDimensions(doc,prefix,style=native_style);native_style=native.style
        hatches.extend(fills(doc,lot,prefix,convert))
        from ..accessibility.cad_export import append as accessibility_export
        accessibility_export(doc,state,prefix+'_ACESSIBILIDADE',convert,report=prefix=='BASE')
        for item in [{'geometry':lot['geometry'],'name':lot['name'],'kind':'lot'},*lot['objects']]:
            layer=prefix+'_'+{'lot':'GLEBAS','building':'EDIFICACOES','impermeable':'IMPERMEAVEL','permeable':'PERMEAVEL'}[item['kind']]
            for ring in item['geometry']['coordinates']:
                entity=msp.add_lwpolyline([convert(p) for p in ring[:-1]],close=True,dxfattribs={'layer':layer})
                entity.set_xdata('SEHURB_ENL',[(1000,project_id),(1000,lot['id']),(1000,item.get('id',lot['id'])),(1071,state['project']['revision'])])
            label=shape(item['geometry']).representative_point();text(item['name'],convert((label.x,label.y)),prefix+'_IDENTIFICACAO')
            if item['kind']=='lot' and glebas:native.polygon(converted(item['geometry'],convert).__geo_interface__,'COTAS_GLEBAS')
            if item['kind']=='building' and buildings:native.polygon(converted(item['geometry'],convert).__geo_interface__,'COTAS_EDIFICACOES')
        ring=lot['geometry']['coordinates'][0]
        a,b=ring[lot['frontEdge']:lot['frontEdge']+2];msp.add_line(convert(a),convert(b),dxfattribs={'layer':prefix+'_FRENTE'})
        if points:
            for i,p in enumerate(ring[:-1],1):
                q=convert(p);msp.add_point(q,dxfattribs={'layer':prefix+'_PONTOS'});text('P'+str(i),(q[0]+text_height,q[1]+text_height),prefix+'_PONTOS')
        if setbacks:
            for d in lot['derived']['setbacks']:
                if d['line'] is None:continue
                a,b=map(convert,d['line']);native.aligned(a,b,0,'AFASTAMENTOS')
        if texts:
            for a in lot.get('texts',[]):
                font={'Arial':'arial','Times New Roman':'times','Courier New':'cour'}[a['font']]+('bd' if a['bold'] else '')+'.ttf'
                style='ENL_'+font[:-4]
                if style not in doc.styles:doc.styles.new(style,dxfattribs={'font':font})
                text(a['text'],convert((a['x'],a['y'])),prefix+'_TEXTOS',height=a['size'],angle=a['angle']-angle_offset,true_color=int(a['color'][1:],16),style=style)
        matrix=Matrix44.chain(Matrix44.translate(-origin[0],-origin[1],0),Matrix44.z_rotate(-rotation),Matrix44.translate(*offset,0)) if prefix=='IMPLANTACAO' else Matrix44()
        for index,r in enumerate(refs,1):
            _,path=reference(store,project_id,r['id']);source=ezdxf.readfile(path)
            mapping={l.dxf.name:prefix+'_CAD_'+str(index)+'_'+l.dxf.name for l in source.layers}
            statuses={l['name'].lower():l['visible'] for l in r['metadata']['layers']}
            for layer in list(source.layers):
                attrs={k:layer.dxf.get(k) for k in ('color','true_color','linetype','lineweight') if layer.dxf.hasattr(k)}
                target=source.layers.new(mapping[layer.dxf.name],dxfattribs=attrs)
                if not statuses.get(layer.dxf.name.lower(),True):target.off()
            # Zero-layer children retain block inheritance; model entities get a named layer.
            for block in source.blocks:
                for e in block:
                    if e.dxf.layer!='0':e.dxf.layer=mapping.get(e.dxf.layer,e.dxf.layer)
            for e in source.modelspace():
                if e.dxf.layer=='0':e.dxf.layer=mapping['0']
            before={e.dxf.handle for e in msp}
            xref.load_modelspace(source,doc,conflict_policy=xref.ConflictPolicy.XREF_PREFIX)
            added=[e for e in msp if e.dxf.handle not in before]
            errors=transform.inplace(added,matrix)
            if errors:raise DomainError('Uma referência CAD não pôde ser transformada para a implantação. Exporte uma versão 2D simplificada do DXF.')
            if any(e.dxftype() in ('IMAGE','PDFUNDERLAY','DWFUNDERLAY','DGNUNDERLAY') for e in added):warnings.append('Referências externas do CAD importado precisam dos seus arquivos originais.')
    # Grid north rotates with the technical view, while base north remains +Y.
    for prefix,convert in [('BASE',lambda p:p),('IMPLANTACAO',technical)]:
        a=convert((maxx+text_height*5,maxy));b=convert((maxx+text_height*5,maxy+text_height*8))
        msp.add_line(a,b,dxfattribs={'layer':prefix+'_NORTE'});text('N',b,prefix+'_NORTE')
    if rasters:
        import numpy as np
        import rasterio
        from rasterio.vrt import WarpedVRT
        from rasterio.enums import Resampling,ColorInterp
        from PIL import Image
        folder=store.folder(project_id).resolve()
        for index,r in enumerate(rasters,1):
            meta=r['metadata'];path=(folder/meta['derivedPath']).resolve()
            if not path.is_relative_to(folder) or not path.is_file():raise DomainError('Ortofoto ausente na pasta do projeto.',404)
            with rasterio.open(path) as source, WarpedVRT(source,crs=state['project']['crs']['wkt'],resampling=Resampling.bilinear) as view:
                ratio=min(1,4096/max(view.width,view.height));w=max(1,round(view.width*ratio));h=max(1,round(view.height*ratio))
                values=view.read(meta['bands'],out_shape=(len(meta['bands']),h,w),masked=True,resampling=Resampling.bilinear)
                rgb=np.clip((values.filled(meta['min'])-meta['min'])*255/(meta['max']-meta['min']),0,255).astype('uint8')
                if len(rgb)==1:rgb=np.repeat(rgb,3,axis=0)
                alpha=(~np.ma.getmaskarray(values).any(axis=0)).astype('float64')*255
                if ColorInterp.alpha in view.colorinterp:
                    band=view.colorinterp.index(ColorInterp.alpha)+1;alpha*=view.read(band,out_shape=(h,w),resampling=Resampling.bilinear)/255
                alpha=np.clip(alpha*meta['opacity'],0,255).astype('uint8')
                data=np.dstack([rgb.transpose(1,2,0),alpha]);buffer=io.BytesIO();Image.fromarray(data).save(buffer,format='PNG')
                filename=f'imagens/ortofoto-{index}.png';images[filename]=buffer.getvalue()
                bounds=view.bounds;definition=doc.add_image_def(filename=filename,size_in_pixel=(w,h))
                msp.add_image(definition,insert=(bounds.left,bounds.bottom),size_in_units=(bounds.right-bounds.left,bounds.top-bounds.bottom),dxfattribs={'layer':'BASE_ORTOFOTOS'})
    bounds=[(minx,miny,maxx,maxy)]
    technical_points=[technical(p) for p in all_points]
    bounds.append((min(p[0] for p in technical_points),min(p[1] for p in technical_points),max(p[0] for p in technical_points),max(p[1] for p in technical_points)))
    report(doc,state,lot,bounds)
    behind(doc,hatches)
    stream=io.StringIO();doc.write(stream);dxf=stream.getvalue().encode('utf-8')
    manifest={'projectId':project_id,'revision':state['project']['revision'],'lotId':lot_id,'crs':state['project']['crs']['authid'],'units':'m','technicalRotationDegrees':-math.degrees(rotation),'technicalOffset':offset,'separationM':gap,'warnings':warnings}
    if not images:return dxf,'application/dxf','SEHURB-ENL.dxf'
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as package:
        package.writestr('SEHURB-ENL.dxf',dxf)
        for name,data in images.items():package.writestr(name,data)
        package.writestr('exportacao.json',json.dumps(manifest,ensure_ascii=False,indent=2))
        package.writestr('LEIA-ME.txt','Extraia toda a pasta antes de abrir SEHURB-ENL.dxf no AutoCAD. Preserve a subpasta imagens. Unidades: metros. BASE mantém coordenadas do projeto; IMPLANTACAO é uma cópia girada e deslocada. Ortofotos reprojetadas explicitamente para o CRS do projeto, com limite de 4096 pixels por lado e opacidade incorporada ao PNG. Cotas e afastamentos são DIMENSION nativas conforme visibilidade. Quadros e legenda são linhas/MTEXT. Hachuras sólidas em layers próprias; contornos e nomes vetoriais. Halo de textos da tela não é reproduzido. Referências externas existentes nos CADs importados dependem dos arquivos originais.\n'+ '\n'.join(warnings))
    return output.getvalue(),'application/zip','SEHURB-ENL.zip'
