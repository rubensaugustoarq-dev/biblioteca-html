"""Shapefile poligonal: prévia explícita de CRS, importação atômica e ZIP GIS."""
import codecs
import io
import json
from pathlib import PurePosixPath
from uuid import uuid4
import zipfile
import re
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import transform
from .store import DomainError, polygon, uid, encode

LIMIT = 100 * 1024 * 1024


def components(uploads):
    files, original = {}, io.BytesIO()
    if len(uploads) == 1 and uploads[0].filename.lower().endswith('.zip'):
        raw = uploads[0].file.read(LIMIT + 1)
        if len(raw) > LIMIT:
            raise DomainError('Limite de entrada: 100 MB.')
        original.write(raw)
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                infos = [i for i in archive.infolist() if not i.is_dir()]
                if len(infos) > 100 or sum(i.file_size for i in infos) > LIMIT:
                    raise DomainError('ZIP excede o limite de 100 arquivos ou 100 MB descompactados.')
                for info in infos:
                    path = PurePosixPath(info.filename.replace('\\', '/'))
                    if path.is_absolute() or '..' in path.parts:
                        raise DomainError('ZIP contém caminhos inválidos.')
                    if path.suffix.lower() in ('.shp', '.shx', '.dbf', '.prj', '.cpg'):
                        key = str(path).lower()
                        if key in files:
                            raise DomainError('ZIP contém nomes duplicados.')
                        files[key] = archive.read(info)
        except (zipfile.BadZipFile, RuntimeError, OSError):
            raise DomainError('ZIP inválido ou protegido por senha.')
    else:
        if len(uploads) > 20:
            raise DomainError('Escolha somente os arquivos de um Shapefile.')
        with zipfile.ZipFile(original, 'w', zipfile.ZIP_DEFLATED) as archive:
            total = 0
            for upload in uploads:
                name = PurePosixPath(upload.filename.replace('\\', '/')).name
                raw = upload.file.read(LIMIT - total + 1)
                total += len(raw)
                if total > LIMIT:
                    raise DomainError('Limite de entrada: 100 MB.')
                key = name.lower()
                if key in files:
                    raise DomainError('Arquivos com nomes duplicados.')
                files[key] = raw
                archive.writestr(name, raw)
    bases = [name[:-4] for name in files if name.endswith('.shp')]
    if len(bases) != 1:
        raise DomainError('Escolha um único conjunto Shapefile por vez, com o mesmo nome base.')
    base = bases[0]
    missing = [ext for ext in ('.shp', '.shx', '.dbf', '.prj') if base + ext not in files]
    if missing:
        raise DomainError('Faltam os arquivos ' + ', '.join(missing) + ' do mesmo conjunto. Selecione todos juntos ou envie um ZIP.')
    return base, files, original.getvalue()


