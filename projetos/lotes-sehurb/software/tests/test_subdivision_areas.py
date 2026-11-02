import copy
from uuid import uuid4
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from shapely.geometry import shape
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store
from tests.test_infra import rect

class SubdivisionAreaTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(Path(self.temp.name)/'projects')
        self.client=TestClient(api.app);self.doc=api.store.create('Áreas','EPSG:31979',-67.81,-9.974);self.pid=self.doc['project']['id'];self.source=str(uuid4())
        self.command('boundary.upsert',{'id':self.source,'name':'Gleba mãe','geometry':rect(0,0,100,100)})
    def tearDown(self):api.store=self.previous;self.temp.cleanup()
    def command(self,kind,args,revision=None):
        response=self.client.post(f'/api/projects/{self.pid}/commands',headers={'X-LSEHURB':'1'},json={'commandId':str(uuid4()),'expectedRevision':self.doc['project']['revision'] if revision is None else revision,'type':kind,'parameters':args})
        if response.status_code==200:self.doc=response.json()
        return response
    def area(self,geometry=None,**kwargs):
        return {'id':str(uuid4()),'sourceEntityId':self.source,'name':'Quadra A','mode':'internalArea','geometry':geometry or rect(10,10,20,30),**kwargs}
    def validate(self,value,action='validate',revision=None):
        return self.client.post(f'/api/projects/{self.pid}/subdivision/areas/{action}',headers={'X-LSEHURB':'1'},json={'expectedRevision':self.doc['project']['revision'] if revision is None else revision,'area':value})
    def test_whole_parent_is_copied_and_derived_not_trusted(self):
        before=copy.deepcopy(self.doc['entities'][0]['geometry']);revision=self.doc['project']['revision']
        value=self.area(mode='wholeGleba',sourceBoundarySnapshot=rect(0,0,1,1),sourceRevision=999,derived={'areaM2':1})
        response=self.command('subdivision.area.upsert',value);self.assertEqual(response.status_code,200,response.text)
        area=self.doc['subdivisionAreas'][0]
        self.assertEqual(area['geometry'],before);self.assertEqual(area['sourceBoundarySnapshot'],before)
        self.assertEqual(area['sourceRevision'],revision);self.assertEqual(area['derived']['areaM2'],10000)
        self.assertEqual(self.doc['entities'][0]['geometry'],before);self.assertEqual(self.doc['infra'],[])
    def test_internal_touching_and_independent_edit_overlap_warning(self):
        a=self.area(rect(0,0,20,30));b=self.area(rect(10,10,20,30),name='Quadra B')
        for value in (a,b):self.assertEqual(self.command('subdivision.area.upsert',value).status_code,200)
        first,second=self.doc['subdivisionAreas'];self.assertEqual(first['derived']['areaM2'],600)
        self.assertIn(b['id'],first['derived']['overlappingAreaIds']);before=copy.deepcopy(second)
        a['geometry']=rect(0,0,5,5);a['name']='Quadra A ajustada'
        self.assertEqual(self.command('subdivision.area.upsert',a).status_code,200)
        after=self.doc['subdivisionAreas'][1]
        self.assertEqual(after['id'],before['id']);self.assertEqual(after['geometry'],before['geometry'])
        self.assertEqual(self.doc['subdivisionAreas'][0]['derived']['overlappingAreaIds'],[])
    def test_invalid_outside_self_crossing_and_empty_are_atomic(self):
        revision=self.doc['project']['revision']
        geometries=[rect(90,90,20,20),{'type':'Polygon','coordinates':[[[0,0],[10,10],[0,10],[10,0],[0,0]]]},rect(0,0,0,0)]
        for geometry in geometries:self.assertEqual(self.command('subdivision.area.upsert',self.area(geometry)).status_code,422)
        self.assertEqual(self.doc['project']['revision'],revision);self.assertEqual(api.store.state(self.pid)['subdivisionAreas'],[])
    def test_check_clip_read_only_and_split_requires_user_choice(self):
        before=api.store.state(self.pid);value=self.area(rect(90,90,20,20))
        self.assertEqual(self.validate(value).status_code,422)
        clipped=self.validate(value,'clip');self.assertEqual(clipped.status_code,200)
        self.assertEqual(clipped.json()['parts'][0]['areaM2'],100);self.assertEqual(clipped.json()['discardedAreaM2'],300)
        self.assertEqual(api.store.state(self.pid),before)
        u={'type':'Polygon','coordinates':[[[0,0],[30,0],[30,30],[20,30],[20,10],[10,10],[10,30],[0,30],[0,0]]]}
        self.command('boundary.upsert',{'id':self.source,'name':'Gleba U','geometry':u})
        parts=self.validate(self.area(rect(0,20,30,5)),'clip').json()['parts'];self.assertEqual(len(parts),2)
        self.assertEqual(sorted(p['areaM2'] for p in parts),[50,50])
    def test_history_delete_reopen_and_save_as(self):
        a=self.area();self.command('subdivision.area.upsert',a);self.command('subdivision.area.upsert',{**a,'name':'Renomeada'})
        self.command('undo',{});self.assertEqual(self.doc['subdivisionAreas'][0]['name'],'Quadra A')
        self.command('redo',{});self.assertEqual(self.doc['subdivisionAreas'][0]['name'],'Renomeada')
        self.command('subdivision.area.delete',{'id':a['id']});self.assertEqual(self.doc['subdivisionAreas'],[])
        self.command('undo',{});self.assertEqual(self.doc['subdivisionAreas'][0]['id'],a['id'])
        destination=Path(self.temp.name)/'Cópia';destination.mkdir();api.store.save_as(self.pid,destination,self.doc['project']['revision'])
        reopened=Store(api.store.root).state(self.pid);self.assertTrue(shape(reopened['subdivisionAreas'][0]['geometry']).equals(shape(a['geometry'])))
        self.assertTrue(shape(reopened['entities'][0]['geometry']).equals(shape(rect(0,0,100,100))))
    def test_changed_or_missing_parent_keeps_snapshot_and_cannot_reassign(self):
        a=self.area();self.command('subdivision.area.upsert',a);original=copy.deepcopy(self.doc['subdivisionAreas'][0])
        self.command('boundary.upsert',{'id':self.source,'name':'Origem alterada','geometry':rect(0,0,40,40)})
        area=self.doc['subdivisionAreas'][0];self.assertTrue(area['derived']['sourceChanged']);self.assertEqual(area['sourceBoundarySnapshot'],original['sourceBoundarySnapshot'])
        self.command('subdivision.area.upsert',{**a,'name':'Novo nome','sourceBoundarySnapshot':rect(0,0,1,1)})
        self.assertEqual(self.doc['subdivisionAreas'][0]['sourceBoundarySnapshot'],original['sourceBoundarySnapshot'])
        other=str(uuid4());self.command('boundary.upsert',{'id':other,'name':'Outra','geometry':rect(0,0,80,80)})
        self.assertEqual(self.command('subdivision.area.upsert',{**a,'sourceEntityId':other}).status_code,422)
        self.command('entity.delete',{'id':self.source});area=self.doc['subdivisionAreas'][0]
        self.assertTrue(area['derived']['sourceMissing']);self.assertEqual(area['geometry'],original['geometry'])
    def test_stale_revisions_and_name_validation(self):
        a=self.area();self.assertEqual(self.validate(a,revision=0).status_code,409)
        self.assertEqual(self.command('subdivision.area.upsert',a,revision=0).status_code,409)
        self.assertEqual(self.validate({**a,'name':' '}).status_code,422)
        checked=self.validate(a);self.assertEqual(checked.status_code,200);self.assertEqual(checked.json()['derived']['percentOfSource'],6)
        self.assertEqual(self.doc['subdivisionAreas'],[])
