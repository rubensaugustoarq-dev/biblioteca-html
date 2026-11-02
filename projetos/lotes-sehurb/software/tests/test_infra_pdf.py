from io import BytesIO
import copy
import unittest
from PIL import Image
from pypdf import PdfReader
from services.engine.infra.domain import calculate
from services.engine.infra.pdf import render_infra
from services.engine.study_pdf import StudyFields
from tests.test_infra import road,rect
from tests.test_study_pdf import StudyPdfTests

class InfraPdfEndpointTests(StudyPdfTests):
    def setUp(self):
        super().setUp();self.url=self.url.replace('/study/pdf','/infra/pdf')

class InfraPdfTests(unittest.TestCase):
    def fixture(self,count=3):
        values=[{**road([[10,10+i*12],[90,10+i*12]]),'name':'Via '+str(i+1),'clipToGleba':False,'material':'earth' if i==2 else 'asphalt','sidewalkLeft':0 if i==2 else 2,'sidewalkRight':0 if i==2 else 2} for i in range(count)]
        items,metrics=calculate(values)
        state={'project':{'revision':4},'entities':[{'attributes':{'name':'Gleba A'},'geometry':rect(0,0,100,100),'derived':{'areaM2':10000}}],'infra':items,'infraMetrics':metrics}
        fields=StudyFields(title='Estudo de vias',content='INFRA / URBANO',date='13/10/2026',scale=1000,expectedRevision=4)
        image=BytesIO();Image.new('RGBA',(1560,1108),(230,239,232,255)).save(image,'PNG')
        return state,fields,image.getvalue()
    def test_a3_sections_materials_totals_and_no_mutation(self):
        state,fields,image=self.fixture();before=copy.deepcopy(state)
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)))
        text='\n'.join(p.extract_text() for p in pdf.pages)
        for value in ('Gleba A','10.000,00 m²','Via 1','Via 2','Via 3','80,00 m','CBUQ','Terra','SEÇÕES DAS VIAS','QUANTITATIVOS CONFIRMADOS','Calçamento:','Pavimento:','Total sistema viário:'):
            self.assertIn(value,text)
        self.assertEqual(state,before)
        for page in pdf.pages:
            self.assertAlmostEqual(float(page.mediabox.width)*25.4/72,420,places=3)
            self.assertAlmostEqual(float(page.mediabox.height)*25.4/72,297,places=3)
    def test_many_roads_generate_continuations_without_missing_names(self):
        state,fields,image=self.fixture(16)
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)))
        self.assertGreater(len(pdf.pages),1)
        for i,page in enumerate(pdf.pages):
            self.assertIn(f'FOLHA: {i+1:02d}/{len(pdf.pages):02d}',page.extract_text())
        self.assertEqual(fields.sheet,'01/01','A numeração gerada não deve alterar os campos originais')
        first=pdf.pages[0].extract_text()
        self.assertIn('QUANTITATIVOS CONFIRMADOS',first)
        self.assertIn('Total sistema viário:',first)
        self.assertLess(first.index('Gleba A'),first.index('QUANTITATIVOS CONFIRMADOS'))
        self.assertLess(first.index('QUANTITATIVOS CONFIRMADOS'),first.index('VIAS · RESUMO'))
        text='\n'.join(p.extract_text() for p in pdf.pages)
        for i in range(16):self.assertIn('Via '+str(i+1),text)
        self.assertIn('QUANTITATIVOS CONFIRMADOS',text)

    def test_many_glebas_keep_totals_on_first_page(self):
        state,fields,image=self.fixture()
        state['entities']=[{**state['entities'][0],'attributes':{'name':'Gleba '+str(i)}} for i in range(40)]
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)))
        first=pdf.pages[0].extract_text()
        self.assertIn('QUANTITATIVOS CONFIRMADOS',first)
        self.assertIn('Total sistema viário:',first)
        text='\n'.join(p.extract_text() for p in pdf.pages)
        for i in range(40):self.assertIn('Gleba '+str(i),text)
