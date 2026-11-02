import copy
import json
from pathlib import Path
import unittest
from uuid import uuid4
from tempfile import TemporaryDirectory
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store
from services.engine.enl.domain import validate

def rect(x,y,w,h):return {'type':'Polygon','coordinates':[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]}
def object_(kind='building',geometry=None,floors=1):return {'id':str(uuid4()),'kind':kind,'name':kind,'geometry':geometry or rect(2,5,6,20),'floors':floors,'computableArea':None}
def lot():return {'id':str(uuid4()),'sourceEntityId':str(uuid4()),'name':'Lote ENL','geometry':rect(0,0,10,30),'frontEdge':0,'backEdge':2,'rules':{},'objects':[object_()]}
class EnlTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(self.temp.name);self.doc=api.store.create('ENL','EPSG:31979',-67.81,-9.974);self.client=TestClient(api.app);self.url='/api/projects/'+self.doc['project']['id']+'/commands'
    def tearDown(self):api.store=self.previous;self.temp.cleanup()
    def command(self,type,args):
        r=self.client.post(self.url,headers={'X-LSEHURB':'1'},json={'commandId':str(uuid4()),'expectedRevision':self.doc['project']['revision'],'type':type,'parameters':args})
        if r.status_code==200:self.doc=r.json()
        return r
    def test_delete_first_building_vertex_recalculates_and_undo_restores(self):
        value=lot();value['objects'][0]['geometry']={'type':'Polygon','coordinates':[[[2,5],[8,5],[8,25],[2,25],[2,10],[2,5]]]}
        self.assertEqual(self.command('boundary.upsert',{'id':value['sourceEntityId'],'name':'Original','geometry':value['geometry']}).status_code,200)
        self.assertEqual(self.command('enl.upsert',value).status_code,200)
        ring=value['objects'][0]['geometry']['coordinates'][0][1:-1]
        value['objects'][0]['geometry']['coordinates']=[ring+[ring[0]]]
        self.assertEqual(self.command('enl.upsert',value).status_code,200)
        d=self.doc['enl'][0]['derived'];self.assertEqual(d['footprintM2'],105);self.assertEqual(d['to'],35);self.assertEqual(d['tp'],65)
        self.assertEqual(self.doc['enl'][0]['objects'][0]['geometry']['coordinates'][0][0],[8,5])
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['enl'][0]['derived']['footprintM2'],120)
        self.assertEqual(self.command('redo',{}).status_code,200);self.assertEqual(self.doc['enl'][0]['derived']['footprintM2'],105)

    def test_300_120_indices_and_setbacks(self):
        value=lot();d=validate(value)['derived'];self.assertEqual(d['lotAreaM2'],300);self.assertEqual(d['builtAreaM2'],120);self.assertEqual(d['ca'],.4);self.assertEqual(d['to'],40);self.assertEqual(d['tp'],60);self.assertEqual([s['distanceM'] for s in d['setbacks']],[5,2,5,2])
        value['objects'][0]['floors']=2;value['objects'].append(object_('permeable',rect(0,0,10,4)));value['rules']={'maxCa':.7,'maxTo':50,'minTp':65,'front':6}
        d=validate(value)['derived'];self.assertEqual(d['ca'],.8);self.assertEqual(d['to'],40);self.assertEqual(d['tp'],60);self.assertEqual([s['status'] for s in d['checks']],['fail','ok','fail']);self.assertEqual(d['setbacks'][0]['status'],'fail')
        value['objects'][0]['computableArea']=150;self.assertEqual(validate(value)['derived']['ca'],.5)
    def test_impermeable_union_deduction_not_double_counted(self):
        value=lot();value['objects'].extend([object_('impermeable',rect(0,0,10,10)),object_('impermeable',rect(0,5,10,10))])
        d=validate(value)['derived'];self.assertEqual(d['builtAreaM2'],120);self.assertEqual(d['footprintM2'],120);self.assertEqual(d['pavementAreaM2'],150)
        self.assertEqual(d['impermeableAreaM2'],210);self.assertEqual(d['permeableAreaM2'],90);self.assertEqual(d['tp'],30)
        self.assertEqual(d['ca'],.4);self.assertEqual(d['to'],40)
        value['objects'][0]['floors']=2;self.assertEqual(validate(value)['derived']['tp'],30)
        self.assertEqual(self.command('boundary.upsert',{'id':value['sourceEntityId'],'name':'Original','geometry':value['geometry']}).status_code,200)
        self.assertEqual(self.command('enl.upsert',value).status_code,200);self.assertEqual(self.doc['enl'][0]['derived']['tp'],30)
        value['objects']=value['objects'][:1];self.assertEqual(self.command('enl.upsert',value).status_code,200);self.assertEqual(self.doc['enl'][0]['derived']['tp'],60)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['enl'][0]['derived']['tp'],30)
        self.assertEqual(Store(self.temp.name).state(self.doc['project']['id'])['enl'][0]['derived']['permeableAreaM2'],90)
    def test_lot_texts_persist_history_and_are_independent_of_study(self):
        value=lot();self.assertEqual(self.command('boundary.upsert',{'id':value['sourceEntityId'],'name':'Original','geometry':value['geometry']}).status_code,200)
        text={'id':str(uuid4()),'text':'Rua A','x':3,'y':5,'size':2,'angle':25,'font':'Courier New','bold':False,'color':'#112233','outline':True,'outlineColor':'#ffffff','outlineWidth':2}
        value['texts']=[text];self.assertEqual(self.command('enl.upsert',value).status_code,200)
        self.assertEqual(self.doc['annotations'],[]);self.assertEqual(self.doc['enl'][0]['texts'][0]['text'],'Rua A')
        self.assertEqual(Store(self.temp.name).state(self.doc['project']['id'])['enl'][0]['texts'][0]['angle'],25)
        value['texts'][0]['text']='Rua B';self.assertEqual(self.command('enl.upsert',value).status_code,200)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['enl'][0]['texts'][0]['text'],'Rua A')
        value['texts'][0]['font']='Fonte inválida';before=copy.deepcopy(self.doc);self.assertEqual(self.command('enl.upsert',value).status_code,422)
        self.assertEqual(json.loads(json.dumps(api.store.state(self.doc['project']['id']))),before)
    def test_change_front_persists_and_changes_roles_without_rotating_geometry(self):
        value=lot();self.assertEqual(self.command('boundary.upsert',{'id':value['sourceEntityId'],'name':'Original','geometry':value['geometry']}).status_code,200)
        self.assertEqual(self.command('enl.upsert',value).status_code,200)
        value['frontEdge']=1;self.assertEqual(self.command('enl.upsert',value).status_code,200)
        saved=self.doc['enl'][0];self.assertEqual(saved['frontEdge'],1);self.assertEqual(saved['geometry'],value['geometry']);self.assertEqual(saved['derived']['setbacks'][1]['role'],'front');self.assertEqual(saved['derived']['setbacks'][1]['distanceM'],2)
        reopened=Store(self.temp.name).state(self.doc['project']['id']);self.assertEqual(reopened['enl'][0]['frontEdge'],1)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['enl'][0]['frontEdge'],0)
    def test_invalid_geometries_and_overlaps_atomic(self):
        source=lot();source['objects']=[];self.assertEqual(self.command('boundary.upsert',{'id':source['sourceEntityId'],'name':'Original','geometry':source['geometry']}).status_code,200)
        before=copy.deepcopy(self.doc)
        for g in [rect(8,5,6,20),rect(2,5,0,20)]:
            value=copy.deepcopy(source);value['objects']=[object_(geometry=g)];r=self.command('enl.upsert',value);self.assertEqual(r.status_code,422,r.text);self.assertEqual(json.loads(json.dumps(api.store.state(self.doc['project']['id']))),before)
        for kind in ['building','permeable']:
            value=copy.deepcopy(source);value['objects']=[object_(),object_(kind,rect(3,6,2,2))];self.assertEqual(self.command('enl.upsert',value).status_code,422)
        value=copy.deepcopy(source);value['frontEdge']=2;value['backEdge']=2;self.assertEqual(self.command('enl.upsert',value).status_code,422)
    def test_multiple_lots_save_reopen_history_and_source_isolation(self):
        value=lot();original=value['geometry'];self.assertEqual(self.command('boundary.upsert',{'id':value['sourceEntityId'],'name':'Original','geometry':original}).status_code,200);sources=copy.deepcopy(self.doc['entities'])
        self.assertEqual(self.command('enl.upsert',value).status_code,200);identity=value['id'];value2=copy.deepcopy(value);value2['id']=str(uuid4());value2['name']='Alternativa';self.assertEqual(self.command('enl.upsert',value2).status_code,200)
        self.assertEqual(len(self.doc['enl']),2);self.assertEqual([v['id'] for v in Store(self.temp.name).state(self.doc['project']['id'])['enl']],[identity,value2['id']]);self.assertEqual(self.doc['entities'][0]['geometry'],original);self.assertEqual(self.doc['entities'][0]['attributes'],sources[0]['attributes'])
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(len(self.doc['enl']),1);self.assertEqual(self.command('redo',{}).status_code,200);self.assertEqual(len(self.doc['enl']),2)
        self.assertEqual(self.command('enl.delete',{'id':identity}).status_code,200);self.assertEqual(len(self.doc['enl']),1);self.assertEqual(self.doc['entities'][0]['geometry'],original)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(len(self.doc['enl']),2)
        target=Path(self.temp.name)/'copia';target.mkdir();api.store.save_as(self.doc['project']['id'],target,self.doc['project']['revision'])
        reopened=Store(self.temp.name).state(self.doc['project']['id']);self.assertEqual(len(reopened['enl']),2);self.assertEqual(reopened['enl'][0]['derived']['to'],40)
if __name__=='__main__':unittest.main()
