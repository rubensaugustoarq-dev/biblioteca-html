"""Confirmed accessibility overlays; never mutate infrastructure or its quantities."""
import math
from shapely.geometry import Point, LineString, Polygon, shape, mapping
from shapely.ops import unary_union, linemerge, substring
from .domain import num, lines, CURB_MATCH_TOLERANCE
from ..store import DomainError, uid

REFERENCES={'tactileDirectional':'NBR 16537:2024 · 7.4 e 7.8', 'tactileWarning':'NBR 16537:2024 · 6.6', 'vehicleAccess':'NBR 9050:2020 VC:2021 · 6.12.4', 'crosswalk':'MBST Volume IV:2022 · 5.4'}
REFERENCES['parking']='CONTRAN 965/2022 · NBR 9050 · parâmetros de projeto a conferir'

def point(value):
    if not isinstance(value,(list,tuple)) or len(value)!=2:raise DomainError('Indique uma coordenada XY.')
    return [num(v,'Coordenada',-1e9,1e9) for v in value]

def host(anchor,infra,metrics,road_id=None,side=None):
    if side is not None and side not in ('left','right'):raise DomainError('Lado de calçada inválido.')
    p=Point(anchor);walks=unary_union([shape(r['geometry']) for r in metrics.get('regions',[]) if r['role']=='sidewalk' and r.get('geometry')])
    choices=[]
    for r in infra:
        if r['kind']!='road' or road_id and r['id']!=road_id:continue
        axis=shape(r['derived']['axisGeometry']);s=axis.project(p);o=axis.interpolate(s)
        a=axis.interpolate(max(0,s-.05));b=axis.interpolate(min(axis.length,s+.05));dx,dy=b.x-a.x,b.y-a.y;ll=math.hypot(dx,dy)
        if ll<1e-8:continue
        n=(-dy/ll,dx/ll);which=side or ('left' if (p.x-o.x)*n[0]+(p.y-o.y)*n[1]>=0 else 'right');sign=1 if which=='left' else -1
        if side and sign*((p.x-o.x)*n[0]+(p.y-o.y)*n[1])<-1e-8:continue
        width=r['sidewalkLeft' if which=='left' else 'sidewalkRight']
        own=unary_union([shape(g['geometry']) for g in r['derived']['regions'] if g['role']=='sidewalk' and g.get('geometry')]).intersection(walks)
        if width<=0 or own.is_empty:continue
        choices.append((own.distance(p),axis.distance(p),r['id'],r,which,width,own,axis,o,n,sign))
    if not choices:raise DomainError('Não há calçada disponível neste lado da via.')
    item=min(choices,key=lambda c:c[:3]);_,_,_,r,which,width,walk,axis,o,n,sign=item
    return r,which,width,walk,axis,o,(n[0]*sign,n[1]*sign)

def curb_frame(anchor,infra,metrics,road_id=None,side=None):
    r,which,width,walk,axis,o,n=host(anchor,infra,metrics,road_id,side)
    if walk.distance(Point(anchor))>1.5:raise DomainError('Aproxime o ponto de uma calçada existente.')
    pavement=unary_union([shape(g['geometry']) for g in metrics['regions'] if g['role'] in ('pavement','unpaved') and g.get('geometry')])
    candidates=lines(pavement.boundary.intersection(walk.buffer(CURB_MATCH_TOLERANCE)))
    if not candidates:raise DomainError('Meio-fio não identificado neste trecho.')
    merged=linemerge(candidates) if len(candidates)>1 else candidates[0]
    curb=min(lines(merged),key=lambda c:c.distance(Point(anchor)));station=curb.project(Point(anchor))
    walk_probe=walk.buffer(1e-7)
    def xy(x,y):
        s=station+x
        if curb.is_ring:s%=curb.length
        elif s<0 or s>curb.length:raise DomainError('Falta extensão de calçada para este elemento.')
        p=curb.interpolate(s)
        a=curb.interpolate((s-.02)%curb.length if curb.is_ring else max(0,s-.02));b=curb.interpolate((s+.02)%curb.length if curb.is_ring else min(curb.length,s+.02))
        dx,dy=b.x-a.x,b.y-a.y;ll=math.hypot(dx,dy)
        if ll<1e-8:raise DomainError('Meio-fio sem direção.')
        nx,ny=-dy/ll,dx/ll
        if not walk_probe.covers(Point(p.x+nx*.02,p.y+ny*.02)):nx,ny=-nx,-ny
        return (p.x+nx*y,p.y+ny*y)
    def poly(vertices):
        pts=[]
        for a,b in zip(vertices,vertices[1:]+vertices[:1]):
            count=max(1,math.ceil(math.dist(a,b)/.12))
            pts.extend(xy(a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count) for i in range(count))
        return Polygon(pts)
    return r,which,width,walk,curb,station,xy,poly

