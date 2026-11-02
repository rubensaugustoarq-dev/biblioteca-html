from io import BytesIO
import base64,copy,json,unittest
from PIL import Image,ImageDraw,ImageChops
from pypdf import PdfReader
import pypdfium2
from services.engine.pdf_preview import framing_preview
from services.engine.infra.pdf import render_infra
from services.engine.study_pdf import StudyLegendItem
from tests.test_subdivision_pdf import SubdivisionPdfTests
from tests.test_study_pdf import StudyPdfTests

class FramingTests(unittest.TestCase):
    def fixture(self):return SubdivisionPdfTests().fixture()
    def test_fixed_elements_and_map_preview(self):
        state,fields,image=self.fixture();before=copy.deepcopy(fields)
        png,layout=framing_preview(image,fields,True)
        self.assertEqual(layout['map'],[20,10,390,277]);self.assertIn([250,229,160,58],layout['fixed'])
        self.assertTrue(any(box[:3]==[24,48,95] for box in layout['fixed']))
        self.assertLessEqual(max(Image.open(BytesIO(png)).size),1800)
        fields.center=(fields.center[0]-3,fields.center[1]+1.5)
        self.assertEqual(layout,framing_preview(image,fields,True)[1]);self.assertEqual(fields.scale,before.scale)
    def test_large_legend_masks_follow_print_layout(self):
        _,fields,image=self.fixture();fields.legendItems=[StudyLegendItem(label='Descrição de legenda '+str(i),color='#abcdef') for i in range(10)]
        _,layout=framing_preview(image,fields,True);legend=layout['fixed'][2];panel=layout['fixed'][3]
        self.assertEqual(legend[1]+legend[3],282);self.assertLess(panel[1]+panel[3],legend[1])
    def test_print_shift_keeps_stamp_and_tables_pixel_identical(self):
        state,fields,_=self.fixture();before_state=copy.deepcopy(state)
        images=[];pdfs=[]
        for dx,dy in [(0,0),(10,5)]:
            image=Image.new('RGBA',(1560,1108),(230,239,233,255));draw=ImageDraw.Draw(image)
            draw.rectangle((700+dx*4,350+dy*4,900+dx*4,550+dy*4),fill='#81bda4')
            out=BytesIO();image.save(out,'PNG');pdf=render_infra(state,out.getvalue(),fields);pdfs.append(pdf)
            doc=pypdfium2.PdfDocument(pdf);page=doc[0];bitmap=page.render(scale=1);images.append(bitmap.to_pil().copy());bitmap.close();page.close();doc.close()
        factor=72/25.4
        for x,y,w,h in [(250,229,160,58),(24,48,95,174)]:
            box=tuple(round(v*factor) for v in (x,y,x+w,y+h))
            self.assertIsNone(ImageChops.difference(images[0].crop(box),images[1].crop(box)).getbbox())
        self.assertEqual(state,before_state)
        for pdf in pdfs:self.assertIn('ESCALA 1:300',PdfReader(BytesIO(pdf)).pages[0].extract_text())

class FramingEndpointTests(StudyPdfTests):
    def test_preview_returns_map_and_fixed_paper_elements(self):
        data=BytesIO();Image.new('RGBA',(390,277),(20,80,60,255)).save(data,'PNG')
        response=self.client.post(self.url+'?preview=true',headers={'X-LSEHURB':'1'},data={'fields':json.dumps(self.fields)},files={'image':('mapa.png',data.getvalue(),'image/png')})
        self.assertEqual(response.status_code,200,response.text[:100]);result=response.json()
        self.assertIn('mapPreview',result);self.assertEqual(result['framing']['page'],[420,297])
        self.assertEqual(Image.open(BytesIO(base64.b64decode(result['mapPreview']))).size,(390,277))
