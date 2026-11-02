"""Planar road bands and material quantities, independent of Study/ENL."""
import math
from shapely import union_all
from shapely.geometry import LineString, Point, Polygon, mapping, shape
from shapely.ops import unary_union, nearest_points, substring
from ..store import DomainError,polygon,uid

MATERIALS=('asphalt','concrete','pavers','brick','earth','wood')
def numeric(value,label,low,high):
    try:value=float(value)
    except (ValueError,TypeError):raise DomainError(label+' inválido.')
    if not math.isfinite(value) or not low<=value<=high:raise DomainError(label+' fora dos limites.')
    return value

def rounded_axis(coords,radius,radii=None):
    """Circular tangent fillets, with chord error <= 1 cm; control points preserved."""
    if not radius and not radii:return LineString(coords),LineString(coords).length
    if len(coords)<3:raise DomainError('Adicione pelo menos três pontos ao eixo para criar concordância.')
    corners={};cuts=[0.0]*len(coords);length=LineString(coords).length
    for i in range(1,len(coords)-1):
        local_radius=radii.get(str(i),0) if radii is not None else radius
        if not local_radius:continue
        a,b,c=coords[i-1:i+2];la=math.dist(a,b);lb=math.dist(b,c)
        u=((b[0]-a[0])/la,(b[1]-a[1])/la);v=((c[0]-b[0])/lb,(c[1]-b[1])/lb)
        turn=math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])
        if abs(turn)<1e-8:continue
        if abs(turn)>math.pi-1e-6:raise DomainError('O eixo retorna sobre si mesmo; ajuste os pontos.')
        cut=local_radius*math.tan(abs(turn)/2);cuts[i]=cut
        start=(b[0]-u[0]*cut,b[1]-u[1]*cut);end=(b[0]+v[0]*cut,b[1]+v[1]*cut)
        sign=1 if turn>0 else -1
        center=(start[0]-u[1]*local_radius*sign,start[1]+u[0]*local_radius*sign)
        angle=math.atan2(start[1]-center[1],start[0]-center[0])
        step=2*math.acos(max(-1,1-min(.01/local_radius,1)))
        count=max(2,math.ceil(abs(turn)/step))
        if count>2048:raise DomainError('Raio/curva acima do limite de detalhamento.')
        points=[start]+[(center[0]+local_radius*math.cos(angle+turn*k/count),center[1]+local_radius*math.sin(angle+turn*k/count)) for k in range(1,count)]+[end]
        corners[i]=points;length+=local_radius*abs(turn)-2*cut
    for i in range(len(coords)-1):
        if cuts[i]+cuts[i+1]>=math.dist(coords[i],coords[i+1])-1e-6:
            raise DomainError('O raio não cabe nos trechos do eixo. Reduza o raio ou afaste os vértices.')
    points=[coords[0]]
    for i in range(1,len(coords)-1):points.extend(corners.get(i,[coords[i]]))
    points.append(coords[-1]);axis=LineString(points)
    if not axis.is_simple:raise DomainError('A concordância cruza o próprio eixo. Ajuste os pontos ou o raio.')
    return axis,length

def three_point_axis(coords):
    if len(coords)!=3:raise DomainError('O arco precisa de início, meio e fim.')
    start,middle,end=coords
    ax,ay=middle[0]-start[0],middle[1]-start[1];bx,by=end[0]-start[0],end[1]-start[1]
    det=2*(ax*by-ay*bx);scale=max(ax*ax+ay*ay,bx*bx+by*by)
    if scale==0 or abs(det)<scale*1e-9:raise DomainError('Os três pontos do arco devem ser distintos e não alinhados.')
    a2=ax*ax+ay*ay;b2=bx*bx+by*by
    cx=(a2*by-b2*ay)/det;cy=(ax*b2-bx*a2)/det;r=math.hypot(cx,cy)
    angle=lambda p:math.atan2(p[1]-start[1]-cy,p[0]-start[0]-cx)
    first=angle(start);mid=(angle(middle)-first)%(2*math.pi);last=(angle(end)-first)%(2*math.pi)
    direction=1 if mid<last else -1
    sweep=last if direction==1 else 2*math.pi-last
    middle_sweep=mid if direction==1 else 2*math.pi-mid
    step=min(math.pi/18,2*math.acos(max(-1,min(1,1-.01/r))))
    if step<=0:raise DomainError('Arco muito grande para esta precisão.')
    n1=max(1,math.ceil(middle_sweep/step));n2=max(1,math.ceil((sweep-middle_sweep)/step))
    if n1+n2>4096:raise DomainError('O arco excede o limite de 4096 segmentos.')
    points=[start]
    for low,high,count,anchor in ((0,middle_sweep,n1,middle),(middle_sweep,sweep,n2,end)):
        for i in range(1,count):
            theta=first+direction*(low+(high-low)*i/count)
            points.append([start[0]+cx+r*math.cos(theta),start[1]+cy+r*math.sin(theta)])
        points.append(anchor)
    return LineString(points),r*sweep

