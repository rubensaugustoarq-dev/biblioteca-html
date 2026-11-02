"""Shared plain-DXF table layout: lines and text, not native TABLE objects."""
import textwrap


def fmt(n):return f'{n:,.2f}'.replace(',','@').replace('.',',').replace('@','.')


def table_writer(doc,prefix,bounds):
    if not bounds:return lambda *args,**kwargs:None
    maxx=max(b[2] for b in bounds);maxy=max(b[3] for b in bounds);minx=min(b[0] for b in bounds)
    x=maxx+max(20,(maxx-minx)*.05);y=top=maxy;column_width=0
    msp=doc.modelspace();height=.8
    def layer(suffix):
        name=prefix+'_QUADRO_'+suffix
        if name not in doc.layers:doc.layers.new(name,dxfattribs={'color':7})
        return name
    def safe(text):return str(text).replace('\\','\\\\').replace('{','\\{').replace('}','\\}').replace('\n','\\P')
    def text(value,xx,yy,width,name):
        msp.add_mtext(safe(value),dxfattribs={'layer':name,'insert':(xx,yy),'char_height':height,'width':width,'attachment_point':1})
    def table(title,headers,rows,widths,suffix,swatches=None):
        nonlocal x,y,column_width
        name=layer(suffix);width=sum(widths)
        def wrapped(row):return [textwrap.wrap(str(v),width=max(1,int((w-1.4)/(height*.65))),replace_whitespace=False) or [''] for v,w in zip(row,widths)]
        rows=list(rows)
        if not rows:rows=[['—']+['']*(len(headers)-1)]
        for offset in range(0,len(rows),25):
            chunk=rows[offset:offset+25];lines=[wrapped(headers)]+[wrapped(row) for row in chunk]
            heights=[max(3.2,max(map(len,row))*height*1.5+1.4) for row in lines]
            title_text=title+(' · continuação' if offset else '')
            title_lines=textwrap.wrap(title_text,width=max(1,int((width-1.4)/(height*.65)))) or ['']
            heading=max(4,len(title_lines)*height*1.5+1.6)
            total=heading+sum(heights)
            if y-total<top-180:x+=column_width+12;y=top;column_width=0
            column_width=max(column_width,width)
            text('\n'.join(title_lines),x+.7,y-.8,width-1.4,name)
            msp.add_lwpolyline([(x,y),(x+width,y),(x+width,y-total),(x,y-total)],close=True,dxfattribs={'layer':name})
            cursor=y-heading;msp.add_line((x,cursor),(x+width,cursor),dxfattribs={'layer':name})
            for i,(row,row_height) in enumerate(zip(lines,heights)):
                xx=x
                for j,(cell,w) in enumerate(zip(row,widths)):
                    if j:msp.add_line((xx,cursor),(xx,cursor-row_height),dxfattribs={'layer':name})
                    if swatches is not None and i>0 and j==0:
                        color=swatches[offset+i-1]
                        msp.add_line((xx+1,cursor-row_height/2),(xx+w-1,cursor-row_height/2),dxfattribs={'layer':name,'true_color':int(color.lstrip('#'),16)})
                    else:text('\n'.join(cell),xx+.7,cursor-.7,w-1.4,name)
                    xx+=w
                cursor-=row_height;msp.add_line((x,cursor),(x+width,cursor),dxfattribs={'layer':name})
            y-=total+6
    return table
