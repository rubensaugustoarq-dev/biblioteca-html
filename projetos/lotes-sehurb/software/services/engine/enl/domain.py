import math
from shapely.geometry import LineString, mapping
from shapely.ops import unary_union, nearest_points
from ..store import DomainError, polygon, uid


def number(value, label, low=0, high=1e9):
    try: value=float(value)
    except (ValueError, TypeError): raise DomainError(label+' inválido.')
    if not math.isfinite(value) or not low<=value<=high: raise DomainError(label+' fora do limite.')
    return value


def validate(data):
    lot=polygon(data['geometry']);ring=list(lot.exterior.coords);edge_count=len(ring)-1
    front=int(data.get('frontEdge',0));back=int(data.get('backEdge',-1))
    if front<0 or front>=edge_count or back<-1 or back>=edge_count or front==back: raise DomainError('Escolha lados diferentes para frente e fundos.')
    if LineString([ring[front],ring[front+1]]).length<1e-8: raise DomainError('O lado de frente precisa ter comprimento.')
    objects=[];buildings=[];permeable=[];pavements=[];built_area=0;ids=set()
    if len(data.get('objects',[]))>200: raise DomainError('Limite ENL: 200 objetos por lote.')
    for item in data.get('objects',[]):
        identity=uid(item['id']);kind=item['kind']
        if identity in ids or kind not in ('building','permeable','impermeable'): raise DomainError('Objeto ENL inválido ou repetido.')
        ids.add(identity);geom=polygon(item['geometry'])
        if not lot.covers(geom) and not lot.buffer(1e-7).covers(geom): raise DomainError('Todo objeto do ENL precisa estar inteiramente dentro do lote.')
        floors=number(item.get('floors',1),'Pavimentos',1,100)
        if floors!=int(floors): raise DomainError('Informe um número inteiro de pavimentos.')
        computable=item.get('computableArea')
        computable=None if computable is None or computable=='' else number(computable,'Área computável')
        obj={'id':identity,'kind':kind,'name':str(item.get('name',{'building':'Edificação','impermeable':'Área impermeável','permeable':'Área permeável'}[kind]))[:100],
            'geometry':mapping(geom),'floors':int(floors),'computableArea':computable,'areaM2':geom.area}
        objects.append(obj)
        if kind=='building': buildings.append(geom);built_area+=geom.area*floors if computable is None else computable
        elif kind=='impermeable': pavements.append(geom)
        else: permeable.append(geom)
    footprint=unary_union(buildings);occupied=unary_union(buildings+pavements);green=lot.difference(occupied)
    if buildings and sum(g.area for g in buildings)-footprint.area>1e-6: raise DomainError('Edificações se sobrepõem. Use pavimentos no mesmo objeto para áreas empilhadas.')
    if permeable and unary_union(permeable).intersection(occupied).area>1e-6: raise DomainError('A área permeável delineada não pode ocupar edificações ou pavimentação.')
    rules={key:None if data.get('rules',{}).get(key) in (None,'') else number(data['rules'][key],key,0,100 if key in ('maxTo','minTp') else 1e6)
        for key in ('maxCa','maxTo','minTp','front','side','back')}
    setbacks=[]
    for index,(a,b) in enumerate(zip(ring,ring[1:])):
        role='front' if index==front else 'back' if index==back else 'side'
        distance=None;line=None
        if buildings:
            edge=LineString([a,b]);p,q=nearest_points(edge,footprint);distance=p.distance(q);line=[[p.x,p.y],[q.x,q.y]]
        limit=rules[role]
        setbacks.append({'edge':index,'role':role,'distanceM':distance,'line':line,'limit':limit,
            'status':'notConfigured' if limit is None or distance is None else 'ok' if distance+1e-8>=limit else 'fail'})
    ca=built_area/lot.area;to=footprint.area/lot.area*100;tp=green.area/lot.area*100
    checks=[{'name':label,'value':value,'limit':rules[key],
        'status':'notConfigured' if rules[key] is None or value is None else 'ok' if (value>=rules[key]-1e-8 if minimum else value<=rules[key]+1e-8) else 'fail'}
        for label,key,value,minimum in [('C.A.','maxCa',ca,False),('T.O.','maxTo',to,False),('T.P.','minTp',tp,True)]]
    from ..presentation import annotation
    texts=[annotation(item) for item in data.get('texts',[])]
    if len(texts)>500 or len({a['id'] for a in texts})!=len(texts): raise DomainError('Limite de 500 textos por lote, com identificadores distintos.')
    provenance={}
    if data.get('sourceLotId') is not None or data.get('sourceSubdivisionAreaId') is not None:
        provenance={'sourceSubdivisionAreaId':uid(data.get('sourceSubdivisionAreaId')),'sourceLotId':uid(data.get('sourceLotId')),'sourceRevision':int(number(data.get('sourceRevision',0),'Revisão de origem'))}
    return {**provenance,'id':uid(data['id']),'sourceEntityId':uid(data['sourceEntityId']),'name':str(data.get('name','Lote'))[:100],
        'geometry':mapping(lot),'frontEdge':front,'backEdge':back,'rules':rules,'ruleSource':str(data.get('ruleSource',''))[:500],
        'objects':objects,'texts':texts,'derived':{'lotAreaM2':lot.area,'footprintM2':footprint.area,'builtAreaM2':built_area,
            'impermeableAreaM2':occupied.intersection(lot).area,'pavementAreaM2':unary_union(pavements).intersection(lot).area,'permeableAreaM2':green.area,'ca':ca,'to':to,'tp':tp,'checks':checks,'setbacks':setbacks}}
