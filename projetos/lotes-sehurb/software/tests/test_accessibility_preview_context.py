import copy
import unittest
from tempfile import TemporaryDirectory
from unittest.mock import patch
from uuid import uuid4

from services.engine import api
from services.engine.store import Store, DomainError
from services.engine.infra.domain import calculate
from tests.test_accessibility import host
from tests.test_accessibility_elements import element
from tests.test_infra import rect


class AccessibilityPreviewContext(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence')
        self.store=Store(self.temp.name)
        self.doc=self.store.create('Preview','EPSG:31979',-67.81,-9.974)
        self.pid=self.doc['project']['id'];self.source=str(uuid4())
        self.command('boundary.upsert',{'id':self.source,'name':'Gleba','geometry':rect(0,0,100,100)})
        self.road={**host(),'sourceEntityId':self.source}
        self.command('infra.upsert',self.road)

    def tearDown(self):
        self.temp.cleanup()

    def command(self,kind,args):
        self.doc=self.store.command(self.pid,{'commandId':str(uuid4()),'expectedRevision':self.doc['project']['revision'],'type':kind,'parameters':args})

    def test_repeated_previews_do_not_rebuild_document_or_infrastructure(self):
        before=copy.deepcopy(self.doc);previous=api.store;api.store=self.store
        try:
            with patch.object(self.store,'state_db',side_effect=AssertionError('full document rebuilt')),patch('services.engine.infra.domain.calculate',side_effect=AssertionError('infrastructure rebuilt')):
                for x in (20,40,60):
                    v=api.accessibility_element_preview(self.pid,{'expectedRevision':self.doc['project']['revision'],'element':element('tactileWarning',anchor=[x,6])})
                    self.assertEqual(v['derived']['status'],'dimensioned')
        finally:api.store=previous
        self.assertEqual(self.store.state(self.pid),before)

    def test_cold_context_builds_only_hosts_once(self):
        self.store._accessibility_contexts.clear()
        with patch.object(self.store,'state_db',side_effect=AssertionError('full document rebuilt')),patch('services.engine.infra.domain.calculate',wraps=calculate) as build:
            a=self.store.accessibility_context(self.pid,self.doc['project']['revision'])
            b=self.store.accessibility_context(self.pid,self.doc['project']['revision'])
            self.assertEqual(a,b);self.assertEqual(build.call_count,1)
            self.assertNotIn('subdivisionAreas',a);self.assertNotIn('resources',a)
        self.assertEqual(a['infra'],self.doc['infra'])

    def test_revisions_external_updates_undo_redo(self):
        old=self.doc['project']['revision']
        # A second store simulates reopening/updating the project, bypassing the
        # first instance's cache. SQLite revision must still win.
        other=Store(self.temp.name)
        self.doc=other.command(self.pid,{'commandId':str(uuid4()),'expectedRevision':old,'type':'infra.upsert','parameters':{**self.road,'sidewalkLeft':3}})
        with self.assertRaises(DomainError) as caught:self.store.accessibility_context(self.pid,old)
        self.assertEqual(caught.exception.status,409)
        self.assertEqual(self.store.accessibility_context(self.pid,self.doc['project']['revision'])['infra'][0]['sidewalkLeft'],3)
        self.command('undo',{})
        self.assertEqual(self.store.accessibility_context(self.pid,self.doc['project']['revision'])['infra'][0]['sidewalkLeft'],4)
        self.command('redo',{})
        self.assertEqual(self.store.accessibility_context(self.pid,self.doc['project']['revision'])['infra'][0]['sidewalkLeft'],3)

    def test_returned_document_cannot_poison_cache_and_cache_is_bounded(self):
        revision=self.doc['project']['revision']
        self.doc['infra'][0]['sidewalkLeft']=999
        self.assertEqual(self.store.accessibility_context(self.pid,revision)['infra'][0]['sidewalkLeft'],4)
        for width in range(3,9):self.command('infra.upsert',{**self.road,'sidewalkLeft':width})
        self.assertLessEqual(len(self.store._accessibility_contexts),4)
        other=self.store.create('Outro','EPSG:31979',-67.81,-9.974)
        self.assertEqual(self.store.accessibility_context(other['project']['id'],other['project']['revision'])['infra'],[])
