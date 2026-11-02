"""Presentation tables as editable DXF LINE/MTEXT, not ACAD_TABLE entities."""
from shapely.geometry import shape
from .pdf import MATERIAL,fmt
from .subdivision.pdf import USES


def append(doc,state,prefix,legend=None):
    geometries=[shape(e['geometry']) for e in state.get('entities',[])]
    geometries += [shape(r['geometry']) for r in state.get('infraMetrics',{}).get('regions',[])]
    geometries += [shape(a['geometry']) for a in state.get('subdivisionAreas',[]) if a.get('geometry')]
    bounds=[g.bounds for g in geometries if not g.is_empty]
    if not bounds:return
    from ..cad_report import table_writer
    table=table_writer(doc,prefix,bounds)
    entities=state.get('entities',[])
    table('POLIGONAIS DAS GLEBAS',['Gleba','Área (m²)'],[[e['attributes']['name'],fmt(e['derived']['areaM2'])] for e in entities],[40,22],'GLEBAS')
    metrics=state.get('infraMetrics',{})
    table('QUANTITATIVOS CONFIRMADOS',['Descrição','Área (m²)'],[['Calçamento',fmt(metrics.get('sidewalkAreaM2',0))],['Pavimento',fmt(metrics.get('pavementAreaM2',0))],*([['Pontes de madeira',fmt(metrics.get('bridgeAreaM2',0))]] if metrics.get('bridgeAreaM2') else []),['Total sistema viário',fmt(metrics.get('totalAreaM2',0))]],[40,22],'QUANTITATIVOS')
    roads=[r for r in state.get('infra',[]) if r['kind']=='road' and r.get('usage') not in ('walkway','bridge')]
    table('VIAS · RESUMO',['Via','Compr. (m)','Pista (m)','Calçada E/D (m)','Pavimento','Calçadas'],[[r['name'],fmt(r['derived']['axisLengthM']),fmt(r['width']),fmt(r['sidewalkLeft'])+' / '+fmt(r['sidewalkRight']),MATERIAL[r['material']],MATERIAL[r['sidewalkMaterial']] if r['sidewalkLeft']+r['sidewalkRight'] else 'Sem calçadas'] for r in roads],[24,16,14,24,24,24],'VIAS')
    paths=[r for r in state.get('infra',[]) if r.get('usage')=='walkway']
    if paths:table('CALÇADAS INDEPENDENTES',['Calçada','Compr. (m)','Largura (m)','Área (m²)','Material'],[[r['name'],fmt(r['derived']['axisLengthM']),fmt(r['width']),fmt(r['derived']['sidewalkAreaM2']),MATERIAL[r['material']]] for r in paths],[30,20,20,22,24],'CALCADAS')
    bridges=[r for r in state.get('infra',[]) if r.get('usage')=='bridge']
    if bridges:table('PONTES DE MADEIRA',['Ponte','Compr. (m)','Largura (m)','Área (m²)','Material'],[[r['name'],fmt(r['derived']['axisLengthM']),fmt(r['width']),fmt(r['derived'].get('bridgeAreaM2',0)),MATERIAL[r['material']]] for r in bridges],[30,20,20,22,30],'PONTES')
    for area in state.get('subdivisionAreas',[]):
        layout=area.get('layout') or {};data=layout.get('derived')
        if not data:continue
        area_name=area.get('sourceName',area.get('name','Gleba'))
        table('UTILIZAÇÃO DO SOLO · '+area_name,['Uso','Área (m²)','%'],[[label,fmt(data['categories'].get(key,{}).get('areaM2',0)),fmt(data['categories'].get(key,{}).get('percent',0))] for key,label in USES.items()],[40,22,16],'SOLO')
        table('LOTES · RESUMO · '+area_name,['Lote','Área (m²)','Perímetro (m)'],[[lot['name'],fmt(lot['derived']['areaM2']),fmt(lot['derived']['perimeterM'])] for lot in sorted(layout.get('lots',[]),key=lambda l:(l['number'],l['id']))],[40,22,22],'LOTES')
    if legend is None:
        legend=[{'label':'Poligonal da gleba','color':'#80a8d8'}]
        if roads:legend.append({'label':'Eixo das vias','color':'#e7c373'})
        for material in dict.fromkeys(r['material'] for r in state.get('infraMetrics',{}).get('regions',[])):
            legend.append({'label':MATERIAL[material],'color':{'asphalt':'#30363b','concrete':'#bfc7c7','brick':'#c7825e','pavers':'#b19878','earth':'#ae9471','wood':'#573a43'}[material]})
        if any((a.get('layout') or {}).get('lots') for a in state.get('subdivisionAreas',[])):legend.append({'label':'Lotes','color':'#b9d8ff'})
        if any(z['use']=='green' for a in state.get('subdivisionAreas',[]) for z in (a.get('layout') or {}).get('zones',[])):legend.append({'label':'Área verde','color':'#4aa855'})
    if legend:table('LEGENDA',['Símbolo','Descrição'],[['',item['label']] for item in legend],[12,64],'LEGENDA',[item['color'] for item in legend])
