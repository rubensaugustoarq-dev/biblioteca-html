"""Linked curb-ramp overlays. Never change road or sidewalk quantities.
Dimensional subset: NBR 9050:2020 corrected 2021, 6.12.7.3/.3.4.
"""
import math
from shapely.geometry import Point,LineString,Polygon,mapping,shape
from shapely.ops import unary_union,linemerge,nearest_points
from ..store import DomainError,uid

REFERENCE='ABNT NBR 9050:2020 VC:2021 · 6.12.7.3 e 6.12.7.3.4'
# Ten micrometres only for matching independently derived boundaries in UTM.
# Footprints/containment/quantities continue to use the original confirmed geometry.
CURB_MATCH_TOLERANCE=1e-5

def num(value,label,low,high):
    try:v=float(value)
    except (ValueError,TypeError):raise DomainError(label+' inválido.')
    if not math.isfinite(v) or not low<=v<=high:raise DomainError(label+' fora do intervalo permitido.')
    return v

def lines(g):
    if g.geom_type=='LineString':return [g]
    return [p for part in getattr(g,'geoms',[]) for p in lines(part)]

def placement(data,infra,metrics,tolerance=0):
    """Resolve host/side from the cursor. The saved candidate keeps an explicit link.
    Screen tolerance only snaps the anchor; it never clips or deforms the ramp.
    """
    anchor=data.get('anchor',[])
    if not isinstance(anchor,(list,tuple)) or len(anchor)!=2:raise DomainError('Aproxime o mouse de uma calçada.')
    point=Point([num(v,'Coordenada',-1e9,1e9) for v in anchor])
    tolerance=num(tolerance,'Tolerância de captura',0,1.5)
    walks=unary_union([shape(r['geometry']) for r in metrics.get('regions',[]) if r['role']=='sidewalk'])
    options=[]
    for road in infra:
        if road['kind']!='road':continue
        walk=unary_union([shape(r['geometry']) for r in road['derived']['regions'] if r['role']=='sidewalk']).intersection(walks)
        if walk.is_empty or walk.distance(point)>tolerance+1e-7:continue
        interior=walk.buffer(-.002)
        q=point if walk.covers(point) else nearest_points(interior if not interior.is_empty else walk,point)[0]
        axis=shape(road['derived']['axisGeometry']);s=axis.project(q);origin=axis.interpolate(s)
        a=axis.interpolate(max(0,s-.05));b=axis.interpolate(min(axis.length,s+.05))
        side='left' if (b.x-a.x)*(q.y-origin.y)-(b.y-a.y)*(q.x-origin.x)>=0 else 'right'
        if road['sidewalkLeft' if side=='left' else 'sidewalkRight']<=0:continue
        options.append((walk.distance(point),axis.distance(q),road['id'],side,[q.x,q.y]))
    if not options:raise DomainError('Aproxime o mouse de uma calçada existente. Vias sem calçada não aceitam rampas.')
    _,_,road_id,side,anchor=min(options)
    slope=5 if data.get('kind')=='longitudinal' else 8.33
    value=candidate({**data,'roadId':road_id,'side':side,'anchor':anchor,'slopePercent':slope,'flankSlopePercent':slope,'crossSlopePercent':2},infra,metrics)
    for other in metrics.get('_ramps',[]):
        if other['id']!=value['id'] and other.get('derived',{}).get('geometry') and shape(value['derived']['geometry']).intersection(shape(other['derived']['geometry'])).area>1e-5:
            raise DomainError('Esta rampa sobrepõe outra rampa. Reposicione-a.')
    return value

