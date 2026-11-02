"""Bounded search of front-aligned subdivision alternatives, not a global solver."""
import math
import time
from uuid import uuid4
from shapely import set_precision
from shapely.geometry import shape,mapping,box,Polygon
from shapely.affinity import rotate,translate
from shapely.ops import unary_union
from ...store import DomainError
from .layout import validate,fits,local_measures,road_space,surface_space

def polygon_parts(g):
    if g.geom_type=='Polygon' and g.area>1e-8:return [g]
    return [part for child in getattr(g,'geoms',[]) for part in polygon_parts(child)]

def sizes(target,minimum,maximum,extent,area,other):
    maximum=maximum or max(target*1.5,minimum)
    values=[target,minimum,area/max(other,1e-9),maximum]
    for preferred in (target,minimum,area/max(other,1e-9)):
        n=max(1,math.floor(extent/max(preferred,1e-9)))
        values.extend(extent/k for k in (max(1,n-1),n,n+1))
    candidates=sorted({round(v,7) for v in values if minimum-1e-6<=v<=maximum+1e-6 and v>0})
    # Include density-oriented and preferred sizes within a deterministic bound.
    return sorted(candidates,key=lambda v:(abs(v-target),v))[:7]

def alternatives(value,infra):
    started=time.perf_counter()
    value={**value,'zones':[z for z in value.get('zones',[]) if not z.get('automatic')],
           'lots':[l for l in value.get('lots',[]) if l.get('locked')]}
    base=validate(value,infra);boundary=shape(base['sourceGeometry']);params=base['parameters']
    ring=list(boundary.exterior.coords);index=params['frontEdge'];origin=ring[index]
    if params['followFront']:
        end=ring[index+1];angle=math.degrees(math.atan2(end[1]-origin[1],end[0]-origin[0]))
        if not boundary.exterior.is_ccw:angle+=180;origin=end
        params={**params,'angle':angle}
        base=validate({**base,'parameters':params},infra)
    angle=params['angle']
    def local(g):return rotate(translate(g,xoff=-origin[0],yoff=-origin[1]),-angle,origin=(0,0))
    def world(g):return translate(rotate(g,angle,origin=(0,0)),xoff=origin[0],yoff=origin[1])
    reserved=unary_union([road_space(infra),surface_space(infra),*[shape(z['geometry']) for z in base['zones']],*[shape(l['geometry']) for l in base['lots']]])
    available=local(boundary.difference(reserved))
    if available.is_empty:raise DomainError('Não há área livre após descontar vias, usos e lotes travados.')
    xmin,ymin,xmax,ymax=available.bounds
    min_depth=params['minDepth'] or params['depth']
    widths=sizes(params['frontage'],params['minFrontage'],params['maxFrontage'],xmax-xmin,params['minArea'],params['depth'])
    depths=sizes(params['depth'],min_depth,params['maxDepth'],ymax-ymin,params['minArea'],params['frontage'])
    configs=[(w,d,anchor) for w in widths for d in depths if w*d>=params['minArea']-1e-6 and (not params['maxArea'] or w*d<=params['maxArea']+1e-6) for anchor in ('front','bounds')]
    configs.sort(key=lambda c:(c[0]*c[1],abs(c[0]-params['frontage'])+abs(c[1]-params['depth']),c[2]!='front'))
    # Preserve the preferred size among the search trials, even when it is less dense.
    preferred=[c for c in configs if abs(c[0]-params['frontage'])<1e-6 and abs(c[1]-params['depth'])<1e-6]
    config_limited=len(configs)>72
    configs=(preferred[:1]+[c for c in configs if c not in preferred[:1]])[:72]
    if not configs:raise DomainError('Não há combinação de dimensões que respeite os mínimos e máximos.')
    pool=[];seen=set();tested=0;cells=0;limited=config_limited
    for w,d,anchor in configs:
        if time.perf_counter()-started>8 or cells>=120000:limited=True;break
        x0=math.floor(xmin/w)*w if anchor=='front' else xmin
        y0=math.floor(ymin/d)*d if anchor=='front' else ymin
        nx=math.ceil((xmax-x0)/w);ny=math.ceil((ymax-y0)/d)
        if nx*ny>20000:limited=True;continue
        pieces=[];aborted=False
        for row in range(ny):
            for column in range(nx):
                cells+=1
                if cells>120000 or (cells%1000==0 and time.perf_counter()-started>8):aborted=True;limited=True;break
                cell=box(x0+column*w,y0+row*d,x0+(column+1)*w,y0+(row+1)*d)
                piece=available.intersection(cell)
                if not params['adaptEdges'] and abs(piece.area-w*d)>1e-6:continue
                if fits(piece,params):pieces.append(piece)
            if aborted:break
        if aborted:break
        tested+=1
        if not pieces or len(pieces)+len(base['lots'])>1000:continue
        # Absorb residuals only when the resulting parcel still meets every bound.
        if params['adaptEdges']:
            residuals=polygon_parts(available.difference(unary_union(pieces)))
            piece_bounds=[p.bounds for p in pieces]
            for residual in sorted(residuals,key=lambda p:p.area,reverse=True)[:200]:
                if time.perf_counter()-started>8:limited=True;break
                if fits(residual,params) and len(pieces)+len(base['lots'])<1000:pieces.append(residual);piece_bounds.append(residual.bounds);continue
                rx,ry,rxx,ryy=residual.bounds
                adjacent=[i for i,(px,py,pxx,pyy) in enumerate(piece_bounds) if px<=rxx+1e-6 and pxx>=rx-1e-6 and py<=ryy+1e-6 and pyy>=ry-1e-6]
                neighbours=sorted(((pieces[i].boundary.intersection(residual.boundary).length,i) for i in adjacent),reverse=True)
                for contact,i in neighbours[:3]:
                    if contact<=1e-6:break
                    merged=pieces[i].union(residual)
                    if fits(merged,params):pieces[i]=merged;piece_bounds[i]=merged.bounds;break
        signature=tuple(sorted(set_precision(p,1e-5).normalize().wkb for p in pieces))
        if signature in seen:continue
        seen.add(signature)
        area=sum(p.area for p in pieces);deviation=sum(abs(p.area-params['frontage']*params['depth']) for p in pieces)/len(pieces)
        pool.append({'pieces':pieces,'count':len(pieces),'area':area,'deviation':deviation,'width':w,'depth':d,'anchor':anchor})
    if not pool:
        if not params['greenRemainder']:raise DomainError('Nenhuma divisão encontrada dentro dos limites. Revise a frente, as dimensões ou as reservas.')
        # The user explicitly enabled green designation; expose this as a preview,
        # never as a finding that no possible subdivision exists in general.
        pool=[{'pieces':[],'count':0,'area':0,'deviation':0,'width':params['frontage'],'depth':params['depth'],'anchor':'front'}]
    rankings=[('Mais lotes',lambda c:(c['count'],c['area'],-c['deviation'])),
              ('Maior aproveitamento',lambda c:(c['area'],c['count'],-c['deviation'])),
              ('Mais próxima do padrão',lambda c:(-c['deviation'],c['count'],c['area']))]
    selected=[];used=set()
    for name,key in rankings:
        for candidate in sorted(pool,key=key,reverse=True):
            if id(candidate) not in used:selected.append((name,candidate));used.add(id(candidate));break
    results=[]
    for name,candidate in selected:
        lots=list(base['lots']);number=max([l['number'] for l in lots]+[0])
        for piece in candidate['pieces']:
            number+=1;lots.append({'id':str(uuid4()),'name':f'Lote {number:03d}','number':number,'geometry':mapping(world(piece)),'locked':False})
        try:
            result=validate({**base,'parameters':params,'lots':lots},infra)
            if result['derived']['conflictAreaM2']>1e-6:continue
            if params['greenRemainder']:
                greens=polygon_parts(shape(result['derived']['remainderGeometry']))
                if len(greens)+len(result['zones'])>200:continue
                generated=[{'id':str(uuid4()),'name':f'Área verde · sobra {i+1:02d}','use':'green','automatic':True,'reference':'Destinação automática de sobras solicitada pelo usuário; conferir na prévia.','geometry':mapping(g)} for i,g in enumerate(greens)]
                result=validate({**result,'zones':[*result['zones'],*generated]},infra)
        except DomainError:continue
        metrics=result['derived'];actual_green=metrics['categories']['green']['areaM2']
        results.append({'name':name if lots else 'Sem lotes encontrados nesta busca','layout':{k:result[k] for k in ('parameters','lots','zones','derived')},
            'summary':{'lotCount':len(lots),'lotAreaM2':metrics['categories']['lots']['areaM2'],'greenAreaM2':actual_green,
                'utilizationPercent':metrics['categories']['lots']['percent'],'trialFrontageM':candidate['width'],'trialDepthM':candidate['depth']}})
    if not results:raise DomainError('As alternativas calculadas não passaram na conferência final. Ajuste os limites.')
    return {'alternatives':results,'search':{'tested':tested,'cells':cells,'limited':limited,'elapsedSeconds':round(time.perf_counter()-started,3),
        'note':'Melhores alternativas entre as combinações testadas; não é garantia de máximo global nem de aprovação urbanística.'}}
