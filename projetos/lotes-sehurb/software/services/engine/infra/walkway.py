"""Independent pedestrian paths, using the same axis/arc contract as roads."""
from shapely.geometry import Point,mapping,shape
from ..store import DomainError,polygon


def validate_walkway(data,validate_road,numeric):
    material=data.get('material','concrete')
    if material not in ('concrete','brick','pavers'):raise DomainError('Calçada independente: escolha concreto ou tijolinho.')
    terminal=numeric(data.get('terminalRadiusM',0),'Raio da ponta circular',0,100)
    # Reuse axis validation and analytic arc lengths; no vehicle returns are applied.
    result=validate_road({**data,'usage':'road','material':material,'sidewalkMaterial':material,'sidewalkLeft':0,'sidewalkRight':0,'endpointRadii':{},'culDeSac':{'enabled':False},'clipToGleba':False})
    axis=shape(result['derived']['axisGeometry']);width=result['width']
    if terminal and terminal<width/2:raise DomainError('A ponta circular deve ter raio de pelo menos metade da largura da calçada.')
    surface=axis.buffer(width/2,cap_style=2,join_style=2,mitre_limit=3)
    if terminal:surface=surface.union(Point(axis.coords[-1]).buffer(terminal,quad_segs=64))
    clip=data.get('clipToGleba',False)
    if not isinstance(clip,bool):raise DomainError('Confirme o recorte à gleba.')
    if clip:surface=surface.intersection(polygon(data['sourceGeometry']))
    if surface.is_empty or surface.area<.01:raise DomainError('A calçada não possui área dentro do recorte. Desative o recorte para desenhar fora da gleba.')
    result.update(usage='walkway',terminalRadiusM=terminal,clipToGleba=clip)
    derived=result['derived'];derived.update(pavementAreaM2=0,unpavedAreaM2=0,sidewalkAreaM2=surface.area)
    derived['regions']=[{'role':'pavement','material':material,'geometry':mapping(surface.difference(surface))},{'role':'sidewalk','material':material,'geometry':mapping(surface)}]
    return result
