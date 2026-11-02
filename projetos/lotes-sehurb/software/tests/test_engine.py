from contextlib import closing
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import json
import unittest
import numpy as np
import rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store, DomainError

HEADERS = {'X-LSEHURB': '1'}
POLYGON = {'type': 'Polygon', 'coordinates': [[[630000,8897000],[630100,8897000],[630100,8897100],[630000,8897100],[630000,8897000]]]}


class EngineTests(unittest.TestCase):
    def setUp(self):
        evidence = Path(__file__).parent / 'evidence'
        evidence.mkdir(exist_ok=True)
        self.temp = TemporaryDirectory(dir=evidence)
        self.store = Store(Path(self.temp.name)/'projects')
        self.old = api.store
        api.store = self.store
        self.client = TestClient(api.app)
        self.client.__enter__()
        self.document = self.client.post('/api/projects', headers=HEADERS,
            json={'name':'Projeto teste','authid':'EPSG:31979','longitude':-67.81,'latitude':-9.974}).json()
        self.id = self.document['project']['id']
        self.entity_id = str(uuid4())

    def tearDown(self):
        self.client.__exit__(None,None,None)
        api.store = self.old
        self.temp.cleanup()

    def apply(self, kind, params=None, revision=None, command_id=None):
        if revision is None: revision = self.store.state(self.id)['project']['revision']
        return self.client.post(f'/api/projects/{self.id}/commands',headers=HEADERS,json={
            'commandId':command_id or str(uuid4()),'expectedRevision':revision,'type':kind,'parameters':params or {}})

    def draw(self):
        return self.apply('boundary.upsert',{'id':self.entity_id,'name':'Gleba A','geometry':POLYGON})

    def test_measures_persist_and_checkpoint(self):
        result = self.draw().json()
        self.assertEqual(result['entities'][0]['derived']['areaM2'],10000)
        self.assertEqual(result['entities'][0]['derived']['perimeterM'],400)
        reopened = Store(self.store.root).state(self.id)
        self.assertEqual(reopened['entities'][0]['id'],self.entity_id)
        checkpoint=self.client.post(f'/api/projects/{self.id}/checkpoint',headers=HEADERS).json()
        with closing(__import__('sqlite3').connect(self.store.folder(self.id)/'checkpoints'/checkpoint['file'])) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM entities').fetchone()[0],1)

    def test_undo_redo_survive_reopen_and_new_edit_clears_redo(self):
        self.draw()
        self.assertEqual(self.apply('undo').json()['entities'],[])
        self.assertTrue(Store(self.store.root).state(self.id)['canRedo'])
        redone=self.apply('redo').json()
        self.assertEqual(redone['entities'][0]['id'],self.entity_id)
        self.assertEqual(redone['project']['revision'],3)
        self.apply('undo')
        self.draw()
        self.assertFalse(self.store.state(self.id)['canRedo'])

    def test_invalid_geometry_and_stale_revision_do_not_change_state(self):
        self.draw()
        bad={'type':'Polygon','coordinates':[[[0,0],[10,10],[0,10],[10,0],[0,0]]]}
        self.assertEqual(self.apply('boundary.upsert',{'id':self.entity_id,'geometry':bad}).status_code,422)
        self.assertEqual(self.apply('entity.delete',{'id':self.entity_id},revision=0).status_code,409)
        state=self.store.state(self.id)
        self.assertEqual(state['project']['revision'],1)
        self.assertEqual(state['entities'][0]['derived']['areaM2'],10000)

    def test_idempotency_and_locked_edit(self):
        command_id=str(uuid4())
        args={'id':self.entity_id,'geometry':POLYGON}
        first=self.apply('boundary.upsert',args,revision=0,command_id=command_id)
        repeated=self.apply('boundary.upsert',args,revision=0,command_id=command_id)
        self.assertEqual(first.json(),repeated.json())
        self.assertEqual(self.apply('entity.delete',{'id':self.entity_id},revision=0,command_id=command_id).status_code,409)
        self.apply('entity.lock',{'id':self.entity_id,'locked':True})
        self.assertEqual(self.draw().status_code,422)
        self.assertEqual(self.apply('entity.delete',{'id':self.entity_id}).status_code,422)

    def test_crs_and_origin_rejection(self):
        self.assertEqual(self.client.post('/api/projects',headers=HEADERS,json={'name':'bad','authid':'EPSG:4326','longitude':-67.81,'latitude':-9.974}).status_code,422)
        self.assertEqual(self.client.post('/api/projects',headers=HEADERS,json={'name':'bad','authid':'EPSG:31983','longitude':-67.81,'latitude':-9.974}).status_code,422)
        self.assertEqual(self.client.post(f'/api/projects/{self.id}/checkpoint').status_code,403)
        self.assertEqual(self.client.post(f'/api/projects/{self.id}/checkpoint',headers={**HEADERS,'Origin':'https://example.com'}).status_code,403)

    def test_orthophoto_cog_range_and_persistence(self):
        path=Path(self.temp.name)/'ortho.tif'
        data=np.full((3,64,64),128,dtype=np.uint8)
        with rasterio.open(path,'w',driver='GTiff',width=64,height=64,count=3,dtype='uint8',crs='EPSG:31979',transform=from_origin(630000,8897100,1,1)) as ds: ds.write(data)
        with path.open('rb') as file:
            response=self.client.post(f'/api/projects/{self.id}/orthophotos',headers=HEADERS,
                data={'expected_revision':'0','command_id':str(uuid4())},files={'file':('ortho.tif',file,'image/tiff')})
        self.assertEqual(response.status_code,200,response.text)
        resource=response.json()['resources'][0]
        self.assertEqual(resource['metadata']['bounds'],[630000.,8897036.,630064.,8897100.])
        url=f"/api/projects/{self.id}/resources/{resource['id']}/cog"
        ranged=self.client.get(url,headers={'Range':'bytes=0-15'})
        self.assertEqual(ranged.status_code,206)
        self.assertEqual(len(ranged.content),16)
        self.assertEqual(Store(self.store.root).state(self.id)['resources'][0]['id'],resource['id'])
        self.apply('undo')
        self.assertEqual(self.client.get(url).status_code,404)
        self.apply('redo')
        self.assertEqual(self.client.get(url).status_code,200)
        # Removing one of two rasters must retain the other and be reversible.
        with path.open('rb') as file:
            imported=self.client.post(f'/api/projects/{self.id}/orthophotos',headers=HEADERS,
                data={'expected_revision':str(self.store.state(self.id)['project']['revision']),'command_id':str(uuid4())},
                files={'file':('ortho2.tif',file,'image/tiff')}).json()['resources']
            second=next(r for r in imported if r['id']!=resource['id'])
        result=self.apply('resource.delete',{'id':resource['id']})
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual([r['id'] for r in result.json()['resources']],[second['id']])
        self.assertEqual(self.client.get(url).status_code,404)
        self.assertTrue((self.store.folder(self.id)/resource['relativePath']).is_file())
        self.assertEqual(Store(self.store.root).state(self.id)['resources'][0]['id'],second['id'])
        self.apply('undo')
        self.assertEqual(len(self.store.state(self.id)['resources']),2)
        self.assertEqual(self.client.get(url).status_code,200)
        self.apply('redo')
        self.assertEqual(len(self.store.state(self.id)['resources']),1)
        self.assertEqual(self.client.get(url).status_code,404)

    def test_missing_crs_raster_is_rejected_without_confirmed_resource(self):
        path=Path(self.temp.name)/'unreferenced.tif'
        with rasterio.open(path,'w',driver='GTiff',width=8,height=8,count=1,dtype='uint8',transform=from_origin(0,8,1,1)) as ds: ds.write(np.ones((1,8,8),dtype=np.uint8))
        with path.open('rb') as file:
            response=self.client.post(f'/api/projects/{self.id}/orthophotos',headers=HEADERS,data={'expected_revision':'0','command_id':str(uuid4())},files={'file':('bad.tif',file,'image/tiff')})
        self.assertEqual(response.status_code,422)
        self.assertEqual(self.store.state(self.id)['resources'],[])

    def test_rotated_grid_preserves_original_and_prepares_north_up_display(self):
        from affine import Affine
        path=Path(self.temp.name)/'rotated.tif'
        transform=Affine.translation(630000,8897100)*Affine.rotation(15)*Affine.scale(1,-1)
        with rasterio.open(path,'w',driver='GTiff',width=64,height=64,count=3,dtype='uint8',crs='EPSG:31979',transform=transform) as ds:
            ds.write(np.full((3,64,64),128,dtype=np.uint8))
        with path.open('rb') as file:
            response=self.client.post(f'/api/projects/{self.id}/orthophotos',headers=HEADERS,
                data={'expected_revision':'0','command_id':str(uuid4())},files={'file':('rotated.tif',file,'image/tiff')})
        self.assertEqual(response.status_code,200,response.text)
        resource=response.json()['resources'][0]
        self.assertTrue(resource['metadata']['rotatedGridResampledForDisplay'])
        self.assertEqual(resource['metadata']['displayAffine'][1],0)
        self.assertEqual(resource['metadata']['displayAffine'][3],0)
        original=self.store.folder(self.id)/resource['relativePath']
        with rasterio.open(original) as ds:
            self.assertEqual(ds.transform,transform)


if __name__=='__main__': unittest.main()
