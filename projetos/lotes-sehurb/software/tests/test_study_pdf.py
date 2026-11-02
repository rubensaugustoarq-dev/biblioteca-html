from io import BytesIO
from tempfile import TemporaryDirectory
import unittest
from PIL import Image
from pypdf import PdfReader
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store


class StudyPdfTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir="tests/evidence");self.previous=api.store;api.store=Store(self.temp.name)
        self.doc=api.store.create('Estudo A3','EPSG:31979',-67.81,-9.974)
        self.url='/api/projects/'+self.doc['project']['id']+'/study/pdf'
        self.client=TestClient(api.app)
        self.fields=dict(title='URBANIZAÇÃO JOAFRA',content='ESTUDO DE GLEBA',location='Rio Branco/AC',author='Responsável de teste',date='11/10/2026',revision='00',sheet='01/01',scale=2500,expectedRevision=self.doc['project']['revision'])
    def tearDown(self):
        api.store=self.previous;self.temp.cleanup()
    def export(self, size=(390,277),image=None):
        import json
        data=BytesIO();(image or Image.new('RGBA',size,(25,100,60,130))).save(data,'PNG')
        return self.client.post(self.url,headers={'X-LSEHURB':'1'},data={'fields':json.dumps(self.fields)},files={'image':('mapa.png',data.getvalue(),'image/png')})
    def test_dimensions_fields_alpha_and_no_mutation(self):
        response=self.export();self.assertEqual(response.status_code,200,response.text[:100])
        p=PdfReader(BytesIO(response.content)).pages[0]
        self.assertAlmostEqual(float(p.mediabox.width)*25.4/72,420,places=3)
        self.assertAlmostEqual(float(p.mediabox.height)*25.4/72,297,places=3)
        text=p.extract_text()
        for v in ['URBANIZAÇÃO JOAFRA','ESCALA 1:2.500','Rio Branco/AC','SEHURB','420 × 297 mm']:self.assertIn(v,text)
        objects=p['/Resources']['/XObject'].get_object().values()
        self.assertTrue(any('/SMask' in o.get_object() for o in objects))
        self.assertEqual(api.store.state(self.doc['project']['id']),self.doc)
        self.assertNotIn('ÁREA:',text)
        self.fields['area']='43.917,17'
        populated=PdfReader(BytesIO(self.export().content)).pages[0].extract_text()
        self.assertIn('ÁREA: 43.917,17 m²',populated)
        self.assertIn('MATRÍCULA:',populated)
    def test_bad_ratio_scale_and_revision_are_rejected(self):
        self.assertEqual(self.export((300,300)).status_code,422)
        self.fields['scale']=0;self.assertEqual(self.export().status_code,422)
        self.fields['scale']=1000;self.fields['expectedRevision']+=1;self.assertEqual(self.export().status_code,409)
    def test_paused_a1_stays_paused(self):
        from uuid import uuid4
        response=self.client.get('/api/projects/'+self.doc['project']['id']+'/sheets/'+str(uuid4())+'/pdf')
        self.assertEqual(response.status_code,410)
    def test_custom_legend_grows_upward_and_uses_item_colors(self):
        from pypdf.generic import ContentStream
        from reportlab.lib.units import mm
        def legend_rect(page):
            operations=ContentStream(page.get_contents(),page.pdf).operations
            return next([float(v) for v in args] for args,op in operations if op==b're' and abs(float(args[0])-25*mm)<.01 and abs(float(args[1])-15*mm)<.01)
        first=PdfReader(BytesIO(self.export().content)).pages[0]
        initial=legend_rect(first)
        self.fields['legendItems']=[{'label':name,'color':color} for name,color in [('Poligonal do estudo','#00ff00'),('Via existente','#ff0000'),('Área verde','#0000ff'),('Calçada prevista','#ff00ff')]]
        page=PdfReader(BytesIO(self.export().content)).pages[0]
        enlarged=legend_rect(page)
        self.assertEqual(initial[1],enlarged[1])
        self.assertGreater(enlarged[3],initial[3])
        for item in self.fields['legendItems']:self.assertIn(item['label'],page.extract_text())
        self.assertNotIn('POLIGONAL DE INTERVENÇÃO',page.extract_text())
        strokes=[tuple(float(v) for v in args) for args,op in ContentStream(page.get_contents(),page.pdf).operations if op==b'RG']
        for color in [(0,1,0),(1,0,0),(0,0,1),(1,0,1)]:self.assertIn(color,strokes)
        self.fields['legendItems']=[]
        self.assertNotIn('LEGENDA',PdfReader(BytesIO(self.export().content)).pages[0].extract_text())
    def test_preview_renders_same_pdf_without_browser_pdf_support(self):
        self.url+='?preview=true'
        response=self.export();self.assertEqual(response.status_code,200)
        import base64
        result=response.json()
        self.assertEqual(base64.b64decode(result['pdf'])[:5],b'%PDF-')
        image=Image.open(BytesIO(base64.b64decode(result['preview'])))
        self.assertGreater(image.width,image.height)
    def test_local_ortho_scaling_opacity_and_foreground(self):
        import numpy as np
        import rasterio
        from rasterio.transform import from_bounds
        from pathlib import Path
        from uuid import uuid4
        from fastapi import UploadFile
        from services.engine.raster import prepare
        from services.engine.study_pdf import StudyFields,render_rasters
        project_id=self.doc['project']['id']
        source=api.store.folder(project_id)/'test-raster.tif'
        values=np.zeros((3,70,100),dtype='uint8');values[0]=255
        with rasterio.open(source,'w',driver='GTiff',width=100,height=70,count=3,dtype='uint8',crs='EPSG:31979',transform=from_bounds(629500,8896650,630500,8897350,100,70)) as raster:raster.write(values)
        with source.open('rb') as file:resource=prepare(api.store,project_id,UploadFile(filename='teste.tif',file=file))
        self.doc=api.store.command(project_id,dict(commandId=str(uuid4()),expectedRevision=self.doc['project']['revision'],type='resource.add',parameters={'resource':resource}))
        self.fields.update(center=[630000,8897000],rasters=[{'id':resource['id'],'opacity':.5}],expectedRevision=self.doc['project']['revision'])
        vector=Image.new('RGBA',(390,277));vector.putpixel((195,138),(0,0,255,255));out=BytesIO();vector.save(out,'PNG')
        for scale in [1500,2500,5000]:
            self.fields['scale']=scale
            rendered=Image.open(BytesIO(render_rasters(api.store,self.doc,StudyFields(**self.fields),out.getvalue())))
            self.assertEqual(rendered.getpixel((196,138)),(255,0,0,128))
            self.assertEqual(rendered.getpixel((195,138)),(0,0,255,255))
            if scale==5000:self.assertEqual(rendered.getpixel((0,0))[3],0)

if __name__=='__main__':unittest.main()


