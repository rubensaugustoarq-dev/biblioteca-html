"""Landscape objects in project metres; base surfaces are never deducted."""
import math
from shapely.geometry import Point, Polygon, mapping
from shapely.ops import unary_union
from ..store import DomainError, uid
from ..infra.domain import numeric, direction_arc


def candidate(data):
    identity=uid(data['id']);kind=data.get('kind')
    if kind not in ('tree','palm','water','chalet','hut'):raise DomainError('Tipo de paisagismo inválido.')
    name=str(data.get('name','')).strip()[:100]
    if not name:raise DomainError('Informe o nome do elemento.')
    raw=data.get('geometry',{});result={'id':identity,'kind':kind,'name':name}
    if kind!='water':
        xy=raw.get('coordinates',[])
        if raw.get('type')!='Point' or len(xy)!=2:raise DomainError('Escolha um ponto para a vegetação.')
        xy=[numeric(v,'Coordenada',-1e9,1e9) for v in xy]
        rotation=numeric(data.get('rotationDegrees',0),'Rotação',-360,360)
        result.update(geometry={'type':'Point','coordinates':xy},rotationDegrees=rotation)
        if kind in ('chalet','hut'):
            angle=math.radians(rotation)
            def world(x,y):return [xy[0]+math.cos(angle)*x-math.sin(angle)*y,xy[1]+math.sin(angle)*x+math.cos(angle)*y]
            if kind=='chalet':
                side=numeric(data.get('sideM',3),'Lado do chalé',.5,50);h=side/2;result['sideM']=side
                ring=[world(x,y) for x,y in [(-h,-h),(h,-h),(h,h),(-h,h)]]
            else:
                radius=numeric(data.get('radiusM',2),'Raio da choupana',.25,50);result['radiusM']=radius
                ring=[world(radius*math.cos(i*math.tau/8),radius*math.sin(i*math.tau/8)) for i in range(8)]
            area=Polygon(ring)
        else:
            diameter=numeric(data.get('diameterM',4 if kind=='tree' else 3),'Diâmetro da copa',.2,100)
            result['diameterM']=diameter;area=Point(xy).buffer(diameter/2,quad_segs=32)
        result['derived']={'geometry':mapping(area),'areaM2':area.area,'perimeterM':area.length}
        return result
    rings=raw.get('coordinates',[])
    if raw.get('type')!='Polygon' or len(rings)!=1:raise DomainError('Desenhe um contorno fechado para a lâmina d’água.')
    ring=rings[0]
    if not 4<=len(ring)<=301 or ring[0]!=ring[-1]:raise DomainError('Contorno inválido; use de 3 a 300 vértices e feche o desenho.')
    points=[]
    for xy in ring:
        if len(xy)!=2:raise DomainError('Use coordenadas XY.')
        points.append([numeric(v,'Coordenada',-1e9,1e9) for v in xy])
    if any(math.dist(a,b)<.001 for a,b in zip(points,points[1:])):raise DomainError('Afaste os vértices coincidentes.')
    arcs={}
    for item in data.get('arcSegments',[]):
        index=item.get('index')
        if isinstance(index,bool) or not isinstance(index,int) or not 0<=index<len(points)-1 or index in arcs:raise DomainError('Trecho de curva inválido.')
        arcs[index]=numeric(item.get('directionDegrees'),'Direção do arco',-360,360)
    sampled=[points[0]];perimeter=0
    for index,(a,b) in enumerate(zip(points,points[1:])):
        if index in arcs:
            arc,length,_=direction_arc(a,b,arcs[index]);sampled.extend(arc[1:]);perimeter+=length
        else:sampled.append(b);perimeter+=math.dist(a,b)
    surface=Polygon(sampled)
    if surface.is_empty or not surface.is_valid or surface.area<.01:raise DomainError('O contorno da água se cruza ou não forma uma área. Ajuste vértices/curvas.')
    result.update(geometry={'type':'Polygon','coordinates':[points]},arcSegments=[{'index':i,'directionDegrees':d} for i,d in sorted(arcs.items())])
    result['derived']={'geometry':mapping(surface),'areaM2':surface.area,'perimeterM':perimeter}
    return result


def derive(items):
    return [candidate(value) for value in items]


def totals(items):
    water=[Polygon(v['derived']['geometry']['coordinates'][0]) for v in items if v['kind']=='water']
    return {'trees':sum(v['kind']=='tree' for v in items),'palms':sum(v['kind']=='palm' for v in items),
            'chalets':sum(v['kind']=='chalet' for v in items),'huts':sum(v['kind']=='hut' for v in items),'waterCount':len(water),'waterAreaM2':unary_union(water).area if water else 0}
