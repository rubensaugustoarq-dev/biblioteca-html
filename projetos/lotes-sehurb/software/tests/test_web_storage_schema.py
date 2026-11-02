"""Verifica a migração inicial, não uma API/motor ainda inexistentes."""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

SCHEMA = Path(__file__).resolve().parents[1] / 'services/engine/migrations/001_project.sql'


class WebStorageSchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(SCHEMA.read_text(encoding='utf-8'))
        for project_id in ('a', 'b'):
            self.db.execute("INSERT INTO projects(id,name,crs_wkt,tolerances_json) VALUES (?,?,?,?)",
                            (project_id, project_id, 'WKT de teste, não CRS real', '{}'))
            self.db.execute('INSERT INTO revisions(project_id,revision) VALUES (?,0)', (project_id,))
        self.db.execute("INSERT INTO entities(project_id,id,kind,revision) VALUES ('a','block-a','block',0)")
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_rejects_cross_project_parent(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO entities(project_id,id,kind,revision,parent_id) VALUES ('b','parcel-b','parcel',0,'block-a')")

    def test_rejects_duplicate_command_and_invalid_revision_step(self):
        self.db.execute("INSERT INTO revisions(project_id,revision,command_id) VALUES ('a',1,'cmd')")
        self.db.execute("INSERT INTO revisions(project_id,revision) VALUES ('a',2)")
        args = ('a', 'cmd', 'create', 0, 1, '0' * 64, '{}', '{}')
        self.db.execute('INSERT INTO commands VALUES (?,?,?,?,?,?,?,?)', args)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO commands VALUES (?,?,?,?,?,?,?,?)', args)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute('INSERT INTO commands VALUES (?,?,?,?,?,?,?,?)',
                            ('a', 'cmd2', 'create', 0, 2, '0' * 64, '{}', '{}'))

    def test_transaction_failure_rolls_back_entities_and_revision(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db:
                self.db.execute("INSERT INTO revisions(project_id,revision) VALUES ('a',1)")
                self.db.execute("INSERT INTO entities(project_id,id,kind,revision,parent_id) VALUES ('a','new','parcel',1,'block-a')")
                self.db.execute("INSERT INTO entities(project_id,id,kind,revision) VALUES ('a','broken','parcel',99)")
        self.assertIsNone(self.db.execute("SELECT id FROM entities WHERE id='new'").fetchone())
        self.assertIsNone(self.db.execute("SELECT revision FROM revisions WHERE project_id='a' AND revision=1").fetchone())

    def test_backup_reopens_with_geometry_and_ids(self):
        data = b'fixture binary: WKB validity is a future engine responsibility'
        self.db.execute("UPDATE entities SET geometry_wkb=?, attributes_json=? WHERE id='block-a'",
                        (data, '{"number":"Q01"}'))
        self.db.commit()
        evidence = SCHEMA.parents[3] / 'tests/evidence'
        evidence.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=evidence) as folder:
            path = Path(folder) / 'checkpoint.sqlite'
            with closing(sqlite3.connect(path)) as backup:
                self.db.backup(backup)
            with closing(sqlite3.connect(path)) as reopened:
                self.assertEqual(reopened.execute("SELECT id,geometry_wkb,attributes_json FROM entities WHERE project_id='a'").fetchone(),
                                 ('block-a', data, '{"number":"Q01"}'))
                self.assertEqual(reopened.execute('PRAGMA integrity_check').fetchone()[0], 'ok')


if __name__ == '__main__':
    unittest.main()
