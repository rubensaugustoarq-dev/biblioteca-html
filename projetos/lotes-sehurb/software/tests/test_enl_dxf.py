import io
import hashlib
import copy
import json
import math
import unittest
import zipfile
from uuid import uuid4
from tempfile import TemporaryDirectory
from pathlib import Path
import ezdxf
import numpy as np
import rasterio
from rasterio.transform import from_origin
from fastapi.testclient import TestClient
from services.engine import api
from services.engine.store import Store
from services.engine.enl.cad_export import export

class EnlDxfTests(unittest.TestCase):
    def setUp(self):
        self.temp=TemporaryDirectory(dir='tests/evidence');self.previous=api.store;api.store=Store(self.temp.name)
        self.state=api.store.create('DXF ENL','EPSG:31979',-67.81,-9.974);self.pid=self.state['project']['id'];self.client=TestClient(api.app)
        def world(p):return [628000+p[0]*.8-p[1]*.6,8898000+p[0]*.6+p[1]*.8]
        self.world=world
        def rect(x,y,w,h):return {'type':'Polygon','coordinates':[[world(p) for p in [[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]]]]}
        source=str(uuid4());self.command('boundary.upsert',{'id':source,'name':'Original','geometry':rect(0,0,10,30)})
        self.lot={'id':str(uuid4()),'sourceEntityId':source,'name':'Lote A','geometry':rect(0,0,10,30),'frontEdge':0,'backEdge':2,'rules':{},'objects':[{'id':str(uuid4()),'kind':'building','name':'Casa','geometry':rect(2,5,6,20),'floors':1,'computableArea':None},{'id':str(uuid4()),'kind':'impermeable','name':'Estacionamento','geometry':rect(0,0,10,4),'floors':1,'computableArea':None}], 'texts':[{'id':str(uuid4()),'text':'Rua A','x':self.world([3,-1])[0],'y':self.world([3,-1])[1],'size':1,'angle':math.degrees(math.atan2(.6,.8)),'font':'Arial','bold':False,'color':'#123456','outline':False}]}
        self.command('enl.upsert',self.lot)
    def tearDown(self):api.store=self.previous;self.temp.cleanup()
    def command(self,type,args):
        self.state=api.store.command(self.pid,{'commandId':str(uuid4()),'expectedRevision':self.state['project']['revision'],'type':type,'parameters':args})
    def read(self,**kwargs):
        data,media,name=export(api.store,self.pid,self.lot['id'],**kwargs)
        self.assertEqual(media,'application/dxf');return ezdxf.read(io.StringIO(data.decode('utf-8')))
    def test_coordinates_alignment_spacing_layers_readonly(self):
        before=copy.deepcopy(api.store.state(self.pid));doc=self.read();msp=doc.modelspace()
        base=list(msp.query('LWPOLYLINE[layer=="BASE_GLEBAS"]'))[0];tech=list(msp.query('LWPOLYLINE[layer=="IMPLANTACAO_GLEBAS"]'))[0]
        for actual,expected in zip(base.get_points('xy'),self.lot['geometry']['coordinates'][0][:-1]):self.assertAlmostEqual(actual[0],expected[0]);self.assertAlmostEqual(actual[1],expected[1])
        pts=tech.get_points('xy');self.assertAlmostEqual(pts[0][1],pts[1][1]);self.assertAlmostEqual(math.dist(pts[0],pts[1]),10)
        self.assertGreater(min(p[0] for p in pts)-max(p[0] for p in base.get_points('xy')),49)
        self.assertEqual(doc.header['$INSUNITS'],6);self.assertIn('BASE_IMPERMEAVEL',doc.layers);self.assertEqual(len(list(msp.query('LWPOLYLINE[layer=="IMPLANTACAO_EDIFICACOES"]'))),1)
        self.assertEqual(api.store.state(self.pid),before);self.assertFalse(doc.audit().has_errors)
    def test_visibility_and_rotated_text(self):
        doc=self.read(texts=False,points=False,glebas=False,buildings=True,setbacks=False);msp=doc.modelspace()
        for layer in ['BASE_TEXTOS','BASE_PONTOS','BASE_COTAS_GLEBAS','BASE_AFASTAMENTOS']:self.assertFalse(list(msp.query(f'*[layer=="{layer}"]')))
        self.assertEqual(len(list(msp.query('DIMENSION[layer=="BASE_COTAS_EDIFICACOES"]'))),4)
        doc=self.read(points=True,glebas=True);msp=doc.modelspace();self.assertEqual(len(list(msp.query('POINT[layer=="BASE_PONTOS"]'))),4)
        text=list(msp.query('TEXT[layer=="IMPLANTACAO_TEXTOS"]'))[0];self.assertAlmostEqual(text.dxf.rotation,0,places=5);self.assertEqual(text.dxf.true_color,0x123456)
    def test_native_cotas_setbacks_fills_and_own_enl_report(self):
        from shapely.geometry import Polygon
        before=copy.deepcopy(api.store.state(self.pid));doc=self.read(glebas=True,buildings=True,setbacks=True);msp=doc.modelspace()
        for category,expected in [('COTAS_GLEBAS',[10,10,30,30]),('COTAS_EDIFICACOES',[6,6,20,20]),('AFASTAMENTOS',[2,2,5,5])]:
            values=[]
            for prefix in ('BASE','IMPLANTACAO'):
                dims=list(msp.query(f'DIMENSION[layer=="{prefix}_{category}"]'));self.assertEqual(len(dims),4)
                self.assertTrue(all(d.dimtype==1 and d.dxf.text=='<>' and d.dxf.geometry in doc.blocks for d in dims))
                actual=sorted(round(d.get_measurement(),5) for d in dims);self.assertEqual(actual,expected);values.append(actual)
            self.assertEqual(*values)
        cells=[e.plain_text() for e in msp.query('MTEXT') if e.dxf.layer.startswith('ENL_QUADRO_')]
        for value in ('ÁREAS E ÍNDICES DO LOTE','OBJETOS · RESUMO','LEGENDA','0,40','40,00 %','46,67 %','120,00 m²','160,00 m²','140,00 m²','Casa','Estacionamento'):self.assertIn(value,cells)
        self.assertFalse(any(e.dxf.layer.startswith('SEHURB_INFRA') for e in msp))
        for prefix in ('BASE','IMPLANTACAO'):
            hatches=list(msp.query(f'HATCH[layer=="{prefix}_HACHURAS_PERMEAVEL"]'))
            area=0
            for h in hatches:
                rings=[[(x,y) for x,y,_ in p.vertices] for p in h.paths]
                area+=Polygon(rings[0],rings[1:]).area
            self.assertAlmostEqual(area,140,places=5)
        maxx=max(p[0] for e in msp.query('LWPOLYLINE') if e.dxf.layer in ('BASE_GLEBAS','IMPLANTACAO_GLEBAS') for p in e.get_points('xy'))
        self.assertTrue(all(e.dxf.insert.x>maxx for e in msp.query('MTEXT') if e.dxf.layer.startswith('ENL_QUADRO_')))
        self.assertEqual(api.store.state(self.pid),before);self.assertFalse(doc.audit().has_errors)

    def test_native_cad_layers_visibility_and_copy(self):
        source=ezdxf.new('R2010');source.layers.new('PAREDES',dxfattribs={'color':3});source.layers.new('OCULTA',dxfattribs={'color':2})
        source.modelspace().add_line(self.world([0,0]),self.world([10,0]),dxfattribs={'layer':'PAREDES'});source.modelspace().add_line(self.world([0,3]),self.world([10,3]),dxfattribs={'layer':'OCULTA'})
        rid=str(uuid4());folder=api.store.folder(self.pid)/'assets'/rid;folder.mkdir();source.saveas(folder/'original.dxf')
        self.command('resource.add',{'resource':{'id':rid,'role':'vectorSource','relativePath':f'assets/{rid}/original.dxf','sha256':hashlib.sha256((folder/'original.dxf').read_bytes()).hexdigest(),'metadata':{'name':'planta.dxf','bounds':[627982,8898000,628008,8898030],'layers':[{'name':l.dxf.name,'visible':l.dxf.name!='OCULTA','color':l.color,'linetype':l.dxf.linetype,'lineweight':l.dxf.lineweight} for l in source.layers]}}})
        doc=self.read();lines=[e for e in doc.modelspace().query('LINE') if 'CAD_1_PAREDES' in e.dxf.layer];self.assertEqual(len(lines),2)
        technical=next(e for e in lines if 'IMPLANTACAO' in e.dxf.layer);self.assertAlmostEqual(technical.dxf.start.y,technical.dxf.end.y,places=5)
        hidden=[l for l in doc.layers if 'CAD_1_OCULTA' in l.dxf.name];self.assertEqual(len(hidden),2);self.assertTrue(all(l.is_off() for l in hidden));self.assertFalse(doc.audit().has_errors)
    def test_raster_package_relative_reference_and_opacity(self):
        rid=str(uuid4());folder=api.store.folder(self.pid);path=folder/'assets'/(rid+'.tif')
        with rasterio.open(path,'w',driver='GTiff',width=4,height=3,count=3,dtype='uint8',crs='EPSG:31979',transform=from_origin(628000,8898030,2,2)) as ds:ds.write(np.full((3,3,4),100,dtype='uint8'))
        self.command('resource.add',{'resource':{'id':rid,'role':'orthophoto','relativePath':f'assets/{rid}.tif','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'metadata':{'name':'ortho.tif','derivedPath':f'assets/{rid}.tif','opacity':.5,'bands':[1,2,3],'min':0,'max':255,'bounds':[628000,8898024,628008,8898030]}}})
        data,media,name=export(api.store,self.pid,self.lot['id']);self.assertEqual(media,'application/zip')
        from PIL import Image
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            doc=ezdxf.read(io.StringIO(z.read('SEHURB-ENL.dxf').decode('utf-8')));images=list(doc.modelspace().query('IMAGE'));self.assertEqual(len(images),1)
            self.assertEqual(images[0].dxf.layer,'BASE_ORTOFOTOS');self.assertAlmostEqual(images[0].dxf.insert.x,628000);self.assertAlmostEqual(images[0].dxf.insert.y,8898024)
            self.assertEqual(np.array(Image.open(io.BytesIO(z.read('imagens/ortofoto-1.png'))))[0,0,3],127)
            order=list(doc.modelspace().entities_in_redraw_order());self.assertEqual(order[0].dxftype(),'IMAGE');self.assertEqual(order[1].dxftype(),'HATCH')
            info=json.loads(z.read('exportacao.json'));self.assertEqual(info['crs'],'EPSG:31979');self.assertGreaterEqual(info['separationM'],50);self.assertFalse(doc.audit().has_errors)
    def test_endpoint_revision_and_missing_lot(self):
        url=f'/api/projects/{self.pid}/enl/cad/export';r=self.client.get(url,params={'lot_id':self.lot['id'],'revision':self.state['project']['revision']});self.assertEqual(r.status_code,200);self.assertIn('attachment',r.headers['content-disposition'])
        self.assertEqual(self.client.get(url,params={'lot_id':self.lot['id'],'revision':0}).status_code,409)
        self.assertEqual(self.client.get(url,params={'lot_id':str(uuid4())}).status_code,404)
if __name__=='__main__':unittest.main()
