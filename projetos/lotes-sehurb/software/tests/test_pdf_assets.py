from io import BytesIO
import json,unittest
from unittest.mock import patch
from PIL import Image
from pypdf import PdfReader
from fastapi import UploadFile
from services.engine.pdf_assets import PdfAssets
from services.engine.infra.pdf import render_infra
from services.engine.store import DomainError
from tests.test_infra_shared_report import fixture


class PdfAssetsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.state,cls.fields,cls.image=fixture()
        cls.pdf=render_infra(cls.state,cls.image,cls.fields)

    def test_small_manifest_does_not_embed_pdf_or_render_any_page(self):
        cache=PdfAssets();result=cache.put('project',self.pdf,self.image,{'page':[420,297]},'report.pdf')
        self.assertLess(len(json.dumps(result)),5000)
        self.assertNotIn('pdf',result);self.assertNotIn('data:',json.dumps(result))
        token=result['pdfUrl'].split('/')[-2];entry=cache.get('project',token)
        self.assertEqual(entry.pages,{})
        self.assertGreater(entry.count,1);self.assertEqual(len(result['previews']),entry.count)
        first=cache.page('project',token,0);self.assertEqual(len(entry.pages),1)
        self.assertEqual(Image.open(BytesIO(first)).format,'JPEG')
        self.assertEqual(cache.page('project',token,0),first)
        cache.page('project',token,1);cache.page('project',token,2)
        self.assertEqual(len(entry.pages),2,'only two rendered page images retained')
        self.assertEqual(cache.get('project',token).pdf,self.pdf)
        with self.assertRaises(DomainError):cache.get('other',token)
        with self.assertRaises(DomainError):cache.page('project',token,entry.count)

    def test_cache_expiry_count_and_byte_budget(self):
        now=[0];cache=PdfAssets(limit=1,ttl=10,clock=lambda:now[0])
        a=cache.put('a',self.pdf,b'',{},'a.pdf');token=a['pdfUrl'].split('/')[-2]
        cache.put('b',self.pdf,b'',{},'b.pdf')
        with self.assertRaises(DomainError):cache.get('a',token)
        token=next(iter(cache.items));now[0]=11
        with self.assertRaises(DomainError):cache.get('b',token)
        with self.assertRaises(DomainError):PdfAssets(max_bytes=10).put('x',self.pdf,b'',{},'x.pdf')

    def test_repeated_map_and_logo_are_shared_between_pdf_pages(self):
        reader=PdfReader(BytesIO(self.pdf));images={}
        for page in reader.pages:
            for ref in page['/Resources']['/XObject'].get_object().values():
                obj=ref.get_object()
                if obj.get('/Subtype')=='/Image':images.setdefault((obj.get('/Width'),obj.get('/Height')),set()).add(ref.idnum)
        self.assertEqual(len(images[(780,554)]),1,'same map image is embedded once, not once per page')

    def test_transparent_map_masks_do_not_duplicate_the_photo_per_page(self):
        image=BytesIO();Image.new('RGBA',(390,277),(42,110,77,200)).save(image,'PNG')
        pdf=render_infra(self.state,image.getvalue(),self.fields)
        references=set()
        for page in PdfReader(BytesIO(pdf)).pages:
            for ref in page['/Resources']['/XObject'].get_object().values():
                obj=ref.get_object()
                if obj.get('/Subtype')=='/Image' and obj.get('/Width')==390:
                    self.assertIn('/SMask',obj);references.add(ref.idnum)
        self.assertEqual(len(references),1,'transparent photo must also be embedded once')

    def test_lazy_api_manifest_and_binary_assets_are_compatible(self):
        from services.engine import api,pdf_assets
        state=self.state
        class ReadOnlyStore:
            def state(self,pid):return state
        cache=PdfAssets()
        with patch.object(api,'store',ReadOnlyStore()),patch.object(pdf_assets,'assets',cache):
            response=api.infra_pdf('project',UploadFile(filename='map.png',file=BytesIO(self.image)),self.fields.model_dump_json(),True,preview_mode='lazy')
            result=json.loads(response.body);token=result['pdfUrl'].split('/')[-2]
            self.assertNotIn('pdf',result);self.assertEqual(cache.get('project',token).pages,{})
            self.assertEqual(api.pdf_document_asset('project',token).body[:5],b'%PDF-')
            self.assertEqual(api.pdf_map_asset('project',token).media_type,'image/png')
            page=api.pdf_page_asset('project',token,0);self.assertEqual(page.media_type,'image/jpeg')
            self.assertEqual(Image.open(BytesIO(page.body)).format,'JPEG')
