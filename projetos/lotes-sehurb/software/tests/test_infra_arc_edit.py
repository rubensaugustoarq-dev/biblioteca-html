import unittest
from tempfile import TemporaryDirectory
from uuid import uuid4
from services.engine.store import Store
from tests.test_infra import rect,road


class ExistingRoadArcEdit(unittest.TestCase):
    def test_curve_existing_segment_preserves_identity_and_recalculates_history(self):
        with TemporaryDirectory(dir='tests/evidence') as folder:
            store=Store(folder);doc=store.create('Curvar via','EPSG:31979',-67.81,-9.974)
            pid=doc['project']['id'];source=str(uuid4())
            def command(kind,parameters):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':parameters})
            command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(0,0,100,100)})
            item={**road([[20,20],[60,20],[60,60]]),'sourceEntityId':source,'clipToGleba':False,'width':6}
            command('infra.upsert',item);before=doc['infraMetrics']['pavementAreaM2'];raw=doc['infra'][0]['geometry']
            command('infra.upsert',{**item,'arcSegments':[{'index':0,'directionDegrees':30}]})
            self.assertEqual(len(doc['infra']),1);self.assertEqual(doc['infra'][0]['id'],item['id'])
            self.assertEqual(doc['infra'][0]['geometry'],raw);self.assertEqual(doc['infra'][0]['width'],6)
            self.assertNotEqual(doc['infra'][0]['derived']['axisGeometry'],raw)
            self.assertNotEqual(doc['infraMetrics']['pavementAreaM2'],before)
            curved=doc['infra'][0]['derived']['axisGeometry']
            self.assertEqual(Store(folder).state(pid)['infra'][0]['derived']['axisGeometry'],curved)
            command('undo',{});self.assertEqual(doc['infra'][0]['derived']['axisGeometry'],raw)
            command('redo',{});self.assertEqual(doc['infra'][0]['derived']['axisGeometry'],curved)
            command('infra.upsert',{**doc['infra'][0],'arcSegments':[]})
            self.assertEqual(doc['infra'][0]['derived']['axisGeometry'],raw)
