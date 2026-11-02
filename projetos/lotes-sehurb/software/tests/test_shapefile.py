from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import unittest
import zipfile
import json
from types import SimpleNamespace
from unittest.mock import patch
import shapefile
from pyproj import CRS
from shapely.geometry import Polygon, MultiPolygon, mapping
from shapely.geometry.polygon import orient
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store

HEADERS = {'X-LSEHURB': '1'}


def bundle(geom=None, crs=31979, missing=None):
    geom = geom or Polygon([(630000,8897000),(630100,8897000),(630100,8897100),(630000,8897100)],
                          [[(630020,8897020),(630020,8897040),(630040,8897040),(630040,8897020)]])
    streams = [BytesIO() for _ in range(3)]
    with shapefile.Writer(shp=streams[0], shx=streams[1], dbf=streams[2], shapeType=5, encoding='utf-8') as writer:
        writer.field('NOME', 'C', size=100)
        writer.field('ORIGEM', 'C', size=100)
        parts = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
        rings = []
        for part in parts:
            part = orient(part, sign=-1)
            rings.extend([list(part.exterior.coords), *[list(r.coords) for r in part.interiors]])
        writer.poly(rings)
        writer.record('Intervenção', 'Análise')
    files = dict(zip(('.shp','.shx','.dbf'), [stream.getvalue() for stream in streams]))
    files['.prj'] = CRS.from_epsg(crs).to_wkt(version='WKT1_ESRI').encode()
    files['.cpg'] = b'UTF-8'
    result = BytesIO()
    with zipfile.ZipFile(result, 'w') as archive:
        for extension, raw in files.items():
            if extension != missing:
                archive.writestr('POLIGONAL DA INTERVENÇÃO' + extension, raw)
    return result.getvalue()


