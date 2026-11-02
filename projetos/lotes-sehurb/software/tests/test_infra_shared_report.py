from copy import deepcopy
from io import BytesIO
from pathlib import Path
from uuid import uuid4
import unittest
from PIL import Image
from pypdf import PdfReader
from services.engine.infra.pdf import render_infra
from services.engine.infra.domain import calculate
from services.engine.infra.project_report import summary_cards,legend_entries
from services.engine.study_pdf import StudyFields
from services.engine.landscape.domain import candidate as landscape
from services.engine.accessibility.domain import candidate as ramp_candidate
from services.engine.accessibility.elements import candidate as element_candidate
from tests.test_accessibility import host,ramp
from tests.test_accessibility_elements import element
from tests.test_accessibility_parking import surface,parking
from tests.test_landscape_walkways import walkway
from tests.test_bridges import bridge
from tests.test_infra import rect


def fixture():
    h=host();h['name']='Via principal'
    infra,metrics=calculate([h,{**surface(),'geometry':rect(200,200,80,80)},walkway([[0,30],[20,30]],name='Caminho'),bridge(geometry={'type':'LineString','coordinates':[[20,30],[21,30]]})])
    ramps=[ramp_candidate(ramp(h,name='Rampa reta',slopePercent=8.33),infra,metrics),ramp_candidate(ramp(h,name='Rampa longitudinal',kind='longitudinal',anchor=[70,6],slopePercent=5,flankSlopePercent=5),infra,metrics)]
    ramps.append({**ramps[0],'id':str(uuid4()),'name':'Rampa sem vínculo','derived':{'status':'invalid'}})
    elements=[element_candidate(element('tactileWarning',name='Alerta'),infra,metrics),element_candidate(element('tactileDirectional',name='Direcional',pathMode='automatic'),infra,metrics),element_candidate(element('vehicleAccess',name='Acesso',anchor=[30,6]),infra,metrics),element_candidate(element('crosswalk',name='Travessia',anchor=[20,0]),infra,metrics),element_candidate(parking(anchor=[220,220],parkingType='accessible',transferWidthM=1.2),infra,metrics)]
    elements.append({**elements[0],'id':str(uuid4()),'derived':{'status':'invalid'}})
    planting=[landscape({'id':str(uuid4()),'kind':kind,'name':name,'geometry':{'type':'Point','coordinates':[100+i*10,30]},**params}) for i,(kind,name,params) in enumerate([('tree','Árvore',{'diameterM':4}),('palm','Palmeira',{'diameterM':3}),('chalet','Chalé A',{'sideM':3}),('hut','Choupana B',{'radiusM':2})])]
    for i in range(2):planting.append(landscape({'id':str(uuid4()),'kind':'water','name':'Lago '+str(i+1),'geometry':rect(100,50,10,10)}))
    state={'project':{'revision':1},'entities':[{'attributes':{'name':'Gleba geral'},'derived':{'areaM2':10000}}],'infra':infra,'infraMetrics':metrics,'accessibility':ramps,'accessibilityElements':elements,'landscape':planting}
    fields=StudyFields(title='Integração geral',date='02/11/2026',scale=500,expectedRevision=1)
    image=BytesIO();Image.new('RGB',(780,554),'#eff4ee').save(image,'PNG')
    return state,fields,image.getvalue()


