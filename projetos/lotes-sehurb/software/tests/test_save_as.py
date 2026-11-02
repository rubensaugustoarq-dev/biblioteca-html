from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import patch
import json
import sqlite3
import unittest
from contextlib import closing
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store, DomainError


class SaveAsTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(dir=Path(__file__).parent/'evidence')
        self.store = Store(Path(self.temp.name)/'projects')
        self.doc = self.store.create('Projeto de teste', 'EPSG:31979', -67.81, -9.974)
        self.id = self.doc['project']['id']
        self.destination = Path(self.temp.name)/'Outra pasta'
        self.destination.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def command(self, kind, parameters):
        return self.store.command(self.id, {'commandId':str(uuid4()), 'expectedRevision':self.store.state(self.id)['project']['revision'],
            'type':kind, 'parameters':parameters})

    def test_complete_copy_history_reopen_and_future_writes(self):
        original = self.store.folder(self.id)
        image = original/'assets/originals/test.tif'
        image.write_bytes(b'original preserved')
        self.command('resource.add', {'resource':{'id':str(uuid4()),'role':'orthophoto', 'relativePath':'assets/originals/test.tif',
            'sha256':'0'*64, 'metadata':{'name':'test.tif'}}})
        self.store.checkpoint(self.id)
        result = self.store.save_as(self.id, self.destination, 1)
        copied = Path(result['folder'])
        self.assertEqual((copied/'assets/originals/test.tif').read_bytes(), image.read_bytes())
        self.assertEqual(len(list((copied/'checkpoints').glob('*.sqlite'))), 1)
        reopened = Store(self.store.root)
        self.assertEqual(reopened.folder(self.id), copied)
        self.assertEqual(len(reopened.recent()), 1)
        reopened.command(self.id, {'commandId':str(uuid4()),'expectedRevision':1,'type':'undo'})
        self.assertEqual(reopened.state(self.id)['resources'], [])
        with closing(sqlite3.connect(original/'project.sqlite')) as db:
            self.assertEqual(db.execute('SELECT revision FROM projects').fetchone()[0], 1)
        self.assertEqual(reopened.state(self.id)['project']['revision'], 2)
        self.assertTrue((copied/'assets/originals/test.tif').is_file())

    def test_invalid_destination_stale_revision_and_cancel(self):
        for folder, revision in [(self.store.folder(self.id),0), (self.destination,1)]:
            with self.assertRaises(DomainError):
                self.store.save_as(self.id,folder,revision)
        self.assertFalse((self.store.root/'external-projects.json').exists())
        old = api.store
        api.store = self.store
        try:
            with TestClient(api.app) as client:
                with patch('services.engine.api.subprocess.run',return_value=SimpleNamespace(returncode=0,stdout='{"path":""}')):
                    response=client.post(f'/api/projects/{self.id}/save-as',headers={'X-LSEHURB':'1'},json={'expectedRevision':0})
                self.assertEqual(response.json(), {'cancelled':True})
                with patch('services.engine.api.subprocess.run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps({'path':str(self.destination)}))):
                    response=client.post(f'/api/projects/{self.id}/save-as',headers={'X-LSEHURB':'1'},json={'expectedRevision':0})
                self.assertEqual(response.status_code,200,response.text)
                self.assertTrue(Path(response.json()['folder']).is_dir())
        finally:
            api.store = old


if __name__ == '__main__':
    unittest.main()