def direction_arc(start,end,degrees):
    """Start/end plus outgoing tangent direction, like CAD Start End Direction."""
    theta=math.radians(degrees);dx,dy=end[0]-start[0],end[1]-start[1]
    normal=(-math.sin(theta),math.cos(theta));den=2*(dx*normal[0]+dy*normal[1])
    chord=math.hypot(dx,dy)
    if chord<1e-6 or abs(den)<chord*1e-9:raise DomainError('A direção é paralela à corda. Mude o ângulo para formar um arco.')
    offset=(dx*dx+dy*dy)/den;radius=abs(offset);sign=1 if offset>0 else -1
    cx,cy=start[0]+normal[0]*offset,start[1]+normal[1]*offset
    first=math.atan2(start[1]-cy,start[0]-cx);last=math.atan2(end[1]-cy,end[0]-cx)
    sweep=(sign*(last-first))%(2*math.pi)
    step=min(math.pi/18,2*math.acos(max(-1,min(1,1-.01/radius))))
    if step<=0:raise DomainError('Arco muito grande para a precisão de desenho.')
    count=max(2,math.ceil(sweep/step))
    if count>4096:raise DomainError('O arco excede o limite de 4096 segmentos; ajuste a direção.')
    points=[start]+[[cx+radius*math.cos(first+sign*sweep*i/count),cy+radius*math.sin(first+sign*sweep*i/count)] for i in range(1,count)]+[end]
    end_direction=math.degrees(math.atan2(sign*(end[0]-cx),-sign*(end[1]-cy)))%360
    return points,radius*sweep,end_direction

def apply_segment_arcs(coords,axis,length,segments):
    sampled=list(axis.coords);end_direction=None
    for segment in reversed(segments):
        i=segment['index'];a,b=coords[i:i+2]
        position=next((k for k in range(len(sampled)-1) if math.dist(sampled[k],a)<1e-7 and math.dist(sampled[k+1],b)<1e-7),None)
        if position is None:raise DomainError('Retire a concordância nos extremos deste trecho antes de aplicar o arco por direção.')
        arc,arc_length,direction=direction_arc(a,b,segment['directionDegrees'])
        sampled[position:position+2]=arc;length+=arc_length-math.dist(a,b)
        if i==len(coords)-2:end_direction=direction
    axis=LineString(sampled)
    if not axis.is_simple or length>1e6:raise DomainError('O eixo em arco cruza a si mesmo ou ultrapassa o limite de extensão.')
    return axis,length,end_direction

def cul_transition_limit(radius,width,axis_length,position,side):
    if (position=='left' and side=='right') or (position=='right' and side=='left'):return 0.0
    shift={'left':1,'center':0,'right':-1}[position]*(radius-width/2)
    sign=1 if side=='left' else -1;m=width/2-sign*shift
    available=max(0,axis_length-.05);denominator=2*(radius-m)
    if denominator<=1e-9:return 0.0
    return max(0,min(100,(available*available-(radius*radius-m*m))/denominator))

