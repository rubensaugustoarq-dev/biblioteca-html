"""Explicit snapshot bridge from saved subdivision lots to independent ENL studies."""
import math
from uuid import uuid4
from shapely.geometry import shape
from ..store import DomainError,uid
from .domain import validate


def import_lots(state,args,revision):
    area_id=uid(args['areaId']);area=next((a for a in state.get('subdivisionAreas',[]) if a['id']==area_id),None)
    if not area or not (area.get('layout') or {}).get('lots'):raise DomainError('Selecione um loteamento aplicado no projeto.')
    source=next((e for e in state['entities'] if e['id']==area['sourceEntityId']),None)
    if source is None:raise DomainError('A gleba de origem não existe mais.')
    ids=args.get('lotIds',[])
    if not isinstance(ids,list) or not ids:raise DomainError('Escolha pelo menos um lote.')
    ids=[uid(i) for i in ids]
    if len(set(ids))!=len(ids):raise DomainError('Seleção de lotes repetida.')
    layout=area['layout'];available={l['id']:l for l in layout['lots']}
    if any(i not in available for i in ids):raise DomainError('Um lote selecionado não pertence ao loteamento salvo.')
    current=state.get('enl',[]);existing={(l.get('sourceSubdivisionAreaId'),l.get('sourceLotId')) for l in current}
    requested=[available[i] for i in ids if (area_id,i) not in existing]
    if len(current)+len(requested)>200:raise DomainError('Limite: 200 lotes ENL. Importe menos lotes.')
    # Initial front follows the layout's local bottom; the technician may change
    # it in ENL. This is geometric orientation, not a legal frontage assessment.
    angle=math.radians(layout['parameters'].get('angle',0));c,s=math.cos(angle),math.sin(angle)
    result=list(current)
    for lot in requested:
        ring=lot['geometry']['coordinates'][0]
        front=min(range(len(ring)-1),key=lambda i:sum(-p[0]*s+p[1]*c for p in ring[i:i+2])/2)
        result.append(validate({'id':str(uuid4()),'sourceEntityId':source['id'],'sourceSubdivisionAreaId':area_id,'sourceLotId':lot['id'],'sourceRevision':revision,'name':lot['name'],'geometry':lot['geometry'],'frontEdge':front,'backEdge':-1,'rules':{},'objects':[],'texts':[]}))
    return result
