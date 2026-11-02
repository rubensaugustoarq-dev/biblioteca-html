from io import BytesIO
from copy import deepcopy
from pathlib import Path
import unittest,shutil,subprocess
from PIL import Image,ImageChops
from pypdf import PdfReader
from services.engine.study_pdf import StudyFields,render_study
from services.engine.infra.pdf import render_infra
from services.engine.pdf_preview import framing_preview
from tests.test_infra_pdf import InfraPdfTests
from tests.test_subdivision_pdf import SubdivisionPdfTests


class PdfTitleBlockTests(unittest.TestCase):
    def test_legacy_default_and_framing_mask(self):
        state,fields,image=InfraPdfTests().fixture()
        self.assertTrue(fields.showTitleBlock)
        shown=framing_preview(image,fields,True)[1]
        hidden=framing_preview(image,fields.model_copy(update={'showTitleBlock':False}),True)[1]
        self.assertEqual(shown['map'],hidden['map'])
        self.assertIn([250,229,160,58],shown['fixed'])
        self.assertNotIn([250,229,160,58],hidden['fixed'])
        self.assertEqual([b for b in shown['fixed'] if b!=[250,229,160,58]],hidden['fixed'])

    def test_all_a3_reports_hide_only_title_block(self):
        evidence=Path('tests/evidence/pdf-title-block');evidence.mkdir(exist_ok=True)
        road=InfraPdfTests().fixture(16);subdivision=SubdivisionPdfTests().fixture()
        for name,fixture,render in (('estudo',InfraPdfTests().fixture(),render_study),('vias',road,render_infra),('loteamento',subdivision,render_infra)):
            state,fields,image=fixture;before=deepcopy(state)
            with self.subTest(report=name):
                results={}
                for enabled in (True,False):
                    data=render(state,image,fields.model_copy(update={'showTitleBlock':enabled}))
                    results[enabled]=PdfReader(BytesIO(data))
                    (evidence/(name+('-com' if enabled else '-sem')+'.pdf')).write_bytes(data)
                self.assertEqual(len(results[True].pages),len(results[False].pages))
                for shown,hidden in zip(results[True].pages,results[False].pages):
                    text=hidden.extract_text();self.assertNotIn('SEHURB',text);self.assertNotIn('RESP. TÉCNICO',text);self.assertNotIn('FOLHA:',text)
                    self.assertIn('SEHURB',shown.extract_text());self.assertIn('Quadrícula',text);self.assertIn('LEGENDA',text)
                    self.assertEqual(shown.mediabox,hidden.mediabox)
                if name=='vias':
                    self.assertGreater(len(results[False].pages),1)
                    text='\n'.join(p.extract_text() for p in results[False].pages)
                    for value in ('QUANTITATIVOS CONFIRMADOS','Via 16','SEÇÕES DAS VIAS','Calçamento:'):self.assertIn(value,text)
                if name=='loteamento':
                    text=results[False].pages[0].extract_text()
                    for value in ('UTILIZAÇÃO DO SOLO','Lote 001','Área verde','Perímetro (m)'):self.assertIn(value,text)
                self.assertEqual(state,before)
                executable=shutil.which('pdftoppm')
                if executable:
                    pictures=[]
                    for suffix in ('com','sem'):
                        prefix=evidence/(name+'-'+suffix)
                        subprocess.run([executable,'-f','1','-singlefile','-scale-to-x','1260','-scale-to-y','-1','-png',str(prefix.with_suffix('.pdf')),str(prefix)],check=True,capture_output=True)
                        pictures.append(Image.open(prefix.with_suffix('.png')).convert('RGB'))
                    box=ImageChops.difference(*pictures).getbbox();self.assertIsNotNone(box)
                    # Rendering differs only inside the removed 250,229 / 160x58 mm stamp.
                    self.assertGreaterEqual(box[0],749);self.assertGreaterEqual(box[1],686)
                    self.assertLessEqual(box[2],1232);self.assertLessEqual(box[3],863)