def validate(data):
    if data.get('usage')=='bridge':
        from .bridge import validate_bridge
        return validate_bridge(data,validate,numeric)
    if data.get('usage')=='walkway':
        from .walkway import validate_walkway
        return validate_walkway(data,validate,numeric)
    identity=uid(data['id']);source=uid(data['sourceEntityId']);boundary=polygon(data['sourceGeometry'])
    kind=data['kind'];material=data.get('material','asphalt')
    if kind not in ('road','surface') or material not in MATERIALS:raise DomainError('Tipo ou material de infraestrutura inválido.')
    if material=='wood':raise DomainError('Use Ponte de madeira para representar a madeira pião-roxo.')
    title=str(data.get('name','Via' if kind=='road' else 'Pavimentação')).strip()[:100]
    if not title:raise DomainError('Informe um nome para o objeto.')
    result={'id':identity,'sourceEntityId':source,'sourceGeometry':mapping(boundary),'kind':kind,'name':title,'material':material}
    clip=data.get('clipToGleba',kind=='road')
    if not isinstance(clip,bool):raise DomainError('Confirme o recorte à gleba.')
    result['clipToGleba']=clip
    if kind=='road':
        raw=data['geometry']
        if raw.get('type')!='LineString':raise DomainError('Desenhe um eixo de via com dois ou mais pontos.')
        coords=raw.get('coordinates',[])
        if not 2<=len(coords)<=500 or any(len(p)!=2 or not all(math.isfinite(float(v)) for v in p) for p in coords):raise DomainError('Eixo inválido; limite de 500 pontos XY.')
        axis=LineString(coords)
        if not axis.is_simple or axis.length<.01 or axis.length>1e6 or any(math.dist(a,b)<1e-6 for a,b in zip(coords,coords[1:])):raise DomainError('O eixo não pode cruzar a si mesmo nem repetir pontos consecutivos.')
        control_axis=axis
        radius=numeric(data.get('curveRadiusM',0),'Raio de concordância',0,10000)
        radii=data.get('filletRadii')
        if radii is not None:
            if not isinstance(radii,dict):raise DomainError('Concordâncias por ponto inválidas.')
            if any(str(i) not in [str(k) for k in range(1,len(coords)-1)] for i in radii):raise DomainError('O ponto da concordância não existe mais; remova o arco antes de remover o ponto.')
            radii={str(i):numeric(r,'Raio no ponto',0,10000) for i,r in radii.items()}
            result['filletRadii']=radii
        curve_type=data.get('curveType','polyline')
        if curve_type not in ('polyline','threePoint'):raise DomainError('Tipo de curva inválido.')
        axis,axis_length=three_point_axis(coords[:3]) if curve_type=='threePoint' else rounded_axis(coords,radius,radii)
        if curve_type=='threePoint' and len(coords)>3:
            axis_length+=LineString(coords[2:]).length
            axis=LineString([*axis.coords,*coords[3:]])
            if not axis.is_simple:raise DomainError('A continuação cruza o próprio eixo.')
        segments=data.get('arcSegments',[])
        if not isinstance(segments,list) or len(segments)>499:raise DomainError('Lista de arcos inválida.')
        normalized=[]
        for segment in segments:
            if not isinstance(segment,dict):raise DomainError('Arco de trecho inválido.')
            index=segment.get('index')
            if isinstance(index,bool) or not isinstance(index,int) or not 0<=index<len(coords)-1:raise DomainError('O trecho do arco não existe; retire o arco antes de remover pontos.')
            normalized.append({'index':index,'directionDegrees':numeric(segment.get('directionDegrees'),'Direção do arco',-36000,36000)%360})
        if len({v['index'] for v in normalized})!=len(normalized):raise DomainError('Arcos repetidos no mesmo trecho.')
        if normalized and curve_type=='threePoint':raise DomainError('Este eixo usa arco legado de três pontos; mantenha sua edição pelos controles originais.')
        end_direction=None
        if normalized:axis,axis_length,end_direction=apply_segment_arcs(coords,axis,axis_length,sorted(normalized,key=lambda v:v['index']))
        result['arcSegments']=normalized
        result['curveType']=curve_type
        raw_radii=data.get('endpointRadii',{})
        if not isinstance(raw_radii,dict):raise DomainError('Raios das extremidades inválidos.')
        result['endpointRadii']={key:numeric(raw_radii.get(key,0),'Raio da extremidade',0,100) for key in ('startLeft','startRight','endLeft','endRight')}
        width=numeric(data.get('width',7),'Largura da pista',.5,60)
        left=numeric(data.get('sidewalkLeft',2),'Calçada esquerda',0,20);right=numeric(data.get('sidewalkRight',2),'Calçada direita',0,20)
        cul=data.get('culDeSac',{})
        if not isinstance(cul,dict):raise DomainError('Configuração do cul-de-sac inválida.')
        enabled=cul.get('enabled',False);position=cul.get('position','center')
        if not isinstance(enabled,bool) or position not in ('left','center','right'):raise DomainError('Escolha cul-de-sac à esquerda, central ou à direita.')
        cul_radius=numeric(cul.get('radiusM',max(5,width/2+1)),'Raio do cul-de-sac',.5,100)
        if enabled and (material=='earth' or left<=0 or right<=0):raise DomainError('Cul-de-sac exige via pavimentada com calçadas nos dois lados.')
        if enabled and cul_radius<=width/2:raise DomainError('O raio do cul-de-sac deve ser maior que metade da largura da pista.')
        transitions={}
        limits={}
        for side in ('left','right'):
            limit=cul_transition_limit(cul_radius,width,axis_length,position,side) if enabled else 100
            key='transition'+side.title()+'M'
            value=numeric(cul.get(key,min(3,limit) if limit>0 else 3),'Concordância '+side,0,100)
            active=not ((position=='left' and side=='right') or (position=='right' and side=='left'))
            if enabled and active and value>limit+1e-6:raise DomainError('A concordância '+side+' não cabe na ligação. Limite geométrico: '+format(limit,'.2f')+' m.')
            transitions[key]=value;limits[side]=limit
        result['culDeSac']={'enabled':enabled,'position':position,'radiusM':cul_radius,**transitions}
        result['derivedCulLimits']=limits
        sidewalk_material=data.get('sidewalkMaterial','concrete')
        if sidewalk_material not in ('concrete','pavers','brick'):raise DomainError('Escolha concreto ou tijolinho para as calçadas.')
        clip=data.get('clipToGleba',True)
        if not isinstance(clip,bool):raise DomainError('Confirme o recorte à gleba.')
        pavement=axis.buffer(width/2,cap_style=2,join_style=2,mitre_limit=3)
        walks=unary_union([axis.buffer(width/2+left,single_sided=True,join_style=2,mitre_limit=3),axis.buffer(-(width/2+right),single_sided=True,join_style=2,mitre_limit=3)]).difference(pavement)
        if clip:pavement=pavement.intersection(boundary);walks=walks.intersection(boundary)
        if pavement.is_empty or pavement.area<.01:raise DomainError('O recorte não possui área de pista. Desative Recortar à gleba para desenhar fora do limite.')
        result.update(geometry=mapping(control_axis),curveRadiusM=radius,width=width,sidewalkLeft=left,sidewalkRight=right,sidewalkMaterial=sidewalk_material,clipToGleba=clip)
        regions=[{'role':'unpaved' if material=='earth' else 'pavement','material':material,'geometry':mapping(pavement)},{'role':'sidewalk','material':sidewalk_material,'geometry':mapping(walks)}]
        result['derived']={'endDirectionDegrees':end_direction,'axisGeometry':mapping(axis),'axisLengthM':axis_length,'pavementAreaM2':0 if material=='earth' else pavement.area,'unpavedAreaM2':pavement.area if material=='earth' else 0,'sidewalkAreaM2':walks.area,'regions':regions}
    else:
        geometry=polygon(data['geometry'])
        if clip:geometry=geometry.intersection(boundary)
        if geometry.is_empty or geometry.area<.01:raise DomainError('O recorte não possui área. Desative Recortar à gleba para desenhar fora do limite.')
        result['geometry']=data['geometry']
        result['derived']={'surfaceGeometry':mapping(geometry),'axisLengthM':0,'pavementAreaM2':0 if material=='earth' else geometry.area,'unpavedAreaM2':geometry.area if material=='earth' else 0,'sidewalkAreaM2':0,'regions':[{'role':'unpaved' if material=='earth' else 'pavement','material':material,'geometry':mapping(geometry)}]}
    return result

