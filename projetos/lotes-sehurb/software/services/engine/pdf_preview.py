"""Map-only preview and fixed paper elements for interactive print framing."""
from io import BytesIO
from PIL import Image
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.units import mm
from .study_pdf import StudyLegendItem

def framing_preview(image,fields,infra=False):
    with Image.open(BytesIO(image)) as source:
        picture=source.convert('RGBA');picture.thumbnail((1800,1800),Image.Resampling.LANCZOS)
        out=BytesIO();picture.save(out,'PNG')
    boxes=[[23,13,20,31]]
    if fields.showTitleBlock:boxes.append([250,229,160,58])
    items=(fields.legendItems if fields.legendItems is not None else [StudyLegendItem(label='POLIGONAL DE INTERVENÇÃO',color=fields.lineColor)]) if fields.legend else []
    height=0
    if items:
        width=min(180,max(72,max(stringWidth(item.label,'Helvetica',7)/mm+16 for item in items)))
        height=8
        for item in items:
            lines=['']
            for word in item.label.split():
                value=(lines[-1]+' '+word).strip()
                if stringWidth(value,'Helvetica',7)>(width-15)*mm and lines[-1]:lines.append(word)
                else:lines[-1]=value
            height+=max(6,len(lines)*3+2)
        boxes.append([25,282-height,width,height])
    if infra:
        # Infra's report reserves this fixed side panel, including its footer.
        panel_height=height if fields.legendItems else 0
        bottom=min(222,282-panel_height-7) if panel_height else 222
        boxes.append([24,48,95,bottom-48+5])
    return out.getvalue(),{'page':[420,297],'map':[20,10,390,277],'fixed':boxes}
