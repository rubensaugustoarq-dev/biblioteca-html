import io,math,unittest
import ezdxf
from services.engine.cad_dimensions import NativeDimensions
from tests.test_infra import road,rect
from services.engine.infra.domain import calculate

class NativeDimensionTests(unittest.TestCase):
    def roundtrip(self,doc):
        stream=io.StringIO();doc.write(stream);out=ezdxf.read(io.StringIO(stream.getvalue()))
        self.assertFalse(out.audit().has_errors)
        for d in out.modelspace().query('DIMENSION ARC_DIMENSION'):
            self.assertIn(d.dxf.geometry,out.blocks);self.assertGreater(len(out.blocks[d.dxf.geometry]),0)
            self.assertEqual(d.dxf.text,'<>')
        return out
    def test_utm_aligned_independent_offset_and_style(self):
        doc=ezdxf.new('R2010');native=NativeDimensions(doc,'SEHURB')
        native.aligned([626000,8890000],[626003,8890004],-2)
        native.independent([{'start':[626010,8890010],'end':[626020,8890010],'offset':3,'color':'#ff0011'}])
        out=self.roundtrip(doc);dims=list(out.modelspace().query('DIMENSION'));self.assertEqual(len(dims),2)
        self.assertEqual(dims[0].dimtype,1)
        self.assertAlmostEqual(dims[0].get_measurement(),5,places=6)
        self.assertAlmostEqual(dims[1].get_measurement(),10,places=6)
        self.assertAlmostEqual(dims[1].dxf.defpoint.y,8890013,places=6)
        self.assertEqual(dims[1].dxf.true_color,0xff0011)
        style=out.dimstyles.get(dims[0].dxf.dimstyle);self.assertEqual(style.dxf.dimdec,2);self.assertEqual(dims[0].override().get('dimpost'),'<> m');self.assertEqual(style.dxf.dimlfac,1)
        dims[1].dxf.defpoint3=(626025,8890010,0);self.assertAlmostEqual(dims[1].get_measurement(),15,places=6)
    def test_lot_shared_edges_once_and_outside_gleba(self):
        doc=ezdxf.new('R2010');native=NativeDimensions(doc,'SEHURB');seen=set()
        native.polygon(rect(626000,8890000,10,25),'LOTES',True,seen)
        native.polygon(rect(626010,8890000,10,25),'LOTES',True,seen)
        native.polygon(rect(626000,8890000,20,25),'GLEBAS')
        out=self.roundtrip(doc);self.assertEqual(len(out.modelspace().query('DIMENSION[layer=="SEHURB_LOTES"]')),7)
        self.assertEqual(len(out.modelspace().query('DIMENSION[layer=="SEHURB_GLEBAS"]')),4)
    def test_true_arc_lengths_and_radii_clockwise_and_major(self):
        for sweep in (90,-90,240,-240):
            doc=ezdxf.new('R2010');native=NativeDimensions(doc,'SEHURB');angle=math.radians(sweep)
            points=[[626000+10*math.cos(angle*i/40),8890000+10*math.sin(angle*i/40)] for i in range(41)]
            native.path({'type':'LineString','coordinates':points});out=self.roundtrip(doc)
            arcs=list(out.modelspace().query('ARC_DIMENSION'));self.assertEqual(len(arcs),1)
            d=arcs[0];c=d.dxf.defpoint4;a=d.dxf.defpoint2;b=d.dxf.defpoint3
            theta=(math.atan2(b.y-c.y,b.x-c.x)-math.atan2(a.y-c.y,a.x-c.x))%math.tau
            self.assertAlmostEqual((a-c).magnitude*theta,10*abs(angle),places=4)
            radius=list(out.modelspace().query('DIMENSION'))[0];self.assertAlmostEqual(radius.get_measurement(),10,places=4)
    def test_broken_straight_is_not_false_arc_and_sections_match(self):
        doc=ezdxf.new('R2010');native=NativeDimensions(doc,'SEHURB')
        native.path({'type':'LineString','coordinates':[[0,0],[10,0],[10,10]]})
        self.assertFalse(doc.modelspace().query('ARC_DIMENSION'))
        items,_=calculate([road()]);native.roads(items);out=self.roundtrip(doc)
        measures=[round(d.get_measurement(),6) for d in out.modelspace().query('DIMENSION[layer=="SEHURB_COTAS_SECOES"]')]
        self.assertEqual(measures,[10,2,3])
    def test_mixed_line_fillet_line_sums_analytic_length(self):
        items,_=calculate([{**road([[0,0],[50,0],[50,50]]),'filletRadii':{'1':10},'clipToGleba':False}])
        doc=ezdxf.new('R2010');native=NativeDimensions(doc,'SEHURB');native.path(items[0]['derived']['axisGeometry']);out=self.roundtrip(doc)
        lines=list(out.modelspace().query('DIMENSION[layer=="SEHURB_COTAS_VIAS"]'));arcs=list(out.modelspace().query('ARC_DIMENSION'))
        self.assertEqual(len(lines),2);self.assertEqual(len(arcs),1)
        self.assertAlmostEqual(sum(d.get_measurement() for d in lines),80,places=5)
        self.assertAlmostEqual(items[0]['derived']['axisLengthM'],80+5*math.pi,places=6)

if __name__=='__main__':unittest.main()
