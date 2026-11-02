"""Plan representation of a straight timber pedestrian bridge."""
import math
from shapely.geometry import LineString,shape,mapping
from ..store import DomainError,polygon


def validate_bridge(data,validate_road,numeric):
    raw=data.get('geometry',{})
    points=raw.get('coordinates',[])
    if raw.get('type')!='LineString' or len(points)!=2:raise DomainError('Ponte: indique dois pontos para um eixo reto.')
    if data.get('arcSegments') or data.get('curveRadiusM') or any(data.get('filletRadii',{}).values()):raise DomainError('O eixo desta ponte deve ser reto.')
    # Validate finite XY, IDs, source and width through the shared road contract.
    result=validate_road({**data,'usage':'road','material':'concrete','sidewalkMaterial':'concrete','sidewalkLeft':0,'sidewalkRight':0,'endpointRadii':{},'culDeSac':{'enabled':False},'clipToGleba':False})
    a,b=list(shape(result['geometry']).coords);distance=math.dist(a,b)
    length=numeric(data.get('bridgeLengthM',distance),'Comprimento da ponte',.5,200)
    end=[a[0]+(b[0]-a[0])*length/distance,a[1]+(b[1]-a[1])*length/distance]
    axis=LineString([a,end]);surface=axis.buffer(result['width']/2,cap_style=2)
    clip=data.get('clipToGleba',False)
    if not isinstance(clip,bool):raise DomainError('Confirme o recorte à gleba.')
    if clip:surface=surface.intersection(polygon(data['sourceGeometry']))
    if surface.is_empty or surface.area<.01:raise DomainError('A ponte não possui área dentro do recorte. Desative o recorte para atravessar fora da gleba.')
    result.update(usage='bridge',material='wood',sidewalkMaterial='wood',bridgeLengthM=length,clipToGleba=clip,geometry=mapping(axis))
    result['derived'].update(axisGeometry=mapping(axis),axisLengthM=length,pavementAreaM2=0,sidewalkAreaM2=0,unpavedAreaM2=0,bridgeAreaM2=surface.area,
        regions=[{'role':'bridge','material':'wood','geometry':mapping(surface)}])
    return result
