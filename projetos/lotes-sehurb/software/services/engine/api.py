from pathlib import Path
from typing import Any
import os
import subprocess
import sys
import threading
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .store import Store, DomainError, ROOT, uid, metrics, polygon
from .raster import prepare
from . import shapes, cad

from .version import VERSION

app = FastAPI(title='Lotes SEHURB', version=VERSION)
store = Store(os.environ.get('LSE_PROJECTS_DIR'))
shape_picker_lock = threading.Lock()


@app.middleware('http')
async def local_only(request: Request, call_next):
    host = request.headers.get('host', '').split(':')[0]
    if host not in ('127.0.0.1', 'localhost', 'testserver'):
        return JSONResponse({'detail': 'Acesso disponível somente no computador local.'}, status_code=403)
    if request.url.path.startswith('/api/') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
        origin = request.headers.get('origin')
        if request.headers.get('x-lsehurb') != '1' or (origin and origin not in ('http://127.0.0.1:8765', 'http://localhost:8765', 'http://127.0.0.1:5173', 'http://localhost:5173')):
            return JSONResponse({'detail': 'Origem da operação não autorizada.'}, status_code=403)
    return await call_next(request)


@app.exception_handler(DomainError)
async def domain_error(request, error):
    return JSONResponse({'detail': error.message}, status_code=error.status)


class CreateProject(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    authid: str
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-80, le=84, allow_inf_nan=False)


class Command(BaseModel):
    commandId: str
    expectedRevision: int = Field(ge=0)
    type: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class ViewState(BaseModel):
    center: tuple[float, float]
    resolution: float = Field(gt=0, allow_inf_nan=False)


class MeasureArea(BaseModel):
    points: list[tuple[float, float]] = Field(min_length=4, max_length=10000)


@app.post('/api/projects/{project_id}/measure/area')
def measure_area(project_id: str, data: MeasureArea):
    store.state(project_id)
    try:
        return metrics({'type': 'Polygon', 'coordinates': [[list(p) for p in data.points]]})
    except DomainError as error:
        raise DomainError('Não foi possível medir a área. Use três pontos distintos, feche no início e evite linhas cruzadas. ' + error.message)


@app.get('/api/health')
def health():
    return {'version': VERSION, 'storage': 'SQLite local', 'capabilities': ['projects', 'orthophoto', 'boundary', 'history', 'shapefile', 'annotations', 'dxf', 'enl', 'infra']}


@app.get('/api/projects')
def projects():
    return store.recent()


@app.post('/api/projects')
def create(data: CreateProject):
    return store.create(data.name, data.authid, data.longitude, data.latitude)


@app.get('/api/projects/{project_id}')
def state(project_id: str):
    return store.state(project_id)


@app.post('/api/projects/{project_id}/commands')
def command(project_id: str, data: Command):
    if data.type not in ('landscape.upsert', 'landscape.delete', 'boundary.upsert', 'entity.delete', 'entity.lock', 'resource.opacity', 'resource.delete', 'cad.layer', 'enl.upsert', 'enl.delete', 'enl.subdivision.import', 'accessibility.upsert', 'accessibility.delete', 'accessibility.element.upsert', 'accessibility.element.delete', 'infra.upsert', 'infra.delete', 'subdivision.area.upsert', 'subdivision.area.delete', 'subdivision.layout.apply', 'annotation.upsert', 'annotation.delete', 'dimension.upsert', 'dimension.delete', 'undo', 'redo'):
        raise DomainError('Comando não disponível.')
    try:
        return store.command(project_id, data.model_dump())
    except (KeyError, TypeError, ValueError):
        raise DomainError('Parâmetros incompletos ou inválidos.')


@app.post('/api/projects/{project_id}/orthophotos')
def upload(project_id: str, file: UploadFile = File(...), expected_revision: int = Form(...), command_id: str = Form(...)):
    uid(command_id)
    if store.state(project_id)['project']['revision'] != expected_revision:
        raise DomainError('Revisão mudou antes da importação. Recarregue o projeto.', 409)
    resource = prepare(store, project_id, file)
    return store.command(project_id, {'commandId': command_id, 'expectedRevision': expected_revision,
                                      'type': 'resource.add', 'parameters': {'resource': resource}})