def candidate(data,infra,metrics,ramps=(),preview=False):
    kind=data.get('kind');identity=uid(data['id'])
    if kind not in REFERENCES:raise DomainError('Elemento de acessibilidade desconhecido.')
    value={k:v for k,v in data.items() if k not in ('derived','projectId','revision')};value['id']=identity
    value['name']=str(data.get('name','Elemento'))[:100];warnings=[];pending=[];parts=[]
    def add(role,g):
        if g.is_empty or not g.is_valid or g.area<1e-8:raise DomainError('A geometria não comporta este elemento. Ajuste o desenho.')
        parts.append({'role':role,'geometry':mapping(g)})
    raw_anchor=data.get('anchor')
    if raw_anchor is None:raw_anchor=(data.get('path') or [[0,0]])[0]
    anchor=point(raw_anchor);value['anchor']=anchor
    length=0;slope=None;free=None;placement_error=None
    width=num(data.get('widthM',.25),'Largura',.1,20);value['widthM']=width
    if kind=='parking':
        from .parking import layout
        result=layout({**data,'anchor':anchor},infra,metrics,preview=preview)
        placement_error=result.pop('placementError',None)
        parts=result.pop('parts');warnings=result.pop('warnings');pending=result.pop('pending')
        value.update(result);length=result['lengthM']
    elif kind=='crosswalk':
        r=next((r for r in infra if r['kind']=='road' and r.get('usage') not in ('walkway','bridge') and r['id']==data.get('roadId')),None)
        if not r:
            r=min((r for r in infra if r['kind']=='road' and r.get('usage') not in ('walkway','bridge')),key=lambda r:shape(r['derived']['axisGeometry']).distance(Point(anchor)),default=None)
        if not r:raise DomainError('Crie uma via para inserir a travessia.')
        if r.get('material')=='earth':raise DomainError('A travessia pintada exige pavimento.')
        axis=shape(r['derived']['axisGeometry']);s=axis.project(Point(anchor));o=axis.interpolate(s);a=axis.interpolate(max(0,s-.05));b=axis.interpolate(min(axis.length,s+.05));theta=math.atan2(b.y-a.y,b.x-a.x)
        if axis.distance(Point(anchor))>r['width']/2+max(r.get('sidewalkLeft',0),r.get('sidewalkRight',0))+1.5:raise DomainError('Aproxime o cursor da via para posicionar a travessia.')
        angle=num(data.get('angleDegrees',0),'Rotação',-80,80)*math.pi/180;theta+=angle
        u=(math.cos(theta),math.sin(theta));n=(-u[1],u[0]);span=r['width']/math.cos(angle);width=num(width,'Largura da travessia',3,12)
        bar=num(data.get('barM',.4),'Barra',.3,.4);gap=num(data.get('gapM',.4),'Intervalo',.3,.8)
        x=-span/2
        while x+bar<=span/2+1e-8:
            g=Polygon([(o.x+n[0]*v+u[0]*w,o.y+n[1]*v+u[1]*w) for v,w in [(x,-width/2),(x+bar,-width/2),(x+bar,width/2),(x,width/2)]])
            add('crosswalk',g);x+=bar+gap
        carriage=unary_union([shape(g['geometry']) for g in metrics['regions'] if g['role']=='pavement' and g.get('geometry')])
        footprint=unary_union([shape(p['geometry']) for p in parts])
        if footprint.difference(carriage).area>2e-4:raise DomainError('A travessia ultrapassa o pavimento neste ponto. Ajuste posição/rotação.')
        value.update(roadId=r['id'],barM=bar,gapM=gap,angleDegrees=angle*180/math.pi);length=span
        linked=[q for q in ramps if q.get('roadId')==r['id'] and q.get('derived',{}).get('status')=='dimensioned']
        near=[q for q in linked if abs(axis.project(Point(q['anchor']))-s)<width/2+.5]
        if not {'left','right'}.issubset({q['side'] for q in near}):warnings.append('Travessia sem par de rampas alinhadas nos dois lados.')
        pending.append('Conferir locação, visibilidade, controle de tráfego e autorização municipal.')
    elif kind=='tactileDirectional':
        automatic=data.get('pathMode')=='automatic'
        coords=[point(p) for p in data.get('path',[])]
        if not automatic and (len(coords)<2 or len(coords)>500):raise DomainError('Desenhe de 2 a 500 pontos no percurso.')
        r,which,nominal,walk,axis,o,n=host(anchor if automatic else coords[0],infra,metrics,data.get('roadId'),data.get('side'))
        service=num(data.get('serviceWidthM',.7),'Faixa de serviço',0,5);free=nominal-service
        if automatic:
            if free<width:raise DomainError('A faixa livre da calçada não comporta a largura do piso direcional.')
            r,which,nominal,walk,curb,s,xy,poly=curb_frame(anchor,infra,metrics,data.get('roadId'),data.get('side'))
            # Choose physical sidewalk components, rather than cutting a
            # continuous cul-de-sac sidewalk at the imaginary axis extension.
            def on_selected_side(p):
                t=axis.project(p);o=axis.interpolate(t)
                a=axis.interpolate(max(0,t-.05));b=axis.interpolate(min(axis.length,t+.05))
                cross=(b.x-a.x)*(p.y-o.y)-(b.y-a.y)*(p.x-o.x)
                return cross*(1 if which=='left' else -1)>=-1e-8
            components=list(getattr(walk,'geoms',[walk]))
            chosen=min(components,key=lambda g:g.distance(Point(anchor)))
            if not r.get('culDeSac',{}).get('enabled'):
                walk=unary_union([g for g in components if g is chosen or on_selected_side(g.representative_point())])
            offset=service+free/2
            # Collect every curb component of this road, including portions split
            # by junctions; a click chooses a side, never a single nearest fragment.
            pavement=unary_union([shape(q['geometry']) for q in metrics['regions'] if q['role'] in ('pavement','unpaved') and q.get('geometry')])
            edges=lines(pavement.boundary.intersection(walk.buffer(CURB_MATCH_TOLERANCE)))
            curbs=lines(linemerge(edges)) if len(edges)>1 else edges
            others=[(shape(q['derived']['axisGeometry']),q['width']/2) for q in infra if q['kind']=='road' and q['id']!=r['id']]
            def belongs(p):
                distance=axis.distance(p)-r['width']/2
                return not any(other.distance(p)-half<distance-.05 for other,half in others)
            routes=[]
            for edge in curbs:
                reference=edge.simplify(2*CURB_MATCH_TOLERANCE,preserve_topology=True)
                count=max(1,math.ceil(reference.length/.25));runs=[];run=[]
                for i in range(count+1):
                    p=reference.interpolate(reference.length*i/count)
                    if belongs(p):run.append((p.x,p.y))
                    else:
                        if len(run)>1:runs.append(LineString(run))
                        run=[]
                if len(run)>1:runs.append(LineString(run))
                for reference in runs:
                    if reference.length<width:continue
                    t=reference.length/2;p=reference.interpolate(t)
                    a=reference.interpolate(max(0,t-.02));b=reference.interpolate(min(reference.length,t+.02))
                    dx,dy=b.x-a.x,b.y-a.y;ll=math.hypot(dx,dy)
                    if ll<1e-8:continue
                    sign=1 if walk.buffer(1e-7).covers(Point(p.x-dy/ll*.02,p.y+dx/ll*.02)) else -1
                    for route in lines(reference.offset_curve(sign*offset,join_style=2,mitre_limit=2)):
                        margin=width/2+.02
                        if route.length<=2*margin:continue
                        route=route if route.is_ring else substring(route,margin,route.length-margin)
                        if route.buffer(width/2,cap_style=2,join_style=2,mitre_limit=2).difference(walk).area>2e-4:
                            # Intersections can narrow the actual sidewalk below
                            # its nominal section. Center in the measured strip.
                            points=[];fitted=[];samples=max(2,math.ceil(reference.length/.12))
                            for j in range(samples+1):
                                t=margin+(reference.length-2*margin)*j/samples;p=reference.interpolate(t)
                                a=reference.interpolate(max(0,t-.02));b=reference.interpolate(min(reference.length,t+.02))
                                dx,dy=b.x-a.x,b.y-a.y;ll=math.hypot(dx,dy)
                                if ll<1e-8:raise DomainError('Calçada sem direção contínua neste encontro.')
                                nx,ny=sign*-dy/ll,sign*dx/ll
                                ray=LineString([(p.x,p.y),(p.x+nx*50,p.y+ny*50)])
                                spans=lines(ray.intersection(walk.buffer(CURB_MATCH_TOLERANCE)))
                                spans=[q for q in spans if q.distance(p)<.001]
                                available=max((q.length for q in spans),default=0)
                                if available<service+width:
                                    if len(points)>1:fitted.append(LineString(points))
                                    points=[]
                                    message='Há trecho de encontro sem largura para a faixa de serviço e o piso; percurso interrompido ali. Revise a calçada.'
                                    if message not in warnings:warnings.append(message)
                                    continue
                                inset=service+(available-service)/2
                                points.append((p.x+nx*inset,p.y+ny*inset))
                            if len(points)>1:fitted.append(LineString(points))
                            routes.extend(fitted)
                            continue
                        routes.append(route)
            if not routes:raise DomainError('Não foi identificado trecho contínuo desta calçada.')
            line=unary_union(routes)
            clearance=num(data.get('rampClearanceM',.5),'Reserva junto às rampas',0,5)
            ramp_shapes=[shape(q['derived']['geometry']) for q in ramps
                        if q.get('roadId')==r['id'] and q.get('derived',{}).get('status')=='dimensioned' and q['derived'].get('geometry')
                        and shape(q['derived']['geometry']).intersection(walk).area>1e-5]
            reserved=[]
            for route in lines(line):
                intervals=[]
                for ramp_shape in ramp_shapes:
                    if route.distance(ramp_shape)>nominal+clearance:continue
                    stations=[route.project(Point(p)) for edge in lines(ramp_shape.boundary) for p in edge.coords]
                    if stations:intervals.append((max(0,min(stations)-clearance),min(route.length,max(stations)+clearance)))
                start=0
                for a,b in sorted(intervals):
                    if a>start+.1:reserved.append(substring(route,start,a))
                    start=max(start,b)
                if start<route.length-.1:reserved.append(substring(route,start,route.length))
            line=unary_union(reserved)
            segments=[q for q in lines(line) if q.length>=.1]
            if not segments:raise DomainError('As reservas das rampas ocupam todo o percurso disponível.')
            line=unary_union(segments)
            value['rampClearanceM']=clearance
            value.update(pathMode='automatic',offsetM=offset)
            coords=[] # Automatic routes are regenerated from their host, not frozen vertices.
        else:
            line=LineString(coords)
        if not automatic and data.get('pathMode')=='sidewalk':
            r,which,nominal,walk,curb,s,xy,poly=curb_frame(coords[0],infra,metrics,data.get('roadId'),data.get('side'))
            end=curb.project(Point(coords[-1]));delta=end-s
            if curb.is_ring and abs(delta)>curb.length/2:delta-=math.copysign(curb.length,delta)
            offset=num(data.get('offsetM',service+free/2),'Afastamento da guia',.05,20)
            count=max(1,math.ceil(abs(delta)/.12));line=LineString([xy(delta*i/count,offset) for i in range(count+1)])
        if not line.is_simple or line.length<.1 or line.length>10000:raise DomainError('Percurso inválido, cruzado ou muito extenso.')
        g=line.buffer(width/2,cap_style=2,join_style=2,mitre_limit=2)
        if g.difference(walk).area>2e-4:raise DomainError('O piso direcional deve caber integralmente na calçada, sem recorte.')
        alerts=[]
        if not automatic and data.get('pathMode')!='sidewalk':
            for i in range(1,len(coords)-1):
                a,b,c=coords[i-1:i+2];u=(a[0]-b[0],a[1]-b[1]);v=(c[0]-b[0],c[1]-b[1]);ll=math.hypot(*u)*math.hypot(*v)
                if ll<1e-10:raise DomainError('Remova pontos consecutivos repetidos do percurso.')
                angle=math.degrees(math.acos(max(-1,min(1,(u[0]*v[0]+u[1]*v[1])/ll))))
                if 90-1e-7<=angle<=150+1e-7:
                    size=2*width;theta=math.atan2(u[1],u[0]);ux,uy=math.cos(theta),math.sin(theta)
                    alert=Polygon([(b[0]+ux*x-uy*y,b[1]+uy*x+ux*y) for x,y in [(-size/2,-size/2),(size/2,-size/2),(size/2,size/2),(-size/2,size/2)]])
                    if alert.difference(walk).area>2e-4:raise DomainError('A área de alerta na mudança de direção não cabe na calçada. Reposicione o vértice.')
                    alerts.append(alert)
                elif angle<90:warnings.append('Mudança de direção muito fechada; revisar percurso conforme NBR 16537 · 7.3 e 7.4.')
        direction=g.difference(unary_union(alerts)) if alerts else g
        for part in getattr(direction,'geoms',[direction]):add('directional',part)
        for alert in alerts:add('warning',alert)
        length=line.length
        if free<1.2:warnings.append('Faixa livre declarada inferior a 1,20 m.')
        if free<width+1.2:warnings.append('Conferir posicionamento e faixa lisa lateral: a solução central não reserva 0,60 m em ambos os lados.')
        if g.distance(axis)<r['width']/2+service-1e-4:warnings.append('Percurso invade a faixa de serviço declarada. Ajuste o afastamento.')
        # Changes of direction and junctions require context-specific warning surfaces.
        if len(coords)>2 and data.get('pathMode')!='sidewalk':pending.append('Alertas em mudanças de 90° a 150° gerados com dobro da largura; conferir encontros entre percursos independentes.')
        value.update(roadId=r['id'],side=which,path=coords,serviceWidthM=service)
    else:
        linked=None
        if data.get('rampId'):
            linked=next((r for r in ramps if r['id']==data['rampId'] and r.get('derived',{}).get('status')=='dimensioned'),None)
            if not linked:raise DomainError('A rampa vinculada não está disponível para sinalização.')
            anchor=linked['anchor'];value.update(anchor=anchor,roadId=linked['roadId'],side=linked['side'])
        r,which,nominal,walk,curb,s,xy,poly=curb_frame(anchor,infra,metrics,value.get('roadId'),value.get('side'))
        value.update(roadId=r['id'],side=which)
        if kind=='vehicleAccess':
            depth=num(data.get('runM',.7),'Desenvolvimento',.1,10);height=num(data.get('heightM',.15),'Desnível',.01,1)
            transition=num(data.get('transitionM',.5),'Transição lateral',0,5);free=nominal-depth;slope=height*100/depth
            if free<1.2-1e-5:raise DomainError('O acesso de veículos deve preservar ao menos 1,20 m de faixa livre na calçada.')
            add('vehicle',poly([(-width/2,0),(width/2,0),(width/2,depth),(-width/2,depth)]))
            if transition:
                add('vehicle',poly([(-width/2-transition,0),(-width/2,0),(-width/2,depth)]));add('vehicle',poly([(width/2,0),(width/2+transition,0),(width/2,depth)]))
            free_strip=poly([(-width/2-transition,depth),(width/2+transition,depth),(width/2+transition,depth+1.2)])
            if free_strip.difference(walk).area>2e-4:raise DomainError('A geometria não preserva faixa livre contínua atrás deste acesso.')
            value.update(runM=depth,heightM=height,transitionM=transition);length=width+2*transition
            pending.append('Inclinação do acesso veicular calculada, sem limite municipal confirmado; conferir níveis reais, drenagem e continuidade do passeio.')
        else:
            extent=linked['widthM'] if linked else num(data.get('lengthM',1.5),'Comprimento',.1,100)
            offset=num(data.get('offsetM',.5),'Distância da guia',0,20)
            purpose=data.get('purpose','crossing');value['purpose']=purpose
            if purpose=='crossing' and not .4<=width<=.6:warnings.append('Alerta de travessia: adotar largura entre 0,40 m e 0,60 m.')
            if purpose=='crossing' and abs(offset-.5)>1e-6:warnings.append('Alerta de travessia: conferir afastamento de 0,50 m da guia.')
            angle=num(data.get('angleDegrees',0),'Rotação',-180,180)*math.pi/180
            normal_half=(abs(math.sin(angle))*extent+abs(math.cos(angle))*width)/2
            if linked and offset+2*normal_half>linked['derived']['depthM']+1e-5:raise DomainError('A rampa vinculada não tem desenvolvimento suficiente para o alerta nesta rotação.')
            vertices=[(-extent/2,-width/2),(extent/2,-width/2),(extent/2,width/2),(-extent/2,width/2)]
            add('warning',poly([(x*math.cos(angle)-y*math.sin(angle),offset+normal_half+x*math.sin(angle)+y*math.cos(angle)) for x,y in vertices]))
            value['angleDegrees']=angle*180/math.pi
            value.update(lengthM=extent,offsetM=offset);length=extent
            if purpose!='crossing':pending.append('Modelo manual: conferir posição e dimensões para a finalidade específica na NBR 16537.')
        footprint=unary_union([shape(p['geometry']) for p in parts])
        if footprint.difference(walk).area>2e-4:raise DomainError('O elemento não cabe integralmente na calçada neste trecho.')
    footprint=unary_union([shape(p['geometry']) for p in parts])
    if kind.startswith('tactile'):
        tile=num(data.get('tileM',.25),'Módulo da placa',.1,1);value['tileM']=tile
        a=data.get('lrvFloor');b=data.get('lrvTactile')
        if a is None or b is None:pending.append('Contraste LRV seco/molhado não informado; a cor da tela não comprova conformidade.')
        elif abs(num(a,'LRV do entorno',0,100)-num(b,'LRV do piso tátil',0,100))<30:warnings.append('Diferença de LRV inferior a 30 pontos.')
        if width<.25 or width>.6:warnings.append('Conferir largura da sinalização para a situação específica.')
        pieces=math.ceil(footprint.area/(tile*tile)-1e-9)
    else:pieces=None
    color=str(data.get('color','#e6c64a'))
    if len(color)!=7 or color[0]!='#' or any(c not in '0123456789abcdefABCDEF' for c in color[1:]):raise DomainError('Cor inválida.')
    value['color']=color
    value['derived']={'status':'invalid' if placement_error else 'dimensioned','geometry':mapping(footprint),'parts':parts,'axisGeometry':mapping(line) if kind=='tactileDirectional' else None,'areaM2':footprint.area,'lengthM':length,'slopePercent':slope,'freeWidthM':free,'pieces':pieces,'warnings':warnings,'pending':pending,'reference':REFERENCES[kind]}
    if placement_error:value['derived']['error']=placement_error
    return value

