import copy
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
from shapely.geometry import shape,LineString
from services.engine import api
from services.engine.store import Store,DomainError
from services.engine.infra.domain import calculate
from services.engine.accessibility.domain import candidate as ramp_candidate
from services.engine.accessibility.elements import candidate,derive,totals
from tests.test_accessibility import host,ramp
from tests.test_infra import rect

def element(kind,**kw):
    return {'id':str(uuid4()),'kind':kind,'name':'Teste','anchor':[50,6],'widthM':.5 if kind=='tactileWarning' else .25 if kind=='tactileDirectional' else 2.4 if kind=='vehicleAccess' else 4,'color':'#e6c64a',**kw}

class AccessibilityElements(unittest.TestCase):
    def test_directional_wraps_culdesac_without_axis_side_break(self):
        for position in ('left','center','right'):
            r={**host(),'width':7,'sidewalkLeft':2,'sidewalkRight':2,
               'culDeSac':{'enabled':True,'position':position,'radiusM':8}}
            infra,m=calculate([r]);original=copy.deepcopy((infra,m))
            a=candidate(element('tactileDirectional',anchor=[40,4.5],pathMode='automatic'),infra,m)
            b=candidate(element('tactileDirectional',anchor=[40,-4.5],pathMode='automatic'),infra,m)
            route=shape(a['derived']['axisGeometry'])
            self.assertEqual(route.geom_type,'LineString')
            self.assertGreater(route.length,220)
            self.assertLess(route.bounds[1],-4);self.assertGreater(route.bounds[3],4)
            self.assertTrue(route.equals_exact(shape(b['derived']['axisGeometry']),1e-7))
            # Both sidewalk ramps reserve their space in this single route.
            ramps=[ramp_candidate(ramp(r,side=side,anchor=[40,y],kind='longitudinal',slopePercent=5,flankSlopePercent=5),infra,m)
                   for side,y in [('left',4.5),('right',-4.5)]]
            cut=candidate(element('tactileDirectional',anchor=[40,4.5],pathMode='automatic'),infra,m,ramps)
            self.assertLess(cut['derived']['lengthM'],a['derived']['lengthM'])
            for q in ramps:self.assertEqual(shape(cut['derived']['geometry']).intersection(shape(q['derived']['geometry'])).area,0)
            self.assertEqual((infra,m),original)

    def test_alert_rotation_both_sides_preserves_curb_gap_and_link(self):
        infra,m=calculate([host()]);before=copy.deepcopy((infra,m))
        for sign in (1,-1):
            for angle in (0,90,180,-90):
                v=candidate(element('tactileWarning',anchor=[50,sign*6],angleDegrees=angle),infra,m)
                g=shape(v['derived']['geometry']);bounds=g.bounds
                self.assertAlmostEqual(g.area,.75,places=5)
                self.assertAlmostEqual(min(abs(bounds[1]),abs(bounds[3])),5.5,places=5)
                self.assertAlmostEqual(bounds[2]-bounds[0],.5 if abs(angle)==90 else 1.5,places=5)
                self.assertAlmostEqual(bounds[3]-bounds[1],1.5 if abs(angle)==90 else .5,places=5)
        q=ramp_candidate(ramp(infra[0],kind='longitudinal',slopePercent=5,flankSlopePercent=5),infra,m)
        v=candidate(element('tactileWarning',rampId=q['id'],angleDegrees=90),infra,m,[q])
        self.assertEqual(v['rampId'],q['id']);self.assertEqual(v['angleDegrees'],90)
        self.assertEqual(derive([v],infra,m,[q])[0],v)
        with self.assertRaises(DomainError):candidate(element('tactileWarning',anchor=[50,-6],angleDegrees=90,lengthM=3),infra,m)
        self.assertEqual((infra,m),before)

    def test_automatic_directional_single_click_center_side_and_rederive(self):
        infra,m=calculate([host()]);before=copy.deepcopy((infra,m))
        for side,y,expected in [('left',6,7.35),('right',-6,-6.35)]:
            v=candidate(element('tactileDirectional',anchor=[50,y],pathMode='automatic'),infra,m)
            line=shape(v['derived']['axisGeometry'])
            self.assertEqual(v['side'],side);self.assertEqual(v['path'],[])
            self.assertAlmostEqual(line.interpolate(.5,normalized=True).y,expected,places=4)
            self.assertGreater(line.length,99);self.assertLess(line.length,100)
            self.assertAlmostEqual(v['derived']['areaM2'],line.length*.25,places=4)
            self.assertEqual(derive([v],infra,m,[])[0],v)
        self.assertEqual((infra,m),before)
        changed,t=calculate([{**host(),'id':infra[0]['id'],'sidewalkLeft':3}])
        v=candidate(element('tactileDirectional',anchor=[50,6],pathMode='automatic'),infra,m)
        updated=derive([v],changed,t,[])[0]
        self.assertEqual(updated['id'],v['id'])
        self.assertAlmostEqual(shape(updated['derived']['axisGeometry']).interpolate(.5,normalized=True).y,6.85,places=4)
        i,t=calculate([{**host(),'sidewalkLeft':0,'sidewalkRight':0}])
        with self.assertRaises(DomainError):candidate(element('tactileDirectional',pathMode='automatic'),i,t)

    def test_automatic_directional_follows_curve_and_covers_both_fragments_at_junction(self):
        r={**host(),'arcSegments':[{'index':0,'directionDegrees':20}]};infra,m=calculate([r]);axis=shape(infra[0]['derived']['axisGeometry'])
        o=axis.interpolate(axis.length/2);a=axis.interpolate(axis.length/2-.05);b=axis.interpolate(axis.length/2+.05)
        dx,dy=b.x-a.x,b.y-a.y;ll=(dx*dx+dy*dy)**.5
        anchor=[o.x-dy/ll*7,o.y+dx/ll*7]
        v=candidate(element('tactileDirectional',anchor=anchor,pathMode='automatic'),infra,m)
        self.assertGreater(len(v['derived']['axisGeometry']['coordinates']),20)
        self.assertTrue(shape(v['derived']['geometry']).is_valid)
        branch={**host(),'id':str(uuid4()),'geometry':{'type':'LineString','coordinates':[[50,0],[50,50]]}}
        infra,m=calculate([host(),branch])
        v=candidate(element('tactileDirectional',anchor=[20,6],pathMode='automatic'),infra,m)
        path=shape(v['derived']['axisGeometry'])
        self.assertEqual(path.geom_type,'MultiLineString')
        self.assertLess(path.bounds[0],1);self.assertGreater(path.bounds[2],99)
        self.assertTrue(all(q.bounds[3]<10 for q in path.geoms),'stay on chosen road, not branch')

    def test_automatic_directional_reserves_half_metre_at_ramps_and_recalculates(self):
        r=host();infra,m=calculate([r]);q=ramp_candidate(ramp(r,slopePercent=8.33),infra,m)
        data=element('tactileDirectional',anchor=[20,6],pathMode='automatic')
        v=candidate(data,infra,m,[q]);path=shape(v['derived']['axisGeometry']);ramp_shape=shape(q['derived']['geometry'])
        self.assertEqual(path.geom_type,'MultiLineString')
        self.assertEqual(len(path.geoms),2)
        left,right=sorted(path.geoms,key=lambda q:q.bounds[0])
        self.assertAlmostEqual(left.bounds[2],ramp_shape.bounds[0]-.5,places=4)
        self.assertAlmostEqual(right.bounds[0],ramp_shape.bounds[2]+.5,places=4)
        self.assertEqual(shape(v['derived']['geometry']).intersection(ramp_shape).area,0)
        self.assertAlmostEqual(v['derived']['lengthM'],sum(p.length for p in path.geoms))
        moved=ramp_candidate({**q,'anchor':[60,6]},infra,m)
        updated=derive([v],infra,m,[moved])[0]
        self.assertEqual(updated['id'],v['id']);self.assertNotEqual(updated['derived']['axisGeometry'],v['derived']['axisGeometry'])
        restored=derive([v],infra,m,[])[0]
        self.assertGreater(restored['derived']['lengthM'],v['derived']['lengthM'])
        # Multiple disjoint directional parts must remain exportable as closed CAD polygons.
        import ezdxf
        from services.engine.accessibility.cad_export import append
        cad=ezdxf.new('R2010');append(cad,{'accessibilityElements':[v]})
        self.assertFalse(cad.audit().has_errors)
        self.assertTrue(all(p.closed for p in cad.modelspace().query('LWPOLYLINE')))

    def test_pdf_accessibility_summary_and_page_numbering(self):
        from io import BytesIO
        from PIL import Image
        from pypdf import PdfReader
        from services.engine.infra.pdf import render_infra
        from services.engine.study_pdf import StudyFields
        infra,m=calculate([host()]);v=candidate(element('tactileWarning'),infra,m)
        state={'project':{'revision':1},'entities':[],'infra':infra,'infraMetrics':m,'accessibilityElements':[v]}
        original=copy.deepcopy(state);image=BytesIO();Image.new('RGBA',(1560,1108),(230,239,232,255)).save(image,'PNG')
        data=render_infra(state,image.getvalue(),StudyFields(title='Teste acessibilidade',date='19/10/2026',scale=1000,expectedRevision=1))
        pdf=PdfReader(BytesIO(data));text='\n'.join(p.extract_text() for p in pdf.pages)
        self.assertIn('ACESSIBILIDADE',text);self.assertIn('Piso de alerta',text);self.assertIn('0,75',text);self.assertEqual(state,original)
        for i,p in enumerate(pdf.pages):self.assertIn(f'FOLHA: {i+1:02d}/{len(pdf.pages):02d}',p.extract_text())
    def test_dxf_closed_layers_patterns_and_rotated_copy(self):
        import ezdxf
        from services.engine.accessibility.cad_export import append
        infra,m=calculate([host()]);q=ramp_candidate(ramp(host(),roadId=infra[0]['id']),infra,m)
        values=[candidate(element('tactileDirectional',path=[[20,7],[30,7]],anchor=[20,7]),infra,m),candidate(element('tactileWarning'),infra,m),candidate(element('vehicleAccess',anchor=[70,6]),infra,m),candidate(element('crosswalk',anchor=[80,0]),infra,m)]
        state={'accessibility':[q],'accessibilityElements':values};doc=ezdxf.new('R2010')
        append(doc,state);append(doc,state,'TECH',lambda p:(p[1],-p[0]),False)
        polylines=list(doc.modelspace().query('LWPOLYLINE'));self.assertTrue(polylines);self.assertTrue(all(p.closed for p in polylines))
        hatches=list(doc.modelspace().query('HATCH'));self.assertTrue(any(h.dxf.pattern_name=='SEHURB_TATIL_DIRECIONAL' for h in hatches));self.assertTrue(any(h.dxf.pattern_name=='SEHURB_TATIL_ALERTA' for h in hatches))
        self.assertTrue(any(p.dxf.layer=='TECH_TRAVESSIA' for p in polylines));self.assertFalse(doc.audit().has_errors)
    def test_vehicle_both_sides_preserves_free_strip_and_base_quantities(self):
        r=host();infra,m=calculate([r]);before=copy.deepcopy((infra,m))
        for side,y in [('left',6),('right',-6)]:
            v=candidate(element('vehicleAccess',anchor=[50,y],path=[]),infra,m)
            self.assertEqual(v['side'],side);self.assertAlmostEqual(v['derived']['slopePercent'],15/.7)
            self.assertGreaterEqual(v['derived']['freeWidthM'],1.2);self.assertAlmostEqual(v['derived']['areaM2'],.7*(2.4+.5),places=4)
            self.assertTrue(v['derived']['pending']);self.assertEqual(v['derived']['warnings'],[])
        with self.assertRaisesRegex(DomainError,'1,20'):candidate(element('vehicleAccess',anchor=[50,-6],runM=1),infra,m)
        no_walk={**r,'sidewalkLeft':0,'sidewalkRight':0};i,t=calculate([no_walk])
        with self.assertRaises(DomainError):candidate(element('vehicleAccess'),i,t)
        self.assertEqual((infra,m),before)
    def test_tactile_route_warning_turns_union_and_no_clipping(self):
        infra,m=calculate([host()]);v=candidate(element('tactileDirectional',path=[[20,7],[30,7],[30,8]],anchor=[20,7]),infra,m)
        self.assertEqual(len([p for p in v['derived']['parts'] if p['role']=='warning']),1)
        self.assertAlmostEqual(v['derived']['lengthM'],11)
        self.assertGreater(v['derived']['pieces'],0)
        twin={**v,'id':str(uuid4())};t=totals([v,twin]);self.assertAlmostEqual(t['tactileDirectional']['areaM2']+t['tactileWarning']['areaM2'],v['derived']['areaM2'])
        with self.assertRaises(DomainError):candidate(element('tactileDirectional',path=[[20,7],[30,0]],anchor=[20,7]),infra,m)
        with self.assertRaises(DomainError):candidate(element('tactileDirectional',path=[[20,7],[30,7],[20,7]],anchor=[20,7]),infra,m)
    def test_linked_alert_updates_and_retains_broken_identity(self):
        r=host();infra,m=calculate([r]);q=ramp_candidate(ramp(r,slopePercent=8.33),infra,m)
        v=candidate(element('tactileWarning',rampId=q['id']),infra,m,[q])
        self.assertEqual(v['lengthM'],q['widthM']);self.assertAlmostEqual(v['derived']['areaM2'],.75,places=4)
        wider=ramp_candidate({**q,'widthM':2},infra,m);changed=derive([v],infra,m,[wider])[0]
        self.assertEqual(changed['lengthM'],2)
        invalid=derive([v],infra,m,[])[0];self.assertEqual(invalid['id'],v['id']);self.assertEqual(invalid['derived']['status'],'invalid')
        self.assertIsNone(invalid['derived']['geometry'])
    def test_warning_sizes_lrv_and_no_false_certificate(self):
        infra,m=calculate([host()]);v=candidate(element('tactileWarning',widthM=.25,offsetM=.2,lrvFloor=50,lrvTactile=40),infra,m)
        self.assertEqual(len(v['derived']['warnings']),3)
        for size in [.2,.25,.3,.4,.5]:
            q=candidate(element('tactileWarning',tileM=size),infra,m);self.assertIn('LRV',' '.join(q['derived']['pending']))
    def test_curved_sidewalk_following_and_vehicle(self):
        r={**host(),'arcSegments':[{'index':0,'directionDegrees':20}]};infra,m=calculate([r]);axis=shape(infra[0]['derived']['axisGeometry'])
        def sidewalk(s):
            o=axis.interpolate(s);a=axis.interpolate(s-.05);b=axis.interpolate(s+.05);dx,dy=b.x-a.x,b.y-a.y;ll=(dx*dx+dy*dy)**.5;return [o.x-dy/ll*6.8,o.y+dx/ll*6.8]
        a,b=sidewalk(axis.length*.3),sidewalk(axis.length*.7)
        v=candidate(element('tactileDirectional',anchor=a,path=[a,b],pathMode='sidewalk',offsetM=2),infra,m)
        self.assertGreater(len(v['derived']['axisGeometry']['coordinates']),10);self.assertTrue(shape(v['derived']['geometry']).is_valid)
        q=candidate(element('vehicleAccess',anchor=sidewalk(axis.length*.5)),infra,m);self.assertTrue(shape(q['derived']['geometry']).is_valid)
    def test_crosswalk_real_paint_area_and_missing_ramps_warning(self):
        infra,m=calculate([host()]);v=candidate(element('crosswalk',anchor=[50,0]),infra,m)
        self.assertGreater(len(v['derived']['parts']),2);self.assertAlmostEqual(v['derived']['lengthM'],10)
        self.assertLess(v['derived']['areaM2'],40);self.assertTrue(v['derived']['warnings'])
        with self.assertRaises(DomainError):candidate(element('crosswalk',anchor=[500,500]),infra,m)
        with self.assertRaises(DomainError):candidate(element('crosswalk',barM=.8),infra,m)
    def test_store_preview_atomic_history_save_as_and_host_invalidation(self):
        with TemporaryDirectory(dir='tests/evidence') as directory:
            store=Store(directory);doc=store.create('Acessibilidade','EPSG:31979',-67.81,-9.974);pid=doc['project']['id']
            def command(kind,args):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
            source=str(uuid4());command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(0,0,100,100)})
            r={**host(),'sourceEntityId':source};command('infra.upsert',r);before=copy.deepcopy(doc)
            original=api.store;api.store=store
            try:
                v=api.accessibility_element_preview(pid,{'expectedRevision':doc['project']['revision'],'element':element('vehicleAccess')})
                self.assertEqual(store.state(pid),before)
                with self.assertRaises(DomainError):api.accessibility_element_preview(pid,{'expectedRevision':0,'element':v})
            finally:api.store=original
            command('accessibility.element.upsert',v);self.assertEqual(doc['infraMetrics'],before['infraMetrics']);identity=v['id']
            command('undo',{});self.assertEqual(doc['accessibilityElements'],[]);command('redo',{});self.assertEqual(doc['accessibilityElements'][0]['id'],identity)
            destination=Path(directory)/'Copy';destination.mkdir();store.save_as(pid,destination,doc['project']['revision']);self.assertEqual(Store(directory).state(pid)['accessibilityElements'],doc['accessibilityElements'])
            command('infra.upsert',{**r,'sidewalkLeft':0});self.assertEqual(doc['accessibilityElements'][0]['derived']['status'],'invalid')
            command('undo',{});self.assertEqual(doc['accessibilityElements'][0]['derived']['status'],'dimensioned')
            command('accessibility.element.delete',{'id':identity});self.assertEqual(doc['accessibilityElements'],[])
            command('undo',{});self.assertEqual(doc['accessibilityElements'][0]['id'],identity)

if __name__=='__main__':unittest.main()