@app.post('/api/projects/{project_id}/cad/import')
def cad_import(project_id: str, file: UploadFile = File(...), expected_revision: int = Form(...), command_id: str = Form(...), confirmed: bool = Form(False)):
    uid(command_id)
    if store.state(project_id)['project']['revision'] != expected_revision:
        raise DomainError('Projeto mudou antes da importação.', 409)
    resource = cad.prepare(store, project_id, file, confirmed)
    return store.command(project_id, {'commandId': command_id, 'expectedRevision': expected_revision,
        'type': 'resource.add', 'parameters': {'resource': resource}})


@app.get('/api/projects/{project_id}/cad/{resource_id}/view')
def cad_view(project_id: str, resource_id: str):
    _, path = cad.reference(store, project_id, resource_id)
    return FileResponse(path.with_name('view.json'), media_type='application/json')


@app.get('/api/projects/{project_id}/cad/{resource_id}/snap')
def cad_snap(project_id: str, resource_id: str):
    from .enl.cad_snap import snap_features
    return snap_features(store,project_id,resource_id)


@app.get('/api/projects/{project_id}/cad/export')
def cad_export(project_id: str, texts: bool = True, points: bool = False, dimensions: bool = False, infra: bool = False, legend: str | None = None, dimension_groups: str | None = None):
    groups=None
    if dimension_groups is not None:
        groups=set(filter(None,dimension_groups.split(',')))
        if not groups.issubset({'glebas','roads','surfaces','lots','independent'}):raise DomainError('Grupo de cotas DXF inválido.')
    entries=None
    if legend is not None:
        import json
        from pydantic import ValidationError
        from .study_pdf import StudyLegendItem
        try:
            if len(legend)>16000:raise ValueError()
            entries=json.loads(legend)
            if not isinstance(entries,list) or len(entries)>40:raise ValueError()
            entries=[StudyLegendItem.model_validate(item).model_dump() for item in entries]
        except (ValueError,TypeError,ValidationError):raise DomainError('Legenda DXF inválida. Confira os itens e cores do PDF.')
    return Response(cad.export(store, project_id, texts, points, dimensions, infra, entries, groups), media_type='application/dxf',
        headers={'Content-Disposition': 'attachment; filename="SEHURB-estudo.dxf"', 'Cache-Control': 'no-store'})


@app.get('/api/projects/{project_id}/enl/cad/export')
def enl_cad_export(project_id: str, lot_id: str, revision: int | None = None, texts: bool = True, points: bool = False, glebas: bool = False, buildings: bool = False, setbacks: bool = True):
    from .enl.cad_export import export
    data,media,filename=export(store,project_id,lot_id,revision,texts,points,glebas,buildings,setbacks)
    return Response(data,media_type=media,headers={'Content-Disposition':f'attachment; filename="{filename}"','Cache-Control':'no-store'})


@app.get('/api/projects/{project_id}/resources/{resource_id}/cog')
def resource_file(project_id: str, resource_id: str):
    state = store.state(project_id)
    resource = next((r for r in state['resources'] if r['id'] == uid(resource_id)), None)
    if not resource:
        raise DomainError('Ortofoto não encontrada.', 404)
    folder = store.folder(project_id)
    path = (folder / resource['metadata']['derivedPath']).resolve()
    if not path.is_relative_to(folder.resolve()) or not path.is_file():
        raise DomainError('Arquivo da ortofoto ausente. Preserve a pasta completa do projeto.', 404)
    return FileResponse(path, media_type='image/tiff', headers={'Cache-Control': 'private, max-age=3600'})


@app.post('/api/projects/{project_id}/view')
def save_view(project_id: str, data: ViewState):
    store.save_view(project_id, data.model_dump())
    return {'saved': True}


@app.post('/api/projects/{project_id}/checkpoint')
def checkpoint(project_id: str):
    return store.checkpoint(project_id)


class SaveAs(BaseModel):
    expectedRevision: int = Field(ge=0)


