"""Compact saved subdivision report: land use and lot name/area/perimeter."""
from xml.sax.saxutils import escape
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from ...store import DomainError

USES={'lots':'Lotes','roads':'Sistema viário','paved':'Outras pavimentações','green':'Área verde','institutional':'Institucional','other':'Outros usos','remainder':'Remanescente'}
def fmt(value,decimals=2):return f'{value:,.{decimals}f}'.replace(',','@').replace('.',',').replace('@','.')

def saved_area(state,identity):
    area=next((a for a in state.get('subdivisionAreas',[]) if a['id']==identity),None)
    if not area or not area.get('layout',{}).get('lots'):
        raise DomainError('Aplique o loteamento desta gleba antes de gerar o PDF A3.')
    return area

def table(title,headers,rows,widths,subtitle=''):
    heights=[row_height(row,widths) for row in rows]
    height=7+(10 if subtitle else 0)+6+sum(heights)
    return ('table',{'title':title,'headers':headers,'rows':rows,'widths':widths,'subtitle':subtitle,'rowHeights':heights},height)

def row_height(row,widths):
    style=ParagraphStyle('lot_cell',fontName='Helvetica',fontSize=6,leading=7)
    return max(5,max(Paragraph(escape(str(cell)),style).wrap((width-2)*mm,100*mm)[1]/mm+2 for cell,width in zip(row,widths)))

def cards(state,identity,capacity=169):
    area=saved_area(state,identity);layout=area['layout'];metrics=layout['derived']
    values=[('heading','POLIGONAIS DAS GLEBAS',7),('text',escape(area.get('sourceName',area['name']))+' · '+fmt(metrics['glebaAreaM2'])+' m²',9)]
    values.append(table('UTILIZAÇÃO DO SOLO',['Uso','m²','%'],[[label,fmt(metrics['categories'].get(key,{}).get('areaM2',0)),fmt(metrics['categories'].get(key,{}).get('percent',0))] for key,label in USES.items()],[47,29,19]))
    values.append(('text',f"<b>{metrics['lotCount']} lotes</b> · áreas confirmadas no projeto.",8))
    rows=[[lot['name'],fmt(lot['derived']['areaM2']),fmt(lot['derived']['perimeterM'])] for lot in sorted(layout['lots'],key=lambda l:(l['number'],l['id']))]
    widths=[47,24,24];headers=['Lote','Área (m²)','Perímetro (m)']
    # Fill the remaining space on page one; later pages use their full capacity.
    remaining=capacity-sum(card[2] for card in values)
    budget=remaining if rows and remaining>=13+row_height(rows[0],widths) else capacity
    chunk=[];used=13;continuation=False
    for row in rows:
        height=row_height(row,widths)
        if chunk and used+height>budget:
            values.append(table('LOTES · RESUMO'+(' · continuação' if continuation else ''),headers,chunk,widths))
            chunk=[];used=13;budget=capacity;continuation=True
        chunk.append(row);used+=height
    if chunk:values.append(table('LOTES · RESUMO'+(' · continuação' if continuation else ''),headers,chunk,widths))
    return values
