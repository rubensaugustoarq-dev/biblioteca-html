import copy,json,unittest
from uuid import uuid4
from services.engine import api
from services.engine.store import Store
import tests.test_subdivision_layout as fixtures
from tests.test_infra import rect

class EnlSubdivisionTests(unittest.TestCase):
    setUp=fixtures.LayoutCommandTests.setUp
    tearDown=fixtures.LayoutCommandTests.tearDown
    command=fixtures.LayoutCommandTests.command
    preview=fixtures.LayoutCommandTests.preview
    apply=fixtures.LayoutCommandTests.apply
    def prepare(self):
        value=fixtures.layout();value['zones']=[{'id':str(uuid4()),'name':'Área verde','use':'green','geometry':rect(0,40,40,10)}]
        response=self.preview(value);self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.apply(response.json()).status_code,200)
        return self.doc['subdivisionAreas'][0]['layout']['lots']
    def test_import_snapshots_individual_lots_and_not_green_parent(self):
        lots=self.prepare();before=copy.deepcopy(self.doc);chosen=lots[:2]
        response=self.command('enl.subdivision.import',{'areaId':self.id,'lotIds':[v['id'] for v in chosen]})
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual([{k:v for k,v in e.items() if k!='revision'} for e in self.doc['entities']],[{k:v for k,v in e.items() if k!='revision'} for e in before['entities']])
        self.assertEqual([a['geometry'] for a in self.doc['subdivisionAreas']],[a['geometry'] for a in before['subdivisionAreas']])
        self.assertEqual(self.doc['subdivisionAreas'][0]['layout'],before['subdivisionAreas'][0]['layout'])
        self.assertEqual(len(self.doc['enl']),2)
        for study,source in zip(self.doc['enl'],chosen):
            self.assertEqual(study['geometry'],source['geometry']);self.assertEqual(study['sourceLotId'],source['id']);self.assertEqual(study['sourceSubdivisionAreaId'],self.id)
            self.assertEqual(study['sourceRevision'],before['project']['revision'])
            self.assertAlmostEqual(study['derived']['lotAreaM2'],source['derived']['areaM2'])
            self.assertEqual(study['objects'],[]);self.assertEqual(study['derived']['tp'],100)
        self.assertNotEqual(self.doc['enl'][0]['derived']['lotAreaM2'],self.doc['entities'][0]['derived']['areaM2'])
        reopened=Store(api.store.root).state(self.pid);self.assertEqual(json.loads(json.dumps(reopened['enl'])),self.doc['enl'])
        identities=[v['id'] for v in self.doc['enl']]
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['enl'],[])
        self.assertEqual(self.command('redo',{}).status_code,200);self.assertEqual([v['id'] for v in self.doc['enl']],identities)
    def test_existing_study_objects_and_provenance_survive_repeat_import(self):
        lots=self.prepare();ids=[lots[0]['id']]
        self.assertEqual(self.command('enl.subdivision.import',{'areaId':self.id,'lotIds':ids}).status_code,200)
        study=copy.deepcopy(self.doc['enl'][0]);g=study['geometry']['coordinates'][0]
        from shapely.geometry import shape,mapping
        building=shape(study['geometry']).buffer(-2)
        study['objects']=[{'id':str(uuid4()),'kind':'building','name':'Casa','geometry':mapping(building),'floors':1,'computableArea':None}]
        self.assertEqual(self.command('enl.upsert',study).status_code,200)
        before=copy.deepcopy(self.doc['enl'])
        self.assertEqual(self.command('enl.subdivision.import',{'areaId':self.id,'lotIds':ids}).status_code,200)
        self.assertEqual(self.doc['enl'],before)
        self.assertEqual(self.command('boundary.upsert',{'id':self.source,'name':'Origem alterada','geometry':rect(0,0,50,60)}).status_code,200)
        self.assertEqual(self.doc['enl'],before)
    def test_bad_selection_and_unapplied_preview_are_atomic(self):
        preview=self.preview().json();before=copy.deepcopy(self.doc)
        response=self.command('enl.subdivision.import',{'areaId':self.id,'lotIds':[preview['layout']['lots'][0]['id']]})
        self.assertEqual(response.status_code,422);self.assertEqual(self.doc,before)
        lots=self.prepare();before=copy.deepcopy(self.doc)
        for ids in ([],[lots[0]['id'],str(uuid4())],[lots[0]['id'],lots[0]['id']]):
            response=self.command('enl.subdivision.import',{'areaId':self.id,'lotIds':ids})
            self.assertEqual(response.status_code,422);self.assertEqual(self.doc,before)

if __name__=='__main__':unittest.main()