def cross(a,b):return a[0]*b[1]-a[1]*b[0]

def intersection_points(geometry):
    if geometry.is_empty:return []
    if geometry.geom_type=='Point':return [geometry]
    if geometry.geom_type in ('LineString','LinearRing'):return [Point(geometry.coords[0]),Point(geometry.coords[-1])]
    return [point for part in geometry.geoms for point in intersection_points(part)]

def boundary_route(geometry,start,end):
    boundary=geometry.boundary;rings=list(boundary.geoms) if boundary.geom_type=='MultiLineString' else [boundary]
    ring=min(rings,key=lambda r:max(r.distance(Point(start)),r.distance(Point(end))))
    if max(ring.distance(Point(start)),ring.distance(Point(end)))>.02:raise DomainError('O raio não encontra uma borda contínua; ajuste a ligação.')
    a,b=ring.project(Point(start)),ring.project(Point(end));length=ring.length
    if a<=b:
        direct=list(substring(ring,a,b).coords)
        wrapped=list(substring(ring,a,length).coords)+list(substring(ring,0,b).coords)[1:]
    else:
        direct=list(reversed(list(substring(ring,b,a).coords)))
        wrapped=list(substring(ring,a,length).coords)+list(substring(ring,0,b).coords)[1:]
    route=direct if abs(b-a)<=length-abs(b-a) else (wrapped if a>b else list(reversed(list(substring(ring,b,length).coords)+list(substring(ring,0,a).coords)[1:])))
    route[0]=start;route[-1]=end
    return route

