"""Shared-study summaries and plan-symbol legend for the Infra A3 report."""
import math
from collections import Counter
from xml.sax.saxutils import escape
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm

ELEMENT_NAMES={'tactileDirectional':'Piso direcional','tactileWarning':'Piso de alerta','vehicleAccess':'Acessos de veículos','crosswalk':'Travessias · pintura','parking':'Vagas de estacionamento'}
LAND_NAMES={'tree':'Árvores','palm':'Palmeiras','chalet':'Chalés','hut':'Choupanas','water':'Lâminas d’água'}

def fmt(n):return f'{n:,.2f}'.replace(',','@').replace('.',',').replace('@','.')

def text_card(value,minimum=8):
    _,height=Paragraph(value,ParagraphStyle('shared_report',fontName='Helvetica',fontSize=6.5,leading=8)).wrap(89*mm,1000*mm)
    return ('text',value,max(minimum,height/mm+4))


def summary_cards(state,capacity=169):
    entries=[];ramps=state.get('accessibility',[]);elements=state.get('accessibilityElements',[])
    if ramps or elements:
        from ..accessibility.elements import totals
        from ..accessibility.parking import TYPES
        valid=[r for r in ramps if r.get('derived',{}).get('status')=='dimensioned']
        invalid=[r for r in ramps if r.get('derived',{}).get('status')!='dimensioned']
        entries.append(('heading','ACESSIBILIDADE · RESUMO',7))
        entries.append(text_card(f'<b>Rampas locadas: {len(ramps)}</b> · geometria conferida: {len(valid)} · vínculos a revisar: {len(invalid)}.<br/>Retas com abas: {sum(r["kind"]=="straight" for r in valid)} · longitudinais: {sum(r["kind"]=="longitudinal" for r in valid)}.<br/>Com alerta dimensional: {sum(r.get("derived",{}).get("normativeStatus")=="outside" for r in valid)}.'))
        for r in ramps:
            d=r.get('derived',{});name=escape(r.get('name','Rampa'))
            if d.get('status')!='dimensioned':entries.append(text_card(f'{name} · vínculo a revisar; excluída das áreas.'));continue
            kind='Reta com abas' if r['kind']=='straight' else 'Longitudinal'
            entries.append(text_card(f'<b>{name}</b> · {kind} · largura {fmt(r.get("widthM",0))} m · desnível {fmt(r.get("heightM",0))} m.<br/>Inclinação {fmt(r.get("slopePercent",0))}% · extensão {fmt(d.get("totalLengthM",0))} m'+(' · <b>com alerta dimensional</b>.' if d.get('normativeStatus')=='outside' else '.')))
        groups=totals(elements)
        for kind,v in groups.items():
            if not v['count']:continue
            entries.append(text_card(f'<b>{ELEMENT_NAMES[kind]}</b>: {v["count"]} · {fmt(v["areaM2"])} m²'+(f' · {fmt(v["lengthM"])} m' if kind=='tactileDirectional' else '')))
            if kind=='tactileWarning' and any(p['role']=='warning' for e in elements if e.get('derived',{}).get('status')=='dimensioned' and e['kind']=='tactileDirectional' for p in e['derived']['parts']):entries.append(text_card('Piso de alerta: inclui as faixas de alerta geradas automaticamente nos percursos direcionais.'))
            if kind=='parking':
                for key,count in v['byType'].items():
                    if count:entries.append(text_card(f'{TYPES[key]}: {count} vagas'))
        # Group equal parameters instead of printing one row per tile or bay.
        formats=Counter()
        for e in elements:
            if e.get('derived',{}).get('status')!='dimensioned':continue
            kind=e['kind']
            if kind.startswith('tactile'):
                label=f'{ELEMENT_NAMES[kind]} · faixa {fmt(e.get("widthM",0))} m · placa {fmt(e.get("tileM",0))} m'
            elif kind=='parking':
                label=f'{TYPES.get(e.get("parkingType","car"),"Vaga")} · {fmt(e.get("widthM",0))} × {fmt(e.get("lengthM",0))} m · ângulo {fmt(e.get("parkingAngleDegrees",90))}°'
            elif kind=='vehicleAccess':label=f'Acesso de veículos · largura {fmt(e.get("widthM",0))} m · desenvolvimento {fmt(e.get("runM",0))} m'
            else:label=f'Travessia zebrada · largura {fmt(e.get("widthM",0))} m · barras {fmt(e.get("barM",0))} / intervalo {fmt(e.get("gapM",0))} m'
            formats[label]+=e.get('quantity',1) if kind=='parking' else 1
        for label,count in formats.items():entries.append(text_card(escape(label)+f' · {count} un.'))
        bad=sum(e.get('derived',{}).get('status')!='dimensioned' for e in elements)
        if bad:entries.append(text_card(f'Elementos com vínculo a revisar, excluídos dos quantitativos: {bad}.'))
        entries.append(text_card('Dados gerais do projeto, somente elementos gravados. Sobreposições de Acessibilidade não descontam calçada/pavimento. Alertas e pendências do projeto não equivalem a aprovação normativa.'))
    from .landscape_report import landscape_cards
    entries.extend(landscape_cards(state,capacity))
    return entries


