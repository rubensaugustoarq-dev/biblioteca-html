import math,unittest
from copy import deepcopy
from tempfile import TemporaryDirectory
from uuid import uuid4
from shapely.geometry import shape,Point,LineString
from services.engine.landscape.domain import candidate as landscape,totals
from services.engine.infra.domain import calculate
from services.engine.store import Store,DomainError
from tests.test_infra import road,rect


def walkway(points=None,**extra):
    return {**road(points or [[0,0],[20,0]]),'usage':'walkway','width':2,'material':'concrete','clipToGleba':False,**extra}

class LandscapeWalkwayTests(unittest.TestCase):
    def test_roofs_square_octagon_rotation_and_validation(self):
        for kind,params,expected,count in [('chalet',{'sideM':3},9,4),('hut',{'radiusM':2},8*math.sqrt(2),8)]:
            for angle in [0,37,90]:
                raw={'id':str(uuid4()),'name':kind,'kind':kind,'geometry':{'type':'Point','coordinates':[626000,8890000]},'rotationDegrees':angle,**params};before=deepcopy(raw)
                value=landscape(raw);polygon=shape(value['derived']['geometry'])
                self.assertAlmostEqual(polygon.area,expected,places=7);self.assertEqual(len(polygon.exterior.coords)-1,count)
                self.assertEqual(value['geometry'],raw['geometry']);self.assertEqual(raw,before)
        with self.assertRaises(DomainError):landscape({'id':str(uuid4()),'name':'Chalé','kind':'chalet','sideM':0,'geometry':{'type':'Point','coordinates':[0,0]}})

    def test_path_branches_union_without_pavement_or_double_counting(self):
        a=walkway();b=walkway([[10,0],[10,10]]);before=deepcopy([a,b])
        items,m=calculate([a,b]);self.assertEqual(m['pavementAreaM2'],0);self.assertAlmostEqual(m['sidewalkAreaM2'],58)
        self.assertEqual(m['totalAreaM2'],m['sidewalkAreaM2']);self.assertEqual([a,b],before)
        self.assertEqual(items[0]['derived']['axisLengthM'],20)
        self.assertEqual(items[1]['geometry']['coordinates'][0],(10.,0.))
        car=road([[10,-10],[10,10]]);car.update(width=6,sidewalkLeft=0,sidewalkRight=0,clipToGleba=False)
        _,mixed=calculate([a,car]);self.assertAlmostEqual(mixed['sidewalkAreaM2'],28)

    def test_curved_path_circle_and_clipping_confirmed_geometry(self):
        raw=walkway([[0,0],[20,0]],arcSegments=[{'index':0,'directionDegrees':90}],terminalRadiusM=3)
        values,m=calculate([raw]);v=values[0];axis=shape(v['derived']['axisGeometry'])
        expected=axis.buffer(1,cap_style=2,join_style=2,mitre_limit=3).union(Point(axis.coords[-1]).buffer(3,quad_segs=64))
        self.assertAlmostEqual(shape(v['derived']['regions'][1]['geometry']).area,expected.area,places=5)
        self.assertAlmostEqual(v['derived']['axisLengthM'],math.pi*10,places=6)
        self.assertAlmostEqual(sum(d['lengthM'] for d in v['derived']['dimensions']),math.pi*10,places=6)
        self.assertEqual(m['pavementAreaM2'],0);self.assertGreater(m['sidewalkAreaM2'],60)
        clipped={**walkway([[-10,5],[20,5]]),'clipToGleba':True,'sourceGeometry':rect(0,0,100,100)}
        _,m=calculate([clipped]);self.assertAlmostEqual(m['sidewalkAreaM2'],40)
        with self.assertRaises(DomainError):calculate([walkway(terminalRadiusM=.2)])

    def test_store_roofs_and_walkway_reopen_history_and_isolation(self):
        with TemporaryDirectory(dir='tests/evidence') as folder:
            store=Store(folder);doc=store.create('Coberturas e caminhos','EPSG:31979',-67.81,-9.974);pid=doc['project']['id'];source=str(uuid4())
            def command(kind,args):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
            command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(0,0,100,100)})
            roof={'id':str(uuid4()),'name':'Chalé','kind':'chalet','geometry':{'type':'Point','coordinates':[5,5]},'sideM':3}
            command('landscape.upsert',roof)
            path={**walkway(),'sourceEntityId':source};command('infra.upsert',path)
            first=doc['infraMetrics']['sidewalkAreaM2']
            command('infra.upsert',{**doc['infra'][0],'terminalRadiusM':3})
            self.assertGreater(doc['infraMetrics']['sidewalkAreaM2'],first);self.assertEqual(doc['landscapeMetrics']['chalets'],1)
            self.assertEqual(Store(folder).state(pid)['infra'][0]['usage'],'walkway')
            command('undo',{});self.assertAlmostEqual(doc['infraMetrics']['sidewalkAreaM2'],first)
            command('redo',{});self.assertEqual(doc['infra'][0]['terminalRadiusM'],3)
            command('landscape.delete',{'id':roof['id']});self.assertEqual(doc['infra'][0]['id'],path['id'])

    def test_walkway_dxf_closed_sidewalk_hatch_dimensions_and_summary(self):
        import ezdxf
        from services.engine.infra.cad_export import append
        paths,m=calculate([walkway(terminalRadiusM=3,name='Caminho 1')])
        state={'infra':paths,'infraMetrics':m,'entities':[],'subdivisionAreas':[]}
        doc=ezdxf.new('R2010');append(doc,state,dimensions=True)
        self.assertFalse(doc.audit().has_errors)
        outlines=list(doc.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_CALCADAS_CONCRETO"]'))
        self.assertTrue(outlines);self.assertTrue(all(p.closed for p in outlines))
        self.assertTrue(list(doc.modelspace().query('DIMENSION')))
        text=' '.join(e.text for e in doc.modelspace().query('MTEXT'))
        self.assertIn('CALÇADAS INDEPENDENTES',text);self.assertIn('Caminho 1',text)
