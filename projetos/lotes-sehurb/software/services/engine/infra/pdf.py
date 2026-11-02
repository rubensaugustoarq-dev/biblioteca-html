"""Infra A3 reports reuse the study stamp; all quantities come from stored geometry."""
from io import BytesIO
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from xml.sax.saxutils import escape
from pypdf import PdfReader,PdfWriter
from ..study_pdf import render_study
from .project_report import summary_cards,legend_entries,draw_symbol,text_card

MATERIAL={'asphalt':'CBUQ','concrete':'Concreto','brick':'Tijolinho maciço','earth':'Terra','pavers':'Intertravado','wood':'Madeira pião-roxo'}
def fmt(n):return f'{n:,.2f}'.replace(',','@').replace('.',',').replace('@','.')

def cards(state):
    values=[('heading','POLIGONAIS DAS GLEBAS',7)]
    for e in state['entities']:
        values.append(('text',escape(e['attributes']['name'])+' · '+fmt(e['derived']['areaM2'])+' m²',9))
    if not state['entities']:values.append(('text','Nenhuma gleba cadastrada.',9))
    m=state.get('infraMetrics',{})
    values.append(('heading','QUANTITATIVOS CONFIRMADOS',7))
    bridge_text=f"Pontes de madeira: <b>{fmt(m['bridgeAreaM2'])} m²</b><br/>" if m.get('bridgeAreaM2') else ''
    values.append(('text',f"Calçamento: <b>{fmt(m.get('sidewalkAreaM2',0))} m²</b><br/>Pavimento: <b>{fmt(m.get('pavementAreaM2',0))} m²</b><br/>{bridge_text}Total sistema viário: <b>{fmt(m.get('totalAreaM2',0))} m²</b><br/><font size='5.5'>Áreas por união, sem dupla contagem. Terra excluída do pavimento.</font>",20))
    roads=[v for v in state.get('infra',[]) if v['kind']=='road' and v.get('usage') not in ('walkway','bridge')]
    values.append(('heading','VIAS · RESUMO',7))
    for v in roads:
        values.append(('text',f"<b>{escape(v['name'])}</b> · {fmt(v['derived']['axisLengthM'])} m<br/>Pista {fmt(v['width'])} m · {MATERIAL[v['material']]} · Calçadas E/D {fmt(v['sidewalkLeft'])}/{fmt(v['sidewalkRight'])} m",12))
    if not roads:values.append(('text','Nenhuma via cadastrada.',9))
    paths=[v for v in state.get('infra',[]) if v.get('usage')=='walkway']
    if paths:
        values.append(('heading','CALÇADAS INDEPENDENTES',7))
        for v in paths:values.append(('text',f"<b>{escape(v['name'])}</b> · {fmt(v['derived']['axisLengthM'])} m<br/>Largura {fmt(v['width'])} m · {MATERIAL[v['material']]} · Área {fmt(v['derived']['sidewalkAreaM2'])} m²",12))
    bridges=[v for v in state.get('infra',[]) if v.get('usage')=='bridge']
    if bridges:
        values.append(('heading','PONTES DE MADEIRA',7))
        for v in bridges:values.append(('text',f"<b>{escape(v['name'])}</b> · {fmt(v['derived']['axisLengthM'])} m × {fmt(v['width'])} m<br/>Madeira pião-roxo · Área {fmt(v['derived'].get('bridgeAreaM2',0))} m²",12))
    values.append(('heading','SEÇÕES DAS VIAS',7))
    # Equivalent sections share a card to keep the sheet compact.
    sections={}
    for v in roads:
        key=(v['width'],v['sidewalkLeft'],v['sidewalkRight'],v['material'],v['sidewalkMaterial'])
        sections.setdefault(key,[]).append(v['name'])
    for key,names in sections.items():
        group=[]
        for name in names:
            label=', '.join([*group,name])
            _,h=Paragraph('<b>'+escape(label)+'</b>',ParagraphStyle('section_names',fontName='Helvetica',fontSize=6.5,leading=8)).wrap(89*mm,1000*mm)
            if group and h>8*mm:values.append(('section',(key,', '.join(group)),33));group=[]
            group.append(name)
        if group:values.append(('section',(key,', '.join(group)),33))
    return values

