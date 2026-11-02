"""Parking markings hosted by confirmed pavement surfaces, without area deduction."""
import math
from shapely.geometry import Point,Polygon,shape,mapping
from shapely.ops import unary_union
from .domain import num
from ..store import DomainError,uid

TYPES={'car':'Carro','accessible':'PCD','elderly':'Idoso','motorcycle':'Moto','bicycle':'Bicicleta',
       'electric':'Elétrico','loading':'Carga/descarga','truck':'Caminhão','bus':'Ônibus',
       'taxi':'Táxi','ambulance':'Ambulância','custom':'Personalizada'}


def layout(data,infra,metrics,preview=False):
    anchor=data['anchor'];p=Point(anchor);source=data.get('surfaceId')
    if source:uid(source)
    surfaces=[r for r in infra if r['kind']=='surface' and r.get('material')!='earth' and (not source or r['id']==source)]
    if not surfaces:raise DomainError('Selecione uma área de pavimentação existente. Terra não aceita vagas demarcadas.')
    surface=min(surfaces,key=lambda r:shape(r['derived']['surfaceGeometry']).distance(p))
    pavement=unary_union([shape(q['geometry']) for q in metrics.get('regions',[]) if q['role']=='pavement' and q.get('geometry')])
    available=shape(surface['derived']['surfaceGeometry']).intersection(pavement)
    placement_error=None
    if available.is_empty:raise DomainError('A pavimentação escolhida não possui superfície disponível para vagas.')
    if not available.buffer(1e-7).covers(p):
        placement_error='Posicione a vaga dentro da área de pavimentação escolhida.'
        if not preview:raise DomainError(placement_error)
    kind=data.get('parkingType','car')
    if kind not in TYPES:raise DomainError('Tipo de vaga inválido.')
    count=num(data.get('quantity',1),'Quantidade de vagas',1,100)
    first=num(data.get('startNumber',1),'Número inicial',1,99999)
    if int(count)!=count or int(first)!=first:raise DomainError('Quantidade e número inicial devem ser inteiros.')
    count=int(count);first=int(first)
    width=num(data.get('widthM',2.5),'Largura da vaga',.5,10)
    length=num(data.get('lengthM',5),'Comprimento da vaga',1,30)
    angle=num(data.get('parkingAngleDegrees',90),'Ângulo das vagas',-180,180)
    rotation=num(data.get('angleDegrees',0),'Rotação da fileira',-180,180)
    gap=num(data.get('spacingM',0),'Intervalo entre vagas',0,10)
    transfer=num(data.get('transferWidthM',1.2 if kind=='accessible' else 0),'Faixa de transferência',0,5)
    side=data.get('transferSide','left')
    if side not in ('left','right'):raise DomainError('Lado da faixa de transferência inválido.')
    basis=0
    if data.get('alignToBoundary',True):
        polys=[available] if available.geom_type=='Polygon' else list(available.geoms)
        polygon=min(polys,key=lambda g:g.distance(p));coords=list(polygon.exterior.coords)
        from shapely.geometry import LineString
        a,b=min(zip(coords,coords[1:]),key=lambda pair:LineString(pair).distance(p))
        basis=math.atan2(b[1]-a[1],b[0]-a[0])
        # Face the interior from the closest edge, independent of ring winding.
        edge=LineString([a,b]);q=edge.interpolate(edge.project(p))
        if not available.buffer(1e-7).covers(Point(q.x-math.sin(basis)*.02,q.y+math.cos(basis)*.02)):basis+=math.pi
    basis+=math.radians(rotation);alpha=math.radians(angle)
    ux,uy=math.cos(basis),math.sin(basis)
    dx,dy=math.cos(alpha),math.sin(alpha);nx,ny=-dy,dx
    pitch=(width+transfer)/abs(dy)+gap if abs(dy)>1e-5 else length+gap
    if count>1 and pitch*count>10000:raise DomainError('Fileira muito extensa para este ângulo. Use vagas paralelas ou ajuste os parâmetros.')
    def xy(x,y):return (anchor[0]+ux*x-uy*y,anchor[1]+uy*x+ux*y)
    parts=[];warnings=[]
    def part(role,vertices,label=None):
        geometry=Polygon([xy(x,y) for x,y in vertices])
        result={'role':role,'geometry':mapping(geometry)}
        if label:result['label']=label
        parts.append(result)
    for i in range(count):
        origin=i*pitch
        def corners(low,high):return [(origin+dx*x+nx*y,dy*x+ny*y) for x,y in [(0,low),(length,low),(length,high),(0,high)]]
        part('parking',corners(0,width),f'{first+i:03d} · {TYPES[kind]}')
        if transfer:part('parkingTransfer',corners(width,width+transfer) if side=='left' else corners(-transfer,0))
    footprint=unary_union([shape(q['geometry']) for q in parts])
    if footprint.difference(available).area>2e-4:
        placement_error='A fileira ou a faixa de transferência ultrapassa a pavimentação. Reposicione, gire ou reduza a quantidade; as vagas não serão recortadas.'
        if not preview:raise DomainError(placement_error)
    if kind=='accessible' and transfer<1.2:warnings.append('PCD: conferir faixa adicional de circulação de pelo menos 1,20 m e as exceções aplicáveis.')
    pending=['Dimensões são parâmetros de projeto: conferir legislação municipal, veículo de projeto, circulação/manobras, sinalização vertical e pictogramas executivos.',
             'Conferir rota acessível entre vagas reservadas, rebaixamentos e destino. Não há simulação de trajetória ou validação automática de percentuais legais.']
    return {'surfaceId':surface['id'],'parkingType':kind,'quantity':count,'startNumber':first,'widthM':width,'lengthM':length,
            'parkingAngleDegrees':angle,'angleDegrees':rotation,'alignToBoundary':bool(data.get('alignToBoundary',True)),
            'spacingM':gap,'transferWidthM':transfer,'transferSide':side,'placementAngleDegrees':math.degrees(basis),
            'parts':parts,'warnings':warnings,'pending':pending,'placementError':placement_error}


def check_overlap(value,others):
    geometry=shape(value['derived']['geometry'])
    for other in others:
        if other['id']==value['id'] or other.get('derived',{}).get('status')!='dimensioned':continue
        g=other['derived'].get('geometry')
        if g and geometry.intersection(shape(g)).area>1e-5:raise DomainError('A vaga ou sua faixa de transferência sobrepõe outra vaga ou elemento de acessibilidade. Reposicione a implantação.')
