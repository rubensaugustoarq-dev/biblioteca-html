import copy
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from shapely.geometry import shape,Polygon,Point,mapping,LineString
from shapely.ops import unary_union
from services.engine import api
from services.engine.store import Store,DomainError
from services.engine.infra.domain import calculate
from services.engine.accessibility.domain import candidate,derive,placement
from tests import test_infra as fixtures
from tests.test_infra import road

def host():
    return {**road([[0,0],[100,0]]),'clipToGleba':False,'sidewalkLeft':4,'sidewalkRight':2}

def ramp(r,**changes):
    return {'id':str(uuid4()),'roadId':r['id'],'name':'Rampa','kind':'straight','side':'left','anchor':[50,6],
            'heightM':.15,'widthM':1.5,'slopePercent':8,'flankSlopePercent':8,'crossSlopePercent':2,**changes}

class AccessibilityGeometryTests(unittest.TestCase):
    def test_straight_normative_failures_are_warnings_but_physical_fit_is_required(self):
        r={**host(),'sidewalkLeft':2};items,m=calculate([r]);before=copy.deepcopy(m)
        value=placement(ramp(r),items,m)
        self.assertEqual(value['derived']['status'],'dimensioned');self.assertEqual(value['derived']['normativeStatus'],'outside')
        self.assertTrue(any('Faixa livre' in message for message in value['derived']['warnings']))
        self.assertTrue(shape(value['derived']['geometry']).is_valid);self.assertEqual(m,before)
        for changes in ({'widthM':1.19},{'slopePercent':8.34},{'crossSlopePercent':3.01},{'flankSlopePercent':8.1},{'sideRunM':.5}):
            warning=candidate(ramp(r,**changes),items,m)
            self.assertEqual(warning['derived']['normativeStatus'],'outside');self.assertTrue(warning['derived']['warnings'])
        too_narrow={**r,'sidewalkLeft':.5};a,b=calculate([too_narrow])
        with self.assertRaisesRegex(DomainError,'não cabe integralmente'):placement(ramp(too_narrow,anchor=[50,5.25]),a,b)
    def test_straight_flares_widen_at_street_and_taper_into_sidewalk_on_both_sides(self):
        r={**host(),'sidewalkRight':4};items,m=calculate([r]);before=copy.deepcopy(m)
        for side,sign in (('left',1),('right',-1)):
            value=candidate(ramp(r,side=side,anchor=[50,sign*6],sideRunM=2),items,m)
            g=shape(value['derived']['geometry']);run=value['derived']['runM'];curb=sign*5
            front=g.intersection(LineString([[0,curb+sign*1e-5],[100,curb+sign*1e-5]])).length
            back=g.intersection(LineString([[0,curb+sign*(run-1e-5)],[100,curb+sign*(run-1e-5)]])).length
            self.assertAlmostEqual(front,5.5,delta=.0001);self.assertAlmostEqual(back,1.5,delta=.0001)
            self.assertAlmostEqual(g.area,run*(1.5+2),places=5)
            self.assertEqual(derive([value],items,m)[0]['derived']['geometry'],value['derived']['geometry'])
        self.assertEqual(m,before)
    def test_micrometre_band_gaps_do_not_fragment_a_continuous_curb(self):
        r=host();items,m=calculate([r])
        bottom=[(x,5+(3e-6 if (x//5)%2 else 0)) for x in range(0,101,5)]
        left=Polygon([*bottom,(100,9),(0,9)]);right=Polygon([(0,-7),(100,-7),(100,-5),(0,-5)])
        g=mapping(unary_union([left,right]))
        for region in items[0]['derived']['regions']:
            if region['role']=='sidewalk':region['geometry']=g
        for region in m['regions']:
            if region['role']=='sidewalk':region['geometry']=g
        before=copy.deepcopy((items,m))
        value=candidate(ramp(r,kind='longitudinal',slopePercent=5,flankSlopePercent=5,anchor=[50,6]),items,m)
        self.assertEqual(value['derived']['totalLengthM'],7.5)
        walk=shape(g);self.assertLess(shape(value['derived']['geometry']).difference(walk).area,2e-4)
        self.assertEqual((items,m),before)
    def test_closed_curb_start_is_not_a_physical_end(self):
        r=host();disk=Point(0,0).buffer(50,quad_segs=256);walk=disk.buffer(4).difference(disk)
        region={'role':'sidewalk','geometry':mapping(walk)}
        r['derived']={'axisGeometry':mapping(LineString([[-100,0],[100,0]])),'regions':[region]}
        m={'regions':[region,{'role':'pavement','geometry':mapping(disk)}]}
        value=candidate(ramp(r,heightM=.01,anchor=[51,0]),[r],m)
        self.assertTrue(shape(value['derived']['geometry']).is_valid)
    def test_real_short_sidewalk_still_rejected_with_distinct_width_and_length(self):
        r={**host(),'geometry':{'type':'LineString','coordinates':[[0,0],[6,0]]},'sidewalkLeft':2.3}
        items,m=calculate([r])
        with self.assertRaisesRegex(DomainError,'7.50 m') as caught:
            candidate(ramp(r,kind='longitudinal',slopePercent=5,flankSlopePercent=5,anchor=[3,6]),items,m)
        self.assertIn('largura de 2.30',str(caught.exception))
    def test_edit_side_lengths_recalculates_geometry_without_changing_height(self):
        r=host();items,m=calculate([r]);before=copy.deepcopy(m)
        for length in (1.8,2.4,4):
            value=placement(ramp(r,sideRunM=length),items,m)
            self.assertEqual(value['heightM'],.15);self.assertEqual(value['sideRunM'],length)
            self.assertAlmostEqual(value['derived']['sideRunM'],length);self.assertAlmostEqual(value['flankSlopePercent'],round(15/length,2))
            self.assertAlmostEqual(value['derived']['totalLengthM'],1.5+2*length)
            self.assertEqual(derive([value],items,m)[0]['sideRunM'],length)
        long=placement(ramp(r,kind='longitudinal',sideRunM=1.8,heightM=.09),items,m)
        self.assertEqual(long['heightM'],.09);self.assertEqual(long['slopePercent'],5);self.assertEqual(long['derived']['runM'],1.8)
        with self.assertRaisesRegex(DomainError,'8.33%'):
            placement(ramp(r,kind='longitudinal',sideRunM=1.8),items,m)
        self.assertEqual(m,before)
        with self.assertRaises(DomainError):placement(ramp(r,sideRunM=0),items,m)
    def test_automatic_host_side_parameters_and_cursor_tolerance(self):
        a=host();b={**host(),'geometry':{'type':'LineString','coordinates':[[0,30],[100,30]]}}
        items,m=calculate([a,b]);before=copy.deepcopy(m)
        for anchor,road_id,side,kind,slope in (([50,6],a['id'],'left','straight',8.33),([50,-6],a['id'],'right','longitudinal',5),([50,36],b['id'],'left','straight',8.33)):
            value=placement({**ramp(a,anchor=anchor,kind=kind),'roadId':'','side':'wrong','slopePercent':8,'crossSlopePercent':99},items,m)
            self.assertEqual((value['roadId'],value['side']),(road_id,side));self.assertEqual(value['slopePercent'],slope);self.assertEqual(value['crossSlopePercent'],2)
            self.assertAlmostEqual(value['derived']['runM'],15/slope)
        snapped=placement(ramp(a,anchor=[50,9.1]),items,m,.2);self.assertLessEqual(snapped['anchor'][1],9)
        with self.assertRaises(DomainError):placement(ramp(a,anchor=[50,0]),items,m,1.5)
        zero={**host(),'sidewalkLeft':0,'sidewalkRight':0};i,t=calculate([zero])
        with self.assertRaises(DomainError):placement(ramp(zero),i,t,1.5)
        self.assertEqual(m,before)
    def test_automatic_curved_host_and_overlap_rejection(self):
        r={**host(),'arcSegments':[{'index':0,'directionDegrees':20}]};items,m=calculate([r]);axis=shape(items[0]['derived']['axisGeometry']);mid=axis.interpolate(axis.length/2)
        value=placement(ramp(r,anchor=[mid.x,mid.y+6]),items,m)
        self.assertTrue(shape(value['derived']['geometry']).is_valid)
        with self.assertRaisesRegex(DomainError,'sobrepõe'):placement({**value,'id':str(uuid4())},items,{**m,'_ramps':[value]})
    def test_models_inside_sidewalk_and_quantities_unchanged(self):
        r=host();items,metrics=calculate([r]);before=copy.deepcopy(metrics)
        for values in (ramp(r),ramp(r,kind='longitudinal',side='right',anchor=[50,-6],slopePercent=5,flankSlopePercent=5)):
            result=candidate(values,items,metrics);g=shape(result['derived']['geometry'])
            walk=unary_union([shape(p['geometry']) for p in metrics['regions'] if p['role']=='sidewalk'])
            pavement=unary_union([shape(p['geometry']) for p in metrics['regions'] if p['role']=='pavement'])
            self.assertLess(g.difference(walk).area,1e-7);self.assertLess(g.intersection(pavement).area,1e-7)
            self.assertEqual(len(result['derived']['parts']),3)
            self.assertAlmostEqual(result['derived']['runM'],.15*100/values['slopePercent'])
        self.assertEqual(metrics,before)
    def test_invalid_dimensions_and_missing_sidewalk(self):
        r=host();items,m=calculate([r])
        for changes in ({'kind':'longitudinal','slopePercent':5.1},{'heightM':float('nan')},
                        {'anchor':[50,0]},{'anchor':[50,-6]},{'anchor':[.1,6]}, {'widthM':0}):
            with self.subTest(changes=changes),self.assertRaises(DomainError):candidate(ramp(r,**changes),items,m)
        for kind in ('straight','longitudinal'):
            a={**r,'sidewalkLeft':0};i,m=calculate([a])
            with self.assertRaisesRegex(DomainError,'sem calçada'):candidate(ramp(a,kind=kind),i,m)
    def test_curved_host_and_junction_do_not_clip_invalid_footprints(self):
        r={**host(),'geometry':{'type':'LineString','coordinates':[[0,0],[100,0]]},'arcSegments':[{'index':0,'directionDegrees':20}]}
        items,m=calculate([r]);axis=shape(items[0]['derived']['axisGeometry']);mid=axis.interpolate(axis.length/2)
        # At the crown this arc has a horizontal tangent and its left sidewalk lies north.
        values=ramp(r,anchor=[mid.x,mid.y+6]);result=candidate(values,items,m)
        self.assertTrue(shape(result['derived']['geometry']).is_valid)
        branch={**host(),'id':str(uuid4()),'geometry':{'type':'LineString','coordinates':[[50,0],[50,50]]}}
        items,m=calculate([host(),branch]);primary=items[0]
        with self.assertRaises(DomainError):candidate(ramp(primary,anchor=[50,6]),items,m)
    def test_host_change_retains_invalid_ramp_identity(self):
        r=host();items,m=calculate([r]);value=candidate(ramp(r),items,m)
        changed,metrics=calculate([{**r,'sidewalkLeft':0}]);result=derive([value],changed,metrics)[0]
        self.assertEqual(result['id'],value['id']);self.assertEqual(result['derived']['status'],'invalid')
        self.assertIsNone(result['derived']['geometry']);self.assertEqual(derive([value],[],{'regions':[]})[0]['derived']['status'],'invalid')

class AccessibilityAutomaticRoute(unittest.TestCase):
    def test_preview_route_readonly_and_explicit_saved_link(self):
        with TemporaryDirectory(dir='tests/evidence') as directory:
            previous=api.store;api.store=Store(directory)
            try:
                doc=api.store.create('Rampas automáticas','EPSG:31979',-67.81,-9.974);pid=doc['project']['id']
                def command(kind,args):
                    nonlocal doc
                    doc=api.store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
                source=str(uuid4());command('boundary.upsert',{'id':source,'name':'Gleba','geometry':fixtures.rect(0,0,100,100)})
                r={**host(),'sidewalkLeft':2,'sourceEntityId':source};command('infra.upsert',r);before=copy.deepcopy(doc)
                value=api.accessibility_preview(pid,{'expectedRevision':doc['project']['revision'],'autoHost':True,'ramp':ramp(r,roadId='',anchor=[50,6],sideRunM=2.4)})
                self.assertEqual(value['slopePercent'],8.33);self.assertEqual(json.loads(json.dumps(api.store.state(pid))),json.loads(json.dumps(before)))
                command('accessibility.upsert',value);self.assertEqual(doc['accessibility'][0]['roadId'],r['id']);self.assertEqual(doc['infraMetrics'],before['infraMetrics'])
                self.assertEqual(doc['accessibility'][0]['derived']['normativeStatus'],'outside')
                destination=Path(directory)/'Copia';destination.mkdir();api.store.save_as(pid,destination,doc['project']['revision'])
                command('undo',{});self.assertEqual(doc['accessibility'],[])
                command('redo',{});self.assertEqual(doc['accessibility'][0]['id'],value['id'])
                reopened=Store(directory).state(pid)['accessibility'][0]
                self.assertEqual(reopened['id'],value['id']);self.assertEqual(reopened['sideRunM'],2.4)
                self.assertEqual(reopened['derived']['warnings'],value['derived']['warnings']);self.assertEqual(reopened['derived']['normativeStatus'],'outside')
            finally:api.store=previous

class AccessibilityCommands(unittest.TestCase):
    setUp=fixtures.InfraTests.setUp
    tearDown=fixtures.InfraTests.tearDown
    command=fixtures.InfraTests.command
    def prepare(self):
        self.road={**host(),'sourceEntityId':self.source}
        response=self.command('infra.upsert',self.road);self.assertEqual(response.status_code,200,response.text)
        return ramp(self.road)
    def test_preview_history_save_as_delete_and_quantity_invariance(self):
        value=self.prepare();before=copy.deepcopy(self.doc)
        response=self.client.post(f'/api/projects/{self.pid}/accessibility/preview',headers={'X-LSEHURB':'1'},json={'expectedRevision':self.doc['project']['revision'],'ramp':value})
        self.assertEqual(response.status_code,200,response.text);self.assertEqual(json.loads(json.dumps(api.store.state(self.pid))),before)
        response=self.command('accessibility.upsert',value);self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.doc['infraMetrics'],before['infraMetrics']);self.assertEqual(self.doc['entities'][0]['geometry'],before['entities'][0]['geometry'])
        saved=copy.deepcopy(self.doc['accessibility']);self.assertEqual(len(saved),1)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['accessibility'],[])
        self.assertEqual(self.command('redo',{}).status_code,200);self.assertEqual(self.doc['accessibility'],saved)
        destination=Path(self.temp.name)/'Copia';destination.mkdir();api.store.save_as(self.pid,destination,self.doc['project']['revision'])
        self.assertEqual(json.loads(json.dumps(Store(api.store.root).state(self.pid)['accessibility'])),saved)
        self.assertEqual(self.command('accessibility.delete',{'id':value['id']}).status_code,200);self.assertEqual(self.doc['accessibility'],[])
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['accessibility'],saved)
    def test_overlap_and_stale_preview_atomic_and_host_edit_invalidation(self):
        value=self.prepare();self.assertEqual(self.command('accessibility.upsert',value).status_code,200)
        before=copy.deepcopy(self.doc)
        self.assertEqual(self.command('accessibility.upsert',{**value,'id':str(uuid4())}).status_code,422)
        self.assertEqual(json.loads(json.dumps(api.store.state(self.pid))),before)
        response=self.client.post(f'/api/projects/{self.pid}/accessibility/preview',headers={'X-LSEHURB':'1'},json={'expectedRevision':0,'ramp':value})
        self.assertEqual(response.status_code,409)
        self.assertEqual(self.command('infra.upsert',{**self.road,'sidewalkLeft':0}).status_code,200)
        self.assertEqual(self.doc['accessibility'][0]['derived']['status'],'invalid')
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['accessibility'][0]['derived']['status'],'dimensioned')

if __name__=='__main__':unittest.main()