def preview(store, project_id, uploads):
    state = store.state(project_id)
    base, files, original = components(uploads)
    try:
        source = CRS.from_wkt(files[base + '.prj'].decode('utf-8-sig'))
        target = CRS.from_user_input(state['project']['crs']['authid'])
        transformer = Transformer.from_crs(source, target, always_xy=True, allow_ballpark=False)
        encoding = files.get(base + '.cpg', b'UTF-8').decode('ascii').strip()
        encoding = {'65001': 'utf-8', '1252': 'cp1252'}.get(encoding, encoding)
        codecs.lookup(encoding)
        entities = []
        count = vertices = multi = 0
        with shapefile.Reader(shp=io.BytesIO(files[base+'.shp']), shx=io.BytesIO(files[base+'.shx']),
                              dbf=io.BytesIO(files[base+'.dbf']), encoding=encoding) as reader:
            source_type = reader.shapeType
            line_types = (shapefile.POLYLINE, shapefile.POLYLINEZ, shapefile.POLYLINEM)
            if source_type not in (shapefile.POLYGON, shapefile.POLYGONZ, shapefile.POLYGONM, *line_types):
                raise DomainError(f'O arquivo é do tipo {shapefile.SHAPETYPE_LOOKUP.get(source_type, source_type)}. Para glebas, escolha polígonos ou linhas fechadas; pontos não definem um perímetro.')
            reduced = source_type in (shapefile.POLYGONZ, shapefile.POLYGONM, shapefile.POLYLINEZ, shapefile.POLYLINEM)
            if reader.numRecords > 1000:
                raise DomainError('Limite desta etapa: 1.000 feições por importação.')
            for record in reader.iterShapeRecords():
                count += 1
                geom = shape(record.shape.__geo_interface__)
                if source_type in line_types:
                    lines = list(geom.geoms) if geom.geom_type == 'MultiLineString' else [geom]
                    parts = []
                    for line in lines:
                        coords = [list(p[:2]) for p in line.coords]
                        if len(coords) < 4 or coords[0] != coords[-1]:
                            raise DomainError(f'Feição {count}: linha aberta. Feche o contorno no QGIS para formar uma gleba; o aplicativo não fecha nem une linhas automaticamente.')
                        parts.append(Polygon(coords))
                    if any(not p.is_valid or p.is_empty or p.area <= 0 for p in parts):
                        raise DomainError(f'Feição {count}: contorno fechado inválido. Corrija no QGIS antes de importar.')
                else:
                    parts = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
                if source_type not in line_types and (geom.is_empty or not geom.is_valid or geom.geom_type not in ('Polygon', 'MultiPolygon')):
                    raise DomainError(f'Feição {count} inválida. Corrija no QGIS antes de importar; nada foi reparado automaticamente.')
                multi += len(parts) > 1
                properties = json.loads(json.dumps(record.record.as_dict(), ensure_ascii=False, default=str, allow_nan=False))
                title = next((str(v) for k, v in properties.items() if k.lower() in ('nome', 'name') and v), f'{PurePosixPath(base).name} {count}')
                for index, part in enumerate(parts, 1):
                    converted = transform(lambda x, y, z=None: transformer.transform(x, y, errcheck=True), part)
                    validated = polygon(mapping(converted))
                    vertices += sum(len(r.coords) for r in [validated.exterior, *validated.interiors])
                    if vertices > 100000 or len(entities) >= 1000:
                        raise DomainError('Limite: 1.000 polígonos e 100.000 vértices por importação.')
                    entities.append({'id': str(uuid4()), 'kind': 'boundary', 'locked': False,
                        'geometry': mapping(validated), 'attributes': {'name': (title + (f' — parte {index}' if len(parts)>1 else ''))[:100],
                        'sourceProperties': properties, 'sourceLayer': PurePosixPath(base).name,
                        'sourceFeature': count, 'sourcePart': index, 'sourceCrs': source.to_string(),
                        'sourceShapeType': source_type, 'convertedTo2D': reduced, 'closedLineToPolygon': source_type in line_types}})
        if not entities:
            raise DomainError('Shapefile sem polígonos.')
        token = str(uuid4())
        result = {'token': token, 'name': PurePosixPath(base).name, 'features': count, 'polygons': len(entities),
                  'sourceCrs': source.to_string(), 'targetCrs': target.to_string(),
                  'reprojected': not source.equals(target, ignore_axis_order=True), 'multipartFeatures': multi,
                  'convertedTo2D': reduced, 'closedLineToPolygon': source_type in line_types,
                  'expectedRevision': state['project']['revision'], 'entities': entities}
        folder = store.folder(project_id) / 'assets/originals' / ('shapefile-' + token)
        folder.mkdir()
        (folder / 'original.zip').write_bytes(original)
        (folder / 'preview.json').write_text(encode(result), encoding='utf-8')
        return {k:v for k,v in result.items() if k != 'entities'}
    except DomainError:
        raise
    except Exception as error:
        raise DomainError('Não foi possível ler o Shapefile. Confira o PRJ, a codificação CPG e as geometrias no QGIS. ' + str(error)[:180])


def apply(store, project_id, token, command_id, revision):
    folder = store.folder(project_id) / 'assets/originals' / ('shapefile-' + uid(token))
    path = folder / 'preview.json'
    if not path.is_file():
        raise DomainError('Prévia não encontrada. Selecione os arquivos novamente.', 404)
    data = json.loads(path.read_text(encoding='utf-8'))
    if revision != data['expectedRevision']:
        raise DomainError('O projeto mudou depois da prévia. Reimporte para conferir os dados.', 409)
    return store.command(project_id, {'commandId': command_id, 'expectedRevision': revision,
                         'type': 'boundary.import', 'parameters': {'entities': data['entities']}})


def preview_local(store, project_id, selected_path):
    path = Path(selected_path)
    if not path.is_file() or path.suffix.lower() != '.shp':
        raise DomainError('Selecione um arquivo .shp existente.')
    siblings = {p.suffix.lower(): p for p in path.parent.iterdir()
                if p.is_file() and p.stem.casefold() == path.stem.casefold()}
    with ExitStack() as stack:
        uploads = [SimpleNamespace(filename=p.name, file=stack.enter_context(p.open('rb')))
                   for extension, p in siblings.items() if extension in ('.shp', '.shx', '.dbf', '.prj', '.cpg')]
        return preview(store, project_id, uploads)