def draw_cards(c,values,page,total,bottom,subdivision=False):
    x=24;w=95;y=48
    c.setFillColorRGB(1,1,1);c.setStrokeColorRGB(.2,.3,.32);c.setLineWidth(.15*mm)
    c.rect(x*mm,(297-bottom)*mm,w*mm,(bottom-y)*mm,fill=1)
    style=ParagraphStyle('infra',fontName='Helvetica',fontSize=6.5,leading=8)
    def text(value,top,height=10):
        p=Paragraph(value,style);_,h=p.wrap((w-6)*mm,height*mm)
        if h>height*mm:raise ValueError('Texto do quadro muito longo. Abrevie os nomes de vias ou glebas.')
        p.drawOn(c,(x+3)*mm,(297-top)*mm-h)
    for kind,value,height in values:
        if kind=='heading':
            c.setFillColorRGB(.91,.95,.93);c.rect(x*mm,(297-y-height)*mm,w*mm,height*mm,fill=1,stroke=0)
            text('<b>'+value+'</b>',y+2,height-2)
        elif kind=='text':text(value,y+2,height-2)
        elif kind=='legend':
            symbol,label=value;draw_symbol(c,symbol,x+6,y+height/2)
            paragraph=Paragraph(escape(label),style);_,ph=paragraph.wrap((w-16)*mm,(height-1)*mm)
            paragraph.drawOn(c,(x+13)*mm,(297-y-height/2)*mm-ph/2)
        elif kind=='table':
            c.setFillColorRGB(.91,.95,.93);c.rect(x*mm,(297-y-7)*mm,w*mm,7*mm,fill=1,stroke=0)
            text('<b>'+value['title']+'</b>',y+2,5)
            top=y+7
            if value['subtitle']:text(value['subtitle'],top+1,9);top+=10
            for row_index,row in enumerate([value['headers']]+value['rows']):
                h=6 if row_index==0 else value.get('rowHeights',[5]*len(value['rows']))[row_index-1];xx=x
                for cell,width in zip(row,value['widths']):
                    c.setFillColorRGB(*((.95,.97,.96) if row_index==0 else (1,1,1)));c.setStrokeColorRGB(.55,.65,.65);c.rect(xx*mm,(297-top-h)*mm,width*mm,h*mm,fill=1,stroke=1)
                    cell_style=ParagraphStyle('cell',fontName='Helvetica-Bold' if row_index==0 else 'Helvetica',fontSize=6,leading=7)
                    para=Paragraph(escape(str(cell)),cell_style);_,ph=para.wrap((width-2)*mm,(h-1)*mm)
                    if ph>(h-1)*mm:raise ValueError('Uma célula da tabela de lotes ficou muito longa. Abrevie os nomes.')
                    para.drawOn(c,(xx+1)*mm,(297-top)*mm-ph-1*mm);xx+=width
                top+=h
        else:
            (width,left,right,pavement,sidewalk),names=value
            # A schematic section with live horizontal dimensions, as in properties.
            text('<b>'+escape(names)+'</b>',y+1,9)
            scale=(w-10)/(width+left+right);a=x+5;b=a+left*scale;d=b+width*scale;e=d+right*scale
            def block(start,size,top,h,color):
                c.setFillColor(color);c.rect(start*mm,(297-top-h)*mm,size*mm,h*mm,fill=1,stroke=0)
            walk='#bfc7c7' if sidewalk!='brick' else '#b66a48'
            road='#b66a48' if pavement=='brick' else '#ae9471' if pavement=='earth' else '#35434c'
            block(a,e-a,y+18,6,'#78868a');block(a,b-a,y+16,3,walk);block(b,d-b,y+19,2,road);block(d,e-d,y+16,3,walk)
            c.setStrokeColorRGB(.2,.3,.32);c.setFillColorRGB(0,0,0);c.setFont('Helvetica',5.5)
            for start,end,label in ((a,b,fmt(left)),(b,d,fmt(width)),(d,e,fmt(right))):
                if end-start<.01:continue
                yy=(297-y-(16 if start==b and end==d else 12))*mm;c.line(start*mm,yy,end*mm,yy)
                for xx in (start,end):c.line(xx*mm,yy-mm,xx*mm,yy+mm)
                c.drawCentredString((start+end)/2*mm,yy+1.5*mm,label+' m')
            c.drawCentredString((a+e)/2*mm,(297-y-28)*mm,'Total '+fmt(width+left+right)+' m · corte esquemático')
            c.drawCentredString((a+e)/2*mm,(297-y-32)*mm,MATERIAL[pavement]+(' / '+MATERIAL[sidewalk] if left+right>0 else ' / sem calçadas'))
        y+=height
    c.setFont('Helvetica',5.5);c.setFillColorRGB(0,0,0)
    c.drawRightString(119*mm,(297-bottom-3)*mm,f'Quadro Loteamento {page}/{total}' if subdivision else f'Quadro Infra {page}/{total} · alturas ilustrativas')

