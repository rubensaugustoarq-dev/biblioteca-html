from tempfile import TemporaryDirectory
from pathlib import Path
from uuid import uuid4
import unittest
from services.engine.store import Store
from services.engine.version import VERSION

class HomeProjectsTests(unittest.TestCase):
    def test_saved_projects_external_locations_and_reopening_preserve_revision(self):
        with TemporaryDirectory(dir='tests/evidence') as folder:
            root=Path(folder);store=Store(root/'projects');a=store.create('Praça','EPSG:31979',-67.81,-9.974);b=store.create('Bosque','EPSG:31979',-67.81,-9.974)
            external=root/'external';external.mkdir();store.save_as(a['project']['id'],external,a['project']['revision'])
            rows=store.recent();self.assertEqual(len(rows),2);self.assertEqual({v['name'] for v in rows},{'Praça','Bosque'})
            self.assertTrue(all(v['modified']>0 and v['crs']=='EPSG:31979' for v in rows))
            for row in rows:self.assertEqual(store.state(row['id'])['project']['revision'],row['revision'])
            self.assertEqual(Store(root/'projects').recent(),rows)
    def test_release_version_is_consistent(self):
        import json
        root=Path(__file__).resolve().parents[1]
        self.assertEqual(VERSION,'1.0.0')
        for file in ('apps/web/package.json','apps/web/package-lock.json'):self.assertEqual(json.loads((root/file).read_text())['version'],VERSION)
