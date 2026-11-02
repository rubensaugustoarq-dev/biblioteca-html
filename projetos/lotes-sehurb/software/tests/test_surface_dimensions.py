import copy
import unittest
import ezdxf
from services.engine.infra.cad_export import append
from services.engine.infra.domain import calculate
from tests.test_accessibility_parking import surface
from tests.test_infra import rect


class SurfaceDimensions(unittest.TestCase):
    def test_surface_native_dimensions_toggle_holes_and_immutability(self):
        source=surface();geometry=rect(0,0,20,20)
        geometry['coordinates'].append(rect(5,5,4,4)['coordinates'][0])
        infra,metrics=calculate([{**source,'geometry':geometry}])
        state={'project':{'name':'Cotas','revision':1},'entities':[],'infra':infra,'infraMetrics':metrics,'subdivisionAreas':[]}
        before=copy.deepcopy(state)
        enabled=ezdxf.new('R2010');append(enabled,state,groups={'surfaces'})
        dimensions=list(enabled.modelspace().query('DIMENSION'))
        self.assertEqual(len(dimensions),8)
        self.assertTrue(all('COTAS_PAVIMENTACAO' in d.dxf.layer for d in dimensions))
        self.assertTrue(all(d.dxf.dimtype&15==1 for d in dimensions))
        self.assertFalse(enabled.audit().has_errors)
        disabled=ezdxf.new('R2010');append(disabled,state,groups=set())
        self.assertEqual(len(list(disabled.modelspace().query('DIMENSION'))),0)
        self.assertEqual(state,before)