class InfraSharedReportTests(unittest.TestCase):
    def test_complete_report_counts_formats_invalids_water_union_and_legend(self):
        state,fields,image=fixture();before=deepcopy(state)
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)));text='\n'.join(p.extract_text() for p in pdf.pages)
        for expected in ('ACESSIBILIDADE · RESUMO','PAISAGISMO · RESUMO','LEGENDA GERAL DO PROJETO','Rampa reta','Rampa longitudinal','Piso direcional','Piso de alerta','Acessos de veículos','Travessias','Vagas de estacionamento','PCD: 3 vagas','Lago 1','Lago 2','Copa Ø','placa','Ponte de madeira pião-roxo','100,00 m²','vínculo a revisar'):
            self.assertIn(expected,text)
        self.assertIn('QUANTITATIVOS CONFIRMADOS',pdf.pages[0].extract_text())
        for i,p in enumerate(pdf.pages):self.assertIn(f'FOLHA: {i+1:02d}/{len(pdf.pages):02d}',p.extract_text())
        self.assertEqual(state,before)
        legend=legend_entries(state);self.assertEqual(len(legend),len(set(legend)))
        self.assertIn(('invalid','Elemento com vínculo a revisar'),legend)

    def test_no_stamp_preserves_every_summary_and_legend_switch_only_hides_legend(self):
        state,fields,image=fixture()
        for legend in (True,False):
            pdf=PdfReader(BytesIO(render_infra(state,image,fields.model_copy(update={'showTitleBlock':False,'legend':legend}))))
            text='\n'.join(p.extract_text() for p in pdf.pages)
            self.assertNotIn('SEHURB',text);self.assertNotIn('FOLHA:',text)
            self.assertIn('PAISAGISMO · RESUMO',text);self.assertIn('ACESSIBILIDADE · RESUMO',text)
            self.assertEqual('LEGENDA GERAL DO PROJETO' in text,legend)

    def test_long_names_and_sections_continue_without_clipping_or_lost_names(self):
        state,fields,image=fixture()
        base=state['infra'][0]
        state['infra']=[{**base,'id':str(uuid4()),'name':f'Via {i:02d} com um nome de apresentação suficientemente longo para ocupar mais de uma linha no quadro'} for i in range(20)]
        state['entities']=[{'attributes':{'name':f'Gleba {i:02d} com denominação extensa para conferência do quadro geral'},'derived':{'areaM2':10000}} for i in range(30)]
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)));text='\n'.join(p.extract_text() for p in pdf.pages)
        self.assertIn('QUANTITATIVOS CONFIRMADOS',pdf.pages[0].extract_text())
        for i in range(20):self.assertIn(f'Via {i:02d}',text)
        for i in range(30):self.assertIn(f'Gleba {i:02d}',text)
        self.assertIn('LEGENDA GERAL DO PROJETO',text)

    def test_roofs_same_size_only_totals_different_size_identifies_exception(self):
        state,fields,image=fixture()
        original=next(v for v in state['landscape'] if v['kind']=='chalet')
        state['landscape'].extend([{**original,'id':str(uuid4()),'name':'Chalé padrão '+str(i),'rotationDegrees':i*10} for i in range(8)])
        def report():return '\n'.join(str(c[1]) for c in summary_cards(state))
        text=report();coverage=next(c[1] for c in summary_cards(state) if c[0]=='table' and c[1]['title']=='COBERTURAS');self.assertEqual(coverage['rows'],[['Chalés','9'],['Choupanas','1']]);self.assertNotIn('DIMENSÕES DIFERENTES',text)
        self.assertNotIn('Chalé padrão',text);self.assertNotIn('Chalé A',text);self.assertNotIn('duas águas',text);self.assertNotIn('Projeção das coberturas',text)
        exception=landscape({'id':str(uuid4()),'kind':'chalet','name':'Chalé especial','sideM':4,'geometry':{'type':'Point','coordinates':[140,30]}})
        state['landscape'].append(exception)
        hut=landscape({'id':str(uuid4()),'kind':'hut','name':'Choupana maior','radiusM':3,'geometry':{'type':'Point','coordinates':[150,30]}})
        state['landscape'].append(hut)
        text=report();details=next(c[1] for c in summary_cards(state) if c[0]=='table' and c[1]['title']=='COBERTURAS · DIMENSÕES DIFERENTES');self.assertIn(['Chalés','lado 3,00 m','9','Grupo principal'],details['rows']);self.assertIn(['Chalés','lado 4,00 m','1','Chalé especial'],details['rows'])
        self.assertIn('raio 3,00 m',text);self.assertIn('Choupana maior',text)
        pdf=PdfReader(BytesIO(render_infra(state,image,fields)));self.assertIn('Chalé especial','\n'.join(p.extract_text() for p in pdf.pages))

    def test_landscape_tables_split_with_repeated_columns_and_keep_all_groups(self):
        from services.engine.infra.landscape_report import landscape_cards
        state,_,_=fixture();base=next(v for v in state['landscape'] if v['kind']=='tree')
        state['landscape']=[{**base,'id':str(uuid4()),'diameterM':1+i/10} for i in range(40)]
        before=deepcopy(state);cards=landscape_cards(state,55)
        tables=[c for c in cards if c[0]=='table']
        self.assertGreater(len(tables),1);self.assertEqual(sum(len(c[1]['rows']) for c in tables),40)
        for card in tables:
            self.assertLessEqual(card[2],48.001);self.assertEqual(card[1]['headers'],['Tipo','Copa Ø (m)','Qtd.'])
        self.assertEqual(state,before)

    def test_render_evidence(self):
        state,fields,image=fixture();folder=Path('tests/evidence/infra-shared-report');folder.mkdir(exist_ok=True)
        for enabled in (True,False):
            data=render_infra(state,image,fields.model_copy(update={'showTitleBlock':enabled}))
            (folder/('com-carimbo.pdf' if enabled else 'sem-carimbo.pdf')).write_bytes(data)
