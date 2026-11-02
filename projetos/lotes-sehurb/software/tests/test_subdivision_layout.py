import copy
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import unittest
from fastapi.testclient import TestClient
from shapely.geometry import shape,mapping
from shapely.affinity import rotate,translate
from services.engine import api
from services.engine.store import Store,DomainError
from services.engine.infra.subdivision.layout import generate,validate
from services.engine.infra.domain import calculate
from tests.test_infra import rect,road

def layout(boundary=None,**changes):
    return {'id':str(uuid4()),'sourceEntityId':str(uuid4()),'sourceGeometry':boundary or rect(0,0,40,50),'parameters':{'frontage':10,'depth':25,'minArea':250,'angle':0,'frontEdge':0},'zones':[],'lots':[],**changes}

class LayoutGeometryTests(unittest.TestCase):
    def test_standard_rectangles_exact_metrics_and_no_automatic_green(self):
        result=generate(layout(),[]);self.assertEqual(len(result['lots']),8)
        for lot in result['lots']:
            self.assertAlmostEqual(lot['derived']['areaM2'],250);self.assertAlmostEqual(lot['derived']['frontageM'],10)
            self.assertTrue(lot['derived']['accessReviewRequired'])
        categories=result['derived']['categories'];self.assertEqual(categories['green']['areaM2'],0)
        self.assertAlmostEqual(categories['lots']['areaM2'],2000);self.assertAlmostEqual(sum(v['percent'] for v in categories.values()),100)
    def test_reservations_roads_pavements_green_and_irregular_remainder(self):
        infrastructure,_=calculate([{**road([[0,10],[40,10]]),'width':4,'sidewalkLeft':1,'sidewalkRight':1,'clipToGleba':False},{**road(),'kind':'surface','geometry':rect(25,30,5,5),'material':'concrete','clipToGleba':False}])
        value=layout(rect(0,0,43,60));value['zones']=[{'id':str(uuid4()),'name':'Praça','use':'green','geometry':rect(0,40,10,10)}]
        result=generate(value,infrastructure);categories=result['derived']['categories']
        self.assertAlmostEqual(sum(v['areaM2'] for v in categories.values()),43*60,places=5)
        self.assertGreater(categories['roads']['areaM2'],0);self.assertEqual(categories['paved']['areaM2'],25)
        self.assertEqual(categories['green']['areaM2'],100);self.assertGreater(categories['remainder']['areaM2'],0)
        for lot in result['lots']:
            g=shape(lot['geometry']);self.assertLess(g.intersection(shape(value['zones'][0]['geometry'])).area,1e-6)
            for item in infrastructure:
                for region in item['derived']['regions']:self.assertLess(g.intersection(shape(region['geometry'])).area,1e-6)
    def test_rotated_utm_and_collinear_front_vertices(self):
        origin=(626000,8900000);g=translate(rotate(shape(rect(0,0,40,50)),32,origin=(0,0)),xoff=origin[0],yoff=origin[1])
        value=layout(mapping(g));value['parameters']['angle']=32
        result=generate(value,[]);self.assertGreaterEqual(len(result['lots']),6)
        for lot in result['lots']:self.assertAlmostEqual(lot['derived']['frontageM'],10,places=5)
        poly={'type':'Polygon','coordinates':[[[0,0],[5,0],[40,0],[40,50],[0,50],[0,0]]]}
        result=generate(layout(poly),[]);self.assertEqual(len(result['lots']),8)
    def test_lock_ids_minimums_and_invalid_overlap(self):
        original=generate(layout(),[]);original['lots'][0]['locked']=True;identity=original['lots'][0]['id']
        regenerated=generate(original,[]);self.assertIn(identity,[l['id'] for l in regenerated['lots']])
        self.assertEqual(len(regenerated['lots']),8)
        bad=copy.deepcopy(original);bad['parameters']['minArea']=251
        with self.assertRaises(DomainError):generate(bad,[])
        bad=copy.deepcopy(original);bad['zones']=[{'id':str(uuid4()),'name':'Praça','use':'green','geometry':bad['lots'][0]['geometry']}]
        with self.assertRaises(DomainError):validate(bad,[])
        bad=copy.deepcopy(original);bad['lots'][0]['geometry']=rect(0,0,5,10)
        with self.assertRaises(DomainError):validate(bad,[])
        bad=copy.deepcopy(original);bad['zones']=[{'id':str(uuid4()),'name':'Fora','use':'institutional','geometry':rect(50,0,5,5)}]
        with self.assertRaises(DomainError):validate(bad,[])

class LayoutCommandTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(Path(self.temp.name)/'projects');self.client=TestClient(api.app)
        self.doc=api.store.create('Lotes','EPSG:31979',-67.81,-9.974);self.pid=self.doc['project']['id'];self.source=str(uuid4());self.id=str(uuid4())
        self.command('boundary.upsert',{'id':self.source,'name':'Gleba A','geometry':rect(0,0,40,50)})
    def tearDown(self):api.store=self.previous;self.temp.cleanup()
    def command(self,kind,args):
        response=self.client.post(f'/api/projects/{self.pid}/commands',headers={'X-LSEHURB':'1'},json={'commandId':str(uuid4()),'expectedRevision':self.doc['project']['revision'],'type':kind,'parameters':args})
        if response.status_code==200:self.doc=response.json()
        return response
    def preview(self,value=None,action='preview'):
        return self.client.post(f'/api/projects/{self.pid}/subdivision/layout/{action}',headers={'X-LSEHURB':'1'},json={'id':self.id,'sourceEntityId':self.source,'expectedRevision':self.doc['project']['revision'],'layout':value or layout()})
    def apply(self,result):
        return self.command('subdivision.layout.apply',{'id':self.id,'sourceEntityId':self.source,'previewRevision':result['expectedRevision'],'layout':result['layout']})
    def test_preview_apply_persistence_history_and_original_preserved(self):
        before=api.store.state(self.pid);response=self.preview();self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(api.store.state(self.pid),before);result=response.json()
        self.assertEqual(self.apply(result).status_code,200)
        self.assertEqual(len(self.doc['subdivisionAreas']),1);self.assertEqual(len(self.doc['subdivisionAreas'][0]['layout']['lots']),8)
        self.assertEqual(self.doc['entities'][0]['geometry'],rect(0,0,40,50))
        self.command('undo',{});self.assertEqual(self.doc['subdivisionAreas'],[])
        self.command('redo',{});identities=[l['id'] for l in self.doc['subdivisionAreas'][0]['layout']['lots']]
        destination=Path(self.temp.name)/'Cópia';destination.mkdir();api.store.save_as(self.pid,destination,self.doc['project']['revision'])
        reopened=Store(api.store.root).state(self.pid);self.assertEqual([l['id'] for l in reopened['subdivisionAreas'][0]['layout']['lots']],identities)
    def test_stale_preview_rejected_and_other_gleba_kept(self):
        first=self.preview().json();self.apply(first);original=copy.deepcopy(self.doc['subdivisionAreas'][0]['layout']['lots'])
        stale=self.preview().json();self.command('boundary.upsert',{'id':str(uuid4()),'name':'Outra','geometry':rect(100,0,40,50)})
        self.assertEqual(self.apply(stale).status_code,409)
        self.source=self.doc['entities'][-1]['id'];self.id=str(uuid4());second=self.preview();self.assertEqual(second.status_code,200,second.text);self.apply(second.json())
        self.assertEqual(len(self.doc['subdivisionAreas']),2);self.assertEqual(self.doc['subdivisionAreas'][0]['layout']['lots'],original)
    def test_explicit_use_changes_balance_and_conflicts_are_atomic(self):
        value=layout();value['zones']=[{'id':str(uuid4()),'name':'Praça','use':'green','geometry':rect(0,0,10,25)}]
        result=self.preview(value).json();self.assertEqual(result['layout']['derived']['categories']['green']['areaM2'],250);self.apply(result)
        stored=self.doc['subdivisionAreas'][0]['layout'];self.assertEqual(len(stored['lots']),7)
        bad=copy.deepcopy(stored);bad['zones'][0]['geometry']=bad['lots'][0]['geometry'];revision=self.doc['project']['revision']
        response=self.apply({'layout':bad,'expectedRevision':revision});self.assertEqual(response.status_code,422)
        self.assertEqual(api.store.state(self.pid)['project']['revision'],revision)
    def test_road_change_diagnosed_without_removing_lots(self):
        self.apply(self.preview().json());ids=[l['id'] for l in self.doc['subdivisionAreas'][0]['layout']['lots']]
        road_value={**road([[0,25],[40,25]]),'sourceEntityId':self.source,'clipToGleba':False}
        self.assertEqual(self.command('infra.upsert',road_value).status_code,200)
        saved=self.doc['subdivisionAreas'][0]['layout'];self.assertGreater(saved['derived']['conflictAreaM2'],0)
        self.assertEqual([l['id'] for l in saved['lots']],ids)
