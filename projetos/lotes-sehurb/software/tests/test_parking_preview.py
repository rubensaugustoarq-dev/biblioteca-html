from copy import deepcopy
from tempfile import TemporaryDirectory
from uuid import uuid4
import unittest
from services.engine.store import Store,DomainError
from services.engine.accessibility.elements import candidate,totals
from services.engine.infra.domain import calculate
from tests.test_accessibility_parking import surface,parking
from tests.test_infra import rect


class ParkingPreviewTests(unittest.TestCase):
    def test_edit_row_outside_host_stays_whole_red_candidate_then_recovers(self):
        infra,metrics=calculate([surface()]);before=deepcopy((infra,metrics))
        draft=parking(anchor=[74,1],quantity=1)
        one=candidate(draft,infra,metrics)
        self.assertEqual(one['derived']['status'],'dimensioned')
        outside=candidate({**draft,'quantity':4},infra,metrics,preview=True)
        self.assertEqual(outside['derived']['status'],'invalid')
        self.assertIn('ultrapassa',outside['derived']['error'])
        self.assertEqual(len(outside['derived']['parts']),4,'do not clip or drop any bay')
        self.assertAlmostEqual(outside['derived']['areaM2'],50)
        self.assertEqual(totals([outside])['parking']['count'],0,'invalid preview is never a confirmed quantity')
        with self.assertRaises(DomainError):candidate(outside,infra,metrics)
        recovered=candidate({**outside,'anchor':[20,20]},infra,metrics,preview=True)
        self.assertEqual(recovered['derived']['status'],'dimensioned')
        self.assertNotIn('error',recovered['derived'])
        self.assertEqual(recovered['id'],draft['id'])
        self.assertEqual((infra,metrics),before)

    def test_endpoint_preview_overlap_and_outside_never_bypass_save(self):
        from services.engine import api
        with TemporaryDirectory(dir='tests/evidence') as folder:
            store=Store(folder);doc=store.create('Prévia vagas','EPSG:31979',-67.81,-9.974);pid=doc['project']['id'];source=str(uuid4())
            def command(kind,args):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
            command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(0,0,100,100)})
            host={**surface(),'sourceEntityId':source};command('infra.upsert',host)
            previous=api.store;api.store=store
            try:
                fixed=parking(surfaceId=host['id'],quantity=1);command('accessibility.element.upsert',fixed)
                before=deepcopy(doc)
                for value in (parking(surfaceId=host['id'],anchor=[74,1],quantity=4),parking(surfaceId=host['id'],anchor=[-1,-1]),{**fixed,'id':str(uuid4())}):
                    result=api.accessibility_element_preview(pid,{'expectedRevision':doc['project']['revision'],'element':value,'previewOnly':True})
                    self.assertEqual(result['derived']['status'],'invalid')
                    self.assertTrue(result['derived']['error']);self.assertTrue(result['derived']['parts'])
                    with self.assertRaises(DomainError):command('accessibility.element.upsert',result)
                    self.assertEqual(store.state(pid),before)
                    with self.assertRaises(DomainError):api.accessibility_element_preview(pid,{'expectedRevision':doc['project']['revision'],'element':value})
                corrected=api.accessibility_element_preview(pid,{'expectedRevision':doc['project']['revision'],'element':parking(surfaceId=host['id'],anchor=[40,40],quantity=4),'previewOnly':True})
                self.assertEqual(corrected['derived']['status'],'dimensioned')
                self.assertEqual(store.state(pid),before)
            finally:api.store=previous