class ShapefileTests(unittest.TestCase):
    def typed_bundle(self, kind, closed=True):
        streams=[BytesIO() for _ in range(3)]
        coords=[[630000,8897000],[630000,8897100],[630100,8897100],[630100,8897000]]
        if closed:
            coords.append(coords[0])
        with shapefile.Writer(shp=streams[0],shx=streams[1],dbf=streams[2],shapeType=kind) as writer:
            writer.field('NOME','C',size=40)
            method={5:'poly',15:'polyz',25:'polym',3:'line',13:'linez',23:'linem'}[kind]
            getattr(writer,method)([coords])
            writer.record('Contorno')
        result=BytesIO()
        with zipfile.ZipFile(result,'w') as archive:
            for extension,stream in zip(('.shp','.shx','.dbf'),streams):
                archive.writestr('contorno'+extension,stream.getvalue())
            archive.writestr('contorno.prj',CRS.from_epsg(31979).to_wkt(version='WKT1_ESRI'))
        return result.getvalue()

    def test_z_m_polygons_and_closed_lines_import_with_explicit_conversion(self):
        for kind in (15,25,3,13,23):
            with self.subTest(kind=kind):
                response=self.preview(self.typed_bundle(kind))
                self.assertEqual(response.status_code,200,response.text)
                data=response.json()
                self.assertEqual(data['convertedTo2D'],kind in (15,25,13,23))
                self.assertEqual(data['closedLineToPolygon'],kind in (3,13,23))
                result=self.apply(data)
                self.assertEqual(result.status_code,200,result.text)
                entity=next(e for e in result.json()['entities'] if e['attributes'].get('sourceShapeType')==kind)
                self.assertEqual(entity['derived']['areaM2'],10000)
                self.assertTrue(all(len(p)==2 for p in entity['geometry']['coordinates'][0]))

    def test_open_line_is_not_closed_silently(self):
        response=self.preview(self.typed_bundle(13,closed=False))
        self.assertEqual(response.status_code,422)
        self.assertIn('linha aberta',response.json()['detail'])
        self.assertEqual(api.store.state(self.project)['project']['revision'],0)

    def setUp(self):
        self.temp = TemporaryDirectory(dir=Path(__file__).parent/'evidence')
        self.old = api.store
        api.store = Store(Path(self.temp.name)/'projects')
        self.client = TestClient(api.app)
        self.client.__enter__()
        self.project = api.store.create('Teste', 'EPSG:31979', -67.81, -9.974)['project']['id']
        self.url = f'/api/projects/{self.project}/shapefile'

    def tearDown(self):
        self.client.__exit__(None,None,None)
        api.store = self.old
        self.temp.cleanup()

    def preview(self, raw):
        return self.client.post(self.url+'/preview', headers=HEADERS, files={'files': ('area.zip', raw, 'application/zip')})

    def apply(self, data, command=None):
        return self.client.post(self.url+'/apply', headers=HEADERS, json={'token':data['token'],
            'expectedRevision':data['expectedRevision'], 'commandId':command or str(uuid4())})

    def test_roundtrip_holes_attributes_history_and_idempotence(self):
        preview = self.preview(bundle())
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertFalse(preview.json()['reprojected'])
        self.assertEqual(api.store.state(self.project)['project']['revision'], 0)
        command = str(uuid4())
        result = self.apply(preview.json(), command)
        self.assertEqual(result.status_code, 200, result.text)
        entity = result.json()['entities'][0]
        self.assertEqual(entity['derived']['areaM2'], 9600)
        self.assertEqual(entity['attributes']['sourceProperties']['ORIGEM'], 'Análise')
        self.assertEqual(self.apply(preview.json(), command).json(), result.json())
        export = self.client.get(self.url+'/export')
        self.assertEqual(export.status_code, 200)
        again = self.preview(export.content).json()
        state = self.apply(again).json()
        self.assertEqual(len(state['entities']), 2)
        self.assertEqual(state['entities'][1]['derived']['areaM2'], 9600)
        api.store.command(self.project, {'commandId':str(uuid4()),'expectedRevision':2,'type':'undo'})
        self.assertEqual(len(api.store.state(self.project)['entities']), 1)
        api.store.command(self.project, {'commandId':str(uuid4()),'expectedRevision':3,'type':'boundary.upsert',
            'parameters':{'id':entity['id'],'name':'Novo nome','geometry':entity['geometry']}})
        self.assertEqual(api.store.state(self.project)['entities'][0]['attributes']['sourceProperties']['ORIGEM'], 'Análise')

    def test_reprojection_and_multipart_are_explicit(self):
        geom = MultiPolygon([Polygon([(-67.81,-9.97),(-67.809,-9.97),(-67.809,-9.969),(-67.81,-9.969)]),
                             Polygon([(-67.808,-9.97),(-67.807,-9.97),(-67.807,-9.969),(-67.808,-9.969)])])
        preview = self.preview(bundle(geom, 4326))
        self.assertEqual(preview.status_code, 200, preview.text)
        data = preview.json()
        self.assertTrue(data['reprojected'])
        self.assertEqual((data['polygons'],data['multipartFeatures']), (2,1))
        result = self.apply(data).json()
        self.assertGreater(result['entities'][0]['derived']['areaM2'], 10000)

    def test_missing_component_invalid_polygon_and_zip_path_rejected(self):
        for raw in [bundle(missing='.prj'), bundle(Polygon([(0,0),(100,100),(0,100),(100,0)]))]:
            self.assertEqual(self.preview(raw).status_code, 422)
        bad = BytesIO()
        with zipfile.ZipFile(bad, 'w') as archive:
            archive.writestr('../outside.shp', b'bad')
        self.assertEqual(self.preview(bad.getvalue()).status_code, 422)
        self.assertEqual(api.store.state(self.project)['project']['revision'], 0)

    def test_multiple_files_and_stale_preview(self):
        with zipfile.ZipFile(BytesIO(bundle())) as archive:
            files = [('files',(name,archive.read(name),'application/octet-stream')) for name in archive.namelist()]
        response = self.client.post(self.url+'/preview', headers=HEADERS, files=files)
        self.assertEqual(response.status_code, 200, response.text)
        other = self.preview(bundle()).json()
        self.assertEqual(self.apply(other).status_code, 200)
        self.assertEqual(self.apply(response.json()).status_code, 409)
        self.assertEqual(len(api.store.state(self.project)['entities']), 1)

    def test_separate_exports_have_one_feature_each_and_distinct_ids(self):
        self.apply(self.preview(bundle()).json())
        self.apply(self.preview(bundle()).json())
        response = self.client.get(self.url+'/export?separate=true')
        self.assertEqual(response.status_code, 200)
        ids = []
        with zipfile.ZipFile(BytesIO(response.content)) as archive:
            names = [name[:-4] for name in archive.namelist() if name.endswith('.shp')]
            self.assertEqual(len(names), 2)
            for base in names:
                with shapefile.Reader(shp=BytesIO(archive.read(base+'.shp')),
                      shx=BytesIO(archive.read(base+'.shx')), dbf=BytesIO(archive.read(base+'.dbf')), encoding='utf-8') as reader:
                    self.assertEqual(reader.numRecords, 1)
                    ids.append(reader.record(0)['ID'])
        self.assertEqual(len(set(ids)), 2)

    def test_vertex_export_matches_numbering_coordinates_and_hole_without_closing_duplicates(self):
        state=self.apply(self.preview(bundle()).json()).json()
        expected=[(ring_index+1,index,point) for ring_index,ring in enumerate(state['entities'][0]['geometry']['coordinates'])
                  for index,point in enumerate(ring[:-1],1)]
        for separate in ('true','false'):
            response=self.client.get(self.url+f'/export?separate={separate}&include_vertices=true')
            self.assertEqual(response.status_code,200)
            with zipfile.ZipFile(BytesIO(response.content)) as archive:
                base='Pontos_identificados/vertices'
                self.assertIn(base+'.prj',archive.namelist())
                self.assertIn(base+'.qml',archive.namelist())
                with shapefile.Reader(shp=BytesIO(archive.read(base+'.shp')),shx=BytesIO(archive.read(base+'.shx')),
                                      dbf=BytesIO(archive.read(base+'.dbf')),encoding='utf-8') as reader:
                    self.assertEqual(reader.shapeType,shapefile.POINT)
                    self.assertEqual(reader.numRecords,len(expected))
                    for record,(ring,index,xy) in zip(reader.iterShapeRecords(),expected):
                        fields=record.record.as_dict()
                        self.assertEqual((fields['ANEL'],fields['PONTO']),(ring,index))
                        self.assertEqual(list(record.shape.points[0]),xy)
                        self.assertEqual((fields['E'],fields['N']),tuple(xy))
                        self.assertEqual(fields['GLEBA_ID'],state['entities'][0]['id'])
        with zipfile.ZipFile(BytesIO(self.client.get(self.url+'/export?separate=true').content)) as archive:
            self.assertFalse(any(name.startswith('Pontos_identificados/') for name in archive.namelist()))

    def test_local_picker_loads_siblings_and_cancel_does_not_modify(self):
        folder = Path(self.temp.name) / 'entrada'
        folder.mkdir()
        with zipfile.ZipFile(BytesIO(bundle())) as archive:
            for name in archive.namelist():
                (folder/name).write_bytes(archive.read(name))
        selected = next(folder.glob('*.shp'))
        with patch('services.engine.api.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout=json.dumps({'path':str(selected)}))):
            result = self.client.post(self.url+'/open-local', headers=HEADERS, json={})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['polygons'], 1)
        self.assertEqual(api.store.state(self.project)['project']['revision'], 0)
        with patch('services.engine.api.subprocess.run', return_value=SimpleNamespace(returncode=0, stdout='{"path":""}')):
            result = self.client.post(self.url+'/open-local', headers=HEADERS, json={})
        self.assertEqual(result.json(), {'cancelled':True})


if __name__ == '__main__':
    unittest.main()
