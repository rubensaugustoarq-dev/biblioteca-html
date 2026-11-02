from shapely.geometry import mapping
from ...store import DomainError,polygon,uid

def candidate(state,args,revision=None):
    identity=uid(args['id']);source_id=uid(args['sourceEntityId'])
    existing=next((a for a in state.get('subdivisionAreas',[]) if a['id']==identity),None)
    if existing:
        if existing['sourceEntityId']!=source_id:raise DomainError('Uma área existente não pode trocar de gleba de origem. Crie outra área.')
        boundary=existing['sourceBoundarySnapshot'];source_name=existing['sourceName'];source_revision=existing['sourceRevision']
    else:
        source=next((e for e in state['entities'] if e['id']==source_id),None)
        if source is None:raise DomainError('Escolha uma gleba existente para criar a área.')
        boundary=source['geometry'];source_name=source['attributes']['name'];source_revision=revision if revision is not None else state['project']['revision']
    mode=args.get('mode','internalArea')
    geometry=args.get('geometry') if mode!='wholeGleba' else boundary
    return validate({'id':identity,'sourceEntityId':source_id,'sourceBoundarySnapshot':boundary,'sourceName':source_name,
        'sourceRevision':source_revision,'mode':mode,'name':args.get('name',''),'geometry':geometry,**({'layout':existing['layout']} if existing and 'layout' in existing else {})})

def validate(value):
    mode=value['mode']
    if mode not in ('wholeGleba','internalArea'):raise DomainError('Escolha gleba inteira ou área interna.')
    name=value['name']
    if not isinstance(name,str) or not name.strip() or len(name.strip())>100:raise DomainError('Informe um nome de até 100 caracteres para a área.')
    boundary=polygon(value['sourceBoundarySnapshot']);geometry=polygon(value['geometry'])
    if sum(len(r.coords) for r in [geometry.exterior,*geometry.interiors])>5000:raise DomainError('Limite de 5.000 vértices por área.')
    if not boundary.covers(geometry):raise DomainError('A área ultrapassa a gleba de origem. Ajuste o desenho ou escolha Recortar ao limite.')
    if mode=='wholeGleba' and not boundary.equals(geometry):raise DomainError('A opção Gleba inteira deve usar seu contorno completo.')
    result={'id':uid(value['id']),'sourceEntityId':uid(value['sourceEntityId']),'sourceName':str(value['sourceName'])[:100],
        'sourceRevision':int(value['sourceRevision']),'sourceBoundarySnapshot':mapping(boundary),'mode':mode,'name':name.strip(),
        'geometry':mapping(geometry),'derived':{'areaM2':geometry.area,'perimeterM':geometry.length,'sourceAreaM2':boundary.area,
            'percentOfSource':100*geometry.area/boundary.area}}
    if value.get('layout') is not None:result['layout']=value['layout']
    return result

def derive(values,entities,infra=None):
    result=[validate(a) for a in values]
    if len(result)>200 or len({a['id'] for a in result})!=len(result):raise DomainError('Limite de 200 áreas com identificadores únicos.')
    polygons={a['id']:polygon(a['geometry']) for a in result}
    for area in result:
        if 'layout' in area:
            from .layout import for_area
            area['layout']=for_area(area,area['layout'],infra or [])
        current=next((e for e in entities if e['id']==area['sourceEntityId']),None)
        changed=current is not None and not polygon(current['geometry']).equals(polygon(area['sourceBoundarySnapshot']))
        overlaps=[other['id'] for other in result if other['id']!=area['id'] and polygons[area['id']].intersection(polygons[other['id']]).area>1e-6]
        area['derived'].update(sourceMissing=current is None,sourceChanged=changed,overlappingAreaIds=overlaps)
    return result

def clip(state,args):
    area=next((a for a in state.get('subdivisionAreas',[]) if a['id']==args.get('id')),None)
    if area:
        if uid(args['sourceEntityId'])!=area['sourceEntityId']:raise DomainError('A área pertence a outra gleba.')
        boundary=polygon(area['sourceBoundarySnapshot'])
    else:
        source=next((e for e in state['entities'] if e['id']==uid(args['sourceEntityId'])),None)
        if source is None:raise DomainError('Selecione a gleba de origem.')
        boundary=polygon(source['geometry'])
    geometry=polygon(args['geometry']).intersection(boundary)
    def parts(g):
        if g.geom_type=='Polygon' and g.area>.000001:return [g]
        return [p for child in getattr(g,'geoms',[]) for p in parts(child)]
    polygons=parts(geometry)
    if not polygons:raise DomainError('O desenho não possui área dentro da gleba.')
    return {'parts':[{'geometry':mapping(g),'areaM2':g.area} for g in sorted(polygons,key=lambda g:-g.area)],'discardedAreaM2':polygon(args['geometry']).area-geometry.area}
