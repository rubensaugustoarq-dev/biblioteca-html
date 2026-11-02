"""Compact landscape tables; coverage dimensions appear only for exceptions."""
from collections import Counter
from .subdivision.pdf import table,row_height


def fmt(n):return f'{n:,.2f}'.replace(',','@').replace('.',',').replace('@','.')


def grouped_tables(title,headers,rows,widths,capacity):
    # Leave room for the parent section heading on a fresh page.
    budget=capacity-7;chunks=[];chunk=[];used=13
    for row in rows:
        height=row_height(row,widths)
        if chunk and used+height>budget:
            chunks.append(table(title+(' · CONTINUAÇÃO' if chunks else ''),headers,chunk,widths));chunk=[];used=13
        chunk.append(row);used+=height
    if chunk:chunks.append(table(title+(' · CONTINUAÇÃO' if chunks else ''),headers,chunk,widths))
    return chunks


def landscape_cards(state,capacity=169):
    landscape=state.get('landscape',[])
    if not landscape:return []
    from ..landscape.domain import totals
    metrics=totals(landscape);entries=[('heading','PAISAGISMO · RESUMO',7)]
    plants=Counter((v['kind'],v.get('diameterM',0)) for v in landscape if v['kind'] in ('tree','palm'))
    if plants:
        rows=[['Árvores' if kind=='tree' else 'Palmeiras',fmt(diameter),str(count)] for (kind,diameter),count in sorted(plants.items(),key=lambda p:(p[0][0]!='tree',p[0][1]))]
        entries.extend(grouped_tables('VEGETAÇÃO',['Tipo','Copa Ø (m)','Qtd.'],rows,[47,28,20],capacity))
    coverage=[];exceptions=[]
    for kind,dimension,label in (('chalet','sideM','Chalés'),('hut','radiusM','Choupanas')):
        groups={}
        for item in landscape:
            if item['kind']==kind:groups.setdefault(item.get(dimension,0),[]).append(item)
        if not groups:continue
        coverage.append([label,str(sum(len(items) for items in groups.values()))])
        if len(groups)<=1:continue
        ordered=sorted(groups.items(),key=lambda p:(-len(p[1]),p[0]))
        for index,(size,items) in enumerate(ordered):
            measure=('lado ' if kind=='chalet' else 'raio ')+fmt(size)+' m'
            reference='Grupo principal' if not index else items[0]['name']+(f' e mais {len(items)-1}' if len(items)>1 else '')
            exceptions.append([label,measure,str(len(items)),reference])
    if coverage:entries.extend(grouped_tables('COBERTURAS',['Tipo','Quantidade'],coverage,[65,30],capacity))
    if exceptions:entries.extend(grouped_tables('COBERTURAS · DIMENSÕES DIFERENTES',['Tipo','Dimensão','Qtd.','Referência'],exceptions,[21,24,10,40],capacity))
    water=[item for item in landscape if item['kind']=='water']
    if water:
        rows=[[item['name'],fmt(item['derived']['areaM2']),fmt(item['derived']['perimeterM'])] for item in water]
        entries.extend(grouped_tables('LÂMINAS D’ÁGUA',['Identificação','Área (m²)','Perímetro (m)'],rows,[43,26,26],capacity))
        entries.append(('text',f'<b>Superfície de água por união: {fmt(metrics["waterAreaM2"])} m².</b>',8))
    entries.append(('text','Quantidades do projeto gravado. Elementos de paisagismo não são somados ao pavimento ou aos índices do ENL.',10))
    return entries