@app.post('/api/projects/{project_id}/save-as')
def save_as(project_id: str, data: SaveAs):
    store.state(project_id)
    if not shape_picker_lock.acquire(blocking=False):
        raise DomainError('Feche a outra janela de seleção antes de salvar como.', 409)
    try:
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/selecionar_pasta_projeto.py')],
            capture_output=True, text=True, timeout=300,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode:
            raise DomainError('Não foi possível abrir o seletor de pastas do Windows.')
        path = __import__('json').loads(result.stdout)['path']
        return store.save_as(project_id, path, data.expectedRevision) if path else {'cancelled': True}
    except subprocess.TimeoutExpired:
        raise DomainError('A seleção foi encerrada após 5 minutos. Clique em Salvar como novamente.')
    except OSError as error:
        raise DomainError('Não foi possível salvar nesta pasta: ' + str(error))
    finally:
        shape_picker_lock.release()


class ShapeApply(BaseModel):
    token: str
    commandId: str
    expectedRevision: int = Field(ge=0)


@app.post('/api/projects/{project_id}/shapefile/preview')
def shape_preview(project_id: str, files: list[UploadFile] = File(...)):
    return shapes.preview(store, project_id, files)


@app.post('/api/projects/{project_id}/shapefile/apply')
def shape_apply(project_id: str, data: ShapeApply):
    return shapes.apply(store, project_id, data.token, data.commandId, data.expectedRevision)


@app.get('/api/projects/{project_id}/shapefile/export')
def shape_export(project_id: str, separate: bool = False, include_vertices: bool = False):
    return Response(shapes.export(store.state(project_id), separate=separate, include_vertices=include_vertices), media_type='application/zip',
                    headers={'Content-Disposition': 'attachment; filename="glebas-shapefile.zip"', 'Cache-Control': 'no-store'})


@app.post('/api/projects/{project_id}/shapefile/open-local')
def shape_open_local(project_id: str):
    store.state(project_id)
    if not shape_picker_lock.acquire(blocking=False):
        raise DomainError('Já existe uma janela para escolher SHP aberta.', 409)
    try:
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/selecionar_shapefile.py')],
            capture_output=True, text=True, timeout=300,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode:
            raise DomainError('Não foi possível abrir o seletor do Windows. Use Importar ZIP / conjunto como alternativa.')
        path = __import__('json').loads(result.stdout)['path']
        return shapes.preview_local(store, project_id, path) if path else {'cancelled': True}
    except subprocess.TimeoutExpired:
        raise DomainError('A seleção foi encerrada após 5 minutos. Clique em Abrir SHP novamente.')
    finally:
        shape_picker_lock.release()


@app.get('/api/projects/{project_id}/sheets/{sheet_id}/pdf')
@app.get('/api/projects/{project_id}/sheets/{sheet_id}/preview')
def sheets_paused(project_id: str, sheet_id: str):
    store.state(project_id)
    uid(sheet_id)
    raise DomainError('Pranchas desativadas por enquanto. Finalize o empranchamento no CAD.',410)


