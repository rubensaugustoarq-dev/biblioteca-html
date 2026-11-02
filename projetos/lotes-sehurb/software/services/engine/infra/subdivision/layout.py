"""Manual lot standards, explicit land uses, previews and confirmed land balance."""
import math
from uuid import uuid4
from shapely.geometry import shape,mapping,box,Polygon,LineString
from shapely.ops import unary_union
from shapely.affinity import rotate,translate
from ...store import DomainError,polygon,uid
from ..domain import numeric

USES=('green','institutional','other')
def local_measures(local):
    edges=list(zip(list(local.exterior.coords),list(local.exterior.coords)[1:]))
    a,b=min(edges,key=lambda edge:(edge[0][1]+edge[1][1])/2)
    bottom=local.bounds[1]
    orientation=1 if local.exterior.is_ccw else -1
    convex=abs(local.convex_hull.area-local.area)<1e-7
    front_edges=[]
    for p,q in edges:
        dx,dy=q[0]-p[0],q[1]-p[1]
        if orientation*dx<=1e-9 or abs(dx)<.5*abs(dy):continue
        # A sampled curved front is a chain, not its shortest single segment.
        # Concave indentations are excluded when another part lies below them.
        mx,my=(p[0]+q[0])/2,(p[1]+q[1])/2
        if convex or local.intersection(LineString([(mx,bottom-1),(mx,my-1e-7)])).length<=1e-6:
            front_edges.append((p,q))
    return (sum(math.dist(p,q) for p,q in front_edges) if front_edges else math.dist(a,b),local.bounds[3]-bottom)

def fits(local,params):
    if local.geom_type!='Polygon' or local.is_empty or local.interiors or not local.is_valid:return False
    if local.area<params['minArea']-1e-6 or (params['maxArea'] and local.area>params['maxArea']+1e-6):return False
    front,depth=local_measures(local)
    return front>=params['minFrontage']-1e-6 and depth>=params['minDepth']-1e-6 and (not params['maxFrontage'] or front<=params['maxFrontage']+1e-6) and (not params['maxDepth'] or depth<=params['maxDepth']+1e-6)
def road_space(infra):
    return unary_union([shape(r['geometry']) for item in infra if item['kind']=='road' for r in item['derived']['regions']])

def surface_space(infra):
    return unary_union([shape(r['geometry']) for item in infra if item['kind']=='surface' for r in item['derived']['regions']])

def validate(value,infra):
    boundary=polygon(value['sourceGeometry']);zones=[];lots=[];occupied=Polygon()
    params=value.get('parameters',{})
    standards={k:numeric(params.get(k,default),label,low,high) for k,default,label,low,high in (
        ('frontage',10,'Frente padrão',1,200),('depth',25,'Profundidade padrão',1,500),
        ('minArea',250,'Área mínima',1,100000),('angle',0,'Orientação',-36000,36000))}
    for key,default,low,high in (('minFrontage',standards['frontage'],1,200),('maxFrontage',0,0,1000),('minDepth',0,0,500),('maxDepth',0,0,2000),('maxArea',0,0,2000000)):
        standards[key]=numeric(params.get(key,default),key,low,high)
    for key,default in (('optimization',True),('followFront',False),('adaptEdges',False),('greenRemainder',True)):
        value_flag=params.get(key,default)
        if not isinstance(value_flag,bool):raise DomainError('Opção de geração inválida: '+key)
        standards[key]=value_flag
    for minimum,maximum in (('minFrontage','maxFrontage'),('minDepth','maxDepth'),('minArea','maxArea')):
        if standards[maximum] and standards[maximum]<standards[minimum]:raise DomainError('O máximo deve ser maior ou igual ao mínimo: '+maximum)
    standards['patternName']=str(params.get('patternName','Padrão manual'))[:100]
    standards['frontEdge']=int(params.get('frontEdge',0))
    if not 0<=standards['frontEdge']<len(boundary.exterior.coords)-1:raise DomainError('O lado de orientação não existe nesta gleba.')
    if len(value.get('zones',[]))>200 or len(value.get('lots',[]))>1000:raise DomainError('Limite: 200 áreas e 1.000 lotes por estudo.')
    ids=set()
    for collection,target in (('zones',zones),('lots',lots)):
        for raw in value.get(collection,[]):
            identity=uid(raw['id'])
            if identity in ids:raise DomainError('Identificador de parcela repetido.')
            ids.add(identity);g=polygon(raw['geometry'])
            if g.difference(boundary).area>1e-6:raise DomainError('Lotes e áreas de uso devem estar dentro da gleba.')
            if g.intersection(occupied).area>1e-6:raise DomainError('Há lotes ou áreas de uso sobrepostos. Ajuste os contornos ou gere nova prévia.')
            occupied=occupied.union(g)
            item={'id':identity,'name':str(raw.get('name','Área' if collection=='zones' else 'Lote')).strip()[:100] or 'Parcela','geometry':mapping(g)}
            if collection=='zones':
                use=raw.get('use')
                if use not in USES:raise DomainError('Escolha área verde, institucional ou outro uso.')
                item.update(use=use,reference=str(raw.get('reference',''))[:500],automatic=bool(raw.get('automatic',False)))
            else:
                number=int(raw.get('number',len(lots)+1))
                if not 1<=number<=999999 or any(l['number']==number for l in lots):raise DomainError('Números de lotes devem ser positivos e únicos neste estudo.')
                item.update(number=number,locked=bool(raw.get('locked',False)))
            item['derived']={'areaM2':g.area,'perimeterM':g.length}
            if collection=='lots':
                if g.area<standards['minArea']-1e-6:raise DomainError('Um lote fica abaixo da área mínima. Ajuste sua geometria ou o padrão antes de aplicar.')
                local=rotate(translate(g,xoff=-g.centroid.x,yoff=-g.centroid.y),-standards['angle'],origin=(0,0))
                frontage,depth=local_measures(local)
                if frontage<standards['minFrontage']-1e-6:raise DomainError('Um lote fica abaixo da frente mínima informada.')
                if not fits(local,standards):raise DomainError('Um lote não atende aos limites de frente, profundidade ou área informados.')
                item['derived'].update(frontageM=frontage,perpendicularExtentM=depth)
            target.append(item)
    roads=road_space(infra).intersection(boundary)
    paved=surface_space(infra).intersection(boundary).difference(roads)
    infrastructure=roads.union(paved)
    conflict=occupied.intersection(infrastructure).area
    categories={'roads':roads,'paved':paved}
    for use in USES:categories[use]=unary_union([shape(z['geometry']) for z in zones if z['use']==use]).difference(infrastructure)
    categories['lots']=unary_union([shape(l['geometry']) for l in lots]).difference(infrastructure)
    remainder=boundary.difference(unary_union(list(categories.values())))
    categories['remainder']=remainder
    for lot in lots:
        g=shape(lot['geometry']);contact=g.boundary.intersection(roads.boundary).length if not roads.is_empty else 0
        # Contact is a geometric indicator, never proof of legal/frontage access.
        lot['derived'].update(roadContactM=contact,accessReviewRequired=True,roadConflictM2=g.intersection(roads).area)
    result={'id':uid(value['id']),'sourceEntityId':uid(value['sourceEntityId']),'sourceGeometry':mapping(boundary),'parameters':standards,'zones':zones,'lots':lots}
    result['derived']={'glebaAreaM2':boundary.area,'lotCount':len(lots),'conflictAreaM2':conflict,
        'categories':{key:{'areaM2':g.area,'percent':100*g.area/boundary.area,'geometry':mapping(g)} for key,g in categories.items()},
        'remainderGeometry':mapping(remainder),'warnings':(['Vias alteradas sobre lotes ou áreas: revise o conflito antes de aplicar.'] if conflict>1e-6 else [])+(['Frentes e acesso dos lotes exigem revisão técnica.'] if lots else [])}
    return result

