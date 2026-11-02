"""Documentos locais, comandos atômicos e histórico persistente da bancada 0.3."""
from contextlib import closing
from collections import OrderedDict
from copy import deepcopy
from pathlib import Path
from uuid import UUID, uuid4
import hashlib
import json
import math
import sqlite3
import warnings
import shutil
import re
import threading
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping
from shapely import from_wkb, to_wkb
from shapely.validation import explain_validity

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = Path(__file__).with_name('migrations') / '001_project.sql'


class DomainError(Exception):
    def __init__(self, message, status=422):
        self.message, self.status = message, status


def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def uid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError):
        raise DomainError('Identificador inválido.')


def crs_info(authid):
    try:
        crs = CRS.from_user_input(authid)
        if not crs.is_projected or any(abs(a.unit_conversion_factor - 1) > 1e-9 for a in crs.axis_info[:2]):
            raise ValueError()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            proj4 = crs.to_proj4()
        return {'authid': crs.to_string(), 'wkt': crs.to_wkt(), 'proj4': proj4,
                'name': crs.name, 'units': 'm', 'axisOrder': 'xy', 'measurementPolicy': 'planimetric'}
    except Exception:
        raise DomainError('Escolha um sistema projetado em metros, como SIRGAS 2000 / UTM.')


def polygon(geometry):
    try:
        if geometry.get('type') != 'Polygon':
            raise DomainError('Esta ferramenta aceita um perímetro Polygon.')
        rings = geometry.get('coordinates', [])
        if not rings or any(len(ring) < 4 or ring[0] != ring[-1] for ring in rings):
            raise DomainError('O perímetro deve ter anéis fechados e pelo menos três vértices distintos.')
        geom = shape(geometry)
        points = list(geom.exterior.coords)
        if any(len(p) != 2 or not all(math.isfinite(v) for v in p) for ring in [geom.exterior, *geom.interiors] for p in ring.coords):
            raise DomainError('Coordenadas devem ser finitas, em X/Y.')
        if len(points) > 10000:
            raise DomainError('Limite desta versão: 10.000 vértices por perímetro.')
        if not geom.is_valid or geom.is_empty or geom.area <= 0:
            raise DomainError('Perímetro inválido: ' + explain_validity(geom))
        return geom
    except DomainError:
        raise
    except Exception:
        raise DomainError('Geometria de perímetro inválida.')


def metrics(geometry):
    g = polygon(geometry)
    ring = list(g.exterior.coords)
    edges = [math.dist(a, b) for a, b in zip(ring, ring[1:])]
    return {'areaM2': g.area, 'perimeterM': g.length, 'edgesM': edges, 'vertices': len(ring) - 1}


