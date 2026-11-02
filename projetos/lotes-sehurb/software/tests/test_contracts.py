import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "plugin"))
from lotes_sehurb.application.commands import CommandDispatcher, ToolNotImplementedError
from lotes_sehurb.domain.catalog import get_catalog, get_tool
from lotes_sehurb.domain.models import Command, Preview
from lotes_sehurb.domain.validation import validate_parameters


class ContractTests(unittest.TestCase):
    def test_catalog_integrity_and_defaults(self):
        tools = get_catalog()
        self.assertGreaterEqual(len(tools), 35)
        self.assertEqual(len(tools), len({tool['id'] for tool in tools}))
        for tool in tools:
            keys = [p['key'] for p in tool['parameters']]
            self.assertEqual(len(keys), len(set(keys)), tool['id'])
            self.assertTrue(tool['acceptance'])
            self.assertIn(tool['status'], ('planejado', 'parcial'))
            for field in tool['parameters']:
                if field['choices'] and field['default'] is not None:
                    self.assertIn(field['default'], field['choices'])
                if field['type'] in ('integer', 'number') and field['default'] is not None:
                    if field['minimum'] is not None:
                        self.assertGreaterEqual(field['default'], field['minimum'])

    def test_minimums_are_not_assumed(self):
        spec = get_tool('lots.preview')
        values = {field['key']: field['default'] for field in spec['parameters']}
        errors = validate_parameters('lots.preview', values)
        self.assertTrue(any('Área mínima' in error for error in errors))
        self.assertTrue(any('Testada mínima' in error for error in errors))

    def test_nan_infinite_and_wrong_numeric_types(self):
        base = {'mode': 'distancia', 'geometry': {}, 'decimals': 2}
        for invalid in (float('nan'), float('inf'), True, 2.5):
            self.assertTrue(validate_parameters('editing.measure', {**base, 'decimals': invalid}))

    def test_out_of_range_and_partial_location(self):
        values = {'crs': 'EPSG:31980', 'latitude': -9.9, 'longitude': None,
                  'utm_zone': 61, 'hemisphere': 'sul', 'coordinate_decimals': 3,
                  'snap_pixels': 12, 'geometry_tolerance_m': 0.001, 'area_tolerance_m2': 0.01}
        errors = validate_parameters('setup.configure', values)
        self.assertTrue(any('máximo 60' in error for error in errors))
        self.assertTrue(any('juntas' in error for error in errors))

    def test_preview_revision_guard(self):
        preview = Preview('project-1', 4, ('lot-1',))
        preview.assert_current('project-1', 4)
        for project_id, revision in [('project-2', 4), ('project-1', 5)]:
            with self.assertRaises(ValueError):
                preview.assert_current(project_id, revision)

    def test_no_fake_execution(self):
        command = Command('editing.measure', 'project-1', 0,
                          {'mode': 'distancia', 'geometry': {}, 'decimals': 2})
        dispatcher = CommandDispatcher()
        with self.assertRaises(ToolNotImplementedError):
            dispatcher.execute(command, 'project-1', 0)
        with self.assertRaises(ValueError):
            dispatcher.execute(command, 'project-1', 1)

    def test_minimum_target_conflict(self):
        spec = get_tool('lots.preview')
        values = {field['key']: field['default'] for field in spec['parameters']}
        values.update(block_id='b1', front_road_ids=['r1'], frontage_min_m=12, area_min_m2=300)
        errors = validate_parameters('lots.preview', values)
        self.assertTrue(any('frontage_min_m' in error for error in errors))
        self.assertTrue(any('area_min_m2' in error for error in errors))

    def test_catalog_isolation(self):
        spec = get_tool('lots.preview')
        spec['parameters'][0]['label'] = 'changed'
        self.assertNotEqual(get_tool('lots.preview')['parameters'][0]['label'], 'changed')


if __name__ == '__main__':
    unittest.main()