@app.post('/api/projects/{project_id}/study/pdf')
def study_pdf(project_id: str, image: UploadFile = File(...), fields: str = Form(...), preview: bool = False, infra: bool = False, preview_mode: str = 'inline'):
    from .study_pdf import StudyFields, render_study, render_rasters
    from pydantic import ValidationError
    try:
        data = StudyFields.model_validate_json(fields)
    except ValidationError:
        raise DomainError('Confira os campos do carimbo e a escala da folha.')
    image_bytes = image.file.read(40*1024*1024+1)
    if len(image_bytes)>40*1024*1024:
        raise DomainError('Imagem muito grande para exportar A3.')
    state = store.state(project_id)
    if state['project']['revision'] != data.expectedRevision:
        raise DomainError('O projeto mudou durante a exportação. Gere a prévia novamente.',409)
    image_bytes = render_rasters(store, state, data, image_bytes)
    if infra:
        from .infra.pdf import render_infra
        pdf = render_infra(state,image_bytes,data)
    else:pdf = render_study(state, image_bytes, data)
    if preview and preview_mode=='lazy':
        from .pdf_preview import framing_preview
        from .pdf_assets import assets
        map_preview,framing=framing_preview(image_bytes,data,infra)
        return JSONResponse(assets.put(project_id,pdf,map_preview,framing,'SEHURB-infra-A3.pdf' if infra else 'SEHURB-estudo-A3.pdf'))
    if preview:
        import base64
        from io import BytesIO
        import pypdfium2
        document = pypdfium2.PdfDocument(pdf)
        page_count=len(document)
        previews=[]
        if infra:
            for index in range(page_count):
                other=document[index];render=other.render(scale=1.2);output=BytesIO()
                render.to_pil().save(output,format='PNG');previews.append(base64.b64encode(output.getvalue()).decode('ascii'))
                render.close();other.close()
        page = document[0]
        bitmap = page.render(scale=1.2)
        png = BytesIO()
        bitmap.to_pil().save(png, format='PNG')
        bitmap.close(); page.close(); document.close()
        from .pdf_preview import framing_preview
        map_preview,framing=framing_preview(image_bytes,data,infra)
        return JSONResponse({'mapPreview':base64.b64encode(map_preview).decode('ascii'),'framing':framing,'pdf': base64.b64encode(pdf).decode('ascii'),
                             'pageCount':page_count,'previews':previews,
                             'preview': base64.b64encode(png.getvalue()).decode('ascii')})
    return Response(pdf, media_type='application/pdf', headers={
        'Content-Disposition': 'attachment; filename="SEHURB-estudo-A3.pdf"', 'Cache-Control': 'no-store'})