def render_infra(state,image,fields):
    from ..store import DomainError
    legend_items=fields.legendItems or [] if fields.legend else []
    legend_height=0
    if legend_items:
        width=min(180,max(72,max(stringWidth(item.label,'Helvetica',7)/mm+16 for item in legend_items)))
        legend_height=8
        for item in legend_items:
            lines=['']
            for word in item.label.split():
                candidate=(lines[-1]+' '+word).strip()
                if stringWidth(candidate,'Helvetica',7)>(width-15)*mm and lines[-1]:lines.append(word)
                else:lines[-1]=candidate
            legend_height+=max(6,len(lines)*3+2)
    bottom=min(222,282-legend_height-7) if legend_height else 222
    capacity=bottom-48-5
    if capacity<40:raise DomainError('A legenda ocupa o espaço do quadro Infra. Reduza seus itens ou textos para gerar esta folha.')
    pages=[[]];used=0
    subdivision=fields.infraReport=='subdivision'
    if subdivision:
        from .subdivision.pdf import cards as subdivision_cards
        entries=subdivision_cards(state,fields.subdivisionAreaId,capacity)
    else:entries=cards(state)
    entries.extend(summary_cards(state,capacity))
    if fields.legend:
        general=legend_entries(state)
        if general:
            entries.append(('heading','LEGENDA GERAL DO PROJETO',7))
            entries.extend(('legend',item,8) for item in general)
    # Measure text from the same font and width used for drawing, so long names
    # wrap without clipping. Geometry/quantities are not modified by pagination.
    entries=[text_card(value,height) if kind=='text' else (kind,value,height) for kind,value,height in entries]
    # Reserve the confirmed totals on page one even when the gleba list overflows.
    totals_index=next(i for i,card in enumerate(entries) if ((card[0]=='table' and card[1]['title']=='UTILIZAÇÃO DO SOLO') if subdivision else (card[0]=='heading' and card[1]=='QUANTITATIVOS CONFIRMADOS')))
    prefix=entries[:totals_index];totals=entries[totals_index:totals_index+2]
    if sum(card[2] for card in prefix+totals)>capacity:
        first=[prefix[0]];remaining=[];space=capacity-sum(card[2] for card in totals)-prefix[0][2]
        for card in prefix[1:]:
            if card[2]<=space:first.append(card);space-=card[2]
            else:remaining.append(card)
        entries=first+totals+[('heading','GLEBAS · CONTINUAÇÃO',7)]+remaining+entries[totals_index+2:]
    active_heading=''
    for index,card in enumerate(entries):
        if card[2]>capacity:raise DomainError('O quadro não cabe com esta legenda. Reduza os itens da legenda.')
        required=card[2]+(entries[index+1][2] if card[0]=='heading' and index+1<len(entries) else 0)
        if used+required>capacity:
            pages.append([]);used=0
            repeat=card[0]!='heading' and active_heading.startswith(('ACESSIBILIDADE','PAISAGISMO','LEGENDA GERAL','VIAS','CALÇADAS','PONTES','SEÇÕES','GLEBAS'))
            if repeat and required+7<=capacity:pages[-1].append(('heading',active_heading+' · CONTINUAÇÃO',7));used=7
        if card[0]=='heading':active_heading=card[1]
        pages[-1].append(card);used+=card[2]
    writer=PdfWriter()
    try:
        for i,values in enumerate(pages):
            page_fields=fields.model_copy(update={'sheet':f'{i+1:02d}/{len(pages):02d}'})
            pdf=render_study(state,image,page_fields,lambda c:draw_cards(c,values,i+1,len(pages),bottom,subdivision))
            writer.add_page(PdfReader(BytesIO(pdf)).pages[0])
    except ValueError as error:raise DomainError(str(error))
    # First merge transparency masks, then images whose mask references now match.
    # A single pass still repeats RGBA orthophotos on every continuation sheet.
    writer.compress_identical_objects(remove_duplicates=True,remove_unreferenced=True)
    writer.compress_identical_objects(remove_duplicates=True,remove_unreferenced=True)
    out=BytesIO();writer.write(out);return out.getvalue()