def legend_entries(state):
    entries=[]
    if state.get('entities'):entries.append(('boundary','Poligonal da gleba'))
    regions=state.get('infraMetrics',{}).get('regions',[])
    materials={'asphalt':'Pavimento CBUQ','brick':'Tijolinho maciço','concrete':'Concreto','pavers':'Intertravado','earth':'Via de terra','wood':'Ponte de madeira pião-roxo'}
    for material in dict.fromkeys(r['material'] for r in regions):entries.append((material,materials[material]))
    if any(v.get('usage')=='walkway' for v in state.get('infra',[])):entries.append(('walkway','Calçada independente'))
    if any((a.get('layout') or {}).get('lots') for a in state.get('subdivisionAreas',[])):entries.append(('lot','Lotes'))
    if any(z.get('use')=='green' for a in state.get('subdivisionAreas',[]) for z in (a.get('layout') or {}).get('zones',[])):entries.append(('green','Área verde'))
    ramps=state.get('accessibility',[]);elements=state.get('accessibilityElements',[])
    for kind,label in [('straight','Rampa reta com abas'),('longitudinal','Rampa longitudinal')]:
        if any(r['kind']==kind for r in ramps):entries.append((kind,label))
    for kind,label in ELEMENT_NAMES.items():
        if any(e['kind']==kind for e in elements) or kind=='tactileWarning' and any(p['role']=='warning' for e in elements for p in e.get('derived',{}).get('parts',[])):entries.append((kind,label))
    for kind,label in LAND_NAMES.items():
        if any(v['kind']==kind for v in state.get('landscape',[])):entries.append((kind,label))
    if any(v.get('derived',{}).get('status')=='invalid' for v in [*ramps,*elements]):entries.append(('invalid','Elemento com vínculo a revisar'))
    return entries


def draw_symbol(c,kind,x,y):
    """Tiny plan symbols; x/y are top-down paper millimetres."""
    c.saveState();c.translate(x*mm,(297-y)*mm);c.scale(mm,mm);c.setLineWidth(.25)
    colors={'boundary':'#83a8d2','asphalt':'#414b51','brick':'#b98b66','concrete':'#bfc7c7','pavers':'#a8977c','earth':'#b19b77','wood':'#573a43','walkway':'#bfc7c7','lot':'#95b9ef','green':'#65b66f','tree':'#67975b','palm':'#98ba74','chalet':'#bb6f48','hut':'#bc9d5e','water':'#4ca6bf','crosswalk':'#414b51','straight':'#bfc7b8','longitudinal':'#bfc7b8','vehicleAccess':'#a5c0bc'}
    c.setFillColor(colors.get(kind,'#e7cd58'));c.setStrokeColor('#324e4a')
    def line(points):
        p=c.beginPath();p.moveTo(*points[0])
        for point in points[1:]:p.lineTo(*point)
        c.drawPath(p)
    if kind in ('tree','palm'):
        c.circle(0,0,2.5,fill=1)
        for i in range(8):
            a=i*math.tau/8;line([(0,0),(2.4*math.cos(a),2.4*math.sin(a))])
    elif kind=='hut':
        pts=[(2.6*math.cos(i*math.tau/8),2.6*math.sin(i*math.tau/8)) for i in range(8)]
        p=c.beginPath();p.moveTo(*pts[0])
        for point in pts[1:]:p.lineTo(*point)
        p.close();c.drawPath(p,fill=1)
        for point in pts:line([(0,0),point])
    elif kind=='invalid':
        c.setFillColor('#e87c6d');c.circle(0,0,2.4,fill=1);c.setFillColor('#ffffff');c.setFont('Helvetica-Bold',4);c.drawCentredString(0,-1,'!')
    else:
        c.rect(-3,-2,6,4,fill=1)
        if kind=='wood':
            c.setStrokeColor('#251b23')
            for i in range(-4,4):
                x1=max(-3,i-2);x2=min(3,i+2)
                if x1<x2:line([(x1,x1-i),(x2,x2-i)])
        elif kind in ('tactileWarning','tactileDirectional'):
            if kind=='tactileWarning':
                c.setFillColor('#6e622b')
                for xx in (-2,-1,0,1,2):
                    for yy in (-1,0,1):c.circle(xx,yy,.15,fill=1)
            else:
                for yy in (-1,0,1):line([(-2.5,yy),(2.5,yy)])
        elif kind=='crosswalk':
            c.setFillColor('#ffffff')
            for xx in (-2.5,-1, .5,2):c.rect(xx,-1.7,.7,3.4,fill=1,stroke=0)
        elif kind=='chalet':line([(0,-2),(0,2)]);line([(-.4,0),(-2.5,0)]);line([(.4,0),(2.5,0)])
        elif kind=='water':
            for yy in (-.7,.7):line([(-2.5,yy),(-1,yy+.35),(1,yy-.35),(2.5,yy)])
        elif kind=='parking':
            c.setFillColor('#246db5');c.rect(-3,-2,6,4,fill=1);c.setFillColor('#ffffff');c.setFont('Helvetica-Bold',3.5);c.drawCentredString(0,-1,'P')
        elif kind in ('straight','longitudinal','vehicleAccess'):line([(-2,0),(2,0)]);line([(1,1),(2,0),(1,-1)])
        elif kind=='boundary':c.setFillColor('#ffffff');c.rect(-2.7,-1.7,5.4,3.4,fill=1)
    c.restoreState()
