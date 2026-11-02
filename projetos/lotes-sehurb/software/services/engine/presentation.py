"""Validated model annotations and A1 sheet settings; all positions in model metres / paper mm."""
import math
import re
from .store import DomainError, uid

def finite(value, low=-1e9, high=1e9):
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise DomainError('Valor fora da faixa válida para texto ou prancha.')
    return value

def annotation(data):
    text = str(data['text']).strip()
    if not text or len(text) > 200:
        raise DomainError('Informe um texto de 1 a 200 caracteres.')
    font=data.get('font','Arial')
    if font not in ('Arial','Times New Roman','Courier New'):
        raise DomainError('Escolha Arial, Times New Roman ou Courier New.')
    def color(key, default):
        value=str(data.get(key,default))
        if not re.fullmatch(r'#[0-9a-fA-F]{6}',value): raise DomainError('Cor inválida. Use uma cor do seletor.')
        return value
    return dict(id=uid(data['id']), text=text, x=finite(data['x']), y=finite(data['y']),
                angle=finite(data.get('angle', 0), -360, 360), size=finite(data.get('size', 2), .05, 100),
                font=font,bold=bool(data.get('bold',True)),color=color('color','#fff8dd'),
                outline=bool(data.get('outline',True)),outlineColor=color('outlineColor','#17212d'),
                outlineWidth=finite(data.get('outlineWidth',2),.5,8))


def dimension(data):
    def point(key):
        value=data.get(key)
        if not isinstance(value,(list,tuple)) or len(value)!=2:raise DomainError('Escolha dois pontos com E/N para a cota.')
        try:return [finite(v) for v in value]
        except (ValueError,TypeError):raise DomainError('Coordenada da cota inválida.')
    start,end=point('start'),point('end');length=math.dist(start,end)
    if not .001<=length<=1000000:raise DomainError('A cota precisa ter entre 0,001 e 1.000.000 metros.')
    color=str(data.get('color','#ffe0a0'))
    if not re.fullmatch(r'#[0-9a-fA-F]{6}',color):raise DomainError('Cor da cota inválida.')
    name=str(data.get('name','Cota')).strip()
    if not name or len(name)>100:raise DomainError('Nome da cota: 1 a 100 caracteres.')
    try:offset=finite(data.get('offset',0),-1000,1000)
    except (ValueError,TypeError):raise DomainError('Afastamento da cota inválido.')
    return dict(id=uid(data['id']),name=name,start=start,end=end,color=color,offset=offset,derived={'lengthM':length})

def sheet(data):
    if len(data.get('center', [])) != 2:
        raise DomainError('Informe E e N do centro da janela.')
    fields = {k: str(data.get('fields', {}).get(k, '')).strip()[:150] for k in
              ('title','phase','work','address','city','cep','author','profession','registration','rrt','date','number','revision','drawing','content','legend')}
    viewport = data['viewport']
    view = {k: finite(viewport[k], 0, 1000) for k in ('x','y','width','height')}
    if view['x'] < 30 or view['y'] < 15 or view['width'] < 20 or view['height'] < 20 or view['x']+view['width'] > 649 or view['y']+view['height'] > 580:
        raise DomainError('A janela deve caber na área de desenho: X 30–649 mm / Y 15–580 mm.')
    def box(name, default):
        b=data.get(name, default)
        result={k:finite(b[k],0,1000) for k in ('x','y','width')}
        if result['x'] < 30 or result['x']+result['width']>649 or result['width']<50 or not 15<=result['y']<=550:
            raise DomainError('Tabela ou legenda fora da área de desenho.')
        if name=='legend' and result['y']+36>580:
            raise DomainError('A legenda deve caber acima do limite de 580 mm da área de desenho.')
        return result
    return dict(id=uid(data['id']), name=str(data.get('name','Prancha A1'))[:80], fields=fields,
                viewport=view, center=[finite(v) for v in data['center'][:2]], scale=finite(data['scale'],10,100000),
                table=box('table',dict(x=34,y=495,width=210)), legend=box('legend',dict(x=260,y=495,width=180)),
                showText=bool(data.get('showText',True)),showPoints=bool(data.get('showPoints',False)),
                showDimensions=bool(data.get('showDimensions',False)),showOrtho=bool(data.get('showOrtho',True)),
                signature=bool(data.get('signature',False)))
