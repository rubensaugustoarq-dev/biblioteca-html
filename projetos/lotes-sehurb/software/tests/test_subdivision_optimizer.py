import copy
import unittest
from unittest.mock import patch
from shapely.geometry import shape,mapping
from shapely.affinity import rotate,translate
from services.engine.infra.subdivision.optimizer import alternatives
from services.engine.infra.subdivision.layout import generate,validate
from services.engine.store import DomainError
from tests.test_subdivision_layout import layout,LayoutCommandTests
from tests.test_infra import rect

def optimized(boundary=None):
    v=layout(boundary);v['parameters'].update(minFrontage=10,maxFrontage=15,minDepth=20,maxDepth=37.5,optimization=True,followFront=True,adaptEdges=True,greenRemainder=True)
    return v

class OptimizerGeometryTests(unittest.TestCase):
    def test_too_small_gleba_can_be_offered_as_green_not_a_false_valid_lot(self):
        v=optimized(rect(0,0,8,8));result=alternatives(v,[])['alternatives'][0]
        self.assertEqual(result['summary']['lotCount'],0);self.assertEqual(result['summary']['greenAreaM2'],64)
        self.assertIn('nesta busca',result['name'])
        v['parameters']['greenRemainder']=False
        with self.assertRaises(DomainError):alternatives(v,[])
    def test_sampled_curved_front_is_measured_as_a_chain(self):
        import math
        boundary={'type':'Polygon','coordinates':[[*[[i,3*math.sin(math.pi*i/40)] for i in range(0,41,2)],[40,50],[0,50],[0,0]]]}
        v=optimized(boundary);v['parameters'].update(followFront=False,angle=0,minArea=200,minFrontage=8,minDepth=15,maxDepth=40)
        result=alternatives(v,[])['alternatives'][0]['layout']
        self.assertEqual(len(result['lots']),8)
        self.assertTrue(any(len(l['geometry']['coordinates'][0])>5 for l in result['lots']))
        self.assertTrue(all(l['derived']['frontageM']>=8-1e-6 for l in result['lots']))
    def test_improves_count_preserves_bounds_and_offers_different_options(self):
        v=optimized(rect(0,0,43,60));old=generate(layout(rect(0,0,43,60)),[])
        report=alternatives(v,[]);options=report['alternatives']
        self.assertGreater(options[0]['summary']['lotCount'],len(old['lots']));self.assertEqual(options[0]['summary']['lotCount'],9)
        self.assertGreaterEqual(len(options),2);self.assertLessEqual(len(options),3)
        for option in options:
            result=option['layout'];self.assertAlmostEqual(sum(c['percent'] for c in result['derived']['categories'].values()),100,places=5)
            self.assertLess(result['derived']['categories']['remainder']['areaM2'],1e-6)
            for lot in result['lots']:
                self.assertGreaterEqual(lot['derived']['frontageM'],10-1e-6);self.assertLessEqual(lot['derived']['frontageM'],15+1e-6)
                self.assertGreaterEqual(lot['derived']['perpendicularExtentM'],20-1e-6);self.assertGreaterEqual(lot['derived']['areaM2'],250-1e-6)
    def test_contour_adaptation_and_automatic_green_is_explicit_and_repeatable(self):
        boundary={'type':'Polygon','coordinates':[[[0,0],[45,0],[38,50],[0,50],[0,0]]]}
        v=optimized(boundary);options=alternatives(v,[])['alternatives'];first=options[0]['layout']
        self.assertTrue(any(z.get('automatic') for z in first['zones']));self.assertGreater(first['derived']['categories']['green']['areaM2'],0)
        self.assertTrue(any(abs(shape(l['geometry']).envelope.area-shape(l['geometry']).area)>.1 for option in options for l in option['layout']['lots']))
        next_value={**v,**first};second=alternatives(next_value,[])['alternatives'][0]['layout']
        self.assertAlmostEqual(second['derived']['categories']['green']['areaM2'],first['derived']['categories']['green']['areaM2'],places=5)
        manual={'id':v['id'],'name':'Praça manual','use':'green','automatic':False,'geometry':rect(0,0,5,5)}
        next_value={**v,'zones':[manual]};result=alternatives(next_value,[])['alternatives'][0]['layout']
        self.assertIn(manual['id'],[z['id'] for z in result['zones']])
    def test_front_selection_rotated_utm_and_clockwise(self):
        original=shape(rect(0,0,43,60));world=translate(rotate(original,31,origin=(0,0)),xoff=626000,yoff=8900000)
        v=optimized(mapping(world));v['parameters']['angle']=0
        result=alternatives(v,[])['alternatives'][0]['layout'];self.assertAlmostEqual(result['parameters']['angle'],31,places=6)
        self.assertEqual(len(result['lots']),9)
        clockwise=mapping(shape(rect(0,0,43,60)).reverse());v=optimized(clockwise);v['parameters']['frontEdge']=3
        other=alternatives(v,[])['alternatives'][0]['layout']
        self.assertEqual(len(other['lots']),9)
    def test_green_can_be_disabled_and_locked_ids_are_preserved(self):
        v=optimized(rect(0,0,43,60));v['parameters']['adaptEdges']=False;v['parameters']['greenRemainder']=False
        options=alternatives(v,[])['alternatives'];self.assertTrue(any(o['layout']['derived']['categories']['remainder']['areaM2']>0 for o in options))
        self.assertTrue(all(not o['layout']['zones'] for o in options))
        result=options[0]['layout'];result['lots'][0]['locked']=True;identity=result['lots'][0]['id']
        again=alternatives({**v,**result},[])['alternatives'][0]['layout'];self.assertIn(identity,[l['id'] for l in again['lots']])
    def test_conflicting_ranges_and_area_maximum_are_enforced(self):
        v=optimized();v['parameters']['maxFrontage']=8
        with self.assertRaises(DomainError):alternatives(v,[])
        v=optimized(rect(0,0,43,60));v['parameters']['maxArea']=260
        report=alternatives(v,[])
        for option in report['alternatives']:
            self.assertTrue(all(l['derived']['areaM2']<=260+1e-6 for l in option['layout']['lots']))
    def test_limited_search_does_not_claim_global_optimality(self):
        calls=[0]
        def clock():calls[0]+=1;return 0 if calls[0]<4 else 9
        with patch('services.engine.infra.subdivision.optimizer.time.perf_counter',side_effect=clock):
            result=alternatives(optimized(rect(0,0,43,60)),[])
        self.assertTrue(result['search']['limited']);self.assertIn('máximo global',result['search']['note'])

class OptimizerApiTests(LayoutCommandTests):
    def test_alternatives_read_only_and_selected_option_persists(self):
        self.command('boundary.upsert',{'id':self.source,'name':'Gleba teste','geometry':rect(0,0,43,60)})
        before=copy.deepcopy(self.doc);response=self.preview(optimized());self.assertEqual(response.status_code,200,response.text)
        report=response.json();self.assertGreaterEqual(len(report['alternatives']),2)
        self.assertEqual(self.doc['project']['revision'],before['project']['revision'])
        option=report['alternatives'][-1]['layout'];self.assertEqual(self.apply({'layout':option,'expectedRevision':report['expectedRevision']}).status_code,200)
        stored=self.doc['subdivisionAreas'][0]['layout'];self.assertEqual([l['id'] for l in stored['lots']],[l['id'] for l in option['lots']])
        self.assertAlmostEqual(stored['derived']['categories']['green']['areaM2'],option['derived']['categories']['green']['areaM2'])
        if stored['zones']:self.assertTrue(stored['zones'][0]['automatic'])
