"""Shared georeferenced/rotated accessibility DXF overlays and compact summary."""
from shapely.geometry import shape
from shapely.ops import transform
from .elements import totals

NAMES={'tactileDirectional':'PISO_DIRECIONAL','tactileWarning':'PISO_ALERTA','vehicleAccess':'ACESSO_VEICULOS','crosswalk':'TRAVESSIA'}
NAMES['parking']='VAGAS'

def append(doc,state,prefix='SEHURB_ACESSIBILIDADE',convert=lambda p:p,report=True):
    msp=doc.modelspace();bounds=[];fills=[]
    def layer(name,color):
        name=prefix+'_'+name
        if name not in doc.layers:doc.layers.new(name,dxfattribs={'color':color})
        return name
    def polygons(g):
        if g.geom_type=='Polygon':yield g
        else:
            for child in getattr(g,'geoms',[]):yield from polygons(child)
    for value in [*state.get('accessibility',[]),*state.get('accessibilityElements',[])]:
        d=value.get('derived',{})
        if d.get('status')!='dimensioned':continue
        kind=value['kind'];name=NAMES.get(kind,'RAMPAS');color=2 if kind.startswith('tactile') else 7 if kind=='crosswalk' else 3
        for part in d.get('parts',[]):
            source=shape(part['geometry'])
            for g in polygons(source):
                rings=[[convert(p) for p in ring.coords] for ring in [g.exterior,*g.interiors]]
                if kind=='parking':
                    parking_layer=layer('VAGAS_TRANSFERENCIA' if part['role']=='parkingTransfer' else 'VAGAS',7)
                    for ring in rings:msp.add_lwpolyline(ring[:-1],close=True,dxfattribs={'layer':parking_layer})
                    if part.get('label'):
                        at=convert(g.representative_point().coords[0]);msp.add_text(part['label'],dxfattribs={'layer':layer('VAGAS_IDENTIFICACAO',7),'insert':at,'height':.25})
                    if part['role']=='parkingTransfer':
                        hatch=msp.add_hatch(color=7,dxfattribs={'layer':parking_layer});hatch.set_pattern_fill('ANSI31',scale=.08)
                        for i,ring in enumerate(rings):hatch.paths.add_polyline_path(ring[:-1],is_closed=True,flags=1 if i==0 else 0)
                        fills.append(hatch.dxf.handle)
                    bounds.extend(rings[0]);continue
                for ring in rings:msp.add_lwpolyline(ring[:-1],close=True,dxfattribs={'layer':layer(name,color)})
                h=msp.add_hatch(dxfattribs={'layer':layer('HACHURA_'+name,color),'hatch_style':0});fills.append(h.dxf.handle)
                for i,ring in enumerate(rings):h.paths.add_polyline_path(ring[:-1],is_closed=True,flags=1 if i==0 else 0)
                rgb=int(value.get('color','#b9c9bf')[1:],16)
                if part['role'] in ('directional','warning'):
                    h.dxf.true_color=rgb
                    h=msp.add_hatch(dxfattribs={'layer':layer('HACHURA_'+name,color),'hatch_style':0});fills.append(h.dxf.handle)
                    for i,ring in enumerate(rings):h.paths.add_polyline_path(ring[:-1],is_closed=True,flags=1 if i==0 else 0)
                    rgb=0x6E622B
                if part['role']=='directional':
                    axis=d.get('axisGeometry');angle=0
                    if axis:
                        import math
                        from .domain import lines
                        path=min(lines(shape(axis)),key=lambda path:path.distance(g))
                        p,q=convert(path.coords[0]),convert(path.coords[1]);angle=math.degrees(math.atan2(q[1]-p[1],q[0]-p[0]))
                    h.set_pattern_fill('SEHURB_TATIL_DIRECIONAL',angle=angle,pattern_type=2,definition=[[0,(0,0),(0,.075),[]]])
                elif part['role']=='warning':h.set_pattern_fill('SEHURB_TATIL_ALERTA',pattern_type=2,definition=[[0,(0,0),(.05,.05),[0,-.05]]])
                h.dxf.true_color=rgb
                bounds.extend(rings[0])
        if kind in ('straight','longitudinal'):
            import re
            matches=re.findall(r'\d+',value['name']);p=convert(shape(d['geometry']).representative_point().coords[0]);msp.add_text(matches[-1] if matches else str(state['accessibility'].index(value)+1),dxfattribs={'layer':layer('IDENTIFICACAO',7),'insert':p,'height':.25})
    if fills:
        handles=set(fills);rest=[e.dxf.handle for e in msp.entities_in_redraw_order() if e.dxf.handle not in handles]
        msp.set_redraw_order((h,format(i,'X')) for i,h in enumerate([*fills,*rest],1))
    if not report or not bounds:return
    x=max(p[0] for p in bounds)+10;y=max(p[1] for p in bounds);name=layer('QUADRO_GERAL',7)
    rows=[['ACESSIBILIDADE','QTD','AREA m2']]
    rows.append(['Rampas de pedestres',str(len([v for v in state.get('accessibility',[]) if v.get('derived',{}).get('status')=='dimensioned'])),'Sobreposicao'])
    for kind,v in totals(state.get('accessibilityElements',[])).items():rows.append([NAMES[kind],str(v['count']),f"{v['areaM2']:.2f}"])
    from .parking import TYPES
    for kind,count in totals(state.get('accessibilityElements',[]))['parking']['byType'].items():
        if count:rows.append(['VAGAS '+TYPES[kind],str(count),''])
    for row in rows:
        at=x
        for cell,width in zip(row,[35,8,20]):
            msp.add_lwpolyline([(at,y),(at+width,y),(at+width,y-3),(at,y-3)],close=True,dxfattribs={'layer':name});msp.add_text(cell,dxfattribs={'layer':name,'insert':(at+.7,y-2),'height':.8});at+=width
        y-=3
