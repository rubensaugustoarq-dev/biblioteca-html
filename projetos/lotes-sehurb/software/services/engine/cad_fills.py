"""Presentation fills with explicit outer and inner rings; original geometry retained."""

def solid(doc,geometry,layer,color,transparency=.75):
    if geometry.is_empty:return []
    if layer not in doc.layers:doc.layers.new(layer,dxfattribs={'true_color':color})
    if geometry.geom_type!='Polygon':
        return [entity for part in getattr(geometry,'geoms',[]) for entity in solid(doc,part,layer,color,transparency)]
    hatch=doc.modelspace().add_hatch(dxfattribs={'layer':layer,'true_color':color,'hatch_style':0})
    hatch.transparency=transparency
    hatch.paths.add_polyline_path(list(geometry.exterior.coords)[:-1],is_closed=True,flags=1)
    for ring in geometry.interiors:hatch.paths.add_polyline_path(list(ring.coords)[:-1],is_closed=True,flags=0)
    return [hatch]


def behind(doc,entities):
    if not entities:return
    msp=doc.modelspace();handles=[e.dxf.handle for e in entities];selected=set(handles)
    order=list(msp.entities_in_redraw_order())
    images=[e.dxf.handle for e in order if e.dxftype()=='IMAGE']
    rest=[e.dxf.handle for e in order if e.dxf.handle not in selected and e.dxftype()!='IMAGE']
    msp.set_redraw_order((handle,format(i,'X')) for i,handle in enumerate([*images,*handles,*rest],1))
    doc.header['$SORTENTS']=doc.header.get('$SORTENTS',127)|16
