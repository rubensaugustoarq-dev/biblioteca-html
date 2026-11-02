import math
import unittest
from copy import deepcopy
from tempfile import TemporaryDirectory
from uuid import uuid4
from services.engine.landscape.domain import candidate,totals
from services.engine.store import Store,DomainError


def water():
    return {'id':str(uuid4()),'kind':'water','name':'Lago','geometry':{'type':'Polygon','coordinates':[[[0,0],[20,0],[20,20],[0,20],[0,0]]]},'arcSegments':[]}


class LandscapeTests(unittest.TestCase):
    def test_curves_include_closing_edge_and_confirm_area(self):
        value=water();original=deepcopy(value)
        straight=candidate(value);self.assertEqual(straight['derived']['areaM2'],400)
        # The closing side bows outside the square through a semicircle.
        value['arcSegments']=[{'index':3,'directionDegrees':180}]
        curved=candidate(value)
        self.assertEqual(curved['geometry'],original['geometry'])
        self.assertAlmostEqual(curved['derived']['areaM2'],400+math.pi*50,delta=.5)
        self.assertAlmostEqual(curved['derived']['perimeterM'],60+math.pi*10,places=6)
        self.assertGreater(len(curved['derived']['geometry']['coordinates'][0]),30)
        self.assertEqual(candidate(original)['derived']['areaM2'],400)

    def test_crossing_and_invalid_controls_are_rejected_without_repair(self):
        value=water();value['geometry']['coordinates'][0]=[[0,0],[20,20],[20,0],[0,20],[0,0]]
        with self.assertRaises(DomainError):candidate(value)
        for arcs in ([{'index':4,'directionDegrees':30}],[{'index':True,'directionDegrees':30}],[{'index':0,'directionDegrees':float('nan')}],[{'index':0,'directionDegrees':0}]):
            value=water();value['arcSegments']=arcs
            with self.assertRaises(DomainError):candidate(value)
        for d in (0,-1,float('inf')):
            with self.assertRaises(DomainError):candidate({'id':str(uuid4()),'name':'Árvore','kind':'tree','geometry':{'type':'Point','coordinates':[1,2]},'diameterM':d})

    def test_water_union_and_separate_vegetation_counts(self):
        a=candidate(water());b=candidate(water())
        tree=candidate({'id':str(uuid4()),'kind':'tree','name':'Árvore','geometry':{'type':'Point','coordinates':[625000,8900000]},'diameterM':6})
        palm=candidate({**tree,'id':str(uuid4()),'kind':'palm'})
        self.assertEqual(totals([a,b,tree,palm]),{'trees':1,'palms':1,'waterCount':2,'waterAreaM2':400,'chalets':0,'huts':0})
        self.assertEqual(tree['geometry']['coordinates'],[625000,8900000])

    def test_store_roundtrip_identity_revision_undo_redo_delete_and_unrelated_commands(self):
        with TemporaryDirectory(dir='tests/evidence') as folder:
            store=Store(folder);doc=store.create('Paisagismo teste','EPSG:31979',-67.81,-9.974);pid=doc['project']['id']
            def command(kind,args):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
            value=water();command('landscape.upsert',value)
            command('landscape.upsert',{**value,'arcSegments':[{'index':3,'directionDegrees':180}]})
            area=doc['landscape'][0]['derived']['areaM2'];self.assertGreater(area,400)
            self.assertEqual(doc['landscape'][0]['revision'],doc['project']['revision'])
            self.assertEqual(Store(folder).state(pid)['landscape'][0]['derived']['areaM2'],area)
            command('undo',{});self.assertEqual(doc['landscape'][0]['derived']['areaM2'],400)
            command('redo',{});self.assertEqual(doc['landscape'][0]['derived']['areaM2'],area)
            command('annotation.upsert',{'id':str(uuid4()),'text':'Rua','x':1,'y':2,'angle':0,'size':2})
            self.assertEqual(Store(folder).state(pid)['landscape'][0]['id'],value['id'])
            command('landscape.delete',{'id':value['id']});self.assertEqual(doc['landscape'],[])
            command('undo',{});self.assertEqual(doc['landscape'][0]['id'],value['id'])
            self.assertEqual(doc['infraMetrics']['pavementAreaM2'],0)