def derive(values,infra,metrics,ramps):
    result=[]
    for value in values:
        try:result.append(candidate(value,infra,metrics,ramps))
        except (DomainError,KeyError,TypeError,ValueError) as e:result.append({**{k:v for k,v in value.items() if k!='derived'},'derived':{'status':'invalid','geometry':None,'parts':[],'warnings':[str(e)],'pending':[]}})
    return result

def totals(values):
    groups={}
    warning_union=unary_union([shape(p['geometry']) for v in values if v.get('derived',{}).get('status')=='dimensioned' for p in v['derived']['parts'] if p['role']=='warning'])
    for kind in REFERENCES:
        items=[v for v in values if v['kind']==kind and v.get('derived',{}).get('status')=='dimensioned']
        geometries=[shape(v['derived']['geometry']) for v in items];count=len(items)
        if kind=='tactileDirectional':geometries=[shape(p['geometry']) for v in items for p in v['derived']['parts'] if p['role']=='directional']
        if kind=='tactileWarning':
            generated=[p for v in values if v['kind']=='tactileDirectional' and v.get('derived',{}).get('status')=='dimensioned' for p in v['derived']['parts'] if p['role']=='warning']
            geometries.extend(shape(p['geometry']) for p in generated);count+=len(generated)
        g=unary_union(geometries)
        if kind=='tactileDirectional':g=g.difference(warning_union)
        if kind=='parking':count=sum(v.get('quantity',1) for v in items)
        groups[kind]={'count':count,'areaM2':g.area,'lengthM':sum(v['derived']['lengthM'] for v in items)}
        if kind=='parking':
            from .parking import TYPES
            groups[kind]['byType']={key:sum(v.get('quantity',1) for v in items if v.get('parkingType','car')==key) for key in TYPES}
    return groups