def actual_curb_return(branch,parent,predicted_corner,predicted_center,radius,endpoint,normal,inside):
    """Find a circle tangent to actual road edges, including curved road bands."""
    corners=intersection_points(branch.boundary.intersection(parent.boundary))
    if not corners:raise DomainError('As bordas das vias não se encontram. Ajuste a ponta do eixo antes de definir o raio.')
    corner=min(corners,key=lambda p:p.distance(Point(predicted_corner)))
    resolution=max(24,math.ceil(math.pi/(4*math.acos(max(-1,1-.001/radius)))))
    centers=intersection_points(branch.buffer(radius,quad_segs=resolution).boundary.intersection(parent.buffer(radius,quad_segs=resolution).boundary))
    centers=[p for p in centers if (p.x-endpoint[0])*normal[0]+(p.y-endpoint[1])*normal[1]>0 and (p.x-endpoint[0])*inside[0]+(p.y-endpoint[1])*inside[1]>0 and branch.distance(p)>=radius-.02 and parent.distance(p)>=radius-.02]
    if not centers:raise DomainError('O raio não cabe neste encontro curvo. Reduza o raio ou ajuste a ligação.')
    center=min(centers,key=lambda p:p.distance(Point(predicted_center)))
    a=nearest_points(branch.boundary,center)[0];b=nearest_points(parent.boundary,center)[0]
    first=math.atan2(a.y-center.y,a.x-center.x);last=math.atan2(b.y-center.y,b.x-center.x);sweep=(last-first+math.pi)%(2*math.pi)-math.pi
    count=max(4,math.ceil(abs(sweep)/(2*math.acos(max(-1,1-.005/radius)))))
    arc=[(a.x,a.y)]+[(center.x+radius*math.cos(first+sweep*k/count),center.y+radius*math.sin(first+sweep*k/count)) for k in range(1,count)]+[(b.x,b.y)]
    c=(corner.x,corner.y)
    branch_path=boundary_route(branch,c,arc[0]);parent_path=boundary_route(parent,arc[-1],c)
    patch=Polygon([*branch_path,*arc[1:],*parent_path[1:]])
    if not patch.is_valid or patch.area<1e-8:raise DomainError('O raio produz uma ligação inválida. Reduza o raio ou ajuste o eixo.')
    return patch,arc

def endpoint_halfplane(endpoint,inside,extent,outside=False):
    transverse=(-inside[1],inside[0]);sign=-1 if outside else 1
    a=(endpoint[0]-transverse[0]*extent,endpoint[1]-transverse[1]*extent)
    b=(endpoint[0]+transverse[0]*extent,endpoint[1]+transverse[1]*extent)
    return Polygon([a,b,(b[0]+inside[0]*extent*sign,b[1]+inside[1]*extent*sign),(a[0]+inside[0]*extent*sign,a[1]+inside[1]*extent*sign),a])

