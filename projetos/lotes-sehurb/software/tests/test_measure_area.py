import unittest
from tempfile import TemporaryDirectory
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store


class MeasureAreaTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(self.temp.name)
        self.doc=api.store.create('Trena','EPSG:31979',-67.81,-9.974)
        self.client=TestClient(api.app);self.url='/api/projects/'+self.doc['project']['id']+'/measure/area'
    def tearDown(self):
        api.store=self.previous;self.temp.cleanup()
    def measure(self,points):
        return self.client.post(self.url,headers={'X-LSEHURB':'1'},json={'points':points})
    def test_utm_area_perimeter_direction_and_no_project_mutation(self):
        ring=[[628000,8890000],[628010,8890000],[628010,8890020],[628000,8890020],[628000,8890000]]
        for points in [ring,ring[::-1]]:
            response=self.measure(points);self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(response.json()['areaM2'],200)
            self.assertEqual(response.json()['perimeterM'],60)
            self.assertEqual(response.json()['vertices'],4)
        self.assertEqual(api.store.state(self.doc['project']['id']),self.doc)
    def test_concave_and_invalid_contours(self):
        response=self.measure([[0,0],[4,0],[4,4],[2,2],[0,4],[0,0]])
        self.assertEqual(response.status_code,200);self.assertEqual(response.json()['areaM2'],12)
        for points in [[[0,0],[4,4],[0,4],[4,0],[0,0]],[[0,0],[1,0],[2,0],[0,0]],[[0,0],[4,0],[4,4],[0,4]],[[0,0],[1,0],[0,0]]]:
            response=self.measure(points);self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(api.store.state(self.doc['project']['id']),self.doc)
    def test_closed_measurement_creates_separate_gleba_and_can_undo(self):
        from uuid import uuid4
        ring=[[628000,8890000],[628010,8890000],[628010,8890020],[628000,8890020],[628000,8890000]]
        area=self.measure(ring).json();initial_revision=self.doc['project']['revision']
        entity_id=str(uuid4())
        response=self.client.post('/api/projects/'+self.doc['project']['id']+'/commands',headers={'X-LSEHURB':'1'},json={
            'commandId':str(uuid4()),'expectedRevision':initial_revision,'type':'boundary.upsert',
            'parameters':{'id':entity_id,'name':'Gleba da medição','geometry':{'type':'Polygon','coordinates':[ring]}}})
        self.assertEqual(response.status_code,200,response.text)
        created=response.json();self.assertEqual(created['entities'][0]['id'],entity_id)
        self.assertEqual(created['entities'][0]['derived']['areaM2'],area['areaM2'])
        self.assertEqual(created['entities'][0]['geometry']['coordinates'][0],ring)
        reopened=api.store.state(self.doc['project']['id']);self.assertEqual(reopened['entities'][0]['id'],entity_id)
        undone=self.client.post('/api/projects/'+self.doc['project']['id']+'/commands',headers={'X-LSEHURB':'1'},json={
            'commandId':str(uuid4()),'expectedRevision':created['project']['revision'],'type':'undo','parameters':{}})
        self.assertEqual(undone.status_code,200);self.assertEqual(undone.json()['entities'],[])


if __name__=='__main__':unittest.main()
