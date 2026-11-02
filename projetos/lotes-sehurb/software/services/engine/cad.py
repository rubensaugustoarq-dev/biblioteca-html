"""DXF originals stay untouched; drawing primitives are only a viewing cache."""
import hashlib
import io
import json
import math
from pathlib import Path
from uuid import uuid4
import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext, recorder
from ezdxf.addons.drawing.config import Configuration, ImagePolicy
from ezdxf import xref
from .store import DomainError, uid


class LimitedRecorder(recorder.Recorder):
    def store(self, record, properties):
        if len(self.records) >= 100000:
            raise DomainError('DXF muito complexo. Exporte uma seleção menor no CAD.')
        super().store(record, properties)


def reference(store, project_id, resource_id):
    state = store.state(project_id)
    item = next((r for r in state['resources'] if r['id'] == uid(resource_id) and r['role'] == 'vectorSource'), None)
    if not item:
        raise DomainError('Referência CAD não encontrada.', 404)
    root = store.folder(project_id).resolve()
    path = (root / item['relativePath']).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise DomainError('DXF original ausente. Preserve a pasta completa do projeto.', 404)
    return item, path


def prepare(store, project_id, upload, confirmed):
    if not confirmed:
        raise DomainError('Confirme que o DXF usa metros e as coordenadas do projeto. Não há reprojeção automática.')
    if not (upload.filename or '').lower().endswith('.dxf'):
        raise DomainError('Escolha um arquivo DXF, não DWG.')
    raw = upload.file.read(50 * 1024 * 1024 + 1)
    if not raw or len(raw) > 50 * 1024 * 1024:
        raise DomainError('Limite por DXF: 50 MB.')
    resource_id = str(uuid4())
    folder = store.folder(project_id) / 'assets' / resource_id
    folder.mkdir(parents=True)
    original = folder / 'original.dxf'
    original.write_bytes(raw)
    try:
        doc = ezdxf.readfile(original)
    except (ezdxf.DXFError, ValueError, OSError, UnicodeError) as error:
        raise DomainError('Não foi possível ler o DXF. Salve novamente como DXF 2010 ou posterior no CAD.') from error
    units = doc.header.get('$INSUNITS', 0)
    if units not in (0, 6):
        raise DomainError('DXF declara unidades diferentes de metros. Converta para metros no CAD antes de importar.')
    layers = [{'name': layer.dxf.name, 'visible': not layer.is_off() and not layer.is_frozen(),
               'color': layer.color, 'linetype': layer.dxf.linetype,
               'lineweight': layer.dxf.lineweight} for layer in doc.layers]
    for layer in doc.layers:
        layer.on(); layer.thaw()
    output = LimitedRecorder()
    context = RenderContext(doc)
    warnings = []
    class Viewer(Frontend):
        def log_message(self, message):
            if len(warnings) < 30 and message not in warnings:
                warnings.append(str(message)[:300])
    config = Configuration(image_policy=ImagePolicy.IGNORE, max_flattening_distance=.01, hatching_timeout=3)
    Viewer(context, output, config=config).draw_layout(doc.modelspace(), finalize=True)
    features = []
    vertices = 0
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    def add(coords, kind, props):
        nonlocal vertices
        if not coords:
            return
        vertices += len(coords)
        if vertices > 1500000:
            raise DomainError('DXF muito detalhado. Exporte uma seleção menor no CAD.')
        points = [[float(p[0]), float(p[1])] for p in coords]
        if not all(math.isfinite(v) for p in points for v in p):
            raise DomainError('DXF contém coordenadas inválidas.')
        for x, y in points:
            bounds[0] = min(bounds[0], x); bounds[1] = min(bounds[1], y)
            bounds[2] = max(bounds[2], x); bounds[3] = max(bounds[3], y)
        coordinates = points[0] if kind == 'Point' else points
        if kind == 'Polygon':
            if points[-1] != points[0]: points.append(points[0])
            coordinates = [points]
        features.append({'type': 'Feature', 'id': f'{resource_id}:{len(features)}',
            'geometry': {'type': kind, 'coordinates': coordinates},
            'properties': {'layer': props.layer, 'color': props.color, 'lineweight': props.lineweight,
                           'handle': props.handle}})
    for record, props in output.player().recordings():
        if isinstance(record, recorder.SolidLinesRecord):
            pts = record.points.to_tuples()
            for i in range(0, len(pts), 2): add(pts[i:i+2], 'LineString', props)
        elif isinstance(record, recorder.PointsRecord):
            pts = record.points.to_tuples()
            add(pts, 'Point' if len(pts) == 1 else 'LineString' if len(pts) == 2 else 'Polygon', props)
        elif isinstance(record, recorder.PathRecord):
            for path in record.path.sub_paths(): add(list(path.flattening(.01)), 'LineString', props)
        elif isinstance(record, recorder.FilledPathsRecord):
            # Closed rings use even/odd grouping so text and hatch holes stay open.
            from shapely.geometry import Polygon, mapping
            geometry = None
            for path in record.paths:
                for sub in path.sub_paths():
                    pts = list(sub.flattening(.01))
                    if len(pts) < 3: continue
                    poly = Polygon(pts)
                    if not poly.is_valid:
                        if 'Alguns preenchimentos complexos não puderam ser exibidos.' not in warnings:
                            warnings.append('Alguns preenchimentos complexos não puderam ser exibidos.')
                        continue
                    geometry = poly if geometry is None else geometry.symmetric_difference(poly)
            if geometry is not None:
                polygons = [geometry] if geometry.geom_type == 'Polygon' else list(getattr(geometry, 'geoms', []))
                for polygon in polygons:
                    if polygon.geom_type != 'Polygon': continue
                    add(list(polygon.exterior.coords), 'Polygon', props)
                    features[-1]['geometry'] = mapping(polygon)
    if not features:
        raise DomainError('Nenhum desenho compatível encontrado no Model deste DXF.')
    if any(e.dxftype() in ('IMAGE', 'PDFUNDERLAY', 'DWFUNDERLAY', 'DGNUNDERLAY', '3DSOLID', 'ACAD_PROXY_ENTITY') for e in doc.modelspace()):
        warnings.append('Imagens externas, underlays e sólidos/proxies não têm visualização garantida. O original é preservado.')
    if any(block.block.is_xref for block in doc.blocks):
        warnings.append('Xrefs externos não são carregados. Vincule as referências no CAD antes de importar.')
    (folder / 'view.json').write_text(json.dumps({'type': 'FeatureCollection', 'features': features}), encoding='utf-8')
    return {'id': resource_id, 'role': 'vectorSource', 'relativePath': f'assets/{resource_id}/original.dxf',
        'sha256': hashlib.sha256(raw).hexdigest(), 'metadata': {'name': Path(upload.filename).name,
        'bounds': bounds, 'layers': layers, 'warnings': warnings, 'count': len(doc.modelspace()),
        'units': units, 'crs': store.state(project_id)['project']['crs']['authid']}}


