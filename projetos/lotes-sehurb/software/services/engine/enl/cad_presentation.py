"""ENL-specific CAD summaries and presentation; no Infra/Study entities included."""
from shapely.geometry import shape,Polygon,mapping
from shapely.ops import unary_union
from ..cad_report import table_writer,fmt
from ..cad_fills import solid

KINDS={'building':'Edificação','impermeable':'Pavimentação impermeável','permeable':'Permeável delineada'}
COLORS={'building':0xFFCF7A,'impermeable':0xBDAFCF,'permeable':0x74D895}


def converted(geometry,convert):
    g=shape(geometry)
    if g.geom_type=='Polygon':return Polygon([convert(p) for p in g.exterior.coords],[[convert(p) for p in ring.coords] for ring in g.interiors])
    from shapely.geometry import MultiPolygon
    return MultiPolygon([converted(mapping(p),convert) for p in g.geoms])


def fills(doc,lot,prefix,convert):
    occupied=unary_union([shape(o['geometry']) for o in lot['objects'] if o['kind'] in ('building','impermeable')])
    remaining=shape(lot['geometry']).difference(occupied)
    result=solid(doc,converted(mapping(remaining),convert),prefix+'_HACHURAS_PERMEAVEL',0x74D895,.8)
    buildings=unary_union([shape(o['geometry']) for o in lot['objects'] if o['kind']=='building'])
    for obj in lot['objects']:
        if obj['kind']=='permeable':continue
        g=shape(obj['geometry'])
        if obj['kind']=='impermeable':g=g.difference(buildings)
        result.extend(solid(doc,converted(mapping(g),convert),prefix+'_HACHURAS_'+{'building':'EDIFICACOES','impermeable':'IMPERMEAVEL'}[obj['kind']],COLORS[obj['kind']],.75))
    return result


def report(doc,state,lot,bounds):
    table=table_writer(doc,'ENL',bounds);d=lot['derived']
    table('ESTUDO ENL · '+lot['name'],['Informação','Valor'],[['Lote',lot['name']],['Área do lote',fmt(d['lotAreaM2'])+' m²'],['Perímetro',fmt(shape(lot['geometry']).length)+' m'],['Sistema de coordenadas',state['project']['crs']['authid']]],[44,34],'LOTE')
    table('ÁREAS E ÍNDICES DO LOTE',['Indicador','Valor'],[['Projeção das edificações',fmt(d['footprintM2'])+' m²'],['Área construída computável',fmt(d['builtAreaM2'])+' m²'],['Pavimentação impermeável',fmt(d['pavementAreaM2'])+' m²'],['Impermeável total (união)',fmt(d['impermeableAreaM2'])+' m²'],['Permeável restante',fmt(d['permeableAreaM2'])+' m²'],['C.A.',fmt(d['ca'])],['T.O.',fmt(d['to'])+' %'],['T.P.',fmt(d['tp'])+' %']],[44,34],'INDICES')
    table('OBJETOS · RESUMO',['Nome','Tipo','Projeção (m²)','Pavimentos','Computável (m²)'],[[o['name'],KINDS[o['kind']],fmt(o['areaM2']),str(o['floors']) if o['kind']=='building' else '—',fmt(o['computableArea'] if o['computableArea'] is not None else o['areaM2']*o['floors']) if o['kind']=='building' else '—'] for o in lot['objects']],[32,30,22,18,24],'OBJETOS')
    roles={'front':'Frente','back':'Fundos','side':'Lateral'}
    table('AFASTAMENTOS · MÍNIMOS POR LADO',['Lado do lote','Referência','Distância (m)'],[[f"P{v['edge']+1} → P{(v['edge']+1)%(len(lot['geometry']['coordinates'][0])-1)+1}",roles[v['role']],'—' if v['distanceM'] is None else fmt(v['distanceM'])] for v in d['setbacks']],[26,28,24],'AFASTAMENTOS')
    legend=[('Lote / gleba','#95b9ef'),('Frente do lote','#66deb0'),('Área permeável restante','#74d895')]
    for kind in ('building','impermeable'):
        if any(o['kind']==kind for o in lot['objects']):legend.append((KINDS[kind],f'#{COLORS[kind]:06x}'))
    table('LEGENDA',['Símbolo','Descrição'],[['',name] for name,_ in legend],[12,64],'LEGENDA',[color for _,color in legend])
    table('NOTAS DO ESTUDO',['Informação'],[['Área permeável por dedução da união de edificações e pavimentação.'],['Resultados geométricos; os parâmetros urbanísticos são avaliados pelo técnico.'],['BASE: coordenadas originais. IMPLANTAÇÃO: cópia girada e deslocada.']],[78],'NOTAS')
