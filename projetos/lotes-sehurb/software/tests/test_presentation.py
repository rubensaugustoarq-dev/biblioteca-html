from contextlib import closing
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import unittest
from pypdf import PdfReader
from fastapi.testclient import TestClient
from services.engine.store import Store, DomainError
from services.engine.sheets import render_pdf
from services.engine import api

class PresentationTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir=Path(__file__).parent/'evidence')
        self.store=Store(self.temp.name)
        self.state=self.store.create('Teste A1','EPSG:31979',-67.81,-9.974)
        self.id=self.state['project']['id']
    def tearDown(self): self.temp.cleanup()
    def command(self,kind,data={}):
        self.state=self.store.command(self.id,dict(commandId=str(uuid4()),expectedRevision=self.state['project']['revision'],type=kind,parameters=data))
        return self.state
    def sheet(self):
        return dict(id=str(uuid4()),name='Prancha teste',center=[630000,8897000],scale=1000,
                    viewport=dict(x=34,y=16,width=607,height=465), fields=dict(work='Projeto de verificação',author='Responsável de teste',number='01/01',date='11/10/2026'))
    def test_text_sheet_history_reopen_and_save_as(self):
        a=dict(id=str(uuid4()),text='Rua de teste',x=630000,y=8897000,size=2,angle=35)
        self.command('annotation.upsert',a);s=self.sheet();self.command('sheet.upsert',s)
        self.assertEqual({k:Store(self.temp.name).state(self.id)['annotations'][0][k] for k in a},a)
        self.command('undo');self.assertEqual(self.state['sheets'],[])
        self.command('redo');self.assertEqual(self.state['sheets'][0]['id'],s['id'])
        self.command('annotation.delete',dict(id=a['id']));self.command('undo')
        self.assertEqual(self.state['annotations'][0]['angle'],35)
        target=Path(self.temp.name)/'copias';target.mkdir()
        copied=self.store.save_as(self.id,target,self.state['project']['revision'])
        self.assertEqual(copied['document']['annotations'],self.state['annotations'])
        self.assertEqual(copied['document']['sheets'],self.state['sheets'])
    def test_invalid_values_do_not_advance_revision(self):
        rev=self.state['project']['revision']
        for bad in [dict(id=str(uuid4()),text='',x=0,y=0),dict(id=str(uuid4()),text='Rua',x=float('inf'),y=0)]:
            with self.assertRaises((DomainError,ValueError)):self.command('annotation.upsert',bad)
        s=self.sheet();s['viewport']['width']=800
        with self.assertRaises(DomainError):self.command('sheet.upsert',s)
        s=self.sheet();s['center']=[]
        with self.assertRaises(DomainError):self.command('sheet.upsert',s)
        self.assertEqual(self.store.state(self.id)['project']['revision'],rev)
    def test_pdf_dimensions_fields_rotation_and_no_sample_data(self):
        self.command('annotation.upsert',dict(id=str(uuid4()),text='Rua de teste',x=630000,y=8897000,size=2,angle=35))
        s=self.sheet();self.command('sheet.upsert',s)
        data=render_pdf(self.store,self.id,s['id']);pdf=PdfReader(BytesIO(data));p=pdf.pages[0]
        self.assertAlmostEqual(float(p.mediabox.width)/72*25.4,841,places=3)
        self.assertAlmostEqual(float(p.mediabox.height)/72*25.4,594,places=3)
        text=p.extract_text();self.assertIn('Rua de teste',text);self.assertIn('Responsável de teste',text)
        self.assertIn('Projeto de verificação',text)
        self.assertNotIn('43.917,17',text)
        self.assertNotIn('00A2129485',text)
        self.assertNotIn('xxxxxxxx',text)
        self.assertGreater(len(data),10000)
    def test_api_sheets_paused_and_text_style_history(self):
        old=api.store;api.store=self.store
        try:
            with TestClient(api.app) as client:
                s=self.sheet();self.command('sheet.upsert',s)
                for suffix in ('pdf','preview'):
                    response=client.get(f'/api/projects/{self.id}/sheets/{s["id"]}/{suffix}')
                    self.assertEqual(response.status_code,410)
                response=client.post(f'/api/projects/{self.id}/commands',headers={'X-LSEHURB':'1'},json=dict(commandId=str(uuid4()),expectedRevision=self.state['project']['revision'],type='sheet.upsert',parameters=s))
                self.assertEqual(response.status_code,422)
                a=dict(id=str(uuid4()),text='Rua estilizada',x=630000,y=8897000,size=3,angle=40,font='Courier New',bold=False,color='#abcdef',outline=True,outlineColor='#001122',outlineWidth=4)
                self.command('annotation.upsert',a)
                self.assertEqual(self.state['annotations'][0],a)
                self.command('annotation.upsert',{**a,'font':'Times New Roman','outline':False})
                self.command('undo');self.assertEqual(self.state['annotations'][0],a)
                self.assertEqual(Store(self.temp.name).state(self.id)['annotations'][0],a)
                with self.assertRaises(DomainError):self.command('annotation.upsert',{**a,'font':'Fonte inexistente'})
                with self.assertRaises(DomainError):self.command('annotation.upsert',{**a,'color':'url(invalid)'})
                with self.assertRaises(DomainError):self.command('annotation.upsert',{**a,'outlineWidth':99})
        finally:api.store=old

    def test_raster_pdf_and_text_visibility(self):
        from fastapi import UploadFile
        from services.engine.raster import prepare
        source=Path(__file__).parent/'evidence'/'ortofoto-sintetica-teste.tif'
        with source.open('rb') as file:
            r=prepare(self.store,self.id,UploadFile(filename=source.name,file=file))
        self.command('resource.add',dict(resource=r))
        self.command('annotation.upsert',dict(id=str(uuid4()),text='Rua escondida',x=630000,y=8897000,size=2,angle=0))
        s=self.sheet();s['showText']=False;self.command('sheet.upsert',s)
        p=PdfReader(BytesIO(render_pdf(self.store,self.id,s['id']))).pages[0]
        self.assertTrue(any(i.name.startswith('FormXob') for i in p.images))
        self.assertNotIn('Rua escondida',p.extract_text())
        s['showText']=True;self.command('sheet.upsert',s)
        p=PdfReader(BytesIO(render_pdf(self.store,self.id,s['id']))).pages[0]
        self.assertIn('Rua escondida',p.extract_text())

if __name__=='__main__':unittest.main()
