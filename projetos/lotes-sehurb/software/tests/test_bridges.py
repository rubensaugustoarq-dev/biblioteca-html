import math,unittest
from copy import deepcopy
from tempfile import TemporaryDirectory
from uuid import uuid4
from shapely.geometry import shape
from services.engine.store import Store,DomainError
from services.engine.infra.domain import calculate
from services.engine.infra.cad_export import append
from tests.test_infra import road,rect
from tests.test_landscape_walkways import walkway


def bridge(**extra):
    return {**road([[10,10],[11,10]]),'usage':'bridge','name':'Ponte 1','width':2,'bridgeLengthM':8,'material':'wood','clipToGleba':False,**extra}


class BridgeTests(unittest.TestCase):
    def test_exact_length_width_anchor_and_separate_wood_quantities(self):
        raw=bridge();before=deepcopy(raw);items,m=calculate([raw]);v=items[0]
        self.assertEqual(v['geometry']['coordinates'],((10.,10.),(18.,10.)))
        self.assertEqual(v['material'],'wood');self.assertEqual(v['usage'],'bridge')
        self.assertAlmostEqual(m['bridgeAreaM2'],16);self.assertEqual(m['pavementAreaM2'],0);self.assertEqual(m['sidewalkAreaM2'],0)
        self.assertAlmostEqual(m['totalAreaM2'],16);self.assertAlmostEqual(m['byMaterial']['wood'],16)
        self.assertEqual(v['derived']['dimensions'][0]['lengthM'],8);self.assertEqual(raw,before)
        changed,_=calculate([{**v,'bridgeLengthM':12,'width':3}]);self.assertEqual(changed[0]['geometry']['coordinates'][0],(10.,10.));self.assertAlmostEqual(changed[0]['derived']['bridgeAreaM2'],36)

    def test_walkway_connection_and_union_without_duplicate_area(self):
        path=walkway([[0,0],[10,0]])
        b=bridge(geometry={'type':'LineString','coordinates':[[8,0],[9,0]]},bridgeLengthM=6)
        items,m=calculate([path,b]);self.assertAlmostEqual(m['bridgeAreaM2'],12);self.assertAlmostEqual(m['sidewalkAreaM2'],16);self.assertAlmostEqual(m['totalAreaM2'],28)
        self.assertEqual(items[1]['geometry']['coordinates'][0],(8.,0.))
        for bad in (bridge(bridgeLengthM=0),bridge(width=0),bridge(arcSegments=[{'index':0,'directionDegrees':30}]),bridge(geometry={'type':'LineString','coordinates':[[0,0],[2,0],[3,1]]})):
            with self.assertRaises(DomainError):calculate([bad])

    def test_dxf_closed_bridge_hatch_native_dimensions_and_tables(self):
        import ezdxf
        items,m=calculate([bridge()]);doc=ezdxf.new('R2010')
        append(doc,{'infra':items,'infraMetrics':m,'entities':[]},dimensions=True)
        self.assertFalse(doc.audit().has_errors)
        outline=list(doc.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_PONTES_MADEIRA_PIAO_ROXO"]'));self.assertEqual(len(outline),1);self.assertTrue(outline[0].closed)
        self.assertTrue(any(h.dxf.pattern_name=='SEHURB_MADEIRA_DIAGONAL' for h in doc.modelspace().query('HATCH')))
        self.assertGreaterEqual(len(list(doc.modelspace().query('DIMENSION'))),2)
        text=' '.join(e.text for e in doc.modelspace().query('MTEXT'));self.assertIn('PONTES DE MADEIRA',text);self.assertIn('Madeira pião-roxo',text)

    def test_save_reopen_edit_undo_redo_preserve_water_and_connections(self):
        with TemporaryDirectory(dir='tests/evidence') as folder:
            store=Store(folder);doc=store.create('Ponte de madeira','EPSG:31979',-67.81,-9.974);pid=doc['project']['id'];source=str(uuid4())
            def command(kind,args):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
            command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(0,0,100,100)})
            command('landscape.upsert',{'id':str(uuid4()),'kind':'water','name':'Água','geometry':rect(0,0,40,40)})
            water=deepcopy(doc['landscape'][0]['derived']);v={**bridge(),'sourceEntityId':source};command('infra.upsert',v)
            command('infra.upsert',{**doc['infra'][0],'bridgeLengthM':12})
            self.assertEqual(Store(folder).state(pid)['infra'][0]['bridgeLengthM'],12)
            self.assertEqual(doc['landscape'][0]['derived'],water);self.assertEqual(doc['infra'][0]['id'],v['id'])
            command('undo',{});self.assertEqual(doc['infra'][0]['bridgeLengthM'],8)
            command('redo',{});self.assertEqual(doc['infra'][0]['bridgeLengthM'],12)