@app.get('/api/projects/{project_id}/pdf-previews/{token}/document.pdf')
def pdf_document_asset(project_id:str,token:str):
    from .pdf_assets import assets
    entry=assets.get(project_id,token)
    return Response(entry.pdf,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="{entry.filename}"','Cache-Control':'no-store'})

@app.get('/api/projects/{project_id}/pdf-previews/{token}/map.png')
def pdf_map_asset(project_id:str,token:str):
    from .pdf_assets import assets
    return Response(assets.get(project_id,token).map,media_type='image/png',headers={'Cache-Control':'no-store'})

@app.get('/api/projects/{project_id}/pdf-previews/{token}/pages/{index}.jpg')
def pdf_page_asset(project_id:str,token:str,index:int):
    from .pdf_assets import assets
    return Response(assets.page(project_id,token,index),media_type='image/jpeg',headers={'Cache-Control':'private, max-age=300'})

@app.post('/api/projects/{project_id}/infra/pdf')
def infra_pdf(project_id: str, image: UploadFile = File(...), fields: str = Form(...), preview: bool = False, preview_mode: str = 'inline'):
    return study_pdf(project_id,image,fields,preview,infra=True,preview_mode=preview_mode)

class SubdivisionAreaRequest(BaseModel):
    expectedRevision:int=Field(ge=0)
    area:dict[str,Any]

@app.post('/api/projects/{project_id}/subdivision/areas/validate')
def subdivision_area_validate(project_id:str,data:SubdivisionAreaRequest):
    from .infra.subdivision.areas import candidate
    state=store.state(project_id)
    if state['project']['revision']!=data.expectedRevision:raise DomainError('Projeto mudou. Refaça a conferência da área.',409)
    try:return candidate(state,data.area)
    except (KeyError,TypeError,ValueError):raise DomainError('Preencha a gleba, o nome e um contorno válido.')

@app.post('/api/projects/{project_id}/subdivision/areas/clip')
def subdivision_area_clip(project_id:str,data:SubdivisionAreaRequest):
    from .infra.subdivision.areas import clip
    state=store.state(project_id)
    if state['project']['revision']!=data.expectedRevision:raise DomainError('Projeto mudou. Refaça o recorte.',409)
    try:return clip(state,data.area)
    except (KeyError,TypeError,ValueError):raise DomainError('Informe uma gleba e um contorno válido para recortar.')

class SubdivisionLayoutRequest(BaseModel):
    expectedRevision:int=Field(ge=0)
    id:str
    sourceEntityId:str
    layout:dict[str,Any]

@app.post('/api/projects/{project_id}/subdivision/layout/{action}')
def subdivision_layout_preview(project_id:str,action:str,data:SubdivisionLayoutRequest):
    from .infra.subdivision.areas import candidate
    from .infra.subdivision.layout import preview,for_area
    state=store.state(project_id)
    if state['project']['revision']!=data.expectedRevision:raise DomainError('Projeto mudou. Gere a prévia novamente.',409)
    if action not in ('preview','validate'):raise DomainError('Operação de loteamento não disponível.',404)
    existing=next((a for a in state.get('subdivisionAreas',[]) if a['id']==data.id),None)
    entity=next((e for e in state['entities'] if e['id']==data.sourceEntityId),None)
    if entity is None:raise DomainError('Selecione uma gleba existente.')
    if existing and not polygon(existing['sourceBoundarySnapshot']).equals(polygon(entity['geometry'])):raise DomainError('A gleba mudou. Inicie um estudo com o perímetro atual.')
    try:
        area=candidate(state,{'id':data.id,'sourceEntityId':data.sourceEntityId,'name':existing['name'] if existing else entity['attributes']['name'],'mode':existing['mode'] if existing else 'wholeGleba','geometry':existing['geometry'] if existing else entity['geometry']})
        extra={}
        if action=='preview' and data.layout.get('parameters',{}).get('optimization',True):
            from .infra.subdivision.optimizer import alternatives
            report=alternatives({**data.layout,'id':area['id'],'sourceEntityId':area['sourceEntityId'],'sourceGeometry':area['geometry']},state['infra'])
            result=report['alternatives'][0]['layout'];extra=report
        else:result=(preview if action=='preview' else for_area)(area,data.layout,state['infra'])
        if result['derived']['conflictAreaM2']>1e-6:raise DomainError('Uma área de uso ou lote invade a pista/calçada. Ajuste ou gere nova prévia.')
        return {'expectedRevision':data.expectedRevision,'layout':result,**extra}
    except (KeyError,TypeError,ValueError):raise DomainError('Confira os parâmetros e contornos do loteamento.')

@app.post('/api/projects/{project_id}/accessibility/preview')
def accessibility_preview(project_id: str, data: dict):
    from .accessibility.domain import candidate,placement
    state=store.accessibility_context(project_id,data.get('expectedRevision'))
    if data.get('expectedRevision')!=state['project']['revision']:raise DomainError('O projeto mudou. Atualize a prévia.',409)
    try:
        if data.get('autoHost'):
            return placement(data['ramp'],state['infra'],{**state['infraMetrics'],'_ramps':state['accessibility']},data.get('snapToleranceM',0))
        return candidate(data['ramp'],state['infra'],state['infraMetrics'])
    except (KeyError,TypeError,ValueError):raise DomainError('Parâmetros de rampa incompletos ou inválidos.')

@app.post('/api/projects/{project_id}/accessibility/elements/preview')
def accessibility_element_preview(project_id: str, data: dict):
    from .accessibility.elements import candidate
    state=store.accessibility_context(project_id,data.get('expectedRevision'))
    if data.get('expectedRevision')!=state['project']['revision']:raise DomainError('O projeto mudou. Atualize a prévia.',409)
    try:
        preview_only=data.get('previewOnly') is True
        value=candidate(data['element'],state['infra'],state['infraMetrics'],state['accessibility'],preview=preview_only)
        if value['kind']=='parking':
            from .accessibility.parking import check_overlap
            try:check_overlap(value,[*state['accessibility'],*state.get('accessibilityElements',[])])
            except DomainError as error:
                if not preview_only:raise
                value['derived'].update(status='invalid',error=error.message)
        return value
    except (KeyError,TypeError,ValueError):raise DomainError('Confira os parâmetros do elemento de acessibilidade.')

web = ROOT / 'apps/web/dist'
if web.is_dir():
    app.mount('/', StaticFiles(directory=web, html=True), name='web')