def export(store, project_id, show_text=True, show_points=False, show_dimensions=False, include_infra=False, legend=None, dimension_groups=None):
    state = store.state(project_id)
    refs = [r for r in state['resources'] if r['role'] == 'vectorSource']
    if refs:
        _, path = reference(store, project_id, refs[0]['id'])
        doc = ezdxf.readfile(path)
        # Start from the complete first source to retain its native objects/styles/layouts.
        for layer in refs[0]['metadata']['layers']:
            table = doc.layers.get(layer['name'])
            if layer['visible']: table.on(); table.thaw()
            else: table.off()
        for ref in refs[1:]:
            _, path = reference(store, project_id, ref['id'])
            source = ezdxf.readfile(path)
            for layer in ref['metadata']['layers']:
                table = source.layers.get(layer['name'])
                if layer['visible']: table.on(); table.thaw()
                else: table.off()
            xref.load_modelspace(source, doc, conflict_policy=xref.ConflictPolicy.XREF_PREFIX)
    else:
        doc = ezdxf.new('R2010')
    if doc.dxfversion < 'AC1024': doc.dxfversion = 'AC1024'
    doc.header['$INSUNITS'] = 6
    msp = doc.modelspace()
    prefix = 'SEHURB'
    while any(prefix + '_' + name in doc.layers for name in ('GLEBAS', 'TEXTOS', 'PONTOS', 'COTAS')):
        prefix += '_ESTUDO'
    for name, color in [('GLEBAS', 4), ('TEXTOS', 7), ('PONTOS', 2), ('COTAS', 7)]:
        doc.layers.new(prefix + '_' + name, dxfattribs={'color': color})
    from .cad_dimensions import NativeDimensions
    native=NativeDimensions(doc,prefix)
    groups=set(dimension_groups) if dimension_groups is not None else ({'glebas','roads','surfaces','lots','independent'} if show_dimensions else set())
    for e in state['entities']:
        from shapely.geometry import shape
        label_point = shape(e['geometry']).representative_point()
        msp.add_mtext(e['attributes']['name']+'\\P'+f"{e['derived']['areaM2']:.2f} m²",
            dxfattribs={'layer': prefix+'_GLEBAS', 'char_height': 1.2, 'insert': (label_point.x,label_point.y), 'attachment_point': 5})
        for ring in e['geometry']['coordinates']:
            msp.add_lwpolyline(ring[:-1], close=True, dxfattribs={'layer': prefix+'_GLEBAS'})
        ring = e['geometry']['coordinates'][0]
        for index, (a, b) in enumerate(zip(ring, ring[1:]), 1):
            if show_points:
                msp.add_point(a, dxfattribs={'layer': prefix+'_PONTOS'})
                msp.add_text(f'P{index}', dxfattribs={'layer': prefix+'_PONTOS', 'height': .8, 'insert': (a[0]+.5, a[1]+.5)})
        if 'glebas' in groups:native.polygon(e['geometry'])
    if show_text:
        for a in state['annotations']:
            color = int(a.get('color', '#fff8dd').lstrip('#'), 16)
            font = {'Arial': 'arial.ttf', 'Times New Roman': 'times.ttf', 'Courier New': 'cour.ttf'}.get(a.get('font'), 'arial.ttf')
            if a.get('bold', True): font = font.replace('.ttf', 'bd.ttf')
            name = prefix+'_'+font.split('.')[0]
            if name not in doc.styles: doc.styles.new(name, dxfattribs={'font': font})
            msp.add_text(a['text'], dxfattribs={'layer': prefix+'_TEXTOS', 'height': a['size'], 'rotation': a['angle'],
                'insert': (a['x'], a['y']), 'true_color': color, 'style': name})
    if include_infra:
        from .infra.cad_export import append
        append(doc,state,show_dimensions,show_points,legend,native,groups)
    if 'independent' in groups:native.independent(state.get('dimensions',[]))
    if not include_infra:
        from .study_cad_report import append as study_report
        study_report(doc,state,prefix,legend)
    from .accessibility.cad_export import append as accessibility_export
    accessibility_export(doc,state)
    stream = io.StringIO(); doc.write(stream)
    return stream.getvalue().encode('utf-8' if doc.dxfversion >= 'AC1021' else doc.encoding, errors='dxfreplace')
