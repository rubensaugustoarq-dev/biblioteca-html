from io import BytesIO
from pathlib import Path
from uuid import uuid4
import copy,json,math,unittest
from PIL import Image
from pypdf import PdfReader
from shapely.geometry import mapping,Polygon
from services.engine.infra.subdivision.layout import generate,validate
from services.engine.infra.pdf import render_infra
from services.engine.study_pdf import StudyFields
from services.engine.store import DomainError
from tests.test_infra import rect
from tests.test_subdivision_layout import LayoutCommandTests,layout

class SubdivisionPdfTests(unittest.TestCase):
    def fixture(self):
        boundary=rect(626000,8890000,40,30)
        value=layout(boundary);value['zones']=[{'id':str(uuid4()),'use':'green','name':'Área verde','geometry':rect(626000,8890025,40,5)}]
        result=generate(value,[]);identity=str(uuid4())
        state={'project':{'revision':5,'crs':{'authid':'EPSG:31979'}},'entities':[], 'subdivisionAreas':[{'id':identity,'name':'Gleba A','sourceName':'Gleba A','geometry':boundary,'layout':result}]}
        fields=StudyFields(title='Loteamento',content='LOTEAMENTO',date='17/10/2026',scale=300,center=(626004,8890015),expectedRevision=5,infraReport='subdivision',subdivisionAreaId=identity)
        image=BytesIO();Image.new('RGBA',(1560,1108),(220,235,225,255)).save(image,'PNG')
        return state,fields,image.getvalue()

    def test_compact_general_table_without_coordinates_or_added_points(self):
        state,fields,image=self.fixture();before=copy.deepcopy(state)
        pdf=render_infra(state,image,fields);reader=PdfReader(BytesIO(pdf));text='\n'.join(p.extract_text() for p in reader.pages)
        first=reader.pages[0].extract_text();self.assertIn('UTILIZAÇÃO DO SOLO',first)
        for content in ('Gleba A','Área verde','200,00','Lote 001','Lote 004','250,00','70,00','Área (m²)','Perímetro (m)'):
            self.assertIn(content,text)
        self.assertNotIn('VIAS · RESUMO',text);self.assertEqual(before,state)
        self.assertEqual(len(reader.pages),1)
        for omitted in ('EPSG:31979','626.000,000','8.890.000,000','P1','P4','Próximo (m)'):self.assertNotIn(omitted,text)
        for i,page in enumerate(reader.pages):
            self.assertIn(f'FOLHA: {i+1:02d}/{len(reader.pages):02d}',page.extract_text())
            self.assertAlmostEqual(float(page.mediabox.width)*25.4/72,420,places=3)

    def test_many_vertices_do_not_increase_pages(self):
        state,fields,image=self.fixture();value=state['subdivisionAreas'][0]['layout'];value['zones']=[]
        ring=[[626020+10*math.cos(i*math.tau/45),8890015+10*math.sin(i*math.tau/45)] for i in range(45)];ring.append(ring[0])
        value['lots']=value['lots'][:1];value['lots'][0]['geometry']={'type':'Polygon','coordinates':[ring]}
        value['parameters']['minFrontage']=0;value['parameters']['minArea']=1
        # Dense circular segments are valid polygons but not standard-front lots;
        # this fixture exercises report pagination, independently of generation.
        poly=Polygon(ring);value['lots'][0]['derived']={'areaM2':poly.area,'perimeterM':poly.length}
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)));text='\n'.join(p.extract_text() for p in pdf.pages)
        self.assertEqual(len(pdf.pages),1)
        for i in range(45):self.assertNotIn(f'P{i+1}',text)
        self.assertIn('Lote 001',text)

    def test_large_lot_list_is_compact_complete_and_numbered(self):
        state,fields,image=self.fixture();lots=[];template=state['subdivisionAreas'][0]['layout']['lots'][0]
        for i in range(80):lots.append({**copy.deepcopy(template),'id':str(uuid4()),'name':f'Lote {i+1:03d}','number':i+1})
        state['subdivisionAreas'][0]['layout']['lots']=lots
        reader=PdfReader(BytesIO(render_infra(state,image,fields)));text='\n'.join(p.extract_text() for p in reader.pages)
        self.assertEqual(len(reader.pages),4)
        for i in range(80):self.assertIn(f'Lote {i+1:03d}',text)
        for i,page in enumerate(reader.pages):self.assertIn(f'FOLHA: {i+1:02d}/04',page.extract_text())
        self.assertIn('UTILIZAÇÃO DO SOLO',reader.pages[0].extract_text())

    def test_long_custom_names_wrap_without_losing_text(self):
        state,fields,image=self.fixture();name='Lote de esquina destinado a uso comercial com identificação especial e nome extenso'
        state['subdivisionAreas'][0]['layout']['lots'][0]['name']=name
        reader=PdfReader(BytesIO(render_infra(state,image,fields)))
        text=' '.join(' '.join(p.extract_text() for p in reader.pages).split())
        self.assertIn(name,text)

    def test_missing_unapplied_or_wrong_area_rejected(self):
        state,fields,image=self.fixture();fields.subdivisionAreaId=str(uuid4())
        with self.assertRaises(DomainError):render_infra(state,image,fields)

class SubdivisionPdfEndpointTests(LayoutCommandTests):
    def test_report_endpoint_reads_saved_lots_and_rejects_stale_revision(self):
        preview=self.preview().json();self.assertEqual(self.apply(preview).status_code,200)
        fields={'title':'Loteamento aplicado','content':'LOTEAMENTO','date':'17/10/2026','scale':1000,'center':[20,25],'expectedRevision':self.doc['project']['revision'],'infraReport':'subdivision','subdivisionAreaId':self.id}
        image=BytesIO();Image.new('RGBA',(390,277),(220,235,225,255)).save(image,'PNG')
        url=f'/api/projects/{self.pid}/infra/pdf?preview=true'
        before=copy.deepcopy(self.doc)
        response=self.client.post(url,headers={'X-LSEHURB':'1'},data={'fields':json.dumps(fields)},files={'image':('mapa.png',image.getvalue(),'image/png')})
        self.assertEqual(response.status_code,200,response.text[:200]);self.assertEqual(response.json()['pageCount'],1)
        self.assertEqual(self.doc,before)
        fields['expectedRevision']-=1
        response=self.client.post(url,headers={'X-LSEHURB':'1'},data={'fields':json.dumps(fields)},files={'image':('mapa.png',image.getvalue(),'image/png')})
        self.assertEqual(response.status_code,409)
