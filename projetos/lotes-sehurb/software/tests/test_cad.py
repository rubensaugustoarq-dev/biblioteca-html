import io
import json
import unittest
from tempfile import TemporaryDirectory
from uuid import uuid4
import ezdxf
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store


class CadTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(dir='tests/evidence')
        self.previous = api.store
        api.store = Store(self.temp.name)
        self.doc = api.store.create('CAD teste', 'EPSG:31979', -67.81, -9.974)
        self.base = '/api/projects/' + self.doc['project']['id']
        self.client = TestClient(api.app)
        self.source = ezdxf.new('R2010'); self.source.header['$INSUNITS'] = 6
        self.source.layers.new('VIAS', dxfattribs={'color': 1})
        self.source.layers.new('OCULTA', dxfattribs={'color': 3}).off()
        msp = self.source.modelspace()
        msp.add_line((628000, 8890000), (628010, 8890010), dxfattribs={'layer': 'VIAS'})
        msp.add_circle((628000, 8890000), 5, dxfattribs={'layer': 'OCULTA'})
        msp.add_text('Rua João', dxfattribs={'height': 2, 'insert': (628002, 8890005), 'layer': 'VIAS'})
        block = self.source.blocks.new('POSTE'); block.add_line((0, 0), (1, 2))
        msp.add_blockref('POSTE', (628020, 8890020), dxfattribs={'layer': 'VIAS'})
        msp.add_lwpolyline([(628000,8890000,0,0,1),(628005,8890000,0,0,0)],dxfattribs={'layer':'VIAS'})
    def tearDown(self):
        api.store = self.previous; self.temp.cleanup()
    def upload(self, confirmed=True):
        stream = io.StringIO(); self.source.write(stream); self.raw = stream.getvalue().encode('utf-8')
        response = self.client.post(self.base+'/cad/import', headers={'X-LSEHURB': '1'},
            data={'expected_revision': self.doc['project']['revision'], 'command_id': str(uuid4()), 'confirmed': str(confirmed).lower()},
            files={'file': ('projeto.dxf', self.raw, 'application/dxf')})
        if response.status_code == 200: self.doc = response.json()
        return response
    def command(self, kind, args={}):
        response = self.client.post(self.base+'/commands', headers={'X-LSEHURB': '1'}, json={
            'commandId': str(uuid4()), 'expectedRevision': self.doc['project']['revision'], 'type': kind, 'parameters': args})
        self.assertEqual(response.status_code, 200, response.text)
        self.doc = response.json()
    def output(self):
        response = self.client.get(self.base+'/cad/export')
        self.assertEqual(response.status_code, 200, response.text[:300])
        return ezdxf.read(io.StringIO(response.content.decode('utf-8')))
    def test_view_native_export_and_history(self):
        result = self.upload(); self.assertEqual(result.status_code, 200, result.text[:500])
        ref = self.doc['resources'][0]
        path = api.store.folder(self.doc['project']['id'])/ref['relativePath']
        self.assertEqual(path.read_bytes(), self.raw)
        self.assertEqual(self.doc['entities'], [])
        response = self.client.get(self.base+'/cad/'+ref['id']+'/view')
        self.assertEqual(response.status_code, 200)
        features = response.json()['features']
        self.assertTrue(any(f['properties']['color'].startswith('#ff0000') for f in features))
        self.assertTrue(any(f['properties']['layer']=='OCULTA' for f in features))
        self.assertTrue(any(f['geometry']['type']=='Polygon' for f in features))
        self.assertLess(ref['metadata']['bounds'][0],628000)
        self.command('cad.layer', {'id':ref['id'],'name':'VIAS','visible':False})
        self.assertFalse(next(l for l in api.store.state(self.doc['project']['id'])['resources'][0]['metadata']['layers'] if l['name']=='VIAS')['visible'])
        exported = self.output()
        self.assertTrue(exported.layers.get('VIAS').is_off())
        self.assertEqual(len(exported.modelspace().query('INSERT')), 1)
        self.assertEqual(exported.modelspace().query('TEXT')[0].dxf.text,'Rua João')
        self.assertEqual(exported.modelspace().query('LWPOLYLINE')[0].get_points()[0][4],1)
        self.command('undo')
        self.assertFalse(self.output().layers.get('VIAS').is_off())
        self.command('resource.delete',{'id':ref['id']}); self.assertFalse(self.doc['resources'])
        self.command('undo'); self.assertEqual(self.doc['resources'][0]['id'],ref['id'])
        self.assertEqual(path.read_bytes(),self.raw)
    def test_native_snap_vertices_blocks_and_no_arc_chords(self):
        self.source.modelspace().add_polyline3d([(628040,8890040,2),(628045,8890045,4)],dxfattribs={'layer':'VIAS'})
        self.assertEqual(self.upload().status_code,200)
        resource=self.doc['resources'][0];before=api.store.state(self.doc['project']['id'])
        response=self.client.get(self.base+'/cad/'+resource['id']+'/snap');self.assertEqual(response.status_code,200,response.text)
        features=response.json()['features'];points=[f for f in features if f['geometry']['type']=='Point'];lines=[f['geometry']['coordinates'] for f in features if f['geometry']['type']=='LineString']
        self.assertTrue(any(f['geometry']['coordinates']==[628021,8890022] and f['properties']['layer']=='VIAS' for f in points))
        self.assertTrue(any(f['geometry']['coordinates']==[628045,8890045] for f in points))
        self.assertIn([[628000,8890000],[628010,8890010]],lines)
        self.assertNotIn([[628000,8890000],[628005,8890000]],lines)
        self.assertEqual(api.store.state(self.doc['project']['id']),before)
    def test_confirm_units_and_multiple_sources(self):
        self.assertEqual(self.upload(False).status_code,422)
        self.source.header['$INSUNITS']=4
        self.assertEqual(self.upload().status_code,422)
        self.source.header['$INSUNITS']=6
        self.assertEqual(self.upload().status_code,200)
        self.assertEqual(self.upload().status_code,200)
        self.assertEqual(len(self.output().modelspace().query('INSERT')),2)
    def test_study_summary_union_legend_hatches_and_native_dimensions(self):
        import copy
        from tests.test_infra import rect
        for name,x in [('Gleba A',628000),('Gleba B',628005)]:
            self.command('boundary.upsert',{'id':str(uuid4()),'name':name,'geometry':rect(x,8890000,10,30)})
        before=copy.deepcopy(api.store.state(self.doc['project']['id']))
        response=self.client.get(self.base+'/cad/export',params={'dimension_groups':'glebas','legend':json.dumps([{'label':'Limite estudado','color':'#123456'}])})
        self.assertEqual(response.status_code,200)
        doc=ezdxf.read(io.StringIO(response.content.decode('utf-8')));msp=doc.modelspace()
        dims=list(msp.query('DIMENSION'));self.assertEqual(len(dims),8);self.assertTrue(all(d.dimtype==1 for d in dims))
        self.assertEqual(sorted(round(d.get_measurement(),6) for d in dims),[10]*4+[30]*4)
        cells=[e.plain_text() for e in msp.query('MTEXT') if '_QUADRO_' in e.dxf.layer]
        for value in ('ESTUDO · GLEBAS','RESUMO GERAL DO ESTUDO','600,00 m²','450,00 m²','300,00','80,00','Limite estudado'):self.assertIn(value,cells)
        self.assertFalse(any('VIAS' in e.dxf.layer or 'ENL' in e.dxf.layer for e in msp))
        hatches=list(msp.query('HATCH'));self.assertEqual(len(hatches),2)
        self.assertTrue(all(h.dxf.solid_fill and h.transparency>.8 for h in hatches))
        self.assertTrue(all(e.dxf.insert.x>628015 for e in msp.query('MTEXT') if '_QUADRO_' in e.dxf.layer))
        self.assertEqual(api.store.state(self.doc['project']['id']),before);self.assertFalse(doc.audit().has_errors)

    def test_export_own_geometry_text_and_optional_points(self):
        a=[628000,8890000];b=[628010,8890000];c=[628010,8890010]
        self.command('boundary.upsert',{'id':str(uuid4()),'name':'Gleba 1','geometry':{'type':'Polygon','coordinates':[[a,b,c,a]]}})
        self.command('annotation.upsert',{'id':str(uuid4()),'text':'Rua A','x':a[0],'y':a[1],'size':2,'angle':45,'font':'Arial','color':'#ff0000'})
        out=self.output();self.assertTrue(out.modelspace().query('LWPOLYLINE')[0].closed)
        self.assertEqual(out.modelspace().query('TEXT')[0].dxf.rotation,45)
        self.assertFalse(out.modelspace().query('POINT'))
        response=self.client.get(self.base+'/cad/export?points=true&dimensions=true&texts=false')
        out=ezdxf.read(io.StringIO(response.content.decode('utf-8')))
        self.assertEqual(len(out.modelspace().query('POINT')),3)
        self.assertFalse(any(e.dxf.text=='Rua A' for e in out.modelspace().query('TEXT')))


if __name__=='__main__': unittest.main()