def endpoint_rounding(items):
    """Curb return fillets: tangent to branch and receiving road at each endpoint.

    Pavement expands into the corner; the sidewalk follows the circular curb.
    Standalone endpoints use a perpendicular mouth edge (zero receiving width).
    """
    roads=[v for v in items if v['kind']=='road' and v.get('usage') not in ('walkway','bridge')]
    axes={v['id']:shape(v['derived']['axisGeometry']) for v in roads}
    # Construct returns before the optional gleba clip, including ends outside the mask.
    base_pavement={v['id']:axes[v['id']].buffer(v['width']/2,cap_style=2,join_style=2,mitre_limit=3) for v in roads}
    for item in roads:
        axis=axes[item['id']];coords=list(axis.coords);patches=[];walk_patches=[];connections=[]
        for endpoint in ('start','end'):
            if endpoint=='end' and item.get('culDeSac',{}).get('enabled'):continue
            left=item['endpointRadii'][endpoint+'Left'];right=item['endpointRadii'][endpoint+'Right']
            if not left and not right:continue
            is_start=endpoint=='start';e=coords[0] if is_start else coords[-1]
            neighbor=coords[1] if is_start else coords[-2];length=math.dist(e,neighbor)
            u=((neighbor[0]-e[0])/length,(neighbor[1]-e[1])/length)
            if is_start and item['arcSegments'] and next((a for a in item['arcSegments'] if a['index']==0),None):
                angle=math.radians(next(a['directionDegrees'] for a in item['arcSegments'] if a['index']==0));u=(math.cos(angle),math.sin(angle))
            elif not is_start and item['derived'].get('endDirectionDegrees') is not None:
                angle=math.radians(item['derived']['endDirectionDegrees']);u=(-math.cos(angle),-math.sin(angle))
            candidates=[v for v in roads if v['id']!=item['id'] and base_pavement[v['id']].buffer(.05).covers(Point(e))]
            target=min(candidates,key=lambda v:axes[v['id']].distance(Point(e))) if candidates else None
            target_axis=axes[target['id']] if target else None
            if target_axis:
                location=target_axis.project(Point(e));p=target_axis.interpolate(location)
                before=target_axis.interpolate(max(0,location-.05));after=target_axis.interpolate(min(target_axis.length,location+.05))
                d=math.hypot(after.x-before.x,after.y-before.y);t=((after.x-before.x)/d,(after.y-before.y)/d)
                parent_normal=(-t[1],t[0]);sign=1 if sum(a*b for a,b in zip(parent_normal,u))>=0 else -1
                parent_edge=(p.x+parent_normal[0]*sign*target['width']/2,p.y+parent_normal[1]*sign*target['width']/2)
            else:
                # Use the physical flat cap of the sampled corridor, not an extrapolated tangent.
                u=((neighbor[0]-e[0])/length,(neighbor[1]-e[1])/length)
                t=(-u[1],u[0]);parent_edge=e
            reach=max(axis.length*2+100,max(left,right)*20+100)
            mouth_inside=endpoint_halfplane(e,u,reach) if not target else None
            mouth_outside=endpoint_halfplane((e[0]+u[0]*1e-6,e[1]+u[1]*1e-6),u,reach,True) if not target else None
            for side,radius in (('Left',left),('Right',right)):
                if not radius:continue
                side_sign=(1 if side=='Left' else -1)*(1 if is_start else -1)
                normal=(-u[1]*side_sign,u[0]*side_sign)
                v=t if sum(a*b for a,b in zip(t,normal))>0 else (-t[0],-t[1])
                determinant=cross(u,v)
                if abs(determinant)<.05:raise DomainError('O raio de entrada precisa de um encontro com abertura suficiente; ajuste a ligação das vias.')
                edge=(e[0]+normal[0]*item['width']/2,e[1]+normal[1]*item['width']/2)
                distance=cross((parent_edge[0]-edge[0],parent_edge[1]-edge[1]),v)/determinant
                c=(edge[0]+u[0]*distance,edge[1]+u[1]*distance)
                wedge=math.acos(max(-1,min(1,sum(a*b for a,b in zip(u,v)))));cut=radius/math.tan(wedge/2)
                if max(0,distance)+cut>=axis.length-.01:raise DomainError('O raio da extremidade não cabe no comprimento da via. Reduza o raio.')
                a=(c[0]+u[0]*cut,c[1]+u[1]*cut);b=(c[0]+v[0]*cut,c[1]+v[1]*cut)
                norm=math.hypot(u[0]+v[0],u[1]+v[1]);center=(c[0]+(u[0]+v[0])/norm*radius/math.sin(wedge/2),c[1]+(u[1]+v[1])/norm*radius/math.sin(wedge/2))
                first=math.atan2(a[1]-center[1],a[0]-center[0]);last=math.atan2(b[1]-center[1],b[0]-center[0]);sweep=(last-first+math.pi)%(2*math.pi)-math.pi
                step=min(math.pi/36,2*math.acos(max(-1,min(1,1-.005/radius))));count=max(4,math.ceil(abs(sweep)/step))
                arc=[a]+[(center[0]+radius*math.cos(first+sweep*k/count),center[1]+radius*math.sin(first+sweep*k/count)) for k in range(1,count)]+[b]
                patch=Polygon([c,*arc,c])
                patch,arc=actual_curb_return(base_pavement[item['id']],base_pavement[target['id']] if target else mouth_outside,c,center,radius,e,normal,u)
                if not patch.is_valid:raise DomainError('Não foi possível formar o raio na extremidade; ajuste o encontro.')
                if not target:patch=patch.intersection(mouth_inside)
                patches.append(patch)
                walk_width=item['sidewalkLeft' if side=='Left' else 'sidewalkRight']
                if walk_width:
                    walk_patch=LineString(arc).buffer(walk_width,cap_style=2,join_style=1)
                    if not target:walk_patch=walk_patch.intersection(mouth_inside)
                    walk_patches.append(walk_patch)
                connections.append({'endpoint':endpoint,'side':side,'radiusM':radius,'targetRoadId':target['id'] if target else None,'limitedToRoadEnvelope':False,'limitedToEndPlane':target is None,'curbGeometry':mapping(LineString(arc))})
        if patches:
            # Submicrometre precision for derived bands prevents floating-point slivers.
            pavement=union_all([base_pavement[item['id']],*patches],grid_size=1e-7)
            walks=union_all([shape(item['derived']['regions'][1]['geometry']),*walk_patches],grid_size=1e-7).difference(pavement)
            if item['clipToGleba']:
                boundary=shape(item['sourceGeometry']);pavement=pavement.intersection(boundary);walks=walks.intersection(boundary)
            item['derived'].update(pavementAreaM2=0 if item['material']=='earth' else pavement.area,unpavedAreaM2=pavement.area if item['material']=='earth' else 0,sidewalkAreaM2=walks.area,endpointReturns=connections)
            item['derived']['regions']=[{'role':'unpaved' if item['material']=='earth' else 'pavement','material':item['material'],'geometry':mapping(pavement)},{'role':'sidewalk','material':item['sidewalkMaterial'],'geometry':mapping(walks)}]

