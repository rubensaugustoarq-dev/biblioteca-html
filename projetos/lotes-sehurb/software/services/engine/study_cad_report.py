"""Study-only DXF presentation, independent of Infra and ENL data."""
from shapely.geometry import shape
from shapely.ops import unary_union
from .cad_report import table_writer,fmt
from .cad_fills import solid,behind


def append(doc,state,prefix,legend=None):
    entities=state['entities'];geometries=[shape(e['geometry']) for e in entities]
    bounds=[g.bounds for g in geometries if not g.is_empty]
    bounds += [r['metadata']['bounds'] for r in state['resources'] if r['role']=='vectorSource' and r['metadata'].get('bounds')]
    table=table_writer(doc,prefix,bounds)
    table('ESTUDO · GLEBAS',['Gleba','Área (m²)','Perímetro (m)'],[[e['attributes']['name'],fmt(e['derived']['areaM2']),fmt(e['derived']['perimeterM'])] for e in entities],[40,22,22],'GLEBAS')
    table('RESUMO GERAL DO ESTUDO',['Informação','Valor'],[['Quantidade de glebas',str(len(entities))],['Soma das áreas (inclui sobreposições)',fmt(sum(g.area for g in geometries))+' m²'],['União das glebas (sem dupla contagem)',fmt(unary_union(geometries).area)+' m²'],['Sistema de coordenadas',state['project']['crs']['authid']],['Unidades','Metros']],[46,28],'RESUMO')
    if legend is None:legend=[{'label':'Poligonal da gleba','color':'#80a8d8'}]
    if legend:table('LEGENDA',['Símbolo','Descrição'],[['',v['label']] for v in legend],[12,64],'LEGENDA',[v['color'] for v in legend])
    fills=[]
    for g in geometries:fills.extend(solid(doc,g,prefix+'_HACHURAS_GLEBAS',0x80A8D8,.9))
    behind(doc,fills)
