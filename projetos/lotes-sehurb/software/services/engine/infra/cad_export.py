"""DXF of confirmed Infra surfaces and saved subdivision layouts in original CRS.

Curves use the same sampled geometry as rendering/quantities, not control chords.
"""
import math
from shapely.geometry import shape

MATERIALS={'asphalt':'CBUQ','concrete':'CONCRETO','brick':'TIJOLINHO','pavers':'INTERTRAVADO','earth':'TERRA','wood':'MADEIRA_PIAO_ROXO'}
ROLES={'pavement':'PISTAS','sidewalk':'CALCADAS','unpaved':'VIAS_TERRA','bridge':'PONTES'}
USES={'green':'AREA_VERDE','institutional':'INSTITUCIONAL','other':'OUTROS_USOS','remainder':'REMANESCENTE'}


def append(doc,state,dimensions=False,points=False,legend=None,native=None,groups=None):
    msp=doc.modelspace()
    hatch_handles=[]
    prefix='SEHURB_INFRA'
    while any(layer.dxf.name.startswith(prefix+'_') for layer in doc.layers):prefix+='_EXPORT'
    def layer(name,color=7):
        name=prefix+'_'+name
        if name not in doc.layers:doc.layers.new(name,dxfattribs={'color':color})
        return name
    def label(text,geometry,name,height=1.0):
        p=geometry.representative_point()
        msp.add_mtext(text,dxfattribs={'layer':name,'insert':(p.x,p.y),'char_height':height,'attachment_point':5})
    def polygons(geometry,name):
        if geometry.is_empty:return
        if geometry.geom_type=='Polygon':
            for ring in [geometry.exterior,*geometry.interiors]:
                msp.add_lwpolyline(list(ring.coords)[:-1],close=True,dxfattribs={'layer':name})
        elif hasattr(geometry,'geoms'):
            for part in geometry.geoms:polygons(part,name)
    def hatches(geometry,name,material):
        if geometry.is_empty:return
        if geometry.geom_type!='Polygon':
            for part in getattr(geometry,'geoms',[]):hatches(part,name,material)
            return
        colors={'asphalt':0x30363B,'concrete':0xBFC7C7,'brick':0xC7825E,'pavers':0xB19878,'earth':0xAE9471,'wood':0x573A43,'green':0x4AA855,'institutional':0xB785D1,'other':0xE6B04D}
        def hatch(rgb,pattern=None):
            entity=msp.add_hatch(dxfattribs={'layer':layer('HACHURAS_'+name),'true_color':rgb,'hatch_style':0})
            entity.paths.add_polyline_path(list(geometry.exterior.coords)[:-1],is_closed=True,flags=1)
            for ring in geometry.interiors:entity.paths.add_polyline_path(list(ring.coords)[:-1],is_closed=True,flags=0)
            if pattern:
                pattern_name,definition=pattern
                entity.set_pattern_fill(pattern_name,style=0,pattern_type=2,definition=definition)
            entity.dxf.true_color=rgb
            hatch_handles.append(entity.dxf.handle)
        hatch(colors.get(material,0xBEB89E))
        if material=='brick':
            # Embedded herringbone pattern: 20 x 10 cm, rotated 45 degrees.
            unit=.1;offset=math.sqrt(2)*unit;base=unit/math.sqrt(2)
            hatch(0x805C47,('SEHURB_TIJOLO_V',[[45,(0,0),(0,offset),[3*unit,-unit]],[135,(base,base),(0,offset),[3*unit,-unit]]]))
        elif material=='wood':
            hatch(0x251B23,('SEHURB_MADEIRA_DIAGONAL',[[45,(0,0),(0,.12),[]]]))
        elif material=='asphalt':
            hatch(0x87919A,('SEHURB_CBUQ',[[0,(0,0),(.15,.15),[0,-.3]]]))
        elif material=='pavers':
            hatch(0x899592,('SEHURB_INTERTRAVADO',[[0,(0,0),(0,.1),[]],[90,(0,0),(.1,.1),[.1,-.1]]]))
    def point_labels(geometry):
        if geometry.geom_type!='Polygon':return
        name=layer('PONTOS',2)
        for i,p in enumerate(list(geometry.exterior.coords)[:-1],1):
            msp.add_point(p,dxfattribs={'layer':name})
            msp.add_text(f'P{i}',dxfattribs={'layer':name,'height':.6,'insert':(p[0]+.2,p[1]+.2)})
    # Global partition is exactly the rendered/quantified surface: intersections
    # do not duplicate pavement or leave sidewalks beneath carriageways.
    for region in state.get('infraMetrics',{}).get('regions',[]):
        name=ROLES[region['role']]+'_'+MATERIALS[region['material']]
        geometry=shape(region['geometry'])
        polygons(geometry,layer(name,8 if region['role']=='sidewalk' else 7))
        hatches(geometry,name,region['material'])
    for item in state.get('infra',[]):
        derived=item['derived']
        if item['kind']=='road':
            axis=shape(derived['axisGeometry'])
            msp.add_lwpolyline(list(axis.coords),dxfattribs={'layer':layer('EIXOS_PONTES' if item.get('usage')=='bridge' else 'EIXOS_CALCADAS' if item.get('usage')=='walkway' else 'EIXOS',2)})
            label(item['name'],axis,layer('NOMES_PONTES' if item.get('usage')=='bridge' else 'NOMES_CALCADAS' if item.get('usage')=='walkway' else 'NOMES_VIAS'))

        else:label(item['name'],shape(derived['surfaceGeometry']),layer('NOMES_PAVIMENTACOES'))
    for area in state.get('subdivisionAreas',[]):
        layout=area.get('layout') or {}
        for lot in layout.get('lots',[]):
            g=shape(lot['geometry']);polygons(g,layer('LOTES',4))
            label(lot['name']+'\\P'+f"{g.area:.2f} m²",g,layer('NOMES_LOTES'),.9)
            if points:point_labels(g)
        for zone in layout.get('zones',[]):
            g=shape(zone['geometry']);polygons(g,layer(USES.get(zone['use'],'OUTROS_USOS'),3))
            hatches(g,USES.get(zone['use'],'OUTROS_USOS'),zone['use'])
            label(zone['name']+'\\P'+f"{g.area:.2f} m²",g,layer('NOMES_AREAS'),.9)

    from ..cad_dimensions import NativeDimensions
    groups=set(groups) if groups is not None else ({'roads','surfaces','lots'} if dimensions else set())
    native=NativeDimensions(doc,prefix,style=native.style if native else None)
    if 'roads' in groups:native.roads(state.get('infra',[]))
    if 'surfaces' in groups:
        seen=set()
        for item in state.get('infra',[]):
            if item['kind']=='surface':native.polygon(item['derived']['surfaceGeometry'],'COTAS_PAVIMENTACAO',seen=seen,holes=True)
    if 'lots' in groups:
        seen=set()
        for area in state.get('subdivisionAreas',[]):
            for lot in (area.get('layout') or {}).get('lots',[]):native.polygon(lot['geometry'],'COTAS_LOTES',inside=True,seen=seen)
    from .cad_tables import append as append_tables
    append_tables(doc,state,prefix,legend)

    # Put new fills behind all contours, labels and imported references while
    # preserving the relative draw order of existing model entities.
    if hatch_handles:
        handles=set(hatch_handles)
        rest=[e.dxf.handle for e in msp.entities_in_redraw_order() if e.dxf.handle not in handles]
        msp.set_redraw_order((handle,format(i,'X')) for i,handle in enumerate([*hatch_handles,*rest],1))
        doc.header['$SORTENTS']=doc.header.get('$SORTENTS',127)|16
