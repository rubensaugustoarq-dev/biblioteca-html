import copy
import unittest
from uuid import uuid4
from tempfile import TemporaryDirectory
from shapely.geometry import shape
from services.engine.store import Store,DomainError
from services.engine.infra.domain import calculate
from services.engine.accessibility.elements import candidate,derive,totals
from services.engine.accessibility.parking import TYPES,check_overlap
from services.engine.accessibility.cad_export import append
from tests.test_infra import rect


def surface():
    return {'id':str(uuid4()),'sourceEntityId':str(uuid4()),'sourceGeometry':rect(0,0,100,100),
            'kind':'surface','name':'Estacionamento','geometry':rect(0,0,80,80),'material':'concrete','clipToGleba':False}


def parking(**values):
    return {'id':str(uuid4()),'kind':'parking','name':'Vagas','anchor':[20,20],'parkingType':'car',
            'widthM':2.5,'lengthM':5,'quantity':3,'parkingAngleDegrees':90,'angleDegrees':0,
            'alignToBoundary':False,'color':'#ffffff',**values}


class ParkingTests(unittest.TestCase):
    def test_pdf_parking_summary_by_type(self):
        from io import BytesIO
        from PIL import Image
        from pypdf import PdfReader
        from services.engine.infra.pdf import render_infra
        from services.engine.study_pdf import StudyFields
        infra,m=calculate([surface()]);v=candidate(parking(parkingType='accessible'),infra,m)
        state={'project':{'revision':1},'entities':[],'infra':infra,'infraMetrics':m,'accessibilityElements':[v]}
        image=BytesIO();Image.new('RGBA',(1560,1108),(230,239,232,255)).save(image,'PNG')
        data=render_infra(state,image.getvalue(),StudyFields(title='Vagas',date='02/11/2026',scale=500,expectedRevision=1))
        text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(data)).pages)
        self.assertIn('Vagas de estacionamento',text);self.assertIn('PCD: 3 vagas',text)

    def test_types_angles_counts_and_base_areas_unchanged(self):
        infra,m=calculate([surface()]);before=copy.deepcopy((infra,m))
        for kind in TYPES:
            for angle in (0,30,45,60,90,-45,123):
                v=candidate(parking(parkingType=kind,parkingAngleDegrees=angle),infra,m)
                bays=[p for p in v['derived']['parts'] if p['role']=='parking']
                self.assertEqual(len(bays),3)
                for part in bays:self.assertAlmostEqual(shape(part['geometry']).area,12.5)
                if kind!='accessible':self.assertAlmostEqual(v['derived']['areaM2'],37.5)
                self.assertEqual(totals([v])['parking']['count'],3)
                self.assertEqual(totals([v])['parking']['byType'][kind],3)
        self.assertEqual((infra,m),before)

    def test_accessible_transfer_containment_overlaps_and_invalid_host(self):
        source=surface();infra,m=calculate([source])
        for side in ('left','right'):
            v=candidate(parking(parkingType='accessible',transferWidthM=1.2,transferSide=side),infra,m)
            self.assertEqual(len(v['derived']['parts']),6)
            self.assertAlmostEqual(v['derived']['areaM2'],3*(2.5+1.2)*5)
        with self.assertRaises(DomainError):candidate(parking(anchor=[79,79]),infra,m)
        with self.assertRaises(DomainError):candidate(parking(quantity=2.2),infra,m)
        with self.assertRaises(DomainError):candidate(parking(parkingType='unknown'),infra,m)
        v=candidate(parking(),infra,m)
        with self.assertRaises(DomainError):check_overlap({**v,'id':str(uuid4())},[v])
        check_overlap(v,[v])
        invalid=derive([v],[],{'regions':[]},[])[0]
        self.assertEqual(invalid['id'],v['id']);self.assertEqual(invalid['derived']['status'],'invalid')
        earth,t=calculate([{**source,'material':'earth'}])
        with self.assertRaises(DomainError):candidate(parking(),earth,t)
        narrow=candidate(parking(parkingType='accessible',transferWidthM=.5),infra,m)
        self.assertTrue(narrow['derived']['warnings'])

    def test_boundary_alignment_orientation_and_cad(self):
        infra,m=calculate([surface()])
        v=candidate(parking(anchor=[30,1],alignToBoundary=True,parkingType='accessible',transferWidthM=1.2),infra,m)
        self.assertEqual(v['surfaceId'],infra[0]['id'])
        import ezdxf
        doc=ezdxf.new('R2010');append(doc,{'accessibilityElements':[v]})
        self.assertFalse(doc.audit().has_errors)
        self.assertEqual(len(list(doc.modelspace().query('LWPOLYLINE[layer=="SEHURB_ACESSIBILIDADE_VAGAS"]'))),3)
        self.assertTrue(list(doc.modelspace().query('HATCH[layer=="SEHURB_ACESSIBILIDADE_VAGAS_TRANSFERENCIA"]')))

    def test_store_preview_save_reopen_undo_redo_and_surface_deletion(self):
        from services.engine import api
        with TemporaryDirectory(dir='tests/evidence') as folder:
            store=Store(folder);doc=store.create('Vagas','EPSG:31979',-67.81,-9.974);pid=doc['project']['id'];source=str(uuid4())
            def command(kind,args):
                nonlocal doc
                doc=store.command(pid,{'commandId':str(uuid4()),'expectedRevision':doc['project']['revision'],'type':kind,'parameters':args})
            command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(0,0,100,100)})
            host={**surface(),'sourceEntityId':source};command('infra.upsert',host)
            previous=api.store;api.store=store
            try:
                original=copy.deepcopy(doc)
                v=api.accessibility_element_preview(pid,{'expectedRevision':doc['project']['revision'],'element':parking(surfaceId=host['id'])})
                self.assertEqual(store.state(pid),original)
                command('accessibility.element.upsert',v)
                self.assertEqual(doc['infraMetrics'],original['infraMetrics'])
                with self.assertRaises(DomainError):api.accessibility_element_preview(pid,{'expectedRevision':doc['project']['revision'],'element':{**v,'id':str(uuid4())}})
                self.assertEqual(Store(folder).state(pid)['accessibilityMetrics']['parking']['count'],3)
                command('undo',{});self.assertEqual(doc['accessibilityElements'],[])
                command('redo',{});self.assertEqual(doc['accessibilityElements'][0]['id'],v['id'])
                command('infra.delete',{'id':host['id']})
                self.assertEqual(doc['accessibilityElements'][0]['derived']['status'],'invalid')
            finally:api.store=previous
