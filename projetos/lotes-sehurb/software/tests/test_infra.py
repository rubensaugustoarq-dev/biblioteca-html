import copy
import json
import unittest
from uuid import uuid4
from tempfile import TemporaryDirectory
from pathlib import Path
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store,DomainError
from services.engine.infra.domain import calculate,validate

def rect(x,y,w,h):return {'type':'Polygon','coordinates':[[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]}
def road(points=None):return {'id':str(uuid4()),'sourceEntityId':str(uuid4()),'sourceGeometry':rect(0,0,100,100),'kind':'road','name':'Via A','geometry':{'type':'LineString','coordinates':points or [[10,50],[90,50]]},'width':10,'sidewalkLeft':2,'sidewalkRight':3,'material':'asphalt','sidewalkMaterial':'concrete','clipToGleba':True}
class InfraTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(self.temp.name);self.doc=api.store.create('Infra','EPSG:31979',-67.81,-9.974);self.client=TestClient(api.app);self.pid=self.doc['project']['id'];self.source=str(uuid4());self.command('boundary.upsert',{'id':self.source,'name':'Gleba','geometry':rect(0,0,100,100)})
    def tearDown(self):api.store=self.previous;self.temp.cleanup()
    def command(self,kind,args):
        response=self.client.post(f'/api/projects/{self.pid}/commands',headers={'X-LSEHURB':'1'},json={'commandId':str(uuid4()),'expectedRevision':self.doc['project']['revision'],'type':kind,'parameters':args})
        if response.status_code==200:self.doc=response.json()
        return response
    def item(self,points=None):value=road(points);value['sourceEntityId']=self.source;return value
    def test_straight_asymmetric_section_and_exact_areas(self):
        values,total=calculate([road()]);derived=values[0]['derived'];self.assertAlmostEqual(derived['axisLengthM'],80);self.assertAlmostEqual(derived['pavementAreaM2'],800);self.assertAlmostEqual(derived['sidewalkAreaM2'],400)
        self.assertAlmostEqual(total['byMaterial']['asphalt'],800);self.assertAlmostEqual(total['byMaterial']['concrete'],400);self.assertAlmostEqual(total['totalAreaM2'],1200)
    def test_crossings_unions_and_sidewalk_priority(self):
        a,b=road(),road([[50,10],[50,90]]);_,total=calculate([a,b]);self.assertAlmostEqual(total['pavementAreaM2'],1500);self.assertAlmostEqual(total['totalAreaM2'],2175);self.assertAlmostEqual(total['sidewalkAreaM2'],675)
        _,same=calculate([a,{**a,'id':str(uuid4())}]);self.assertAlmostEqual(same['totalAreaM2'],1200)
    def test_clip_is_explicit_and_material_ownership(self):
        r=road([[-10,50],[110,50]]);v=validate(r);self.assertAlmostEqual(v['derived']['pavementAreaM2'],1000);self.assertAlmostEqual(v['derived']['sidewalkAreaM2'],500)
        self.assertAlmostEqual(validate({**r,'clipToGleba':False})['derived']['pavementAreaM2'],1200)
        _,mixed=calculate([road(),{**road(),'material':'brick'}]);self.assertAlmostEqual(mixed['totalAreaM2'],1200);self.assertAlmostEqual(mixed['byMaterial']['brick'],0)
        with self.assertRaises(DomainError):validate(road([[0,0],[10,10],[0,10],[10,0]]))
        with self.assertRaises(DomainError):validate({**road(),'width':float('nan')})
    def test_t_junction_and_material_partition(self):
        from shapely.geometry import shape
        a,b=road(),road([[50,50],[50,90]]);b['material']='brick';b['sidewalkMaterial']='brick'
        items,total=calculate([a,b]);self.assertAlmostEqual(total['pavementAreaM2'],1150)
        self.assertAlmostEqual(total['totalAreaM2'],total['pavementAreaM2']+total['sidewalkAreaM2'])
        self.assertAlmostEqual(sum(total['byMaterial'].values()),total['totalAreaM2'])
        regions=total['regions']
        for i,region in enumerate(regions):
            for other in regions[i+1:]:self.assertLess(shape(region['geometry']).intersection(shape(other['geometry'])).area,1e-7)
    def test_tangent_fillets_and_fixed_endpoints(self):
        from services.engine.infra.domain import rounded_axis
        for points in ([[10,10],[60,10],[60,60]],[[10,60],[60,60],[60,10]]):
            axis,length=rounded_axis(points,10)
            self.assertEqual(tuple(axis.coords[0]),tuple(points[0]));self.assertEqual(tuple(axis.coords[-1]),tuple(points[-1]))
            self.assertAlmostEqual(length,80+5*3.141592653589793)
            self.assertEqual(tuple(axis.coords[1]),(50.0,points[0][1]))
            self.assertLess(abs(axis.length-length),.02)
            value=validate({**road(points),'curveRadiusM':10});self.assertEqual(value['geometry']['coordinates'],tuple(tuple(p) for p in points));self.assertGreater(len(value['derived']['axisGeometry']['coordinates']),3)
        with self.assertRaises(DomainError):rounded_axis([[0,0],[10,0],[10,10]],11)
        with self.assertRaises(DomainError):rounded_axis([[0,0],[20,0],[20,10],[40,10]],6)
    def test_curves_persist_and_order_stays_stable(self):
        a=self.item([[10,10],[60,10],[60,60]]);a['curveRadiusM']=10
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        b=self.item([[10,50],[90,50]]);b['material']='brick'
        self.assertEqual(self.command('infra.upsert',b).status_code,200)
        a['name']='Via editada';self.assertEqual(self.command('infra.upsert',a).status_code,200)
        fresh=Store(self.temp.name).state(self.pid)
        self.assertEqual([v['id'] for v in fresh['infra']],[a['id'],b['id']]);self.assertEqual(fresh['infra'][0]['curveRadiusM'],10)
        before=copy.deepcopy(self.doc);a['curveRadiusM']=100
        self.assertEqual(self.command('infra.upsert',a).status_code,422);self.assertEqual(json.loads(json.dumps(api.store.state(self.pid))),before)
    def test_surface_containment_and_union(self):
        r=road();p={'id':str(uuid4()),'sourceEntityId':r['sourceEntityId'],'sourceGeometry':r['sourceGeometry'],'name':'Estacionamento','kind':'surface','material':'asphalt','geometry':rect(40,40,20,20)}
        _,total=calculate([r,p]);self.assertAlmostEqual(total['pavementAreaM2'],1000);self.assertAlmostEqual(total['sidewalkAreaM2'],300)
        self.assertAlmostEqual(validate({**p,'geometry':rect(90,90,20,20)})['derived']['pavementAreaM2'],400)
    def test_outside_geometry_and_optional_clipping(self):
        from shapely.geometry import shape
        r={**road([[110,50],[190,50]]),'clipToGleba':False}
        self.assertAlmostEqual(validate(r)['derived']['pavementAreaM2'],800)
        with self.assertRaises(DomainError):validate({**r,'clipToGleba':True})
        p={**road(),'kind':'surface','geometry':rect(90,90,20,20),'clipToGleba':True}
        result=validate(p);self.assertAlmostEqual(result['derived']['pavementAreaM2'],100)
        self.assertEqual(result['geometry'],p['geometry'])
        self.assertTrue(shape(p['sourceGeometry']).covers(shape(result['derived']['regions'][0]['geometry'])))
        self.assertAlmostEqual(validate({**p,'clipToGleba':False})['derived']['pavementAreaM2'],400)
        value={**self.item([[110,50],[190,50]]),'clipToGleba':False}
        self.assertEqual(self.command('infra.upsert',value).status_code,200)
        self.assertFalse(Store(self.temp.name).state(self.pid)['infra'][0]['clipToGleba'])
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['infra'],[])
    def test_local_concordance_and_three_point_arc(self):
        from services.engine.infra.domain import rounded_axis,three_point_axis
        pts=[[10,10],[60,10],[60,60],[90,60]]
        axis,length=rounded_axis(pts,0,{'1':10})
        self.assertIn((60.,60.),list(axis.coords));self.assertNotIn((60.,10.),list(axis.coords))
        for pts in ([[0,0],[10,10],[20,0]],[[0,0],[10,-10],[20,0]]):
            axis,length=three_point_axis(pts);self.assertAlmostEqual(length,10*3.141592653589793)
            self.assertIn(tuple(pts[1]),list(axis.coords));self.assertEqual(tuple(pts[0]),axis.coords[0]);self.assertEqual(tuple(pts[-1]),axis.coords[-1])
            a=validate({**road(pts),'curveType':'threePoint','clipToGleba':False});self.assertEqual(a['geometry']['coordinates'],tuple(tuple(p) for p in pts));self.assertGreater(len(a['derived']['axisGeometry']['coordinates']),3)
        with self.assertRaises(DomainError):three_point_axis([[0,0],[10,0],[20,0]])
        a={**self.item([[10,10],[60,10],[60,60],[90,60]]),'filletRadii':{'1':10},'curveRadiusM':0}
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        self.assertEqual(Store(self.temp.name).state(self.pid)['infra'][0]['filletRadii'],{'1':10.0})
    def test_start_end_direction_and_continuation(self):
        import math
        from services.engine.infra.domain import direction_arc
        from shapely.geometry import shape
        for angle,end_tangent,sign in ((90,270,1),(270,90,-1)):
            points,length,tangent=direction_arc([0,0],[20,0],angle)
            self.assertEqual(points[0],[0,0]);self.assertEqual(points[-1],[20,0]);self.assertAlmostEqual(length,10*math.pi);self.assertAlmostEqual(tangent,end_tangent)
            self.assertGreater(points[len(points)//2][1]*sign,9.9)
        points,length,tangent=direction_arc([0,0],[10,10],0)
        self.assertAlmostEqual(length,5*math.pi);self.assertAlmostEqual(tangent,90)
        with self.assertRaises(DomainError):direction_arc([0,0],[20,0],0)
        a={**self.item([[10,10],[30,10]]),'clipToGleba':False,'arcSegments':[{'index':0,'directionDegrees':90}]}
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        self.assertAlmostEqual(self.doc['infra'][0]['derived']['axisLengthM'],10*math.pi)
        before=self.doc['infraMetrics']['totalAreaM2']
        a['geometry']['coordinates'].append([30,-20])
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        self.assertAlmostEqual(self.doc['infra'][0]['derived']['axisLengthM'],10*math.pi+30)
        self.assertGreater(self.doc['infraMetrics']['totalAreaM2'],before)
        self.assertEqual(Store(self.temp.name).state(self.pid)['infra'][0]['arcSegments'],a['arcSegments'])
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertAlmostEqual(self.doc['infra'][0]['derived']['axisLengthM'],10*math.pi)
    def test_rebuild_existing_segment_and_reject_invalid_arc_atomically(self):
        a=self.item([[10,10],[40,10],[70,10]])
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        area=self.doc['infraMetrics']['totalAreaM2']
        a['arcSegments']=[{'index':0,'directionDegrees':60}]
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        self.assertGreater(self.doc['infraMetrics']['totalAreaM2'],area)
        self.assertEqual(self.doc['infra'][0]['geometry']['coordinates'],a['geometry']['coordinates'])
        saved=copy.deepcopy(self.doc)
        a['arcSegments'][0]['directionDegrees']=0
        self.assertEqual(self.command('infra.upsert',a).status_code,422);self.assertEqual(json.loads(json.dumps(api.store.state(self.pid))),saved)
    def test_edit_arc_curvature_keeps_endpoints_and_recalculates(self):
        a={**self.item([[10,10],[50,10]]),'clipToGleba':False,'arcSegments':[{'index':0,'directionDegrees':90}]}
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        initial=copy.deepcopy(self.doc);a['arcSegments'][0]['directionDegrees']=45
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        item=self.doc['infra'][0];self.assertEqual(item['geometry'],initial['infra'][0]['geometry'])
        self.assertEqual(item['derived']['axisGeometry']['coordinates'][0],[10.,10.]);self.assertEqual(item['derived']['axisGeometry']['coordinates'][-1],[50.,10.])
        self.assertLess(item['derived']['axisLengthM'],initial['infra'][0]['derived']['axisLengthM'])
        self.assertLess(self.doc['infraMetrics']['totalAreaM2'],initial['infraMetrics']['totalAreaM2'])
        self.assertEqual(Store(self.temp.name).state(self.pid)['infra'][0]['arcSegments'][0]['directionDegrees'],45)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['infra'][0]['arcSegments'][0]['directionDegrees'],90)
    def test_independent_curb_returns_and_global_areas(self):
        import math
        from shapely.geometry import shape
        main=road();branch=road([[50,50],[50,90]])
        _,plain=calculate([main,branch])
        branch['endpointRadii']={'startLeft':3,'startRight':9}
        items,rounded=calculate([main,branch]);returns=items[1]['derived']['endpointReturns']
        self.assertEqual([v['radiusM'] for v in returns],[3,9]);self.assertTrue(all(v['targetRoadId']==main['id'] for v in returns))
        self.assertAlmostEqual(rounded['pavementAreaM2']-plain['pavementAreaM2'],(3**2+9**2)*(1-math.pi/4),delta=.12)
        self.assertGreater(rounded['totalAreaM2'],plain['totalAreaM2'])
        self.assertAlmostEqual(rounded['totalAreaM2'],rounded['pavementAreaM2']+rounded['sidewalkAreaM2'])
        self.assertAlmostEqual(sum(rounded['byMaterial'].values()),rounded['totalAreaM2'])
        regions=rounded['regions']
        for i,r in enumerate(regions):
            for other in regions[i+1:]:self.assertLess(shape(r['geometry']).intersection(shape(other['geometry'])).area,1e-7)
        branch['endpointRadii']={'startLeft':0,'startRight':0};_,again=calculate([main,branch]);self.assertAlmostEqual(again['totalAreaM2'],plain['totalAreaM2'])
    def test_both_ends_standalone_angle_and_clip(self):
        from shapely.geometry import shape
        branch={**road([[10,30],[90,70]]),'clipToGleba':False,'endpointRadii':{'startLeft':3,'startRight':9,'endLeft':9,'endRight':3}}
        items,total=calculate([branch]);self.assertEqual(len(items[0]['derived']['endpointReturns']),4)
        for region in total['regions']:self.assertTrue(shape(region['geometry']).is_valid)
        branch={**road([[-5,50],[90,50]]),'endpointRadii':{'endLeft':9,'endRight':3},'clipToGleba':True}
        _,total=calculate([branch])
        for region in total['regions']:self.assertTrue(shape(branch['sourceGeometry']).covers(shape(region['geometry'])))
        with self.assertRaises(DomainError):calculate([{**road([[10,50],[15,50]]),'endpointRadii':{'startLeft':9}}])
        with self.assertRaises(DomainError):calculate([{**road(),'endpointRadii':{'startLeft':float('nan')}}])
    def test_angled_junction_returns_are_valid_and_increase_pavement(self):
        from shapely.geometry import shape
        main={**road([[10,30],[90,30]]),'clipToGleba':False}
        branch={**road([[50,30],[70,90]]),'clipToGleba':False}
        _,plain=calculate([main,branch]);branch['endpointRadii']={'startLeft':3,'startRight':9}
        values,total=calculate([main,branch]);self.assertGreater(total['pavementAreaM2'],plain['pavementAreaM2'])
        self.assertEqual(len(values[1]['derived']['endpointReturns']),2)
        self.assertTrue(all(shape(r['geometry']).is_valid for r in total['regions']))
        self.assertAlmostEqual(sum(total['byMaterial'].values()),total['totalAreaM2'])
    def test_curved_branch_return_uses_actual_edges_without_sliver(self):
        from shapely.geometry import shape,Point
        main={**road([[-50,0],[50,0]]),'width':7,'sidewalkLeft':3,'sidewalkRight':3,'clipToGleba':False}
        branch={**road([[0,0],[-4,22],[-34,68]]),'width':7,'sidewalkLeft':2,'sidewalkRight':2,'clipToGleba':False,'arcSegments':[{'index':0,'directionDegrees':81.4}]}
        original_branch=shape(validate(branch)['derived']['regions'][0]['geometry']);original_main=shape(validate(main)['derived']['regions'][0]['geometry'])
        branch['endpointRadii']={'startLeft':10,'startRight':10}
        items,total=calculate([main,branch]);result=items[1]['derived']
        self.assertEqual(shape(result['regions'][0]['geometry']).geom_type,'Polygon')
        for entry in result['endpointReturns']:
            curb=shape(entry['curbGeometry'])
            self.assertLess(original_branch.boundary.distance(Point(curb.coords[0])),1e-6)
            self.assertLess(original_main.boundary.distance(Point(curb.coords[-1])),1e-6)
            self.assertLess(shape(result['regions'][0]['geometry']).boundary.distance(Point(curb.coords[0])),.02)
        regions=total['regions']
        for i,r in enumerate(regions):
            self.assertTrue(shape(r['geometry']).is_valid)
            for other in regions[i+1:]:self.assertLess(shape(r['geometry']).intersection(shape(other['geometry'])).area,1e-7)
        self.assertAlmostEqual(total['pavementAreaM2']+total['sidewalkAreaM2'],total['totalAreaM2'])
    def test_standalone_returns_flare_sideways_but_stop_at_end_plane(self):
        from shapely.geometry import shape
        from shapely.ops import unary_union
        from services.engine.infra.domain import endpoint_halfplane
        for points,arcs in (([[10,50],[90,50]],[]),([[10,10],[40,30]],[{'index':0,'directionDegrees':15}])):
            base={**road(points),'width':7,'sidewalkLeft':2,'sidewalkRight':2,'clipToGleba':False,'arcSegments':arcs}
            original=validate(base);envelope=unary_union([shape(r['geometry']) for r in original['derived']['regions']]);axis=list(shape(original['derived']['axisGeometry']).coords)
            changed={**base,'endpointRadii':{'startLeft':10,'startRight':10,'endLeft':10,'endRight':3}}
            values,total=calculate([changed]);result=unary_union([shape(r['geometry']) for r in total['regions']]);added=result.difference(envelope)
            self.assertGreater(added.area,1)
            for end,neighbor in ((axis[0],axis[1]),(axis[-1],axis[-2])):
                import math
                length=math.dist(end,neighbor);u=((neighbor[0]-end[0])/length,(neighbor[1]-end[1])/length)
                self.assertLess(added.difference(endpoint_halfplane(end,u,1000)).area,1e-5)
            components=list(result.geoms) if result.geom_type=='MultiPolygon' else [result]
            self.assertEqual(sum(part.area>1e-5 for part in components),1)
            self.assertLess(sum(part.area for part in components if part.area<=1e-5),1e-5)
            self.assertTrue(all(r['limitedToEndPlane'] for r in values[0]['derived']['endpointReturns']))
    def test_flared_end_outside_gleba_is_computed_before_clipping(self):
        from shapely.geometry import shape
        base={**road([[-5,50],[90,50]]),'clipToGleba':True,'endpointRadii':{'startLeft':10,'startRight':3}}
        _,total=calculate([base])
        self.assertGreater(total['pavementAreaM2'],0)
        for region in total['regions']:self.assertTrue(shape(base['sourceGeometry']).covers(shape(region['geometry'])))
    def test_endpoint_radii_persistence_recalculation_and_history(self):
        main=self.item();branch=self.item([[50,50],[50,90]])
        self.assertEqual(self.command('infra.upsert',main).status_code,200);self.assertEqual(self.command('infra.upsert',branch).status_code,200)
        before=self.doc['infraMetrics']['pavementAreaM2'];branch['endpointRadii']={'startLeft':3,'startRight':9}
        self.assertEqual(self.command('infra.upsert',branch).status_code,200);self.assertGreater(self.doc['infraMetrics']['pavementAreaM2'],before)
        fresh=Store(self.temp.name).state(self.pid);self.assertEqual(fresh['infra'][1]['endpointRadii']['startRight'],9)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertAlmostEqual(self.doc['infraMetrics']['pavementAreaM2'],before)
        self.assertEqual(self.command('redo',{}).status_code,200);self.assertGreater(self.doc['infraMetrics']['pavementAreaM2'],before)
    def test_unpaved_road_representation_without_paving_quantities(self):
        from shapely.geometry import shape
        earth={**road(),'material':'earth','sidewalkLeft':0,'sidewalkRight':0}
        values,total=calculate([earth]);self.assertAlmostEqual(values[0]['derived']['unpavedAreaM2'],800)
        self.assertEqual(values[0]['derived']['pavementAreaM2'],0);self.assertEqual(total['pavementAreaM2'],0);self.assertEqual(total['sidewalkAreaM2'],0);self.assertEqual(total['totalAreaM2'],0)
        self.assertAlmostEqual(total['unpavedAreaM2'],800);self.assertEqual(total['regions'][0]['role'],'unpaved')
        paved={**road([[50,10],[50,90]]),'sidewalkLeft':0,'sidewalkRight':0}
        _,mixed=calculate([earth,paved]);self.assertAlmostEqual(mixed['pavementAreaM2'],800);self.assertAlmostEqual(mixed['unpavedAreaM2'],700)
        for i,r in enumerate(mixed['regions']):
            for other in mixed['regions'][i+1:]:self.assertLess(shape(r['geometry']).intersection(shape(other['geometry'])).area,1e-7)
        with self.assertRaises(DomainError):validate({**earth,'sidewalkMaterial':'earth'})
    def test_unpaved_persistence_and_conversion_to_asphalt(self):
        earth={**self.item(),'material':'earth','sidewalkLeft':0,'sidewalkRight':0,'endpointRadii':{'startLeft':3}}
        self.assertEqual(self.command('infra.upsert',earth).status_code,200);self.assertEqual(self.doc['infraMetrics']['pavementAreaM2'],0)
        self.assertEqual(Store(self.temp.name).state(self.pid)['infra'][0]['material'],'earth')
        earth['material']='asphalt';self.assertEqual(self.command('infra.upsert',earth).status_code,200);self.assertGreater(self.doc['infraMetrics']['pavementAreaM2'],0)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['infraMetrics']['pavementAreaM2'],0)
    def test_numeric_slivers_excluded_but_real_small_polygons_preserved(self):
        from shapely.geometry import shape,GeometryCollection,LineString,Polygon
        from services.engine.infra.domain import measurable_surface
        sidewalk=shape(rect(0,0,20,2));thin=shape(rect(30,0,10,.0000005))
        small=Polygon([[50,0],[50.001,0],[50,.001],[50,0]])
        geometry=measurable_surface(GeometryCollection([sidewalk,thin,small,LineString([[60,0],[70,0]])]))
        self.assertAlmostEqual(geometry.area,sidewalk.area+small.area)
        self.assertTrue(geometry.covers(small));self.assertTrue(geometry.intersection(thin).is_empty)
        values,total=calculate([{**road([[10,10],[40,30]]),'clipToGleba':False,'arcSegments':[{'index':0,'directionDegrees':15}],'endpointRadii':{'startLeft':10,'startRight':10,'endLeft':10,'endRight':3}}])
        for region in total['regions']:
            g=shape(region['geometry']);self.assertIn(g.geom_type,('Polygon','MultiPolygon'))
            pieces=list(g.geoms) if hasattr(g,'geoms') else [g]
            self.assertFalse(any(p.area<=1e-5 and p.area/max(p.length,1e-12)<=1e-6 for p in pieces))
        self.assertAlmostEqual(sum(total['byMaterial'].values()),total['totalAreaM2'])
    def test_culdesac_three_positions_and_union_quantities(self):
        from shapely.geometry import shape
        original={**road([[10,50],[70,50]]),'width':7,'sidewalkLeft':2,'sidewalkRight':2,'clipToGleba':False}
        _,plain=calculate([original]);totals={}
        for position,sign in (('left',1),('center',0),('right',-1)):
            value={**original,'culDeSac':{'enabled':True,'position':position,'radiusM':5}}
            items,total=calculate([value]);info=items[0]['derived']['culDeSac'];totals[position]=total
            self.assertEqual(info['center'],(70.0,50.0+sign*1.5));self.assertEqual(info['outerRadiusM'],7)
            self.assertGreater(total['pavementAreaM2'],plain['pavementAreaM2']);self.assertGreater(total['sidewalkAreaM2'],plain['sidewalkAreaM2'])
            self.assertAlmostEqual(total['pavementAreaM2']+total['sidewalkAreaM2'],total['totalAreaM2'])
            self.assertEqual(shape(items[0]['derived']['regions'][0]['geometry']).geom_type,'Polygon')
            for i,r in enumerate(total['regions']):
                self.assertTrue(shape(r['geometry']).is_valid)
                for other in total['regions'][i+1:]:self.assertLess(shape(r['geometry']).intersection(shape(other['geometry'])).area,1e-7)
        self.assertAlmostEqual(totals['left']['totalAreaM2'],totals['right']['totalAreaM2'],delta=1e-4)
        _,duplicated=calculate([{**original,'culDeSac':{'enabled':True,'position':'center','radiusM':5}},{**original,'id':str(uuid4()),'culDeSac':{'enabled':True,'position':'center','radiusM':5}}])
        self.assertAlmostEqual(duplicated['totalAreaM2'],totals['center']['totalAreaM2'])
    def test_culdesac_prohibits_missing_sidewalks_and_earth(self):
        base={**road(),'culDeSac':{'enabled':True,'position':'center','radiusM':8}}
        for change in ({'sidewalkLeft':0},{'sidewalkRight':0},{'material':'earth'},{'culDeSac':{'enabled':True,'position':'center','radiusM':2}}):
            with self.assertRaises(DomainError):calculate([{**base,**change}])
        a={**self.item(),'culDeSac':{'enabled':True,'position':'left','radiusM':8}}
        self.assertEqual(self.command('infra.upsert',a).status_code,200);saved=copy.deepcopy(self.doc);a['sidewalkLeft']=0
        self.assertEqual(self.command('infra.upsert',a).status_code,422);self.assertEqual(json.loads(json.dumps(api.store.state(self.pid))),saved)
    def test_culdesac_persistence_radius_and_clipping(self):
        from shapely.geometry import shape
        a={**self.item([[10,50],[90,50]]),'culDeSac':{'enabled':True,'position':'right','radiusM':8},'clipToGleba':True}
        self.assertEqual(self.command('infra.upsert',a).status_code,200);before=self.doc['infraMetrics']['totalAreaM2']
        self.assertEqual(Store(self.temp.name).state(self.pid)['infra'][0]['culDeSac']['position'],'right')
        a['culDeSac']['radiusM']=15;self.assertEqual(self.command('infra.upsert',a).status_code,200);self.assertGreater(self.doc['infraMetrics']['totalAreaM2'],before)
        for r in self.doc['infraMetrics']['regions']:self.assertTrue(shape(a['sourceGeometry']).covers(shape(r['geometry'])))
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['infra'][0]['culDeSac']['radiusM'],8)
        self.assertEqual(self.command('redo',{}).status_code,200);self.assertEqual(self.doc['infra'][0]['culDeSac']['radiusM'],15)
        a['culDeSac']['enabled']=False;self.assertEqual(self.command('infra.upsert',a).status_code,200);self.assertLess(self.doc['infraMetrics']['totalAreaM2'],before)
    def test_culdesac_independent_entry_concordances(self):
        from shapely.geometry import shape
        base={**road([[10,50],[90,50]]),'width':7,'sidewalkLeft':2,'sidewalkRight':2,'clipToGleba':False,'culDeSac':{'enabled':True,'position':'right','radiusM':8,'transitionLeftM':3,'transitionRightM':3}}
        values,plain=calculate([base]);info=values[0]['derived']['culDeSac']['transitions'];self.assertFalse(info['left']['editable']);self.assertEqual(info['left']['radiusM'],0);self.assertTrue(info['right']['editable'])
        changed=copy.deepcopy(base);changed['culDeSac']['transitionLeftM']=80
        _,unused=calculate([changed]);self.assertAlmostEqual(unused['totalAreaM2'],plain['totalAreaM2'])
        changed['culDeSac']['transitionRightM']=12;values,expanded=calculate([changed]);self.assertGreater(expanded['pavementAreaM2'],plain['pavementAreaM2']);self.assertEqual(values[0]['culDeSac']['radiusM'],8)
        changed['culDeSac'].update(position='left',transitionLeftM=12,transitionRightM=3);values,left=calculate([changed]);self.assertEqual(values[0]['derived']['culDeSac']['transitions']['right']['radiusM'],0);self.assertAlmostEqual(left['totalAreaM2'],expanded['totalAreaM2'],delta=1e-4)
        changed['culDeSac'].update(position='center',transitionLeftM=3,transitionRightM=9);values,total=calculate([changed]);self.assertTrue(all(v['editable'] for v in values[0]['derived']['culDeSac']['transitions'].values()))
        self.assertEqual(values[0]['derived']['culDeSac']['transitions']['left']['radiusM'],3);self.assertEqual(values[0]['derived']['culDeSac']['transitions']['right']['radiusM'],9)
        for r in total['regions']:self.assertTrue(shape(r['geometry']).is_valid)
    def test_road_dimensions_follow_arcs_fillets_and_returns(self):
        import math
        from shapely.geometry import shape
        straight=road([[10,50],[40,50],[90,50]])
        items,_=calculate([straight]);dims=items[0]['derived']['dimensions']
        self.assertEqual([(d['from'],d['to'],d['lengthM']) for d in dims],[(1,2,30),(2,3,50)])
        curved={**road([[10,50],[30,70]]),'clipToGleba':False,'arcSegments':[{'index':0,'directionDegrees':0}]}
        items,_=calculate([curved]);d=items[0]['derived']['dimensions'][0]
        self.assertAlmostEqual(d['lengthM'],10*math.pi)
        self.assertGreater(len(d['geometry']['coordinates']),2)
        self.assertGreater(d['lengthM'],math.dist(*curved['geometry']['coordinates']))
        fillet={**road([[10,10],[60,10],[60,60]]),'curveRadiusM':10}
        items,_=calculate([fillet]);axis_dims=items[0]['derived']['dimensions']
        self.assertEqual(len(axis_dims),2)
        self.assertAlmostEqual(sum(d['lengthM'] for d in axis_dims),items[0]['derived']['axisLengthM'])
        branch={**road([[50,50],[50,90]]),'endpointRadii':{'startLeft':3,'startRight':9}}
        items,_=calculate([road(),branch]);curbs=[d for d in items[1]['derived']['dimensions'] if d['kind']=='curb']
        self.assertEqual(len(curbs),2)
        self.assertTrue(all(d['lengthM']>0 and shape(d['geometry']).is_valid for d in curbs))

    def test_left_culdesac_tangent_has_no_numeric_needle(self):
        from shapely.geometry import shape,Point,Polygon
        from services.engine.infra.domain import remove_curb_needles
        from unittest.mock import patch
        value={**road([[626184.3508299508,8900101.161668748],[626180.4963765999,8900122.756037146],[626150.1287323856,8900168.61681694]]),
            'width':7,'sidewalkLeft':2,'sidewalkRight':2,'clipToGleba':False,
            'arcSegments':[{'index':0,'directionDegrees':81.40692990783388}],
            'culDeSac':{'enabled':True,'position':'left','radiusM':5,'transitionLeftM':7,'transitionRightM':8.5}}
        items,total=calculate([value]);surface=shape(items[0]['derived']['regions'][0]['geometry'])
        tip=Point(626149.7396597,8900162.864981)
        self.assertGreater(surface.boundary.distance(tip),.5)
        with patch('services.engine.infra.domain.remove_curb_needles',lambda g:g):
            _,before=calculate([value])
        self.assertAlmostEqual(total['pavementAreaM2'],before['pavementAreaM2'],delta=1e-5)
        self.assertAlmostEqual(total['sidewalkAreaM2'],before['sidewalkAreaM2'],delta=1e-4)
        self.assertAlmostEqual(total['totalAreaM2'],total['pavementAreaM2']+total['sidewalkAreaM2'])
        genuine=Polygon([[0,0],[2,0],[2,1],[1,1.1],[0,1]])
        self.assertTrue(remove_curb_needles(genuine).equals_exact(genuine,0))

    def test_culdesac_entry_radius_limit_and_history(self):
        a={**self.item([[10,50],[90,50]]),'culDeSac':{'enabled':True,'position':'center','radiusM':8,'transitionLeftM':3,'transitionRightM':9}}
        self.assertEqual(self.command('infra.upsert',a).status_code,200)
        self.assertEqual(Store(self.temp.name).state(self.pid)['infra'][0]['culDeSac']['transitionRightM'],9)
        a['culDeSac']['transitionRightM']=12;self.assertEqual(self.command('infra.upsert',a).status_code,200)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(self.doc['infra'][0]['culDeSac']['transitionRightM'],9)
        short={**road([[10,50],[20,50]]),'width':7,'culDeSac':{'enabled':True,'position':'center','radiusM':8,'transitionLeftM':100,'transitionRightM':100}}
        with self.assertRaises(DomainError):calculate([short])
    def test_save_reopen_history_and_study_enl_isolation(self):
        before=copy.deepcopy(self.doc['entities']);value=self.item();self.assertEqual(self.command('infra.upsert',value).status_code,200);self.assertEqual(len(self.doc['infra']),1);self.assertEqual(self.doc['entities'],[{**before[0],'revision':self.doc['project']['revision']}]);self.assertEqual(self.doc['enl'],[])
        fresh=Store(self.temp.name).state(self.pid);self.assertEqual(fresh['infra'][0]['id'],value['id']);self.assertAlmostEqual(fresh['infraMetrics']['totalAreaM2'],1200)
        value['width']=12;self.assertEqual(self.command('infra.upsert',value).status_code,200);self.assertAlmostEqual(self.doc['infraMetrics']['pavementAreaM2'],960)
        self.assertEqual(self.command('undo',{}).status_code,200);self.assertAlmostEqual(self.doc['infraMetrics']['pavementAreaM2'],800)
        self.assertEqual(self.command('redo',{}).status_code,200);self.assertAlmostEqual(self.doc['infraMetrics']['pavementAreaM2'],960)
        self.assertEqual(self.command('infra.delete',{'id':value['id']}).status_code,200);self.assertEqual(self.doc['infra'],[]);self.assertEqual(self.command('undo',{}).status_code,200);self.assertEqual(len(self.doc['infra']),1)
        parent=Path(self.temp.name)/'copia';parent.mkdir();api.store.save_as(self.pid,parent,self.doc['project']['revision']);self.assertEqual(len(api.store.state(self.pid)['infra']),1)
    def test_rejected_command_atomic_and_source_copy_survives(self):
        value=self.item();self.assertEqual(self.command('infra.upsert',value).status_code,200);before=copy.deepcopy(self.doc)
        bad=self.item();bad['width']=0;self.assertEqual(self.command('infra.upsert',bad).status_code,422);self.assertEqual(json.loads(json.dumps(api.store.state(self.pid))),before)
        self.assertEqual(self.command('boundary.upsert',{'id':self.source,'name':'Gleba alterada','geometry':rect(0,0,20,20)}).status_code,200);self.assertAlmostEqual(self.doc['infraMetrics']['totalAreaM2'],1200)
        self.assertEqual(self.command('entity.delete',{'id':self.source}).status_code,200);self.assertAlmostEqual(Store(self.temp.name).state(self.pid)['infraMetrics']['totalAreaM2'],1200)
if __name__=='__main__':unittest.main()