def point_files(state):
    streams=[io.BytesIO() for _ in range(3)]
    with shapefile.Writer(shp=streams[0],shx=streams[1],dbf=streams[2],shapeType=shapefile.POINT,encoding='utf-8') as writer:
        writer.field('ID','C',size=64)
        writer.field('GLEBA_ID','C',size=36)
        writer.field('GLEBA','C',size=254)
        writer.field('ANEL','N',size=6)
        writer.field('PONTO','N',size=8)
        writer.field('ROTULO','C',size=254)
        writer.field('E','F',size=24,decimal=8)
        writer.field('N','F',size=24,decimal=8)
        for entity in state['entities']:
            name=entity['attributes']['name']
            for ring_index,ring in enumerate(entity['geometry']['coordinates']):
                for index,(x,y) in enumerate(ring[:-1],1):
                    label=f'P{index}'
                    text=lambda value:value.encode('utf-8')[:254].decode('utf-8',errors='ignore')
                    writer.point(x,y)
                    writer.record(f'{entity["id"]}:{ring_index}:{index}',entity['id'],text(name),ring_index+1,index,text(label),x,y)
    files={f'vertices{ext}':stream.getvalue() for ext,stream in zip(('.shp','.shx','.dbf'),streams)}
    files['vertices.prj']=CRS.from_user_input(state['project']['crs']['authid']).to_wkt(version='WKT1_ESRI').encode('utf-8')
    files['vertices.cpg']=b'UTF-8'
    style=Path(__file__).with_name('vertex-points.qml')
    if style.is_file():
        files['vertices.qml']=style.read_bytes()
    return files


def export(state, separate=False, include_vertices=False):
    if not state['entities']:
        raise DomainError('Desenhe ou importe uma gleba antes de exportar.')
    if separate:
        result = io.BytesIO()
        with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as archive:
            for index, entity in enumerate(state['entities'], 1):
                name = re.sub(r'[^\w -]', '_', entity['attributes']['name']).strip(' .')[:60] or 'Gleba'
                folder = f'{index:03d}_{name}_{entity["id"][:8]}'
                with zipfile.ZipFile(io.BytesIO(export({**state, 'entities': [entity]}))) as part:
                    for filename in part.namelist():
                        renamed = 'perimetro' + filename[len('glebas'):] if filename.startswith('glebas.') else filename
                        archive.writestr(folder + '/' + renamed, part.read(filename))
            if include_vertices:
                for name,raw in point_files(state).items():
                    archive.writestr('Pontos_identificados/'+name,raw)
        return result.getvalue()
    streams = [io.BytesIO() for _ in range(3)]
    with shapefile.Writer(shp=streams[0], shx=streams[1], dbf=streams[2], shapeType=shapefile.POLYGON, encoding='utf-8') as writer:
        writer.field('ID', 'C', size=36)
        writer.field('NOME', 'C', size=254)
        writer.field('AREA_M2', 'F', size=24, decimal=4)
        writer.field('PERIM_M', 'F', size=24, decimal=4)
        writer.field('TRAVADO', 'L')
        for entity in state['entities']:
            geom = orient(polygon(entity['geometry']), sign=-1)
            writer.poly([list(geom.exterior.coords), *[list(r.coords) for r in geom.interiors]])
            name = entity['attributes']['name'].encode('utf-8')[:254].decode('utf-8', errors='ignore')
            writer.record(entity['id'], name, entity['derived']['areaM2'], entity['derived']['perimeterM'], entity['locked'])
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as archive:
        for extension, stream in zip(('.shp', '.shx', '.dbf'), streams):
            archive.writestr('glebas' + extension, stream.getvalue())
        archive.writestr('glebas.prj', CRS.from_user_input(state['project']['crs']['authid']).to_wkt(version='WKT1_ESRI'))
        archive.writestr('glebas.cpg', 'UTF-8')
        archive.writestr('atributos_completos.json', encode({'project': state['project'], 'entities': [
            {'id': e['id'], 'attributes': e['attributes']} for e in state['entities']]}))
        if include_vertices:
            for name,raw in point_files(state).items():
                archive.writestr('Pontos_identificados/'+name,raw)
    return result.getvalue()