def candidate(data,infra,metrics):
    identity=uid(data['id']);road_id=uid(data['roadId']);side=data.get('side','left');kind=data.get('kind','straight')
    if side not in ('left','right') or kind not in ('straight','longitudinal'):raise DomainError('Tipo ou lado de rampa inválido.')
    road=next((r for r in infra if r['id']==road_id and r['kind']=='road'),None)
    if not road:raise DomainError('A via vinculada não existe.')
    nominal=road['sidewalkLeft' if side=='left' else 'sidewalkRight']
    if nominal<=0:raise DomainError('Não é permitido inserir rampa em via/lado sem calçada.')
    height=num(data.get('heightM',.15),'Desnível',.01,.5)
    advisory=kind=='straight';warnings=[]
    width=num(data.get('widthM',1.5),'Largura / patamar',.1 if advisory else 1.2,10)
    minimum_slope=.00001 if data.get('sideRunM') is not None else .5
    slope=num(data.get('slopePercent',5 if kind=='longitudinal' else 8.33),'Inclinação',minimum_slope,500 if advisory else 5)
    cross=num(data.get('crossSlopePercent',2),'Inclinação transversal',0,100 if advisory else 3)
    flank=num(data.get('flankSlopePercent',slope),'Inclinação das abas',minimum_slope,500 if advisory else slope)
    side_run=None
    if data.get('sideRunM') is not None:
        side_run=num(data['sideRunM'],'Comprimento das abas/aproximações',.1,100)
        actual=height*100/side_run;limit=5 if kind=='longitudinal' else slope
        # Compare slopes at the same hundredth-percent precision as the standard notation.
        if not advisory and round(actual,2)>limit+1e-8:
            raise DomainError(f'Comprimento de {side_run:.2f} m resulta em {actual:.2f}%. O limite deste modelo é {limit:.2f}%; com desnível de {height:.2f} m, use pelo menos {height*100/limit:.2f} m ou revise o desnível/modelo.')
        flank=round(actual,2)
        if kind=='longitudinal':slope=flank
    if advisory:
        if width<1.2:warnings.append(f'Largura central de {width:.2f} m inferior ao mínimo de 1,20 m.')
        if round(slope,2)>8.33:warnings.append(f'Inclinação central de {slope:.2f}% acima de 8,33%.')
        if round(flank,2)>min(slope,8.33):warnings.append(f'Inclinação das abas de {flank:.2f}% acima do limite de {min(slope,8.33):.2f}%.')
        if cross>3:warnings.append(f'Inclinação transversal de {cross:.2f}% acima de 3%.')
    anchor=data['anchor']
    if not isinstance(anchor,(list,tuple)) or len(anchor)!=2:raise DomainError('Indique a posição na calçada.')
    anchor=[num(v,'Coordenada',-1e9,1e9) for v in anchor];point=Point(anchor)
    own_walk=unary_union([shape(r['geometry']) for r in road['derived']['regions'] if r['role']=='sidewalk'])
    all_walk=unary_union([shape(r['geometry']) for r in metrics.get('regions',[]) if r['role']=='sidewalk'])
    walk=own_walk.intersection(all_walk)
    if not walk.buffer(.05).covers(point):raise DomainError('Clique dentro da calçada da via escolhida.')
    carriage=unary_union([shape(r['geometry']) for r in metrics.get('regions',[]) if r['role'] in ('pavement','unpaved')])
    curb_lines=lines(carriage.boundary.intersection(walk.buffer(CURB_MATCH_TOLERANCE)))
    if not curb_lines:raise DomainError('Não foi possível identificar o meio-fio neste trecho.')
    curb=linemerge(curb_lines) if len(curb_lines)>1 else curb_lines[0]
    axis=shape(road['derived']['axisGeometry']);station=axis.project(point)
    a=axis.interpolate(max(0,station-.05));b=axis.interpolate(min(axis.length,station+.05));dx,dy=b.x-a.x,b.y-a.y;length=math.hypot(dx,dy)
    if length<1e-8:raise DomainError('O eixo da via não tem direção neste trecho.')
    nx,ny=-dy/length,dx/length;sign=1 if side=='left' else -1;origin=axis.interpolate(station)
    if sign*((point.x-origin.x)*nx+(point.y-origin.y)*ny)<0:raise DomainError('O ponto está na calçada do outro lado. Troque Esquerda/Direita.')
    options=lines(curb);curb=min(options,key=lambda l:l.distance(point));s=curb.project(point);base=curb.interpolate(s)
    walk_probe=walk.buffer(1e-7)
    def frame(t):
        if curb.is_ring:
            p=curb.interpolate(t%curb.length);q=curb.interpolate((t-.02)%curb.length);r=curb.interpolate((t+.02)%curb.length)
        else:p=curb.interpolate(t);q=curb.interpolate(max(0,t-.02));r=curb.interpolate(min(curb.length,t+.02))
        ux,uy=r.x-q.x,r.y-q.y;ll=math.hypot(ux,uy)
        if ll<1e-9:raise DomainError('Meio-fio sem direção.')
        vx,vy=-uy/ll,ux/ll
        if not walk_probe.covers(Point(p.x+vx*.02,p.y+vy*.02)):vx,vy=-vx,-vy
        return p,vx,vy
    def xy(x,y):
        p,vx,vy=frame(s+x);return (p.x+vx*y,p.y+vy*y)
    run=side_run if kind=='longitudinal' and side_run is not None else height*100/slope
    wing=side_run if side_run is not None else height*100/flank
    half=width/2;extent=half+(run if kind=='longitudinal' else wing)
    before=s;after=curb.length-s
    if (not curb.is_ring and (before<extent+.01 or after<extent+.01)) or (curb.is_ring and 2*extent>=curb.length-.02):
        raise DomainError(f'Falta extensão ao longo da calçada: a rampa ocupa {2*extent:.2f} m ({run if kind=="longitudinal" else wing:.2f} + {width:.2f} + {run if kind=="longitudinal" else wing:.2f} m). Disponível a partir deste ponto: {before:.2f} m para um lado e {after:.2f} m para o outro. A largura de {nominal:.2f} m é outra medida; reposicione longe da extremidade/encontro.')
    def local_poly(vertices):
        points=[]
        # Densify the footprint along the actual curb, including curved hosts.
        for a,b in zip(vertices,vertices[1:]+vertices[:1]):
            count=max(1,math.ceil(math.dist(a,b)/.12))
            for i in range(count):points.append(xy(a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count))
        g=Polygon(points)
        if not g.is_valid or g.area<1e-7:raise DomainError('A curvatura do meio-fio não comporta esta rampa.')
        return g
    parts=[]
    if kind=='straight':
        if nominal-run<1.2-1e-8:warnings.append(f'Faixa livre restante de {max(0,nominal-run):.3f} m, inferior a 1,20 m. Para estes parâmetros, a calçada precisa de {run+1.2:.3f} m de largura.')
        # Flares widen at the curb (y=0), tapering to the central width inland.
        specs=[('central',[(-half,0),(half,0),(half,run),(-half,run)]),('wing',[(-half-wing,0),(-half,0),(-half,run)]),('wing',[(half,0),(half+wing,0),(half,run)])]
        # Test the rear free strip as well as the ramp itself.
        if nominal-run>=1.2-1e-8:
            try:
                free=local_poly([(-half-wing,run),(half+wing,run),(half+wing,run+1.2),(-half-wing,run+1.2)])
                if free.difference(walk).area>1e-5:warnings.append('O trecho não preserva a faixa livre contínua de 1,20 m atrás da rampa.')
            except DomainError:warnings.append('Não foi possível confirmar a faixa livre de 1,20 m neste trecho curvo.')
        depth=run;free_width=nominal-run
    else:
        if nominal<1.2:raise DomainError('A rampa longitudinal exige calçada com pelo menos 1,20 m livres de largura.')
        # Full-width lowered landing; both approaches restore the sidewalk grade.
        # Tiny inset only avoids numerical noise at the outer buffer boundary.
        depth=nominal-1e-5;free_width=nominal
        specs=[('landing',[(-half,0),(half,0),(half,depth),(-half,depth)]),('approach',[(-half-run,0),(-half,0),(-half,depth),(-half-run,depth)]),('approach',[(half,0),(half+run,0),(half+run,depth),(half,depth)])]
    for role,vertices in specs:
        geometry=local_poly(vertices)
        if geometry.difference(walk).area>2e-4:raise DomainError('A rampa não cabe integralmente na calçada neste trecho. Reposicione ou ajuste o modelo; o contorno não será recortado.')
        parts.append({'role':role,'geometry':mapping(geometry)})
    footprint=unary_union([shape(p['geometry']) for p in parts])
    return {'id':identity,'roadId':road_id,'side':side,'kind':kind,'name':str(data.get('name','Rampa'))[:100] or 'Rampa','anchor':anchor,'heightM':height,'widthM':width,'sideRunM':side_run,'slopePercent':slope,'flankSlopePercent':flank,'crossSlopePercent':cross,'derived':{'status':'dimensioned','normativeStatus':'outside' if warnings else 'checked','warnings':warnings,'geometry':mapping(footprint),'parts':parts,'curbPoint':[base.x,base.y],'runM':run,'sideRunM':run if kind=='longitudinal' else wing,'totalLengthM':2*extent,'depthM':depth,'freeWidthM':free_width,'overlayAreaM2':footprint.area,'reference':REFERENCE,'note':'Checagem dimensional. Confirmar níveis, encontro sem ressalto, piso tátil, alinhamento da travessia e aprovação/localização municipal.'}}

def derive(values,infra,metrics):
    result=[]
    for value in values:
        try:result.append(candidate(value,infra,metrics))
        except DomainError as error:
            result.append({**{k:v for k,v in value.items() if k!='derived'},'derived':{'status':'invalid','message':str(error),'geometry':None,'parts':[]}})
    return result


