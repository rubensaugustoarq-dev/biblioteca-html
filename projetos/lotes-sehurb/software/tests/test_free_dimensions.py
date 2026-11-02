from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import copy,unittest
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store

class FreeDimensionTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(Path(self.temp.name)/'projects');self.client=TestClient(api.app)
        self.doc=api.store.create('Cotas e textos','EPSG:31979',-67.81,-9.974);self.pid=self.doc['project']['id']
    def tearDown(self):api.store=self.previous;self.temp.cleanup()
    def command(self,kind,args={}):
        response=self.client.post(f'/api/projects/{self.pid}/commands',headers={'X-LSEHURB':'1'},json={'commandId':str(uuid4()),'expectedRevision':self.doc['project']['revision'],'type':kind,'parameters':args})
        if response.status_code==200:self.doc=response.json()
        return response
    def dimension(self):return {'id':str(uuid4()),'name':'Cota rua','start':[626000,8890000],'end':[626003,8890004],'offset':2,'color':'#ffe0a0'}
    def test_measurement_persistence_undo_redo_delete_and_save_as(self):
        value=self.dimension();self.assertEqual(self.command('dimension.upsert',value).status_code,200)
        self.assertEqual(self.doc['dimensions'][0]['derived']['lengthM'],5)
        source=copy.deepcopy(self.doc['entities']);resources=copy.deepcopy(self.doc['resources'])
        value['end']=[626006,8890008];self.command('dimension.upsert',value);self.assertEqual(self.doc['dimensions'][0]['derived']['lengthM'],10)
        self.command('undo');self.assertEqual(self.doc['dimensions'][0]['derived']['lengthM'],5)
        self.command('redo');self.assertEqual(self.doc['dimensions'][0]['derived']['lengthM'],10)
        self.command('dimension.delete',{'id':value['id']});self.assertEqual(self.doc['dimensions'],[])
        self.command('undo');self.assertEqual(self.doc['dimensions'][0]['id'],value['id'])
        self.assertEqual(source,self.doc['entities']);self.assertEqual(resources,self.doc['resources'])
        destination=Path(self.temp.name)/'Cópia';destination.mkdir();api.store.save_as(self.pid,destination,self.doc['project']['revision'])
        reopened=Store(api.store.root).state(self.pid);self.assertEqual(reopened['dimensions'],self.doc['dimensions'])
    def test_text_and_dimensions_survive_each_others_commands(self):
        text={'id':str(uuid4()),'text':'Rua das Palmeiras','x':626000,'y':8890000,'angle':32,'size':2,'font':'Arial','outline':True}
        self.assertEqual(self.command('annotation.upsert',text).status_code,200)
        self.command('dimension.upsert',self.dimension());text['text']='Rua principal';self.command('annotation.upsert',text)
        self.assertEqual(len(self.doc['dimensions']),1);self.assertEqual(self.doc['annotations'][0]['text'],'Rua principal')
        self.assertEqual(self.doc['annotations'][0]['angle'],32)
        self.command('undo');self.assertEqual(self.doc['annotations'][0]['text'],'Rua das Palmeiras');self.assertEqual(len(self.doc['dimensions']),1)
    def test_invalid_dimension_is_atomic(self):
        for patch in ({'end':[626000,8890000]},{'start':[1]},{'offset':'errado'},{'color':'red'},{'name':''}):
            before=copy.deepcopy(self.doc);self.assertEqual(self.command('dimension.upsert',{**self.dimension(),**patch}).status_code,422);self.assertEqual(self.doc,before)
