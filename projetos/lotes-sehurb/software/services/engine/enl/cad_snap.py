"""Native DXF vertices for ENL snapping; independent of the viewing tessellation."""
from ezdxf import readfile
from ..cad import reference
from ..store import DomainError

def snap_features(store,project,resource):
    _,path=reference(store,project,resource);doc=readfile(path);features=[]
    def add(kind,coordinates,layer):
        if len(features)>=100000:raise DomainError('DXF excede o limite de pontos de captura. Exporte uma seleção menor.')
        features.append({'type':'Feature','properties':{'layer':layer},'geometry':{'type':kind,'coordinates':coordinates}})
    def xy(v):return [float(v.x),float(v.y)]
    def visit(entities,inherited=None,depth=0):
        if depth>16:raise DomainError('Blocos DXF excedem a profundidade suportada.')
        for e in entities:
            layer=e.dxf.get('layer','0');layer=inherited if layer=='0' and inherited else layer;kind=e.dxftype()
            if kind=='INSERT':
                inserts=e.multi_insert() if e.mcount>1 else [e]
                for ins in inserts:visit(ins.virtual_entities(),layer,depth+1)
                continue
            points=[];closed=False;bulges=[]
            if kind=='LINE':points=[xy(e.dxf.start),xy(e.dxf.end)];bulges=[0]
            elif kind=='LWPOLYLINE':
                points=[xy(p) for p in e.vertices_in_wcs()];closed=e.closed;bulges=[p[4] for p in e.get_points('xyseb')]
            elif kind=='POLYLINE' and not e.is_polygon_mesh and not e.is_poly_face_mesh:
                points=[xy(p) for p in e.points_in_wcs()];closed=e.is_closed;bulges=[v.dxf.get('bulge',0) for v in e.vertices]
            elif kind=='ARC':points=[xy(p) for p in e.vertices([e.dxf.start_angle,e.dxf.end_angle])]
            elif kind=='POINT':points=[xy(e.dxf.location)]
            for point in points:add('Point',point,layer)
            if kind in ('LINE','LWPOLYLINE','POLYLINE'):
                for i in range(len(points) if closed else len(points)-1):
                    if not bulges or abs(bulges[i])<1e-12:add('LineString',[points[i],points[(i+1)%len(points)]],layer)
    visit(doc.modelspace())
    return {'type':'FeatureCollection','features':features}