def remove_curb_needles(surface):
    """Remove sub-micrometre backtracking tips introduced at tangent unions."""
    coords=list(surface.exterior.coords)[:-1]
    changed=True
    while changed:
        changed=False
        for i,b in enumerate(coords):
            a,c=coords[i-1],coords[(i+1)%len(coords)]
            ab=(b[0]-a[0],b[1]-a[1]);bc=(c[0]-b[0],c[1]-b[1])
            cross=abs(ab[0]*bc[1]-ab[1]*bc[0])
            if ab[0]*bc[0]+ab[1]*bc[1]>=0:continue
            if cross/ max(math.dist(a,b),math.dist(b,c),1e-12)>1e-6 or cross/2>1e-5:continue
            candidate=Polygon(coords[:i]+coords[i+1:],surface.interiors)
            if candidate.is_valid and abs(candidate.area-surface.area)<=1e-5:
                coords.pop(i);surface=candidate;changed=True;break
    return surface

def cul_de_sacs(items):
    """A paved terminal turning bulb, with a continuous sidewalk and smooth neck."""
    for item in items:
        config=item.get('culDeSac',{})
        if item['kind']!='road' or not config.get('enabled'):continue
        axis=shape(item['derived']['axisGeometry']);coords=list(axis.coords);end=coords[-1];previous=coords[-2]
        length=math.dist(end,previous);direction=((end[0]-previous[0])/length,(end[1]-previous[1])/length)
        if item['derived'].get('endDirectionDegrees') is not None:
            angle=math.radians(item['derived']['endDirectionDegrees']);direction=(math.cos(angle),math.sin(angle))
        normal=(-direction[1],direction[0]);radius=config['radiusM'];walk_width=max(item['sidewalkLeft'],item['sidewalkRight'])
        side={'left':1,'center':0,'right':-1}[config['position']];offset=side*(radius-item['width']/2)
        center=(end[0]+normal[0]*offset,end[1]+normal[1]*offset)
        resolution=max(32,math.ceil(math.pi/(4*math.acos(max(-1,1-.005/radius)))))
        disk=Point(center).buffer(radius,quad_segs=resolution)
        original=union_all([shape(item['derived']['regions'][0]['geometry']),axis.buffer(item['width']/2,cap_style=2,join_style=2,mitre_limit=3)],grid_size=1e-7)
        # Independent circular curb returns between the actual road edge and bulb.
        joined=union_all([original,disk],grid_size=1e-7);patches=[];transition_info={}
        inside=(-direction[0],-direction[1])
        for side_name,side_sign in (('left',1),('right',-1)):
            active=not ((config['position']=='left' and side_name=='right') or (config['position']=='right' and side_name=='left'))
            transition=config['transition'+side_name.title()+'M'] if active else 0
            transition_info[side_name]={'radiusM':transition,'maxRadiusM':item['derivedCulLimits'][side_name],'editable':active}
            if transition<=0:continue
            delta=item['width']/2-side_sign*offset
            tangent_distance=math.sqrt(max(0,(radius+transition)**2-(delta+transition)**2))
            predicted_center=(end[0]+normal[0]*side_sign*(item['width']/2+transition)-direction[0]*tangent_distance,end[1]+normal[1]*side_sign*(item['width']/2+transition)-direction[1]*tangent_distance)
            corner_distance=math.sqrt(max(0,radius*radius-delta*delta))
            corner=(end[0]+normal[0]*side_sign*item['width']/2-direction[0]*corner_distance,end[1]+normal[1]*side_sign*item['width']/2-direction[1]*corner_distance)
            patch,arc=actual_curb_return(original,disk,corner,predicted_center,transition,end,(normal[0]*side_sign,normal[1]*side_sign),inside)
            patches.append(patch);transition_info[side_name]['curbGeometry']=mapping(LineString(arc))
        rounded=union_all([joined,*patches],grid_size=1e-7)
        if rounded.geom_type!='Polygon' or not rounded.is_valid:raise DomainError('O cul-de-sac não se liga continuamente à via; ajuste o eixo ou o raio.')
        rounded=remove_curb_needles(rounded)
        # Buffer the actual bulb and returns, not a difference against the old road:
        # microscopic subtraction remnants would become full-width sidewalk strips.
        addition=union_all([disk,*patches],grid_size=1e-7)
        sidewalk=addition.buffer(walk_width,quad_segs=resolution).difference(rounded,grid_size=1e-7)
        # Use the same precision for subtraction as for the tangent unions.
        # Otherwise coincident curb edges can leave an attached needle in the sidewalk.
        walks=union_all([shape(item['derived']['regions'][1]['geometry']),sidewalk],grid_size=1e-7).difference(rounded,grid_size=1e-7)
        if item['clipToGleba']:
            boundary=shape(item['sourceGeometry']);rounded=rounded.intersection(boundary);walks=walks.intersection(boundary)
        item['derived']['culDeSac']={'center':center,'pavementRadiusM':radius,'outerRadiusM':radius+walk_width,'sidewalkWidthM':walk_width,'transitions':transition_info}
        item.pop('derivedCulLimits',None)
        item['derived']['regions']=[{'role':'pavement','material':item['material'],'geometry':mapping(rounded)},{'role':'sidewalk','material':item['sidewalkMaterial'],'geometry':mapping(walks)}]

