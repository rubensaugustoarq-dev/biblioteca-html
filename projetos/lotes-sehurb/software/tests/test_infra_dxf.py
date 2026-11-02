import copy,io,unittest
from tempfile import TemporaryDirectory
from uuid import uuid4
import ezdxf
from shapely.geometry import shape,Polygon
from fastapi.testclient import TestClient
from services.engine import api,cad
from services.engine.store import Store
from services.engine.infra.domain import calculate
from services.engine.infra.cad_export import append
from tests.test_infra import road,rect


class InfraDxfTests(unittest.TestCase):
    def read(self,doc):
        stream=io.StringIO();doc.write(stream)
        out=ezdxf.read(io.StringIO(stream.getvalue()))
        self.assertFalse(out.audit().has_errors)
        return out

    def test_curved_intersections_closed_surfaces_holes_and_areas(self):
        origin=(626000,8890000)
        def coords(raw):return [[origin[0]+x,origin[1]+y] for x,y in raw]
        a={**road(coords([[0,0],[60,0],[60,60]])),'filletRadii':{'1':10},'clipToGleba':False}
        b={**road(coords([[30,0],[30,40]])),'material':'brick','clipToGleba':False,'startRadiusLeft':3,'startRadiusRight':3}
        items,metrics=calculate([a,b])
        hole=rect(626100,8890000,20,20);hole['coordinates'].append(rect(626105,8890005,5,5)['coordinates'][0])
        metrics['regions'].append({'role':'pavement','material':'concrete','geometry':hole})
        state={'infra':items,'infraMetrics':metrics,'subdivisionAreas':[]};before=copy.deepcopy(state)
        doc=ezdxf.new('R2010');append(doc,state,dimensions=True);out=self.read(doc)
        axes=list(out.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_EIXOS"]'))
        self.assertEqual(len(axes),2);self.assertFalse(axes[0].closed)
        self.assertEqual(list(axes[0].get_points('xy')),list(shape(items[0]['derived']['axisGeometry']).coords))
        expected=[]
        for region in metrics['regions']:
            g=shape(region['geometry'])
            for poly in ([g] if g.geom_type=='Polygon' else g.geoms):
                if not poly.is_empty:expected.extend([poly.exterior,*poly.interiors])
        surfaces=[e for e in out.modelspace().query('LWPOLYLINE') if e.dxf.layer!='SEHURB_INFRA_EIXOS' and '_QUADRO_' not in e.dxf.layer]
        self.assertEqual(len(surfaces),len(expected))
        for entity,ring in zip(surfaces,expected):
            self.assertTrue(entity.closed)
            actual=Polygon(entity.get_points('xy'));target=Polygon(ring)
            self.assertLess(actual.symmetric_difference(target).area,1e-7)
            self.assertAlmostEqual(actual.length,target.length,places=6)
        self.assertEqual(state,before)
        self.assertTrue(out.modelspace().query('DIMENSION[layer=="SEHURB_INFRA_COTAS_VIAS"]'))
        self.assertTrue(out.modelspace().query('ARC_DIMENSION'))

    def test_endpoint_saved_lots_green_and_roads_original_crs(self):
        with TemporaryDirectory(dir='tests/evidence') as folder:
            previous=api.store;api.store=Store(folder)
            try:
                state=api.store.create('DXF completo','EPSG:31979',-67.81,-9.974);pid=state['project']['id'];client=TestClient(api.app)
                def command(kind,args):
                    nonlocal state
                    response=client.post(f'/api/projects/{pid}/commands',headers={'X-LSEHURB':'1'},json={'commandId':str(uuid4()),'expectedRevision':state['project']['revision'],'type':kind,'parameters':args})
                    self.assertEqual(response.status_code,200,response.text);state=response.json()
                source=str(uuid4());command('boundary.upsert',{'id':source,'name':'Gleba','geometry':rect(626000,8890000,40,50)})
                command('infra.upsert',{**road([[626000,8889980],[626040,8889980]]),'sourceEntityId':source,'clipToGleba':False})
                from tests.test_subdivision_layout import layout
                value=layout(rect(626000,8890000,40,50));value['zones']=[{'id':str(uuid4()),'name':'Área verde','use':'green','geometry':rect(626000,8890040,40,10)}]
                identity=str(uuid4())
                response=client.post(f'/api/projects/{pid}/subdivision/layout/preview',headers={'X-LSEHURB':'1'},json={'id':identity,'sourceEntityId':source,'expectedRevision':state['project']['revision'],'layout':value})
                self.assertEqual(response.status_code,200,response.text);preview=response.json()
                command('subdivision.layout.apply',{'id':identity,'sourceEntityId':source,'previewRevision':preview['expectedRevision'],'layout':preview['layout']})
                before=copy.deepcopy(api.store.state(pid))
                response=client.get(f'/api/projects/{pid}/cad/export?infra=true');self.assertEqual(response.status_code,200)
                out=ezdxf.read(io.StringIO(response.content.decode('utf-8')));self.assertFalse(out.audit().has_errors)
                lots=list(out.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_LOTES"]'))
                saved=state['subdivisionAreas'][0]['layout']['lots'];self.assertEqual(len(lots),len(saved));self.assertGreater(len(lots),0)
                for poly,lot in zip(lots,saved):
                    self.assertTrue(poly.closed);self.assertEqual(list(poly.get_points('xy')),[tuple(p) for p in lot['geometry']['coordinates'][0][:-1]])
                self.assertTrue(out.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_AREA_VERDE"]'))
                self.assertTrue(out.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_PISTAS_CBUQ"]'))
                self.assertTrue(out.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_CALCADAS_CONCRETO"]'))
                labels=[e.plain_text() for e in out.modelspace().query('MTEXT')]
                self.assertTrue(any('Área verde' in text and 'm²' in text for text in labels))
                self.assertTrue(any('Lote 001' in text and 'm²' in text for text in labels))
                table_text=[e.plain_text() for e in out.modelspace().query('MTEXT') if '_QUADRO_' in e.dxf.layer]
                for title in ('POLIGONAIS DAS GLEBAS','QUANTITATIVOS CONFIRMADOS','VIAS · RESUMO','UTILIZAÇÃO DO SOLO','LOTES · RESUMO','LEGENDA'):
                    self.assertTrue(any(title in text for text in table_text),title)
                for lot in saved:
                    self.assertIn(lot['name'],table_text)
                    from services.engine.infra.pdf import fmt
                    self.assertIn(fmt(lot['derived']['areaM2']),table_text)
                    self.assertIn(fmt(lot['derived']['perimeterM']),table_text)
                geometries=[shape(e['geometry']) for e in state['entities']]+[shape(r['geometry']) for r in state['infraMetrics']['regions']]
                maxx=max(g.bounds[2] for g in geometries)
                self.assertTrue(all(e.dxf.insert.x>maxx for e in out.modelspace().query('MTEXT') if '_QUADRO_' in e.dxf.layer))
                custom=client.get(f'/api/projects/{pid}/cad/export',params={'infra':'true','legend':'[{"label":"Minha rua","color":"#ff0011"}]'})
                self.assertEqual(custom.status_code,200)
                custom_doc=ezdxf.read(io.StringIO(custom.content.decode('utf-8')))
                self.assertTrue(any(e.plain_text()=='Minha rua' for e in custom_doc.modelspace().query('MTEXT')))
                self.assertTrue(any(e.dxf.get('true_color')==0xff0011 for e in custom_doc.modelspace().query('LINE') if '_QUADRO_LEGENDA' in e.dxf.layer))
                self.assertEqual(client.get(f'/api/projects/{pid}/cad/export',params={'infra':'true','legend':'[{"label":"A","color":"bad"}]'}).status_code,422)
                self.assertEqual(out.header['$INSUNITS'],6);self.assertEqual(api.store.state(pid),before)
                native_response=client.get(f'/api/projects/{pid}/cad/export',params={'infra':'true','dimension_groups':'lots,roads'})
                self.assertEqual(native_response.status_code,200,native_response.text[:100])
                native_doc=ezdxf.read(io.StringIO(native_response.content.decode('utf-8')))
                self.assertTrue(native_doc.modelspace().query('DIMENSION[layer=="SEHURB_INFRA_COTAS_LOTES"]'))
                self.assertTrue(native_doc.modelspace().query('DIMENSION[layer=="SEHURB_INFRA_COTAS_SECOES"]'))
                self.assertFalse(native_doc.modelspace().query('DIMENSION[layer=="SEHURB_COTAS_GLEBAS"]'))
                self.assertEqual(client.get(f'/api/projects/{pid}/cad/export',params={'dimension_groups':'bad'}).status_code,422)
                study=ezdxf.read(io.StringIO(client.get(f'/api/projects/{pid}/cad/export').content.decode('utf-8')))
                self.assertFalse(any(e.dxf.layer.startswith('SEHURB_INFRA_') for e in study.modelspace()))
            finally:api.store=previous

    def test_native_hatches_material_patterns_holes_and_draw_order(self):
        from shapely.geometry import mapping,MultiPolygon
        outer=shape(rect(626000,8890000,10,10))
        hole=shape(rect(626003,8890003,2,2))
        geometry=outer.difference(hole)
        regions=[]
        for material in ('brick','asphalt','concrete','pavers','earth'):
            regions.append({'role':'unpaved' if material=='earth' else 'pavement','material':material,'geometry':mapping(geometry)})
        state={'infra':[],'infraMetrics':{'regions':regions},'subdivisionAreas':[{'layout':{'zones':[{'use':'green','name':'Área verde','geometry':mapping(MultiPolygon([geometry,shape(rect(626020,8890000,3,3))]))}]}}]}
        before=copy.deepcopy(state);doc=ezdxf.new('R2010')
        reference=doc.modelspace().add_text('Referência',dxfattribs={'height':1})
        append(doc,state);out=self.read(doc);hatches=list(out.modelspace().query('HATCH'))
        self.assertEqual(len(hatches),10)
        for hatch in hatches:
            self.assertTrue(hatch.dxf.layer.startswith('SEHURB_INFRA_HACHURAS_'))
            paths=hatch.paths.paths
            shell=paths[0];self.assertTrue(shell.is_closed);self.assertEqual(shell.path_type_flags&1,1)
            holes=[]
            for path in paths[1:]:
                self.assertTrue(path.is_closed);self.assertEqual(path.path_type_flags&1,0);holes.append([(x,y) for x,y,_ in path.vertices])
            polygon=Polygon([(x,y) for x,y,_ in shell.vertices],holes)
            expected=geometry if polygon.area>10 else shape(rect(626020,8890000,3,3))
            self.assertLess(polygon.symmetric_difference(expected).area,1e-7)
            self.assertEqual(hatch.dxf.hatch_style,0)
        patterns={h.dxf.pattern_name:h for h in hatches if not h.dxf.solid_fill}
        self.assertEqual(set(patterns),{'SEHURB_TIJOLO_V','SEHURB_CBUQ','SEHURB_INTERTRAVADO'})
        brick=patterns['SEHURB_TIJOLO_V'];self.assertEqual([line.angle for line in brick.pattern.lines],[45,135])
        self.assertAlmostEqual(brick.pattern.lines[0].dash_length_items[0],.3)
        concrete=next(h for h in hatches if h.dxf.layer.endswith('CONCRETO'))
        self.assertTrue(concrete.dxf.solid_fill);self.assertEqual(concrete.dxf.true_color,0xBFC7C7)
        order=list(out.modelspace().entities_in_redraw_order())
        self.assertTrue(all(e.dxftype()=='HATCH' for e in order[:len(hatches)]))
        self.assertIn(reference.dxf.handle,[e.dxf.handle for e in order[len(hatches):]])
        self.assertEqual(state,before)

    def test_summary_continuations_and_long_names_are_complete(self):
        from services.engine.infra.cad_tables import append as tables
        from services.engine.infra.pdf import fmt
        name='Terreno destinado a uso residencial com identificação longa e descrição completa'
        lots=[{'id':str(i),'name':f'Lote {i:03d}','number':i,'derived':{'areaM2':250+i,'perimeterM':70+i}} for i in range(67)]
        lots[0]['name']=name
        state={'entities':[{'attributes':{'name':'Gleba'},'geometry':rect(626000,8890000,50,60),'derived':{'areaM2':3000}}],'subdivisionAreas':[{'name':'Gleba com nome extenso '*7,'layout':{'lots':lots,'derived':{'categories':{}}}}]}
        before=copy.deepcopy(state);doc=ezdxf.new('R2010');tables(doc,state,'TESTE')
        out=self.read(doc);cells=[e.plain_text() for e in out.modelspace().query('MTEXT') if e.dxf.layer=='TESTE_QUADRO_LOTES']
        self.assertTrue(any(' '.join(t.split())==name for t in cells))
        for i,lot in enumerate(lots):
            if i:self.assertIn(lot['name'],cells)
            self.assertIn(fmt(lot['derived']['areaM2']),cells)
            self.assertIn(fmt(lot['derived']['perimeterM']),cells)
        self.assertEqual(sum('LOTES · RESUMO' in t for t in cells),3)
        self.assertGreater(len(set(round(e.dxf.insert.x,1) for e in out.modelspace().query('MTEXT') if 'LOTES · RESUMO' in e.plain_text())),1)
        self.assertEqual(state,before)

    def test_layer_collision_retains_reference_and_earth(self):
        items,metrics=calculate([{**road(),'material':'earth','sidewalkLeft':0,'sidewalkRight':0}])
        doc=ezdxf.new('R2010');doc.layers.new('SEHURB_INFRA_LOTES');doc.modelspace().add_point((1,2),dxfattribs={'layer':'SEHURB_INFRA_LOTES'})
        append(doc,{'infra':items,'infraMetrics':metrics})
        out=self.read(doc)
        self.assertTrue(out.modelspace().query('POINT[layer=="SEHURB_INFRA_LOTES"]'))
        self.assertTrue(out.modelspace().query('LWPOLYLINE[layer=="SEHURB_INFRA_EXPORT_VIAS_TERRA_TERRA"]'))

if __name__=='__main__':unittest.main()