class Store:
    def __init__(self, root=None):
        self.root = Path(root or ROOT / 'projects').resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.location_lock = threading.RLock()
        self._accessibility_contexts = OrderedDict()

    def locations(self):
        registry = self.root / 'external-projects.json'
        return json.loads(registry.read_text(encoding='utf-8')) if registry.is_file() else {}

    def folder(self, project_id):
        project_id = uid(project_id)
        path = Path(self.locations().get(project_id, str(self.root / project_id)))
        if not (path / 'project.sqlite').is_file():
            raise DomainError('Projeto não encontrado.', 404)
        return path

    def connect(self, project_id):
        db = sqlite3.connect(self.folder(project_id) / 'project.sqlite', timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        if not db.execute('SELECT version FROM schema_migrations WHERE version=2').fetchone():
            db.executescript(SCHEMA.with_name('002_document_state.sql').read_text(encoding='utf-8'))
        if not db.execute('SELECT version FROM schema_migrations WHERE version=3').fetchone():
            db.executescript(SCHEMA.with_name('003_presentation.sql').read_text(encoding='utf-8'))
        return db

    def create(self, name, authid, longitude, latitude):
        name = str(name).strip()
        if not name or len(name) > 100:
            raise DomainError('Informe um nome de até 100 caracteres.')
        crs = crs_info(authid)
        if not (-180 <= longitude <= 180 and -80 <= latitude <= 84):
            raise DomainError('Localização fora da faixa válida.')
        area = CRS.from_wkt(crs['wkt']).area_of_use
        if area and not (area.west <= longitude <= area.east and area.south <= latitude <= area.north):
            raise DomainError('A localização está fora da área de uso do CRS escolhido.')
        center = Transformer.from_crs(4326, crs['wkt'], always_xy=True).transform(longitude, latitude)
        project_id = str(uuid4())
        folder = self.root / project_id
        folder.mkdir()
        for sub in ('assets/originals', 'assets/derived', 'checkpoints'):
            (folder / sub).mkdir(parents=True)
        with closing(sqlite3.connect(folder / 'project.sqlite')) as db:
            db.executescript(SCHEMA.read_text(encoding='utf-8'))
            db.executescript(SCHEMA.with_name('002_document_state.sql').read_text(encoding='utf-8'))
            db.execute('INSERT INTO projects(id,name,crs_authid,crs_wkt,tolerances_json) VALUES (?,?,?,?,?)',
                       (project_id, name, crs['authid'], crs['wkt'], encode({'geometryM': .001, 'areaConservationM2': .01, 'snapPixels': 12})))
            db.execute('INSERT INTO revisions(project_id,revision) VALUES (?,0)', (project_id,))
            db.execute('INSERT INTO document_state VALUES (?,?,?,?)', (project_id, '[]', '[]', encode({'center': center, 'resolution': 2})))
            db.commit()
            db.executescript(SCHEMA.with_name('003_presentation.sql').read_text(encoding='utf-8'))
        return self.state(project_id)

    def recent(self):
        result = []
        external = self.locations()
        paths = [p for p in self.root.glob('*/project.sqlite') if p.parent.name not in external]
        paths.extend(Path(folder)/'project.sqlite' for folder in external.values())
        for path in dict.fromkeys(paths):
            try:
                with closing(sqlite3.connect(path)) as db:
                    row = db.execute('SELECT id,name,revision,crs_authid FROM projects').fetchone()
                if row[0] in external and path.parent.resolve() != Path(external[row[0]]).resolve():
                    continue
                result.append({'id': row[0], 'name': row[1], 'revision': row[2], 'crs': row[3], 'modified': path.stat().st_mtime})
            except sqlite3.Error:
                continue
        return sorted(result, key=lambda x: x['modified'], reverse=True)

    def snapshot(self, db, project_id):
        entities = []
        for row in db.execute("SELECT * FROM entities WHERE project_id=? AND state!='deleted'", (project_id,)):
            geom = mapping(from_wkb(row['geometry_wkb'])) if row['geometry_wkb'] else None
            entities.append({'id': row['id'], 'kind': row['kind'], 'locked': bool(row['locked']), 'geometry': geom,
                             'attributes': json.loads(row['attributes_json'])})
        resources = [{'id': r['id'], 'role': r['role'], 'relativePath': r['relative_path'], 'sha256': r['sha256'],
                      'metadata': json.loads(r['metadata_json'])} for r in db.execute("SELECT * FROM resources WHERE project_id=? AND state='ready'", (project_id,))]
        extra = json.loads(db.execute('SELECT presentation_json FROM document_state WHERE project_id=?', (project_id,)).fetchone()[0])
        return {'entities': entities, 'resources': resources, 'annotations': extra.get('annotations', []), 'dimensions':extra.get('dimensions',[]), 'sheets': extra.get('sheets', []), 'enl': extra.get('enl', []), 'infra': extra.get('infra', []), 'subdivisionAreas':extra.get('subdivisionAreas',[]),'accessibility':extra.get('accessibility',[]),'accessibilityElements':extra.get('accessibilityElements',[]),'landscape':extra.get('landscape',[])}

    def state_db(self, db, project_id):
        project = dict(db.execute('SELECT * FROM projects WHERE id=?', (project_id,)).fetchone())
        control = db.execute('SELECT * FROM document_state WHERE project_id=?', (project_id,)).fetchone()
        state = self.snapshot(db, project_id)
        from .landscape.domain import derive as derive_landscape, totals as landscape_totals
        state['landscape']=derive_landscape(state.get('landscape',[]))
        for item in state['landscape']:item.update(projectId=project_id,revision=project['revision'])
        state['landscapeMetrics']=landscape_totals(state['landscape'])
        from .enl.domain import validate as validate_enl
        state['enl'] = [validate_enl(lot) for lot in state.get('enl',[])]
        from .infra.domain import calculate
        state['infra'],state['infraMetrics']=calculate(state.get('infra',[]))
        from .accessibility.domain import derive as derive_accessibility
        state['accessibility']=derive_accessibility(state.get('accessibility',[]),state['infra'],state['infraMetrics'])
        from .accessibility.elements import derive as derive_elements,totals as accessibility_totals
        state['accessibilityElements']=derive_elements(state.get('accessibilityElements',[]),state['infra'],state['infraMetrics'],state['accessibility'])
        state['accessibilityMetrics']=accessibility_totals(state['accessibilityElements'])
        from .infra.subdivision.areas import derive as derive_areas
        state['subdivisionAreas']=derive_areas(state.get('subdivisionAreas',[]),state['entities'],state['infra'])
        for area in state['subdivisionAreas']:area.update(projectId=project_id,revision=project['revision'])
        for item in state['infra']:item.update(projectId=project_id,revision=project['revision'])
        for entity in state['entities']:
            entity.update(projectId=project_id, revision=project['revision'], derived=metrics(entity['geometry']))
        return {'project': {'id': project_id, 'name': project['name'], 'revision': project['revision'],
                            'crs': crs_info(project['crs_wkt']), 'view': json.loads(control['view_json'])},
                **state, 'canUndo': bool(json.loads(control['undo_json'])), 'canRedo': bool(json.loads(control['redo_json']))}

    def state(self, project_id):
        with closing(self.connect(project_id)) as db:
            state = self.state_db(db, project_id)
        with self.location_lock:
            self._remember_accessibility_context(project_id, state)
        return state

    def _remember_accessibility_context(self, project_id, state):
        # Cache only the read-only hosts needed for hovering, not lots, resources,
        # history or presentation. Every preview still checks SQLite's revision.
        key=self._accessibility_context_key(project_id,state['project']['revision'])
        self._accessibility_contexts[key]=deepcopy({'project':{'id':project_id,'revision':state['project']['revision']},
            **{k:state[k] for k in ('infra','infraMetrics','accessibility')},'accessibilityElements':state.get('accessibilityElements',[])})
        self._accessibility_contexts.move_to_end(key)
        while len(self._accessibility_contexts)>4:self._accessibility_contexts.popitem(last=False)

    def _accessibility_context_key(self, project_id, revision):
        folder=self.folder(project_id)
        return str(folder), (folder/'project.sqlite').stat().st_ino, revision

    def accessibility_context(self, project_id, expected_revision):
        with self.location_lock:
            with closing(self.connect(project_id)) as db:
                revision=db.execute('SELECT revision FROM projects WHERE id=?',(project_id,)).fetchone()[0]
                if expected_revision!=revision:raise DomainError('O projeto mudou. Atualize a prévia.',409)
                key=self._accessibility_context_key(project_id,revision)
                if key in self._accessibility_contexts:
                    self._accessibility_contexts.move_to_end(key)
                    return self._accessibility_contexts[key]
                extra=json.loads(db.execute('SELECT presentation_json FROM document_state WHERE project_id=?',(project_id,)).fetchone()[0])
                from .infra.domain import calculate
                from .accessibility.domain import derive
                infra,metrics=calculate(extra.get('infra',[]))
                for item in infra:item.update(projectId=project_id,revision=revision)
                state={'project':{'id':project_id,'revision':revision},'infra':infra,'infraMetrics':metrics,
                       'accessibility':derive(extra.get('accessibility',[]),infra,metrics)}
                from .accessibility.elements import derive as derive_elements
                state['accessibilityElements']=derive_elements(extra.get('accessibilityElements',[]),infra,metrics,state['accessibility'])
                self._remember_accessibility_context(project_id,state)
                return self._accessibility_contexts[key]

    def command(self, project_id, command):
        with self.location_lock:
            state=self._command(project_id, command)
            self._remember_accessibility_context(project_id,state)
            return state

    def _command(self, project_id, command):
        command_id = uid(command['commandId'])
        fingerprint = hashlib.sha256(encode(command).encode()).hexdigest()
        with closing(self.connect(project_id)) as db:
            with db:
                db.execute('BEGIN IMMEDIATE')
                existing = db.execute('SELECT * FROM commands WHERE project_id=? AND id=?', (project_id, command_id)).fetchone()
                if existing:
                    if existing['payload_hash'] != fingerprint:
                        raise DomainError('ID do comando já utilizado com outros dados.', 409)
                    return json.loads(existing['result_json'])
                revision = db.execute('SELECT revision FROM projects WHERE id=?', (project_id,)).fetchone()[0]
                if command['expectedRevision'] != revision:
                    raise DomainError('Projeto mudou em outra operação. Recarregue antes de aplicar.', 409)
                before = self.snapshot(db, project_id)
                after = json.loads(encode(before))
                control = db.execute('SELECT * FROM document_state WHERE project_id=?', (project_id,)).fetchone()
                undo, redo = json.loads(control['undo_json']), json.loads(control['redo_json'])
                kind, args = command['type'], command.get('parameters', {})
                if kind in ('undo', 'redo'):
                    source, target = (undo, redo) if kind == 'undo' else (redo, undo)
                    if not source:
                        raise DomainError('Não há operação para ' + ('desfazer.' if kind == 'undo' else 'refazer.'))
                    after = source.pop()
                    target.append(before)
                else:
                    self.mutate(after, kind, args, revision)
                    undo.append(before)
                    undo = undo[-100:]
                    redo = []
                new_revision = revision + 1
                db.execute('INSERT INTO revisions(project_id,revision,command_id) VALUES (?,?,?)', (project_id, new_revision, command_id))
                db.execute("UPDATE entities SET state='deleted',revision=? WHERE project_id=?", (new_revision, project_id))
                for e in after['entities']:
                    g = polygon(e['geometry'])
                    db.execute('''INSERT INTO entities(project_id,id,kind,revision,locked,geometry_wkb,attributes_json,derived_json)
                                  VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET state='current', revision=excluded.revision,
                                  locked=excluded.locked, geometry_wkb=excluded.geometry_wkb, attributes_json=excluded.attributes_json,derived_json=excluded.derived_json''',
                               (project_id, e['id'], e['kind'], new_revision, int(e['locked']), to_wkb(g), encode(e['attributes']), encode(metrics(e['geometry']))))
                    db.execute('INSERT INTO entity_versions VALUES (?,?,?,?,?)', (project_id, e['id'], new_revision, encode(e), to_wkb(g)))
                db.execute("UPDATE resources SET state='deleted' WHERE project_id=?", (project_id,))
                for r in after['resources']:
                    db.execute('''INSERT INTO resources VALUES (?,?,?,?,?,?,'ready') ON CONFLICT(project_id,id)
                                  DO UPDATE SET state='ready',metadata_json=excluded.metadata_json''',
                               (project_id, r['id'], r['role'], r['relativePath'], r['sha256'], encode(r['metadata'])))
                db.execute('UPDATE projects SET revision=? WHERE id=?', (new_revision, project_id))
                db.execute('UPDATE document_state SET undo_json=?,redo_json=? WHERE project_id=?', (encode(undo), encode(redo), project_id))
                db.execute('UPDATE document_state SET presentation_json=? WHERE project_id=?', (encode({k:after.get(k,[]) for k in ('annotations','dimensions','sheets','enl','infra','subdivisionAreas','accessibility','accessibilityElements','landscape')}),project_id))
                result = self.state_db(db, project_id)
                db.execute('INSERT INTO commands VALUES (?,?,?,?,?,?,?,?)',
                           (project_id, command_id, kind, revision, new_revision, fingerprint, encode(args), encode(result)))
            return result

    def mutate(self, state, kind, args, revision=None):
        if kind in ('landscape.upsert','landscape.delete'):
            from .landscape.domain import candidate
            identity=uid(args['id']);values=state.setdefault('landscape',[])
            existing=next((v for v in values if v['id']==identity),None)
            if kind.endswith('.delete'):
                if not existing:raise DomainError('Elemento de paisagismo não encontrado.',404)
                state['landscape']=[v for v in values if v['id']!=identity]
            else:
                if len(values)>=5000 and not existing:raise DomainError('Limite de 5000 elementos de paisagismo.')
                value=candidate(args)
                state['landscape']=[value if v['id']==identity else v for v in values] if existing else [*values,value]
        elif kind in ('accessibility.element.upsert','accessibility.element.delete'):
            from .accessibility.elements import candidate
            from .accessibility.domain import derive as derive_ramps
            from .infra.domain import calculate
            identity=uid(args['id']);values=state.setdefault('accessibilityElements',[])
            existing=next((v for v in values if v['id']==identity),None)
            if kind.endswith('.delete'):
                if not existing:raise DomainError('Elemento não encontrado.',404)
                state['accessibilityElements']=[v for v in values if v['id']!=identity]
            else:
                if len(values)>=2000 and not existing:raise DomainError('Limite de 2000 elementos de acessibilidade.')
                infra,metrics=calculate(state.get('infra',[]));ramps=derive_ramps(state.get('accessibility',[]),infra,metrics)
                value=candidate(args,infra,metrics,ramps)
                if value['kind']=='parking':
                    from .accessibility.elements import derive as derive_elements
                    from .accessibility.parking import check_overlap
                    check_overlap(value,[*ramps,*derive_elements([v for v in values if v['id']!=identity],infra,metrics,ramps)])
                if value['kind']=='vehicleAccess':
                    from .accessibility.elements import derive as derive_elements
                    others=derive_elements([v for v in values if v['id']!=identity and v['kind']=='vehicleAccess'],infra,metrics,ramps)
                    for other in [*ramps,*others]:
                        if other.get('derived',{}).get('geometry') and shape(value['derived']['geometry']).intersection(shape(other['derived']['geometry'])).area>1e-5:raise DomainError('Acesso de veículos sobrepõe outra rampa/acesso.')
                state['accessibilityElements']=[value if v['id']==identity else v for v in values] if existing else [*values,value]
        elif kind in ('accessibility.upsert','accessibility.delete'):
            from .accessibility.domain import candidate
            from .infra.domain import calculate
            identity=uid(args['id']);values=state.setdefault('accessibility',[])
            existing=next((v for v in values if v['id']==identity),None)
            if kind=='accessibility.delete':
                if not existing:raise DomainError('Rampa não encontrada.',404)
                state['accessibility']=[v for v in values if v['id']!=identity]
            else:
                if len(values)>=1000 and not existing:raise DomainError('Limite de 1000 rampas.')
                infra,metrics=calculate(state.get('infra',[]));value=candidate(args,infra,metrics)
                for other in values:
                    if other['id']==identity:continue
                    try:og=candidate(other,infra,metrics)['derived']['geometry']
                    except DomainError:continue
                    if shape(value['derived']['geometry']).intersection(shape(og)).area>1e-5:raise DomainError('Esta rampa sobrepõe outra rampa. Reposicione-a.')
                from .accessibility.elements import derive as derive_elements
                for other in derive_elements(state.get('accessibilityElements',[]),infra,metrics,[]):
                    if other['kind']=='vehicleAccess' and other.get('derived',{}).get('geometry') and shape(value['derived']['geometry']).intersection(shape(other['derived']['geometry'])).area>1e-5:raise DomainError('Esta rampa sobrepõe um acesso de veículos.')
                state['accessibility']=[value if v['id']==identity else v for v in values] if existing else [*values,value]
        elif kind=='subdivision.layout.apply':
            if args.get('previewRevision')!=revision:raise DomainError('A prévia do loteamento está desatualizada. Confira novamente.',409)
            from .infra.subdivision.areas import candidate,derive
            from .infra.subdivision.layout import for_area
            from .infra.domain import calculate
            identity=uid(args['id']);values=state.setdefault('subdivisionAreas',[])
            existing=next((a for a in values if a['id']==identity),None)
            source_id=uid(args['sourceEntityId'])
            entity=next((e for e in state['entities'] if e['id']==source_id),None)
            if entity is None:raise DomainError('A gleba de origem não está mais disponível.')
            if existing and not polygon(existing['sourceBoundarySnapshot']).equals(polygon(entity['geometry'])):raise DomainError('A gleba mudou. Selecione um novo estudo com o perímetro atual antes de aplicar.')
            area=candidate(state,{'id':identity,'sourceEntityId':source_id,'name':existing['name'] if existing else entity['attributes']['name'],'mode':existing['mode'] if existing else 'wholeGleba','geometry':existing['geometry'] if existing else entity['geometry']},revision)
            infra,_=calculate(state.get('infra',[]))
            area['layout']=for_area(area,args['layout'],infra)
            if area['layout']['derived']['conflictAreaM2']>1e-6:raise DomainError('Há lotes ou usos sobre o sistema viário. Ajuste os contornos ou gere nova prévia.')
            state['subdivisionAreas']=derive([area if a['id']==identity else a for a in values] if existing else [*values,area],state['entities'],infra)
        elif kind in ('subdivision.area.upsert','subdivision.area.delete'):
            from .infra.subdivision.areas import candidate,derive
            identity=uid(args['id']);values=state.setdefault('subdivisionAreas',[])
            existing=next((a for a in values if a['id']==identity),None)
            if kind=='subdivision.area.delete':
                if existing is None:raise DomainError('Área de loteamento não encontrada.',404)
                state['subdivisionAreas']=[a for a in values if a['id']!=identity]
            else:
                value=candidate(state,args,revision)
                from .infra.domain import calculate
                infra,_=calculate(state.get('infra',[]))
                state['subdivisionAreas']=derive([value if a['id']==identity else a for a in values] if existing else [*values,value],state['entities'],infra)
        elif kind in ('infra.upsert','infra.delete'):

            from .infra.domain import calculate
            identity=uid(args['id']);values=state.setdefault('infra',[])
            existing=next((v for v in values if v['id']==identity),None)
            if kind=='infra.delete':
                if existing is None:raise DomainError('Objeto de infraestrutura não encontrado.',404)
                state['infra']=[v for v in values if v['id']!=identity]
            else:
                source=uid(args['sourceEntityId'])
                if existing and existing['sourceEntityId']==source:boundary=existing['sourceGeometry']
                else:
                    entity=next((e for e in state['entities'] if e['id']==source),None)
                    if entity is None:raise DomainError('Selecione uma gleba de origem.')
                    boundary=entity['geometry']
                candidate={**args,'sourceGeometry':boundary}
                state['infra'],_=calculate([candidate if v['id']==identity else v for v in values] if existing else [*values,candidate])
        elif kind=='enl.subdivision.import':
            from .enl.subdivision import import_lots
            state['enl']=import_lots(state,args,revision or 0)
        elif kind in ('enl.upsert','enl.delete'):
            from .enl.domain import validate
            identity=uid(args['id']);values=state.setdefault('enl',[])
            if kind=='enl.delete':
                if not any(v['id']==identity for v in values): raise DomainError('Lote ENL não encontrado.',404)
                state['enl']=[v for v in values if v['id']!=identity]
            else:
                if len(values)>=200 and not any(v['id']==identity for v in values): raise DomainError('Limite: 200 lotes ENL.')
                if not any(e['id']==uid(args['sourceEntityId']) for e in state['entities']) and not any(v['id']==identity for v in values): raise DomainError('Gleba de origem não encontrada.')
                lot=validate(args);state['enl']=[v for v in values if v['id']!=identity]+[lot]
        elif kind in ('dimension.upsert','dimension.delete'):
            from .presentation import dimension
            identity=uid(args['id']);values=state.setdefault('dimensions',[])
            if kind=='dimension.delete':
                if not any(v['id']==identity for v in values):raise DomainError('Cota não encontrada.',404)
                state['dimensions']=[v for v in values if v['id']!=identity]
            else:
                value=dimension(args)
                state['dimensions']=[v for v in values if v['id']!=identity]+[value]
        elif kind in ('annotation.upsert','annotation.delete','sheet.upsert','sheet.delete'):
            from .presentation import annotation, sheet
            key = 'annotations' if kind.startswith('annotation.') else 'sheets'
            object_id = uid(args['id'])
            values = state.setdefault(key, [])
            if kind.endswith('.delete'):
                if not any(v['id']==object_id for v in values): raise DomainError('Objeto não encontrado.',404)
                state[key] = [v for v in values if v['id']!=object_id]
            else:
                validated = annotation(args) if key=='annotations' else sheet(args)
                state[key] = [v for v in values if v['id']!=object_id] + [validated]
        elif kind == 'boundary.import':
            incoming = args['entities']
            if not incoming or len(incoming) > 1000:
                raise DomainError('Quantidade de polígonos fora do limite.')
            ids = {e['id'] for e in state['entities']}
            for entity in incoming:
                entity_id = uid(entity['id'])
                if entity_id in ids:
                    raise DomainError('Esta importação já foi aplicada.', 409)
                polygon(entity['geometry'])
                ids.add(entity_id)
            state['entities'].extend(incoming)
        elif kind == 'boundary.upsert':
            entity_id = uid(args['id'])
            geom = polygon(args['geometry'])
            current = next((e for e in state['entities'] if e['id'] == entity_id), None)
            if current and current['locked']:
                raise DomainError('Destrave o perímetro antes de editar.')
            title = str(args.get('name', 'Perímetro')).strip()[:100] or 'Perímetro'
            entity = {'id': entity_id, 'kind': 'boundary', 'locked': False,
                      'geometry': mapping(geom), 'attributes': {**(current['attributes'] if current else {}), 'name': title}}
            state['entities'] = [e for e in state['entities'] if e['id'] != entity_id] + [entity]
        elif kind in ('entity.delete', 'entity.lock'):
            entity = next((e for e in state['entities'] if e['id'] == uid(args['id'])), None)
            if not entity:
                raise DomainError('Objeto não encontrado.', 404)
            if kind == 'entity.lock':
                entity['locked'] = bool(args['locked'])
            else:
                if entity['locked']:
                    raise DomainError('Destrave antes de excluir.')
                state['entities'].remove(entity)
        elif kind == 'cad.layer':
            resource = next((r for r in state['resources'] if r['id'] == uid(args['id']) and r['role'] == 'vectorSource'), None)
            if not resource:
                raise DomainError('Referência CAD não encontrada.', 404)
            layer = next((v for v in resource['metadata']['layers'] if v['name'] == args['name']), None)
            if not layer or not isinstance(args['visible'], bool):
                raise DomainError('Camada CAD inválida.')
            layer['visible'] = args['visible']
        elif kind == 'resource.add':
            state['resources'].append(args['resource'])
        elif kind == 'resource.delete':
            resource = next((r for r in state['resources'] if r['id'] == uid(args['id'])), None)
            if not resource:
                raise DomainError('Ortofoto não encontrada.', 404)
            state['resources'].remove(resource)
        elif kind == 'resource.opacity':
            value = float(args['opacity'])
            if not math.isfinite(value) or not 0 <= value <= 1:
                raise DomainError('Opacidade fora de 0–100%.')
            resource = next((r for r in state['resources'] if r['id'] == uid(args['id'])), None)
            if not resource:
                raise DomainError('Base não encontrada.', 404)
            resource['metadata']['opacity'] = value
        else:
            raise DomainError('Ferramenta ainda não disponível nesta versão.')

    def save_view(self, project_id, view):
        center, resolution = view['center'], float(view['resolution'])
        if len(center) != 2 or not all(math.isfinite(float(v)) for v in center) or not math.isfinite(resolution) or resolution <= 0:
            raise DomainError('Vista inválida.')
        with closing(self.connect(project_id)) as db, db:
            db.execute('UPDATE document_state SET view_json=? WHERE project_id=?', (encode(view), project_id))

    def checkpoint(self, project_id):
        folder = self.folder(project_id)
        with closing(self.connect(project_id)) as db:
            rev = db.execute('SELECT revision FROM projects WHERE id=?', (project_id,)).fetchone()[0]
            target = folder / 'checkpoints' / f'rev-{rev}-{uuid4().hex[:8]}.sqlite'
            with closing(sqlite3.connect(target)) as backup:
                db.backup(backup)
        return {'revision': rev, 'file': target.name, 'message': 'Checkpoint salvo. Bases permanecem na pasta do projeto.'}

    def save_as(self, project_id, parent, expected_revision):
        with self.location_lock:
            state = self.state(project_id)
            if state['project']['revision'] != expected_revision:
                raise DomainError('O projeto mudou. Atualize antes de salvar como.', 409)
            source = self.folder(project_id).resolve()
            parent = Path(parent).resolve()
            if not parent.is_dir():
                raise DomainError('A pasta escolhida não existe.')
            if parent == source or parent.is_relative_to(source):
                raise DomainError('Escolha uma pasta fora da pasta atual do projeto.')
            name = re.sub(r'[^\w -]', '_', state['project']['name']).strip(' .')[:60] or 'Projeto'
            target = parent / f'{name}_{uuid4().hex[:8]}'
            size = sum(p.stat().st_size for p in source.rglob('*') if p.is_file())
            if shutil.disk_usage(parent).free < size + 64*1024*1024:
                raise DomainError('Espaço insuficiente para copiar o projeto e suas imagens.')
            target.mkdir()
            try:
                for sub in ('assets', 'checkpoints'):
                    if (source/sub).is_dir():
                        shutil.copytree(source/sub, target/sub)
                with closing(self.connect(project_id)) as db, closing(sqlite3.connect(target/'project.sqlite')) as backup:
                    db.backup(backup)
                    if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                        raise DomainError('A cópia do projeto não passou na verificação.')
                registry = self.locations()
                registry[uid(project_id)] = str(target)
                temporary = self.root / ('external-projects-' + uuid4().hex + '.tmp')
                temporary.write_text(encode(registry), encoding='utf-8')
                temporary.replace(self.root/'external-projects.json')
                return {'document': self.state(project_id), 'folder': str(target)}
            except Exception:
                # Leave incomplete copies available for inspection; never replace
                # an existing directory or switch the active project on failure.
                raise