def for_area(area,value,infra):
    result=validate({**value,'id':area['id'],'sourceEntityId':area['sourceEntityId'],'sourceGeometry':area['geometry']},infra)
    return {key:result[key] for key in ('parameters','zones','lots','derived')}

def preview(area,value,infra):
    result=generate({**value,'id':area['id'],'sourceEntityId':area['sourceEntityId'],'sourceGeometry':area['geometry']},infra)
    return {key:result[key] for key in ('parameters','zones','lots','derived')}

def generate(value,infra):
    value={**value,'lots':[l for l in value.get('lots',[]) if l.get('locked')]}
    base=validate(value,infra);params=base['parameters'];boundary=shape(base['sourceGeometry'])
    reserved=unary_union([road_space(infra),surface_space(infra),*[shape(z['geometry']) for z in base['zones']],*[shape(l['geometry']) for l in base['lots']]])
    available=boundary.difference(reserved);origin=list(boundary.exterior.coords)[0]
    local=rotate(translate(available,xoff=-origin[0],yoff=-origin[1]),-params['angle'],origin=(0,0))
    if local.is_empty:raise DomainError('Não há área disponível para lotes após descontar vias e usos.')
    xmin,ymin,xmax,ymax=local.bounds;w=params['frontage'];d=params['depth']
    nx=math.ceil((xmax-xmin)/w);ny=math.ceil((ymax-ymin)/d)
    if nx*ny>20000:raise DomainError('Malha muito grande. Aumente as medidas padrão ou trabalhe uma gleba menor.')
    lots=list(base['lots']);number=max([l['number'] for l in lots]+[0])
    for row in range(ny):
        for column in range(nx):
            cell=box(xmin+column*w,ymin+row*d,xmin+(column+1)*w,ymin+(row+1)*d)
            piece=local.intersection(cell)
            if piece.geom_type!='Polygon' or piece.area<w*d-1e-6:continue
            world=translate(rotate(piece,params['angle'],origin=(0,0)),xoff=origin[0],yoff=origin[1]);number+=1
            lots.append({'id':str(uuid4()),'name':f'Lote {number:03d}','number':number,'geometry':mapping(world),'locked':False})
            if len(lots)>1000:raise DomainError('Mais de 1.000 lotes. Aumente o padrão ou trabalhe uma gleba menor.')
    if len(lots)==len(base['lots']):raise DomainError('Nenhum lote inteiro cabe neste padrão/orientação. Ajuste as dimensões ou as áreas reservadas.')
    return validate({**base,'lots':lots},infra)