def measurable_surface(geometry):
    """Keep polygonal surfaces; discard only isolated sub-micrometre numeric slivers.

    No buffer repair, coordinate changes or removal of ordinary small polygons.
    """
    if geometry.is_empty:return Polygon()
    if geometry.geom_type=='Polygon':
        if geometry.area<=1e-5 and geometry.area/max(geometry.length,1e-12)<=1e-6:return Polygon()
        return geometry
    if hasattr(geometry,'geoms'):return unary_union([measurable_surface(part) for part in geometry.geoms])
    return Polygon()

def calculate(values):
    if len(values)>200:raise DomainError('Limite de 200 objetos de infraestrutura por projeto.')
    items=[validate(v) for v in values]
    if len({v['id'] for v in items})!=len(items):raise DomainError('Identificadores de infraestrutura repetidos.')
    endpoint_rounding(items)
    cul_de_sacs(items)
    for item in items:
        if item['kind']!='road':continue
        axis=shape(item['derived']['axisGeometry']);controls=list(shape(item['geometry']).coords)
        # Project controls onto the smoothed axis so fillets remain part of the
        # point-to-point chain. Scale chord samples to the analytic total length.
        stations=[axis.project(Point(p)) for p in controls]
        stations[0]=0;stations[-1]=axis.length
        factor=item['derived']['axisLengthM']/axis.length
        dimensions=[]
        for i,(a,b) in enumerate(zip(stations,stations[1:])):
            if b-a<=1e-6:continue
            dimensions.append({'from':i+1,'to':i+2,'lengthM':(b-a)*factor,'geometry':mapping(substring(axis,a,b)),'kind':'axis'})
        for end in item['derived'].get('endpointReturns',[]):
            if end.get('curbGeometry'):
                curve=shape(end['curbGeometry'])
                dimensions.append({'lengthM':curve.length,'geometry':mapping(curve),'kind':'curb'})
        for side in item['derived'].get('culDeSac',{}).get('transitions',{}).values():
            if side.get('curbGeometry'):
                curve=shape(side['curbGeometry'])
                dimensions.append({'lengthM':curve.length,'geometry':mapping(curve),'kind':'curb'})
        item['derived']['dimensions']=dimensions
    for item in items:
        item.pop('derivedCulLimits',None)
        derived=item['derived']
        for region in derived['regions']:region['geometry']=mapping(measurable_surface(shape(region['geometry'])))
        for role,field in (('pavement','pavementAreaM2'),('sidewalk','sidewalkAreaM2'),('unpaved','unpavedAreaM2'),('bridge','bridgeAreaM2')):
            derived[field]=sum(shape(r['geometry']).area for r in derived['regions'] if r['role']==role)
        if item['kind']=='surface':derived['surfaceGeometry']=derived['regions'][0]['geometry']
    # Older objects retain material ownership in overlaps; pavement precedes sidewalks.
    # Object order is stable across edits. Partitioning prevents duplicate quantities.
    raw_pavement=unary_union([shape(r['geometry']) for v in items for r in v['derived']['regions'] if r['role']=='pavement'])
    raw_carriageway=unary_union([shape(r['geometry']) for v in items for r in v['derived']['regions'] if r['role'] in ('pavement','unpaved')])
    regions=[];occupied=raw_pavement.difference(raw_pavement)
    for role in ('pavement','unpaved','bridge','sidewalk'):
        for item in items:
            for region in item['derived']['regions']:
                if region['role']!=role:continue
                geometry=shape(region['geometry']).difference(occupied)
                if role=='sidewalk':geometry=geometry.difference(raw_carriageway)
                geometry=measurable_surface(geometry)
                if not geometry.is_empty:
                    regions.append({'role':role,'material':region['material'],'geometry':mapping(geometry)})
                    occupied=occupied.union(geometry)
    final_pavement=unary_union([shape(r['geometry']) for r in regions if r['role']=='pavement'])
    walks=unary_union([shape(r['geometry']) for r in regions if r['role']=='sidewalk'])
    bridges=unary_union([shape(r['geometry']) for r in regions if r['role']=='bridge'])
    return items,{'bridgeAreaM2':bridges.area,'pavementAreaM2':final_pavement.area,'sidewalkAreaM2':walks.area,'totalAreaM2':final_pavement.area+walks.area+bridges.area,'unpavedAreaM2':sum(shape(r['geometry']).area for r in regions if r['role']=='unpaved'),'byMaterial':{m:sum(shape(r['geometry']).area for r in regions if r['material']==m and r['role']!='unpaved') for m in MATERIALS},'regions':regions}
