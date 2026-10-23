(async function(){
'use strict';
const ASSETS=window.LAYOUT_ASSETS||JSON.parse(document.getElementById('asset-data').textContent),NS='http://www.w3.org/2000/svg',W=1200,H=1697.142857,SCALE=150,PLAN_X=135,STORE='sehurb-bem-estar-projeto-final-r09';
const imageCache=new Map();async function hydrateImages(v){if(typeof v==='string'&&v.startsWith('imagens/')){if(!imageCache.has(v))imageCache.set(v,(async()=>{const r=await fetch(v);if(!r.ok)throw Error('Imagem indisponível: '+v);const b=await r.blob();return await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=no;fr.readAsDataURL(b);});})());return imageCache.get(v);}if(Array.isArray(v))return Promise.all(v.map(hydrateImages));if(v&&typeof v==='object'){for(const k of Object.keys(v))v[k]=await hydrateImages(v[k]);}return v;}
await hydrateImages(ASSETS);const seedNode=document.getElementById('saved-state');seedNode.textContent=JSON.stringify(await hydrateImages(JSON.parse(seedNode.textContent)));
if(ASSETS.logo && !ASSETS.logo.startsWith('data:')){
 try {const response=await fetch(ASSETS.logo);if(!response.ok)throw Error('Logo indisponível');const blob=await response.blob();ASSETS.logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});}catch(error){ASSETS.logo='';console.warn(error);}
}
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),clone=o=>JSON.parse(JSON.stringify(o));
let seq=0;function uid(){return 'e'+Date.now().toString(36)+(seq++).toString(36)}
const catalog={massage:{name:'Poltrona de massagem',code:'M01',w:120,h:195,color:'#434e41'},quick:{name:'Cadeira quick massage',code:'M02',w:82.5,h:135,color:'#333b35'},maca:{name:'Maca',code:'M03',w:97.5,h:270,color:'#c2c9b9'},pouf:{name:'Pufe',code:'M04',w:98,h:98,color:'#9da98c'},chair:{name:'Poltrona',code:'M05',w:113,h:129,color:'#99a78b'},coffee:{name:'Cantinho do café',code:'M06',w:115,h:70,color:'#c9a77b'},rug:{name:'Tapete orgânico',code:'M07',w:230,h:310,color:'#d6c4a9'},roundrug:{name:'Tapete Classic redondo',code:'M07',w:240,h:240,color:'#d6c4a9'},plant:{name:'Planta decorativa',code:'M09',w:85,h:85,color:'#729063'},tv:{name:'Televisor',code:'M10',w:9,h:128,color:'#26332c'}};
catalog.humidifier={name:'Umidificador de ar',code:'M11',w:45,h:45,color:'#dce7e1'};
catalog.curtain={name:'Cortina acima do rodapé · P01',code:'M12',w:285,h:15,color:'#bdbbb3',curtainHeight:2.70};
if(!document.querySelector('#catalog option[value=curtain]'))document.querySelector('#catalog').add(new Option('Cortina acima do rodapé · P01','curtain'));
catalog.tvstand={name:'Suporte de TV para 55 polegadas',code:'M13',w:24,h:24,color:'#929699'};
document.querySelector('#catalog').add(new Option('M13 · Suporte de TV para 55 polegadas','tvstand'));
catalog.coffee.name='Aparador para cantinho do café';
document.querySelector('#catalog option[value="coffee"]').textContent=catalog.coffee.name;
const itemCondition={massage:'Existente',quick:'Existente',maca:'Existente',pouf:'Novo',coffee:'Existente',rug:'Novo',plant:'Novo',tv:'Existente',led_strip:'Novo',humidifier:'Novo',curtain:'Novo',tvstand:'Novo'};
if(!document.querySelector('#catalog option[value=humidifier]'))document.querySelector('#catalog').add(new Option('Umidificador de ar','humidifier'));
function furniture(type,x,y,angle=0){return {id:uid(),kind:'furniture',type,x,y,angle,...clone(catalog[type]),condition:itemCondition[type]==='Existente'?'existing':'new',locked:false}}
function initial(){const finalSeed=JSON.parse(document.getElementById('saved-state').textContent||'null');if(finalSeed?.finalSelection)return clone(finalSeed);return {
format:'sehurb-layout',version:1,updated:0,title:'SALA DE BEM-ESTAR E DESCOMPRESSÃO',
agency:'SEHURB · Governo do Estado do Acre',author:'WEMELLI E RUBENS',revision:'R05',date:'21/10/2026',
notes:'Estudo preliminar. Sala: 3,80 × 4,08 m; área de referência: 15,49 m². P01 / P02: acabamentos a definir; cortina junto ao forro, com barra no mínimo 15 cm acima do piso em P01; porta cinza em P02; janela com adesivo cinza e porta bloqueada em P03. Conferir medidas e folgas no local.',
logo:ASSETS.logo,mural:ASSETS.mural,showArt:true,showIds:true,
objects:[furniture('rug',632,690),furniture('coffee',713,681,90),furniture('massage',380,473,-18),furniture('maca',230,672.5),furniture('pouf',545,412),furniture('pouf',704,575),furniture('chair',438,887.5),furniture('plant',235,380),furniture('tv',743.5,749),furniture('quick',255,885,-140),{id:uid(),kind:'text',x:463,y:732,w:280,h:55,angle:0,text:'BEM-ESTAR',font:23,color:'#3d5140',bold:true}],
columns:[{id:'code',title:'Código'},{id:'name',title:'Mobiliário / equipamento'},{id:'qty',title:'Qtd.'},{id:'dim',title:'Dimensões (m)'},{id:'notes',title:'Observações'}],overrides:{},extraRows:[]}}
let state=initial(),selected=null,activeSheet='plan',mode='select',drawStart=null,drag=null,history=[],future=[],zoom=85;
const embedded=JSON.parse($('saved-state').textContent||'null');if(embedded)state=embedded;
try{const auto=JSON.parse(localStorage.getItem(STORE)||'null');if(auto&&auto.format==='sehurb-layout'&&auto.updated>state.updated){if(auto.logo==='@embedded-logo')auto.logo=ASSETS.logo;if(auto.mural==='@embedded-mural')auto.mural=ASSETS.mural;state=auto}}catch(e){}
const finalDB=await new Promise(resolve=>{const req=indexedDB.open(STORE,1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);});
if(finalDB){try{const saved=await new Promise((resolve,reject)=>{const req=finalDB.transaction('projects').objectStore('projects').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(saved?.format==='sehurb-layout'&&saved.updated>state.updated)state=saved;}catch(e){console.warn('Não foi possível ler a cópia automática.',e);}}
function removeOldLampSymbols(v){
const lists=[v.objects,...(v.customSheets||[]).map(s=>s.items),...Object.values(v.sheetItems||{})].filter(Array.isArray);
const ids=new Set(lists.flat().filter(o=>o.type==='t8').map(o=>o.id));
for(const list of lists)for(let i=list.length-1;i>=0;i--)if(list[i].type==='t8'||(list[i].kind==='arrow'&&ids.has(list[i].target)))list.splice(i,1);
if(v.overrides)delete v.overrides.t8;if(v.extraRows)v.extraRows=v.extraRows.filter(r=>r.id!=='t8');
return v
}
function migrate(){if(!state.requestedEditsRV06){for(const o of state.objects||[])if(o.type==='curtain'){o.curtainHeight=2.70;o.name='Cortina acima do rodapé · P01';}state.requestedEditsRV06=true;}if(!state.mural)state.mural=ASSETS.mural;if(state.showArt===undefined)state.showArt=true;state.customSheets??=[];state.sheetOrder??=[];state.sheetItems??={};state.sheetTitles??={};state.overrides??={};state.extraRows??=[];state.textEdits??={};state.wallSpecs??={p3Width:1.08,p3Height:.75,p3Sill:null,plaqueWidth:.45,plaqueHeight:.15};
removeOldLampSymbols(state);
if(!state.itemConditionMigrated){
for(const [type,condition] of Object.entries(itemCondition)){const previous=state.overrides[type]?.notes;state.overrides[type]={...state.overrides[type],notes:condition+(previous?' · '+previous:'')}}
for(const o of state.objects)if(o.type==='coffee')o.name=catalog.coffee.name;
if(state.overrides.coffee)state.overrides.coffee.name=catalog.coffee.name;
state.itemConditionMigrated=true;
}
if(!state.humidifierMigrated){if(!state.objects.some(o=>o.type==='humidifier'))state.objects.push(furniture('humidifier',560,890));state.humidifierMigrated=true}
if(!state.ledContourMigrated){if(!state.columns.some(c=>c.id==='unit'))state.columns.splice(Math.max(0,state.columns.findIndex(c=>c.id==='qty')+1),0,{id:'unit',title:'Unid.'});state.ledContourMigrated=true}
if(!state.conditionsV3){
 for(const o of state.objects.filter(o=>o.kind==='furniture')){
  const note=String(state.overrides[o.type]?.notes||'');
  o.condition??=(/existente/i.test(note)||itemCondition[o.type]==='Existente'?'existing':'new');
 }
 for(const row of state.extraRows)row.condition??=/existente/i.test(row.notes||'')?'existing':'new';
 if(!state.windowP03ConfirmedRV04){state.wallSpecs.p3Width=1.08;state.wallSpecs.p3Height=.75;state.windowP03ConfirmedRV04=true;}
 state.ledCondition??='new';state.conditionsV3=true;
}
if(!state.wallsRevisionV3){
 if(!state.objects.some(o=>o.type==='curtain'))state.objects.push(furniture('curtain',589.5,354));
 state.notes=String(state.notes||'').replace(/adesivo na janela de P01\.?/gi,'cortina junto ao forro, com barra no mínimo 15 cm acima do piso na janela de P01.');
 state.wallsRevisionV3=true;
}
for(const o of state.objects.filter(o=>o.kind==='furniture')){o.condition??=itemCondition[o.type]==='Existente'?'existing':'new';if(o.type==='curtain'&&(!Number.isFinite(o.curtainHeight)||o.curtainHeight<=0))o.curtainHeight=2.70;}

if(!state.requestedEditsRV05){
 state.author='WEMELLI E RUBENS';state.wallSpecs.plaqueWidth=.45;state.wallSpecs.plaqueHeight=.15;
 for(const o of state.objects)if(o.type==='coffee')o.condition='existing';
 state.requestedEditsRV05=true;
}

if(!state.approvedLayoutRV05){
 state.objects=state.objects.filter(o=>o.type!=='chair');
 if(state.objects.filter(o=>o.type==='plant').length===1)state.objects.push(furniture('plant',685,590));
 const positions={rug:[[472,740,0]],coffee:[[685,690,90]],massage:[[380,480,-24]],maca:[[230,672.5,0]],pouf:[[418,884,0],[531,884,0]],plant:[[235,380,0],[685,590,0]],tv:[[710,690,0]],quick:[[263,876,-135]],humidifier:[[685,735,0]],curtain:[[589.5,354,0]]};
 for(const [type,list] of Object.entries(positions)){const objects=state.objects.filter(o=>o.type===type);objects.forEach((o,i)=>{const p=list[i];if(p){o.x=p[0];o.y=p[1];o.angle=p[2];}});}
 state.approvedLayoutRV05=true;
}

if(!state.tvstandRV07){const tv=state.objects.find(o=>o.type==='tv');state.objects.push(furniture('tvstand',tv?tv.x+20:730,tv?tv.y:690));state.tvstandRV07=true;}
}
migrate();
function checkpoint(){history.push(clone(state));if(history.length>60)history.shift();future=[]}
function commit(fn){checkpoint();fn();persist();render();}
function persist(){state.updated=Date.now();if(finalDB){try{const tx=finalDB.transaction('projects','readwrite');tx.objectStore('projects').put(clone(state),'current');tx.oncomplete=()=>{$('status').textContent='Salvo neste navegador · '+new Date().toLocaleTimeString('pt-BR');window.dispatchEvent(new Event('layout:saved'));};tx.onerror=()=>{$('status').textContent='Use Salvar projeto ou Baixar HTML para guardar suas alterações.';};}catch(e){$('status').textContent='Use Salvar projeto ou Baixar HTML.';}}else{$('status').textContent='Use Salvar projeto ou Baixar HTML.';}}
function toast(t){$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',3500)}
function sheetObjects(id=activeSheet){if(id==='plan')return state.objects;const custom=state.customSheets.find(s=>s.id===id);return custom?custom.items:(state.sheetItems[id]??=[])}
function allObjects(){return [...state.objects,...state.customSheets.flatMap(s=>s.items),...Object.values(state.sheetItems).flat()]}
function getSelected(){return allObjects().find(o=>o.id===selected)}
function objectSheet(id){if(state.objects.some(o=>o.id===id))return 'plan';return state.customSheets.find(s=>s.items.some(o=>o.id===id))?.id||Object.keys(state.sheetItems).find(k=>state.sheetItems[k].some(o=>o.id===id))||activeSheet}
function moveInLayers(o,front){const items=sheetObjects(objectSheet(o.id)),i=items.indexOf(o);items.splice(i,1);items[front?'push':'unshift'](o)}
function shape(o){const c=esc(o.color);switch(o.type){case 'massage':return `<rect x="4" y="1" width="92" height="98" rx="20" fill="#253128"/><rect x="16" y="5" width="68" height="38" rx="12" fill="${c}" stroke="#77806f"/><rect x="25" y="8" width="50" height="12" rx="6" fill="#6c7864"/><rect x="19" y="46" width="62" height="31" rx="10" fill="${c}" stroke="#77806f"/><rect x="6" y="34" width="14" height="49" rx="6" fill="${c}"/><rect x="80" y="34" width="14" height="49" rx="6" fill="${c}"/><rect x="20" y="80" width="60" height="16" rx="7" fill="${c}"/><path d="M50 81V96" stroke="#253128"/>`;
case 'quick':return `<path d="M22 90L38 38H62L82 90M19 91H84M30 77H73M50 41V83" fill="none" stroke="#2d3830" stroke-width="6"/><ellipse cx="50" cy="16" rx="21" ry="14" fill="${c}"/><ellipse cx="50" cy="16" rx="9" ry="6" fill="#d6ddd0"/><rect x="33" y="29" width="34" height="24" rx="11" fill="${c}"/><rect x="12" y="49" width="76" height="13" rx="7" fill="${c}"/><ellipse cx="51" cy="69" rx="23" ry="12" fill="${c}"/><rect x="20" y="79" width="22" height="12" rx="5" fill="${c}"/><rect x="59" y="79" width="22" height="12" rx="5" fill="${c}"/>`;
case 'maca':return `<rect x="1" y="1" width="98" height="98" rx="7" fill="${c}" stroke="#859479" stroke-width="1.6"/><rect x="8" y="4" width="84" height="24" rx="8" fill="#d7decd"/><ellipse cx="50" cy="15" rx="12" ry="7" fill="#94a286"/><path d="M7 32H93M7 66H93" stroke="#a3af98"/><rect x="8" y="71" width="84" height="25" rx="3" fill="#e9e1d3"/><path d="M9 76H91M9 80H91" stroke="#c9bda6"/>`;
case 'pouf':return `<circle cx="50" cy="50" r="49" fill="${c}" stroke="#7c8b70" stroke-width="1.4"/><circle cx="50" cy="50" r="43" fill="none" stroke="#c3cbb6" stroke-width="1.5"/>`;
case 'chair':return `<rect x="1" y="1" width="98" height="98" rx="12" fill="${c}" stroke="#748167" stroke-width="1.5"/><rect x="14" y="13" width="72" height="61" rx="11" fill="#b4bfa3"/><rect x="10" y="76" width="80" height="18" rx="6" fill="${c}"/><rect x="3" y="12" width="12" height="63" rx="5" fill="#849477"/><rect x="85" y="12" width="12" height="63" rx="5" fill="#849477"/>`;
case 'coffee':return `<rect x="1" y="1" width="98" height="98" rx="4" fill="${c}" stroke="#9e8059"/><rect x="7" y="9" width="86" height="82" rx="3" fill="#dec6a1"/><rect x="13" y="20" width="37" height="62" rx="6" fill="#303a32"/><rect x="18" y="26" width="27" height="15" rx="3" fill="#7e8b7d"/><circle cx="32" cy="65" r="11" fill="#fff9ed"/><circle cx="32" cy="65" r="7" fill="#61442c"/><rect x="59" y="22" width="28" height="60" rx="3" fill="#b18f60"/><circle cx="68" cy="38" r="7" fill="#fff9ed"/><circle cx="78" cy="64" r="7" fill="#fff9ed"/>`;
case 'rug':return `<path d="M18 3C50 -1 93 5 97 26C103 48 87 61 95 79C100 97 75 101 53 96C28 103 1 97 3 77C9 56 -3 47 4 25C6 13 7 7 18 3Z" fill="${c}" stroke="#b29d80"/><path d="M20 9C48 5 87 11 90 28C96 48 80 61 88 79C92 91 73 95 53 90C29 97 7 91 10 76C15 56 4 47 11 27C12 17 14 12 20 9Z" fill="none" stroke="#f1e6d4" stroke-width="1.4"/>`;
case 'roundrug':return `<ellipse cx="50" cy="50" rx="49" ry="49" fill="${c}" stroke="#b29d80"/><ellipse cx="50" cy="50" rx="45" ry="45" fill="none" stroke="#f4e6d0" stroke-width="1.5"/>`;
case 'plant':return `<circle cx="50" cy="50" r="27" fill="#bc9d72"/><circle cx="50" cy="50" r="20" fill="#6f5b3c"/>`+Array.from({length:8},(_,i)=>`<ellipse cx="50" cy="29" rx="11" ry="26" fill="${i%2?c:'#4d724e'}" transform="rotate(${i*45} 50 50)"/>`).join('')+`<circle cx="50" cy="50" r="12" fill="#83a06b"/>`;
case 'humidifier':return `<circle cx="50" cy="50" r="46" fill="${c}" stroke="#536e65" stroke-width="3"/><path d="M22 28 Q50 6 78 28" fill="none" stroke="#536e65" stroke-width="4"/><ellipse cx="50" cy="19" rx="10" ry="5" fill="#536e65"/><circle cx="50" cy="82" r="4" fill="#536e65"/>`;
case 'curtain':return `<rect x='0' y='12' width='100' height='76' rx='3' fill='${c}' fill-opacity='.25'/><path d='M0 15H100M0 85H100' stroke='#777b73' stroke-width='1.4'/>`+Array.from({length:20},(_,i)=>`<path d='M${i*5} 22q2.5 55 5 0' fill='none' stroke='${c}' stroke-width='1.5'/>`).join('');
case 'tvstand':return `<circle cx="50" cy="50" r="48" fill="${c}" stroke="#686e72" stroke-width="3"/>`;
case 'tv':return `<rect x="2" y="1" width="96" height="98" rx="4" fill="${c}"/><rect x="14" y="5" width="50" height="90" rx="3" fill="#161f1a"/>`;
default:return ''}}
function objectMarkup(o){if(o.kind==='furniture'&&o.type==='tvstand')return `<g class="object ${o.locked?'locked':''}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.angle||0})"><circle r="${Math.max(o.w,o.h)/2}" fill="${esc(o.color)}" stroke="#686e72" stroke-width="1.2"/>${state.showIds?'<text x="0" y="4" text-anchor="middle" pointer-events="none" font-size="10" fill="white">'+esc(o.code)+'</text>':''}</g>`;if(o.kind==='furniture')return `<g class="object ${o.locked?'locked':''}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.angle})"><svg x="${-o.w/2}" y="${-o.h/2}" width="${o.w}" height="${o.h}" viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow:visible">${shape(o)}</svg>${state.showIds?`<g style="pointer-events:none"><rect x="-23" y="-11" width="46" height="22" rx="5" fill="white" fill-opacity=".88"/><text x="0" y="5" text-anchor="middle" style="font:12px Arial;fill:#364333">${esc(o.code)}</text></g>`:''}</g>`;
if(o.kind==='text')return `<g class="object ${o.locked?'locked':''}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.angle||0})"><rect x="${-o.w/2}" y="${-o.h/2}" width="${o.w}" height="${o.h}" fill="#ffffff" fill-opacity="0" pointer-events="all"/>${String(o.text).split('\n').map((t,i)=>`<text x="${-o.w/2}" y="${-o.h/2+o.font+i*o.font*1.25}" style="font-family:Arial;font-size:${o.font}px;font-weight:${o.bold?'700':'400'};fill:${esc(o.color)}">${esc(t)}</text>`).join('')}</g>`;
if(o.kind==='arrow'){const a=anchor(o);return `<g class="object" data-id="${o.id}"><path d="M${o.x2} ${o.y2}H${(o.x2+a.x)/2}V${a.y}H${a.x}" fill="none" stroke="transparent" stroke-width="18"/><path d="M${o.x2} ${o.y2}H${(o.x2+a.x)/2}V${a.y}H${a.x}" fill="none" stroke="${esc(o.color)}" stroke-width="1.8" marker-end="url(#leaderArrow)"/><text x="${o.x2+8}" y="${o.y2-8}" style="font-family:Arial;font-size:${o.font}px;fill:${esc(o.color)}">${esc(o.text)}</text></g>`}return ''}
function anchor(o){const t=allObjects().find(t=>t.id===o.target);return t?{x:t.x+(o.dx||0),y:t.y+(o.dy||0)}:{x:o.x1,y:o.y1}}
const baseObjectMarkup=objectMarkup;
objectMarkup=function(o){return o.kind==='image'?imageMarkup(o):baseObjectMarkup(o)};
function imageMarkup(o){
const iw=o.iw||1,ih=o.ih||1,zoom=o.cropZoom||1,s=(o.fit==='contain'?Math.min(o.w/iw,o.h/ih):Math.max(o.w/iw,o.h/ih))*zoom;
const rw=iw*s,rh=ih*s,x=-o.w/2+(o.w-rw)*(o.cropX??50)/100,y=-o.h/2+(o.h-rh)*(o.cropY??50)/100;
return `<g class="object ${o.locked?'locked':''}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.angle||0})"><defs><clipPath id="crop-${o.id}"><rect x="${-o.w/2}" y="${-o.h/2}" width="${o.w}" height="${o.h}"/></clipPath></defs><rect x="${-o.w/2}" y="${-o.h/2}" width="${o.w}" height="${o.h}" fill="white"/><g clip-path="url(#crop-${o.id})"><image href="${o.src}" xlink:href="${o.src}" x="${x}" y="${y}" width="${rw}" height="${rh}" preserveAspectRatio="none"/></g><rect x="${-o.w/2}" y="${-o.h/2}" width="${o.w}" height="${o.h}" fill="#ffffff" fill-opacity="0" pointer-events="all" stroke="${o.border?'#7b8e71':'none'}" stroke-width="1.2"/></g>`
}
function frame(n){return `<rect width="1200" height="1697.142857" fill="white"/><rect x="43" y="43" width="1114" height="1611" fill="none" stroke="#334936" stroke-width="2"/><rect x="56" y="56" width="1088" height="1585" fill="none" stroke="#9dac95" stroke-width=".6"/><image href="${state.logo}" xlink:href="${state.logo}" x="80" y="70" width="108" height="156" preserveAspectRatio="xMidYMid meet"/><path d="M210 56V250" stroke="#9dac95"/><text x="675" y="105" text-anchor="middle" font-family="Arial" font-size="46" font-weight="bold" fill="#008446">SEHURB</text><text x="675" y="140" text-anchor="middle" font-family="Arial" font-size="21" fill="#008446">SECRETARIA DE ESTADO DE</text><text x="675" y="177" text-anchor="middle" font-family="Arial" font-size="30" font-weight="bold" fill="#008446">HABITAÇÃO E URBANISMO</text>${wrap(state.title,70).slice(0,1).map(t=>`<text x="235" y="215" font-family="Arial" font-size="20" font-weight="bold" fill="#2f4634">${esc(t)}</text>`).join('')}<text x="235" y="238" font-family="Arial" font-size="13" fill="#61765c">${esc(state.agency)}</text><path d="M70 250H1130" stroke="#9dac95"/><path d="M70 1537H1130M70 1595H1130M800 1537V1595" stroke="#9dac95"/><text x="85" y="1559" font-family="Arial" font-size="12" fill="#76816c">RESPONSÁVEL</text><text x="85" y="1582" font-family="Arial" font-size="17" fill="#2d432e">${esc(state.author)}</text><text x="815" y="1559" font-family="Arial" font-size="12" fill="#76816c">REVISÃO / DATA / FOLHA</text><text x="815" y="1582" font-family="Arial" font-size="16" fill="#2d432e">${esc(state.revision)} · ${esc(state.date)} · ${String(n).padStart(2,'0')}</text><text x="85" y="1620" font-family="Arial" font-size="12" fill="#718168">A4 · 210 × 297 mm | Escala gráfica proporcional | PROJETO FINAL</text>`}
function wrap(text,n){return String(text).split('\n').flatMap(line=>{const out=[];let cur='';for(const word of line.split(/\s+/)){if((cur+' '+word).trim().length>n&&cur){out.push(cur);cur=word}else cur=(cur+' '+word).trim()}out.push(cur);return out})}
function ledLength(){return 2*(3.80+4.08)}
function cleanConditionNote(note){return String(note||'').replace(/^(Novo|Existente)(?:\s*·\s*|\s*$)/i,'');}
function conditionOf(o){return o.condition==='existing'?'existing':'new'}
function rowOverrides(id,type){return {...(state.overrides[type]||{}),...(state.overrides[id]||{})}}
function rows(){
 const grouped={};for(const o of state.objects.filter(o=>o.kind==='furniture')){const id=o.type+'__'+conditionOf(o);(grouped[id]??=[]).push(o);}
 const result=Object.entries(grouped).sort(([,a],[,b])=>catalog[a[0].type].code.localeCompare(catalog[b[0].type].code)).map(([id,os])=>{
  const o=os[0],type=o.type,dim=o=>type==='curtain'?(o.w/SCALE).toFixed(2).replace('.',',')+' × '+o.curtainHeight.toFixed(2).replace('.',',')+' (L × A)':type==='tvstand'?'Compatível com TV 55″':(o.w/SCALE).toFixed(2).replace('.',',')+' × '+(o.h/SCALE).toFixed(2).replace('.',',');
  return {id,sourceType:type,objectIds:os.map(o=>o.id),code:o.code||catalog[type].code,name:o.name,qty:os.length,unit:'un',dim:os.every(o=>dim(o)===dim(os[0]))?dim(o):'Variadas',notes:type==='curtain'?'Conjunto com trilho. Medidas de referência; conferir no local.':itemCondition[type]||'',...rowOverrides(id,type),notes:cleanConditionNote(rowOverrides(id,type).notes)||(type==='tvstand'?'Conferir padrão VESA, carga e fixação na parede.':type==='curtain'?'Com trilho. Barra acima do rodapé, mínimo 15 cm do piso; conferir no local.':''),condition:conditionOf(o)};
 });
 return result.concat({id:'led_strip',code:'L01',name:'Fita LED multicores de sobrepor',qty:ledLength().toFixed(2).replace('.',','),unit:'m',dim:'Perímetro do forro',notes:'',...state.overrides.led_strip,notes:cleanConditionNote(state.overrides.led_strip?.notes),condition:state.ledCondition||'new'},state.extraRows.map(r=>({...r,condition:conditionOf(r)})));
}
function routeRow(id,condition){const row=rows().find(r=>r.id===id);if(!row)return;if(row.objectIds){for(const o of state.objects)if(row.objectIds.includes(o.id))o.condition=condition;}else if(id==='led_strip')state.ledCondition=condition;else{const extra=state.extraRows.find(r=>r.id===id);if(extra)extra.condition=condition;}}
function tableSvg(rs,y,title="QUADRO DE MOBILIÁRIO"){const cols=state.columns,weights=cols.map(c=>c.id==='name'?2.8:c.id==='notes'?2.2:c.id==='qty'?0.7:c.id==='dim'?1.6:1),total=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>1040*w/total);let out=`<text x="80" y="${y-18}" font-family="Arial" font-size="20" font-weight="bold" fill="#334b37">${esc(title)}</text>`;for(let r=-1;r<rs.length;r++){let x=80;cols.forEach((c,i)=>{const val=r<0?c.title:rs[r][c.id]??'',w=widths[i];out+=`<rect x="${x}" y="${y+(r+1)*40}" width="${w}" height="40" fill="${r<0?'#e5ece0':r%2?'#fafbf8':'white'}" stroke="#c9d2c2" stroke-width=".7"/>`;const max=Math.max(4,Math.floor(w/6.2)),lines=wrap(val,max).slice(0,2);out+=lines.map((t,j)=>`<text data-cell-key="${r<0?'col-'+c.id:'row-'+rs[r].id+'-'+c.id+'-'+j}" x="${x+7}" y="${y+(r+1)*40+16+j*14}" font-family="Arial" font-size="11.5" fill="#3e503c">${esc(t.length>max?t.slice(0,max-1)+'…':t)}</text>`).join('');x+=w})}return out}
function svgShell(contents){return `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="210mm" height="297mm"><defs>${ASSETS.defs}<marker id="leaderArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#4f6350"/></marker></defs>${contents}</svg>`}
function selectionMarkup(){const o=getSelected();if(!o)return '';if(o.kind==='arrow'){const a=anchor(o);return `<g class="selection"><circle cx="${a.x}" cy="${a.y}" r="7" fill="white" stroke="#416f91"/><circle cx="${o.x2}" cy="${o.y2}" r="7" fill="white" stroke="#416f91"/></g><circle class="handle" data-handle="start" cx="${a.x}" cy="${a.y}" r="14" fill="transparent"/><circle class="handle" data-handle="end" cx="${o.x2}" cy="${o.y2}" r="14" fill="transparent"/>`}
return `<g transform="translate(${o.x} ${o.y}) rotate(${o.angle||0})"><rect class="selection" x="${-o.w/2-5}" y="${-o.h/2-5}" width="${o.w+10}" height="${o.h+10}" fill="none" stroke="#487eaa" stroke-width="2" stroke-dasharray="7 4"/>${o.locked?'':`<path class="selection" d="M0 ${-o.h/2-5}V${-o.h/2-33}" stroke="#487eaa"/><circle class="handle" data-handle="rotate" cx="0" cy="${-o.h/2-34}" r="9" fill="white" stroke="#487eaa" stroke-width="2"/><rect class="handle" data-handle="size" x="${o.w/2-6}" y="${o.h/2-6}" width="13" height="13" fill="white" stroke="#487eaa" stroke-width="2"/>`}</g>`}
function roomBaseMarkup(){return ASSETS.base.replace('M180 812H300M180 692A120 120 0 0 1 300 812','').replace('M180 812H300M735 812','M735 812').replace('x="165" y="347" width="12" height="162"','x="165" y="347" width="12" height="162" fill="#b4b7ba"')+`<path d="M735 812V692" stroke="#9a9ea1" stroke-width="5"/><rect x="164" y="692" width="14" height="120" fill="#c0c2bf" stroke="#657166"/><path d="M165 700l12 104M177 700l-12 104" stroke="#8d625b" stroke-width="1.5"/>`;}
function planMarkup(){
const ordered=[...state.objects.filter(o=>o.type==='rug'||o.type==='roundrug'),...state.objects.filter(o=>o.type!=='rug'&&o.type!=='roundrug')];
return `<g id="planViewport" transform="translate(${PLAN_X} 0)">
<g transform="translate(0 140)"><rect x="180" y="200" width="570" height="612" fill="url(#tile)"/>${roomBaseMarkup()}
<path d="M180 200H462M717 200H750M180 812H615M735 812H750" fill="none" stroke="#c59181" stroke-width="4"/>
<path d="M180 170V142M750 170V142M180 152H750M174 158L186 146M744 158L756 146M150 200H105M150 812H105M116 200V812M110 206L122 194M110 818L122 806" class="dim"/>
<text x="465" y="140" text-anchor="middle" font-size="20">3,80 m</text>
<text x="96" y="506" transform="rotate(-90 96 506)" text-anchor="middle" font-size="20">4,08 m</text>
<text x="837" y="265" font-size="18">W.C.</text><text x="837" y="290" font-size="13">acesso existente</text>
<text x="675" y="852" text-anchor="middle" font-size="14">ACESSO</text></g>
${ordered.map(objectMarkup).join('')}
<g id="led-contour" pointer-events="none">
<rect x="190" y="350" width="550" height="592" rx="3" fill="none" stroke="#976784" stroke-width="2.8" stroke-dasharray="9 6"/>
<path d="M740 590H776V616H804" fill="none" stroke="#976784" stroke-width="1.4"/>
<text x="805" y="607" font-size="14" font-weight="bold" fill="#81546f">FITA LED</text>
<text x="805" y="628" font-size="12" fill="#81546f">MULTICORES</text>
<text x="805" y="649" font-size="12" fill="#81546f">SOBREPOR</text>
<text x="805" y="675" font-size="14" font-weight="bold" fill="#81546f">${ledLength().toFixed(2).replace('.',',')} m lineares</text>
<text x="805" y="696" font-size="10.5" fill="#81546f">Tracejado esquemático</text>
</g><g id="selectionLayer" data-selection="plan">${activeSheet==='plan'?selectionMarkup():''}</g>
<g fill="#815f54" font-size="13"><text x="150" y="720" transform="rotate(-90 150 720)" text-anchor="middle">P03 · LATERAL DA MACA</text><text x="175" y="985" font-size="11">PORTA P03 · NÃO ABRIR</text><text x="465" y="314" text-anchor="middle">P01 · FUNDOS</text><text x="435" y="1008" text-anchor="middle">P02 · ENTRADA</text></g>
<path d="M180 1048H330M180 1042V1054M255 1042V1054M330 1042V1054" stroke="#51674b" stroke-width="2"/>
<text x="180" y="1073" font-size="13">0</text><text x="245" y="1073" font-size="13">0,5</text><text x="323" y="1073" font-size="13">1 m</text>
<text x="440" y="1055" font-size="13" fill="#6b7d62">P01: cortina · P02: porta cinza · P03: porta bloqueada</text></g>`}
function wallQuantities(){const gross=3.80*2.85,windowP1=1.70*1.60,door=.80*2.10;return {gross,windowP1,door,p1Art:gross-windowP1,p2Art:gross-door}}
const DETAIL_SCALE=1000/40*(1200/210);
function specValue(key,fallback){const v=state.wallSpecs?.[key];return Number.isFinite(v)&&v>0?v:fallback;}
function metric(v){return Number(v).toFixed(2).replace('.',',')+' m';}
function areaLabel(){const l=state.wallSpecs?.p3Width,h=state.wallSpecs?.p3Height;return Number.isFinite(l)&&l>0&&Number.isFinite(h)&&h>0?(l*h).toFixed(2).replace('.',',')+' m²':'A CALCULAR · INFORMAR L × H';}
function wallDiagram(which,y){
 const is3=which==='P03',width=is3?4.08:3.80,k=DETAIL_SCALE,left=260,wallW=width*k,wallH=2.85*k,bottom=y+wallH;
 let out=`<rect x="${left}" y="${y}" width="${wallW}" height="${wallH}" fill="#f7f5ef" stroke="#73816d" stroke-width="1.4"/>`;
 if(!is3&&state.mural)out+=`<image href="${state.mural}" xlink:href="${state.mural}" x="${left}" y="${y}" width="${wallW}" height="${wallH}" preserveAspectRatio="none"/>`;
 if(which==='P01'){
  const curtain=state.objects.find(o=>o.type==='curtain'),cl=curtain?curtain.w/SCALE:1.90,ch=Math.min(curtain?.curtainHeight||2.70,2.70),cw=cl*k,cx=left+1.78*k;
  out+=`<path d="M${left} ${bottom-15}h${wallW}" stroke="#adb6a4" stroke-width="1"/><path d="M${cx+cw+10} ${y+ch*k}h22M${cx+cw+10} ${bottom}h22M${cx+cw+25} ${y+ch*k}V${bottom}" stroke="#788574" fill="none"/><text x="${cx+cw+37}" y="${bottom-5}" font-size="11" fill="#52604f">${metric(2.85-ch)}</text><rect x="${left+22}" y="${y+28}" width="125" height="38" rx="5" fill="#f0f0e9" stroke="#9da695"/>
  <rect x="${cx}" y="${y+5}" width="${cw}" height="${ch*k-5}" fill="#d9d7cf" fill-opacity=".94" stroke="#a6a597"/>
  ${Array.from({length:21},(_,i)=>`<path d="M${cx+i*cw/21} ${y+8}q9 170 0 ${ch*k-12}" fill="none" stroke="#aaa99e" stroke-width="1.2"/>`).join('')}
  <path d="M${cx-5} ${y+4}h${cw+10}" stroke="#6e756c" stroke-width="4"/>
  <text x="${cx+cw/2}" y="${y+wallH*.45}" text-anchor="middle" font-size="17" font-weight="bold" fill="#52604f">M12 · CORTINA</text>
  <text x="${cx+cw/2}" y="${y+wallH*.45+24}" text-anchor="middle" font-size="13" fill="#52604f">Altura: ${metric(ch)}</text>
  <text x="${cx+cw/2}" y="${y+wallH*.45+45}" text-anchor="middle" font-size="13" fill="#52604f">Largura: ${metric(cl)}</text>
  <text x="${cx+cw/2}" y="${y+wallH*.45+67}" text-anchor="middle" font-size="11" fill="#52604f">FOLGA DO PISO: ${metric(2.85-ch)}</text>
  <text x="80" y="${y+110}" font-size="13">Ar-condicionado</text><path d="M180 ${y+105}h45v-55h50" fill="none" stroke="#91a087"/>`;
 }else{
  const dx=left+12,dw=.80*k,dh=2.10*k,dy=bottom-dh;
  out+=`<rect x="${dx-5}" y="${dy-5}" width="${dw+10}" height="${dh+5}" fill="${is3?'#d3d2ca':'#8e9295'}" stroke="#747d74"/><rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="${is3?'#d1c9bb':'#afb2b5'}" stroke="#737c72"/><circle cx="${dx+dw-13}" cy="${dy+dh*.55}" r="3" fill="#5e675c"/>`;
  out+=`<text x="${dx+dw/2}" y="${bottom-55}" text-anchor="middle" font-size="12" font-weight="bold" fill="#3d4f3b">PORTA</text><text x="${dx+dw/2}" y="${bottom-36}" text-anchor="middle" font-size="10" fill="#3d4f3b">Largura: 0,80 m</text><text x="${dx+dw/2}" y="${bottom-19}" text-anchor="middle" font-size="10" fill="#3d4f3b">Altura: 2,10 m</text>`;
  if(is3){
   const wl=specValue('p3Width',1.08),wh=specValue('p3Height',1.00),sill=specValue('p3Sill',1.00),wx=left+2.02*k,wy=bottom-(sill+wh)*k,ww=wl*k,hh=wh*k;
   out+=`<path d="M${dx+12} ${dy+12}l${dw-24} ${dh-24}M${dx+dw-12} ${dy+12}l-${dw-24} ${dh-24}" stroke="#a56a60" stroke-width="2"/>
   <text x="${dx+dw/2}" y="${dy+dh*.45}" text-anchor="middle" font-size="13" font-weight="bold" fill="#79493f">NÃO ABRIR</text>
   <rect x="${wx}" y="${wy}" width="${ww}" height="${hh}" fill="#a9adb1" stroke="#6d776b"/><path d="M${wx+ww/2} ${wy}v${hh}" stroke="#d0d2cf" stroke-width="3"/>
   <text x="${wx+ww/2}" y="${wy+hh/2-7}" text-anchor="middle" font-size="12" font-weight="bold" fill="#37433a">ADESIVO CINZA</text>
   <path d="M${wx} ${wy-15}v-15M${wx+ww} ${wy-15}v-15M${wx} ${wy-25}h${ww}" stroke="#788574" fill="none"/>
   <text x="${wx+ww/2}" y="${wy-34}" text-anchor="middle" font-size="12" fill="#4c6148">L: ${state.wallSpecs.p3Width?metric(wl):'INFORMAR'}</text>
   <path d="M${wx+ww+12} ${wy}h22M${wx+ww+12} ${wy+hh}h22M${wx+ww+25} ${wy}v${hh}" stroke="#788574" fill="none"/>
   <text x="${wx+ww+36}" y="${wy+hh/2}" font-size="12" fill="#4c6148">H: ${state.wallSpecs.p3Height?metric(wh):'INFORMAR'}</text>
   <path d="M${wx+ww} ${wy+25}H915v-12h15" stroke="#788574" fill="none"/><text x="935" y="${wy+17}" font-size="12" fill="#4c6148">ADESIVO: ${areaLabel()}</text>`;
   // Maca lateral: volume ilustrativo para identificar a parede.
   const mx=left+.95*k,my=bottom-.75*k,mw=1.80*k;
   out+=`<rect x="${mx}" y="${my}" width="${mw}" height="19" rx="7" fill="#c8d1bd" stroke="#7b8d6e"/><rect x="${mx+mw-60}" y="${my-6}" width="50" height="8" rx="4" fill="#dde3d5" stroke="#91a085"/><path d="M${mx+18} ${my+19}v${bottom-my-19}M${mx+mw-18} ${my+19}v${bottom-my-19}M${mx+18} ${bottom-23}h${mw-36}" fill="none" stroke="#84927d" stroke-width="5"/><rect x="${mx+15}" y="${my-3}" width="55" height="27" fill="#e7dfce" stroke="#b9b09d"/>
   <text x="${mx+mw/2}" y="${my-16}" text-anchor="middle" font-size="12" font-weight="bold" fill="#53694a">M03 · MACA EXISTENTE</text>`;
   const px=left+3.75*k;
   out+=`<path d="M${px-23} ${bottom-44}h46l-8 44h-30Z" fill="#c3b398" stroke="#8a7b65"/><path d="M${px} ${bottom-44}v-70" stroke="#6c895f" stroke-width="3"/>
   ${[-1,1].flatMap((sign)=>[0,1,2].map(i=>`<ellipse cx="${px+sign*(14+i*3)}" cy="${bottom-63-i*20}" rx="${17+i*2}" ry="9" fill="${i%2?'#759369':'#5e8056'}" transform="rotate(${sign*28} ${px+sign*(14+i*3)} ${bottom-63-i*20})"/>`)).join('')}
   <path d="M${px+18} ${bottom-103}H915v20h15" fill="none" stroke="#7b8b72"/><text x="935" y="${bottom-79}" font-size="11" font-weight="bold" fill="#53694a">VASO DE PLANTAS</text>`;
  }else{
   const pw=specValue('plaqueWidth',.45),ph=specValue('plaqueHeight',.15),px=dx+(dw-pw*k)/2,py=dy+.55*k;
   out+=`<rect x="${px}" y="${py}" width="${pw*k}" height="${ph*k}" rx="1.5" fill="#f6f6ed" stroke="#65765b"/><text x="${px+pw*k/2}" y="${py+ph*k*.6}" text-anchor="middle" font-size="4.2" fill="#3d503b">SALA DO BEM-ESTAR</text>
   <path d="M${px+pw*k} ${py+ph*k/2}H915v-34h22" fill="none" stroke="#708269" stroke-width="1.2"/><circle cx="${px+pw*k}" cy="${py+ph*k/2}" r="2.8" fill="#708269"/>
   <text x="940" y="${py+ph*k/2-38}" font-size="11" font-weight="bold" fill="#4a6043">PLAQUINHA · IDENTIFICAÇÃO</text><text x="940" y="${py+ph*k/2-20}" font-size="11" fill="#4a6043">FACE EXTERNA · CORREDOR</text><text x="940" y="${py+ph*k/2+1}" font-size="11" fill="#4a6043">Largura: ${metric(pw)}</text><text x="940" y="${py+ph*k/2+20}" font-size="11" fill="#4a6043">Altura: ${metric(ph)}</text>`;
  }
 }
 out+=`<path d="M${left} ${bottom+18}h${wallW}" stroke="#94a08b"/><text x="${left+wallW/2}" y="${bottom+42}" text-anchor="middle" font-size="13" fill="#67785e">${metric(width)} · pé-direito 2,85 m · Escala 1:40</text>`;
 return out;
}
function wallArtMarkup(){
 let out='<text x="600" y="292" text-anchor="middle" font-size="22" font-weight="bold" fill="#36523d">DETALHES · P01 E P02</text>';
 out+='<text x="80" y="335" font-size="18" font-weight="bold">P01 · FUNDOS — CORTINA NA JANELA</text>'+wallDiagram('P01',365);
 out+='<text x="80" y="850" font-size="12" fill="#5e7254">Cortina junto ao forro; barra acima do rodapé, no mínimo 15 cm do piso. Sem adesivo na janela.</text><text x="80" y="872" font-size="12" fill="#6f7e64">Largura e altura de referência; conferir medidas, folgas e fixação antes da compra.</text>';
 out+='<text x="80" y="932" font-size="18" font-weight="bold">P02 · ENTRADA — PORTA E IDENTIFICAÇÃO</text>'+wallDiagram('P02',960);
 out+=wrap('Pintar a porta de cinza e retocar folha/painel e vistas nas duas faces. Instalar plaquinha “SALA DO BEM-ESTAR” na face externa da porta, voltada ao corredor, dimensões de 45 × 15 cm. Alvenaria P02: 9,15 m², descontada a porta; sem perdas.',132).map((t,i)=>`<text x="80" y="${1450+i*21}" font-size="12" fill="#5c6e53">${esc(t)}</text>`).join('');
 return out;
}
function wallP03Markup(){
 let out='<text x="600" y="292" text-anchor="middle" font-size="22" font-weight="bold" fill="#36523d">P03 · PAREDE LATERAL DA MACA</text>'+wallDiagram('P03',385);
 const notes=[['PORTA EXISTENTE · MANTER FECHADA','Bloquear a abertura e identificar “NÃO ABRIR”. Porta: largura 0,80 m × altura 2,10 m.'],['JANELA EXISTENTE · ADESIVO CINZA',state.wallSpecs.p3Width&&state.wallSpecs.p3Height?'Área geométrica: '+metric(state.wallSpecs.p3Width)+' × '+metric(state.wallSpecs.p3Height)+' = '+areaLabel()+'. Sem acréscimo para perdas.':'Informar largura e altura em Dados da prancha → Medidas dos detalhes para obter cotas e área em m². '],['REFERÊNCIAS PAREDE EM DIVISÓRIA MODULAR','Não há previsão de mudanças para essa parede.']];
 notes.forEach(([title,note],i)=>{const y=950+i*150;out+=`<g data-edit-block="p03-note-${i}"><text x="85" y="${y}" font-size="16" font-weight="bold" fill="#36523d">${title}</text>`+wrap(note,124).map((t,j)=>`<text x="85" y="${y+26+j*21}" font-size="13" fill="#64765b">${esc(t)}</text>`).join('')+'</g>';});return out;
}
function tablePages(){
 const items=rows(),groups=[['new','NOVOS ITENS · AQUISIÇÃO'],['existing','ITENS EXISTENTES · SEM COMPRA']],sheets=[];let markup='',y=350,part=0;
 function push(){if(markup)sheets.push({id:part?'tables-'+part:'table-new',title:part?'Mobiliário · continuação':'Novos e existentes',body:()=>''});if(sheets.length)sheets[sheets.length-1].markup=markup;markup='';y=350;part++;}
 for(const [condition,title] of groups){let remaining=items.filter(r=>r.condition===condition);if(!remaining.length){if(y+110>1460)push();markup+=tableSvg([],y,title)+`<text x="85" y="${y+65}" font-size="14">Nenhum item nesta classificação.</text>`;y+=140;continue;}
 while(remaining.length){let capacity=Math.floor((1460-y-50)/40)-1;if(capacity<1){push();continue;}const chunk=remaining.splice(0,capacity);markup+=tableSvg(chunk,y,title);y+=(chunk.length+1)*40+90;if(remaining.length)push();}
 }
 push();return sheets.map(s=>({id:s.id,title:s.title,body:()=>s.markup}));
}

const supplierList=[
 ['Cortinare','Rua Isaura Parente, 819 – 7º BEC / Bosque','(68) 99953-1718','Cortinas, persianas, tapetes'],
 ['Cia das Cortinas','Rua Rio de Janeiro, 294 – Dom Giocondo','(68) 3223-5604','Cortinas, tapetes'],
 ['Home Design AC','Av. Nações Unidas, 1368 – Bosque','(68) 3223-5604','Cortinas, móveis e decoração'],
 ['Kazê Cortinas','Rua Quintino Bocaiuva, 1434 – Bosque','(68) 99969-8220','Cortinas e persianas'],
 ['Casa Nobre','Av. Ceará, 861 – Cerâmica','(68) 2102-3886','Móveis e peças decorativas'],
 ['RC Casa','Travessa Amapá, 292 – Cerâmica','(68) 99985-6793','Vasos/objetos decorativos (consultar)'],
 ['Varanda Verde – Viveiro','Travessa Éden, 193 – Jardim de Alah','(68) 99984-5222','Plantas ornamentais e vasos'],
 ['Loja dos Tapetes','Av. Getúlio Vargas, 1719 – Bosque','(68) 3223-2788','Tapetes (confirmar estoque)']
];

function tableModels(){state.genericTables??={};return state.genericTables;}
function genericWidths(model){const total=model.columns.reduce((n,c)=>n+(c.weight||100),0);return model.columns.map(c=>(c.weight||100)*1040/total);}
function genericHeight(model,row,header=false){const widths=genericWidths(model);let lines=1;model.columns.forEach((c,i)=>{const text=header?c.title:row.cells[c.id]||'';lines=Math.max(lines,wrap(text,Math.max(4,Math.floor((widths[i]-14)/5.5))).length);});return Math.max(header?48:46,lines*14+18);}
function genericGrid(key,model,chunk,y){
 const widths=genericWidths(model);let out='',yy=y;
 [null,...chunk].forEach((row,r)=>{let x=80;const h=genericHeight(model,row,!row);
 model.columns.forEach((c,i)=>{const w=widths[i],val=row?row.cells[c.id]||'':c.title;
 out+=`<g data-grid="${key}" data-grid-row="${row?row.id:'@header'}" data-grid-col="${c.id}"><rect x="${x}" y="${yy}" width="${w}" height="${h}" fill="${!row?'#e5ece0':r%2?'white':'#fafbf8'}" stroke="#c9d2c2" stroke-width=".7"/>`;
 wrap(val,Math.max(4,Math.floor((w-14)/5.5))).forEach((t,j)=>out+=`<text x="${x+7}" y="${yy+16+j*14}" font-size="11" fill="#3e503c">${esc(t)}</text>`);out+='</g>';x+=w;});yy+=h;});return {markup:out,height:yy-y};
}
function supplierPages(){
 const models=tableModels(),pages=[];let markup='',y=350,part=0;
 const push=()=>{pages.push({id:part?'suppliers-'+part:'suppliers',title:part?'Fornecedores · continuação':'Fornecedores',body:(text=>()=>text)(`<text x="600" y="292" text-anchor="middle" font-size="22" font-weight="bold" fill="#36523d">FORNECEDORES${part?' · CONTINUAÇÃO':''}</text>`+markup)});markup='';y=350;part++;};
 for(const [key,model] of Object.entries(models)){
 let remaining=[...model.rows],first=true;
 do{if(y+genericHeight(model,null,true)+90>1480)push();
 markup+=`<text x="80" y="${y-24}" font-size="17" font-weight="bold" fill="#334b37">${esc(model.title)}${!first?' · CONTINUAÇÃO':''}</text>`;
 if(first&&key==='suppliers'){markup+=`<text x="80" y="${y-3}" font-size="12" fill="#61745a">Seleção do PDF enviado | Rio Branco – Acre | Atualização: 23/10/2026</text>`;y+=14;}
 let available=1480-y-genericHeight(model,null,true),chunk=[];while(remaining.length&&genericHeight(model,remaining[0])<=available){const row=remaining.shift();chunk.push(row);available-=genericHeight(model,row);}
 if(!chunk.length&&remaining.length){push();continue;}
 const grid=genericGrid(key,model,chunk,y);markup+=grid.markup;y+=grid.height+25;
 if(!remaining.length){const note=key==='suppliers'?'Somente fornecedores da seleção enviada. Confirmar entrega, instalação e condições de pagamento com a loja.':'Registre a confirmação e a compra. Três linhas livres para preenchimento manual após a impressão.';const lines=wrap(note,165);if(y+lines.length*17>1500)push();lines.forEach((t,i)=>markup+=`<text x="80" y="${y+i*17}" font-size="11" fill="#61745a">${esc(t)}</text>`);y+=lines.length*17+60;}
 first=false;if(remaining.length)push();
 }while(remaining.length);
 }
 if(markup)push();return pages;
}


function renderPages(){
const descriptors=[{id:'plan',title:'Planta de layout',body:()=>planMarkup()+`<text x="85" y="1160" font-size="18" font-weight="bold" fill="#36523d">RESUMO DA INTERVENÇÃO</text>`+wrap('Adequar a sala para bem-estar e descompressão, reaproveitando os equipamentos existentes e adquirindo os itens novos indicados no quadro. Instalar cortina junto ao forro, com barra no mínimo 15 cm acima do piso em P01; manter a arte nas paredes P01/P02; pintar e retocar a porta de entrada nas duas faces e instalar identificação. Na lateral P03, bloquear a porta e aplicar adesivo cinza na janela. Instalar fita LED multicores e organizar o mobiliário conforme a planta.',143).map((t,i)=>`<text x="85" y="${1195+i*24}" font-size="13" fill="#61745a">${esc(t)}</text>`).join('')+wrap('Sala: 3,80 × 4,08 m; área de referência 15,49 m²; pé-direito 2,85 m. Conferir medidas e folgas no local. Quantidades de compra e reaproveitamento na folha seguinte.',143).map((t,i)=>`<text x="85" y="${1420+i*21}" font-size="13" fill="#718168">${esc(t)}</text>`).join('')},...tablePages()];
if(state.showArt){descriptors.push({id:'art',title:'Detalhes · P01 e P02',body:wallArtMarkup});descriptors.push({id:'art-p03',title:'Detalhe · P03',body:wallP03Markup});}
state.customSheets.forEach(s=>descriptors.push({id:s.id,title:s.title||'Folha de imagens',body:()=>`<text x="80" y="305" font-size="22" font-weight="bold" fill="#38553c">${esc(s.title)}</text>`}));
descriptors.push(...supplierPages());
const defaultRanks=new Map(descriptors.map((d,i)=>[d.id,i])),rank=id=>{const i=state.sheetOrder.indexOf(id);return i<0?10000+defaultRanks.get(id):i};descriptors.sort((a,b)=>Number(a.id.startsWith('suppliers'))-Number(b.id.startsWith('suppliers'))||rank(a.id)-rank(b.id));
if(!descriptors.some(d=>d.id===activeSheet))activeSheet='plan';
$('pages').innerHTML=descriptors.map((d,i)=>{const title=state.sheetTitles[d.id]||d.title;
const extras=d.id==='plan'?'':sheetObjects(d.id).map(objectMarkup).join('')+`<g data-selection="${d.id}">${activeSheet===d.id?selectionMarkup():''}</g>`;
return `<div class="page" id="sheet-${d.id}" data-sheet="${d.id}" data-page="${i+1}" ${d.id==='art'?'data-art="true"':''} data-title="${esc(title)}">${svgShell(frame(i+1)+d.body()+extras)}</div>`}).join('');
const pages=[...document.querySelectorAll('.page')];pages.forEach(p=>p.style.width=(800*zoom/100)+'px');
$('pageCount').textContent=`A4 · 210 × 297 mm · ${pages.length} folha(s)`;
$('pageNav').innerHTML=pages.map((p,i)=>`<button data-goto="${p.id}" class="${p.dataset.sheet===activeSheet?'active':''}">${i+1}. ${esc(p.dataset.title)}</button>`).join('');
$('activeSheet').innerHTML=pages.map((p,i)=>`<option value="${p.dataset.sheet}" ${p.dataset.sheet===activeSheet?'selected':''}>${i+1}. ${esc(p.dataset.title)}</option>`).join('');
}
function render(){notifySelection();migrate();renderPages();prepareEditableTexts();renderProperties();renderLayers();$('undo').disabled=!history.length;$('redo').disabled=!future.length;syncSheet();$('showArt').checked=state.showArt;$('artThumb').hidden=!state.mural;if(state.mural&&$('artThumb').getAttribute('src')!==state.mural)$('artThumb').src=state.mural;else if(!state.mural)$('artThumb').removeAttribute('src')}
let activeStaticText=null;
function prepareEditableTexts(){
 for(const page of document.querySelectorAll('.page')){
  const seen=new Map();
  for(const block of page.querySelectorAll('[data-edit-block]')){const key=page.dataset.sheet+'|block|'+block.dataset.editBlock;block.dataset.editKey=key;block.classList.add('editable-fixed-text');applyStaticEdit(block,key,true);}
  for(const text of page.querySelectorAll('text')){if(text.getAttribute('x')==='85'&&text.getAttribute('y')==='1582')text.dataset.projectField='author';
   if(text.closest('[data-id],defs,[data-edit-block],[data-grid]'))continue;
   const parent=text.parentElement,scope=parent===page.querySelector('svg')?'root':(parent.id||parent.getAttribute('transform')||parent.tagName);
   const base=text.dataset.cellKey?page.dataset.sheet+'|cell|'+text.dataset.cellKey:[page.dataset.sheet,scope,text.getAttribute('x'),text.getAttribute('y'),text.getAttribute('transform')||''].join('|'),n=seen.get(base)||0;seen.set(base,n+1);
   const key=base+'|'+n;text.dataset.editKey=key;text.classList.add('editable-fixed-text');applyStaticEdit(text,key,false);
  }
 }
}
function applyStaticEdit(node,key,block){
 const edit=state.textEdits[key];if(!edit)return;
 if(edit.hidden){node.style.display='none';return;}
 if(block){
  const templates=[...node.querySelectorAll('text')].map(n=>n.cloneNode(true));if(!templates.length)return;
  const lines=String(edit.text??'').split('\n'),firstY=Number(templates[0].getAttribute('y')),secondY=templates[1]?Number(templates[1].getAttribute('y')):firstY+26;
  node.querySelectorAll('text').forEach(n=>n.remove());
  lines.forEach((line,i)=>{const text=(templates[Math.min(i,templates.length-1)]||templates[0]).cloneNode(true);text.textContent=line;text.setAttribute('y',i===0?firstY:secondY+(i-1)*21);node.append(text);});
 }else{
  const x=node.getAttribute('x'),lines=String(edit.text??'').split('\n');node.textContent='';lines.forEach((line,i)=>{const t=document.createElementNS(NS,'tspan');t.setAttribute('x',x);if(i)t.setAttribute('dy','1.25em');t.textContent=line;node.append(t);});
 }
}
function showStaticTextEditor(node){
 activeStaticText={key:node.dataset.editKey,block:node.hasAttribute('data-edit-block'),field:node.dataset.projectField||null};
 $('fixedTextValue').value=state.textEdits[activeStaticText.key]?.text??(activeStaticText.block?[...node.querySelectorAll('text')].map(n=>n.textContent).join('\n'):node.textContent);
 $('fixedTextDialog').showModal();$('fixedTextValue').focus();
}
$('pages').addEventListener('pointerdown',e=>{
 if(mode!=='select')return;const cell=e.target.closest('[data-grid]');if(cell){e.preventDefault();e.stopImmediatePropagation();tableMode=cell.dataset.grid;renderTableEditor();$('tableDialog').showModal();const input=[...$('tableEditor').querySelectorAll('[data-generic-col]')].find(n=>n.dataset.genericCol===cell.dataset.gridCol&&n.dataset.genericRow===cell.dataset.gridRow);input?.focus();return;}const node=e.target.closest('[data-edit-key]');if(!node)return;
 e.preventDefault();e.stopImmediatePropagation();showStaticTextEditor(node);
},true);
$('closeFixedText').onclick=()=>$('fixedTextDialog').close();
$('applyFixedText').onclick=()=>{if(!activeStaticText)return;const key=activeStaticText.key,value=$('fixedTextValue').value;commit(()=>{if(activeStaticText.field){state[activeStaticText.field]=value;delete state.textEdits[key];}else state.textEdits[key]={text:value,hidden:!value.trim()};});$('fixedTextDialog').close();};
$('deleteFixedText').onclick=()=>{if(!activeStaticText)return;const key=activeStaticText.key;commit(()=>{if(activeStaticText.field){state[activeStaticText.field]='';delete state.textEdits[key];}else state.textEdits[key]={hidden:true};});$('fixedTextDialog').close();};
$('restoreFixedTexts').onclick=()=>{commit(()=>state.textEdits={});toast('Textos originais restaurados.');};
function syncSheet(){for(const key of ['p3Width','p3Height','p3Sill','plaqueWidth','plaqueHeight']){const el=$('spec-'+key);if(el&&document.activeElement!==el)el.value=state.wallSpecs?.[key]??'';}for(const [id,key] of Object.entries({sheetTitle:'title',agency:'agency',author:'author',revision:'revision',date:'date',sheetNotes:'notes'})){if(document.activeElement!==$(id))$(id).value=state[key]}$('showIds').checked=state.showIds}
function renderLayers(){$('layers').innerHTML=[...sheetObjects()].reverse().map(o=>`<button data-layer="${o.id}" class="${selected===o.id?'selected':''}"><span>${esc(o.kind==='furniture'||o.kind==='image'?o.name:o.kind==='text'?o.text:'↗ '+o.text)}</span><span>${o.locked?'🔒':''}</span></button>`).join('')}
function field(id,title,value,type='number',step='1'){return `<label>${title}</label><input id="p-${id}" data-prop="${id}" type="${type}" value="${esc(value)}" step="${step}">`}
function renderProperties(){const o=getSelected();if(!o){$('properties').innerHTML='<div class="property-empty">Selecione um móvel, texto ou chamada na prancha.</div>';return}let html=`<span class="badge">${o.kind==='furniture'?esc(o.code):o.kind==='arrow'?'Chamada':'Texto'}</span>`;if(o.kind==='arrow'){html+=field('text','Texto da chamada',o.text,'text')+field('font','Tamanho da fonte',o.font)+field('color','Cor',o.color,'color')}else{if(o.kind==='furniture')html+=field('name','Nome do item',o.name,'text')+`<label>Tabela de destino</label><select data-prop="condition"><option value="new" ${conditionOf(o)==='new'?'selected':''}>Novos itens · compra</option><option value="existing" ${conditionOf(o)==='existing'?'selected':''}>Existentes · sem compra</option></select>`+(o.type==='curtain'?field('curtainHeight','Altura da cortina (m)',o.curtainHeight,'number','0.01'):'');else html+=`<label>Conteúdo (aceita várias linhas)</label><textarea id="p-text" data-prop="text">${esc(o.text)}</textarea>`+field('font','Tamanho da fonte',o.font)+`<label><input type="checkbox" data-prop="bold" ${o.bold?'checked':''}> Negrito</label>`;
html+=`<div class="row">${field('x','X na prancha',o.x.toFixed(1))}${field('y','Y na prancha',o.y.toFixed(1))}</div><div class="row">${field('w',o.kind==='furniture'?'Largura (m)':'Largura do texto',o.kind==='furniture'?(o.w/SCALE).toFixed(2):o.w,'number','0.01')}${field('h',o.kind==='furniture'?(o.type==='curtain'?'Espessura em planta (m)':'Profundidade (m)'):'Altura do texto',o.kind==='furniture'?(o.h/SCALE).toFixed(2):o.h,'number','0.01')}</div>`+field('angle','Rotação (graus)',o.angle||0)+field('color','Cor',o.color,'color')+`<label><input type="checkbox" data-prop="locked" ${o.locked?'checked':''}> Travar elemento</label>`}
html+='<div class="row"><button id="duplicate">Duplicar</button><button id="delete" class="danger">Excluir</button></div><div class="row" style="margin-top:8px"><button id="back">Para trás</button><button id="front">Para frente</button></div>';if(o.kind==='furniture')html+='<button id="labelObject" class="wide">↗ Criar chamada deste móvel</button>';$('properties').innerHTML=html;
$('properties').querySelectorAll('[data-prop]').forEach(el=>el.addEventListener('change',()=>{const key=el.dataset.prop;let v=el.type==='checkbox'?el.checked:['text','textarea','color','select-one'].includes(el.type)?el.value:Number(el.value);if(typeof v==='number'&&!Number.isFinite(v))return;if(['w','h','font','curtainHeight'].includes(key)){if(key==='curtainHeight'&&v>2.70){toast('Altura máxima: 2,70 m para manter ao menos 15 cm do piso.');renderProperties();return}if(v<=0){toast('Informe um valor maior que zero.');renderProperties();return}if(o.kind==='furniture'&&['w','h'].includes(key))v*=SCALE}commit(()=>o[key]=v)}));$('duplicate').onclick=duplicate;$('delete').onclick=removeSelected;$('front').onclick=()=>commit(()=>{state.objects=state.objects.filter(x=>x.id!==o.id);state.objects.push(o)});$('back').onclick=()=>commit(()=>{state.objects=state.objects.filter(x=>x.id!==o.id);state.objects.unshift(o)});if($('labelObject'))$('labelObject').onclick=()=>commit(()=>{const a={id:uid(),kind:'arrow',target:o.id,dx:0,dy:0,x1:o.x,y1:o.y,x2:860,y2:o.y,text:o.name,color:'#4f6350',font:18};state.objects.push(a);selected=a.id})}
function duplicate(){const o=getSelected();if(!o)return;commit(()=>{const n=clone(o);n.id=uid();n.locked=false;if(n.kind==='arrow'){n.x2+=25;n.y2+=25}else{n.x+=25;n.y+=25}sheetObjects(objectSheet(o.id)).push(n);selected=n.id})}
function removeSelected(){const o=getSelected();if(!o)return;if(o.locked){toast('Destrave o elemento para excluir.');return}commit(()=>{for(const a of allObjects().filter(a=>a.kind==='arrow'&&a.target===selected)){const p=anchor(a);a.x1=p.x;a.y1=p.y;a.target=null}const items=sheetObjects(objectSheet(o.id)),i=items.indexOf(o);items.splice(i,1);selected=null})}
function setMode(m){mode=m;drawStart=null;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===m));$('toolHint').textContent=m==='arrow'?'Clique no móvel ou no ponto de origem; depois clique onde ficará o texto. Esc cancela.':m==='text'?'Clique na prancha para inserir um texto.':'Arraste os móveis. Selecione para girar, redimensionar e editar.'}
function pointOnSheet(e,id){const svg=document.querySelector('[data-sheet="'+id+'"]>svg'),p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());return {x:p.x-(id==='plan'?PLAN_X:0),y:p.y}}
$('pages').addEventListener('pointerdown',e=>{
const page=e.target.closest('.page');if(e.button!==0||!page)return;activeSheet=page.dataset.sheet;$('activeSheet').value=activeSheet;
const p=pointOnSheet(e,activeSheet),hit=e.target.closest('[data-id]'),handle=e.target.closest('[data-handle]');
if(mode==='text'){commit(()=>{const o={id:uid(),kind:'text',text:'Novo texto',x:p.x,y:p.y,w:250,h:60,font:20,angle:0,color:'#354a38',bold:false};sheetObjects().push(o);selected=o.id});setMode('select');window.dispatchEvent(new Event('layout:edit'));$('p-text')?.focus();return}
if(mode==='arrow'){if(!drawStart||drawStart.sheet!==activeSheet){const o=hit&&allObjects().find(o=>o.id===hit.dataset.id);drawStart={sheet:activeSheet,x1:p.x,y1:p.y,target:o&&o.kind!=='arrow'?o.id:null,dx:o?p.x-o.x:0,dy:o?p.y-o.y:0,text:o?.name||'Identificação'};toast('Agora clique onde ficará o texto da chamada.')}else{commit(()=>{const a={id:uid(),kind:'arrow',...drawStart,x2:p.x,y2:p.y,color:'#4f6350',font:18};sheetObjects().push(a);selected=a.id});setMode('select')}return}
if(handle){const o=getSelected();if(!o||o.locked)return;checkpoint();drag={id:o.id,sheet:activeSheet,handle:handle.dataset.handle,start:p,orig:clone(o)};e.preventDefault();return}
if(hit){selected=hit.dataset.id;const o=getSelected();if(o.locked){render();return}checkpoint();drag={id:o.id,sheet:activeSheet,handle:mode==='crop'&&o.kind==='image'?'crop':'move',start:p,orig:clone(o)};renderProperties();renderLayers();updateSelection();e.preventDefault()}else{selected=null;renderProperties();renderLayers();updateSelection()}
});
function notifySelection(){const o=getSelected();window.dispatchEvent(new CustomEvent('layout:selection',{detail:{selected:!!o,locked:!!o?.locked,arrow:o?.kind==='arrow'}}));}
function updateSelection(){notifySelection();document.querySelectorAll('[data-selection]').forEach(g=>g.innerHTML=g.dataset.selection===activeSheet?selectionMarkup():'')}
document.addEventListener('pointermove',e=>{
if(!drag)return;const p=pointOnSheet(e,drag.sheet),o=allObjects().find(x=>x.id===drag.id),b=drag.orig;
const snap=v=>$('snap').checked&&!e.shiftKey?Math.round(v/7.5)*7.5:v,dx=p.x-drag.start.x,dy=p.y-drag.start.y;
if(drag.handle==='move'){if(o.kind==='arrow'){o.x2=b.x2+dx;o.y2=b.y2+dy}else{o.x=snap(b.x+dx);o.y=snap(b.y+dy)}}
else if(drag.handle==='rotate'){let a=Math.atan2(p.y-o.y,p.x-o.x)*180/Math.PI+90;o.angle=e.shiftKey?Math.round(a/15)*15:a}
else if(drag.handle==='size'){const a=-(o.angle||0)*Math.PI/180,lx=(p.x-o.x)*Math.cos(a)-(p.y-o.y)*Math.sin(a),ly=(p.x-o.x)*Math.sin(a)+(p.y-o.y)*Math.cos(a);o.w=Math.max(12,snap(2*Math.abs(lx)));o.h=o.kind==='image'&&o.keepRatio!==false&&!e.shiftKey?o.w*b.h/b.w:Math.max(12,snap(2*Math.abs(ly)))}
else if(drag.handle==='crop'){const a=-(o.angle||0)*Math.PI/180,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a),s=(o.fit==='contain'?Math.min(o.w/o.iw,o.h/o.ih):Math.max(o.w/o.iw,o.h/o.ih))*(o.cropZoom||1);o.cropX=Math.max(0,Math.min(100,(b.cropX??50)+(o.w-o.iw*s?lx/(o.w-o.iw*s)*100:0)));o.cropY=Math.max(0,Math.min(100,(b.cropY??50)+(o.h-o.ih*s?ly/(o.h-o.ih*s)*100:0)))}
else if(drag.handle==='start'){o.target=null;o.x1=p.x;o.y1=p.y}else if(drag.handle==='end'){o.x2=p.x;o.y2=p.y}
const node=document.querySelector('[data-id="'+o.id+'"]');if(node)node.outerHTML=objectMarkup(o);
sheetObjects(drag.sheet).filter(a=>a.kind==='arrow'&&a.target===o.id).forEach(a=>{const el=document.querySelector('[data-id="'+a.id+'"]');if(el)el.outerHTML=objectMarkup(a)});
updateSelection();e.preventDefault()
},{passive:false});
function stopDrag(){if(!drag)return;drag=null;persist();render()};document.addEventListener('pointerup',stopDrag);document.addEventListener('pointercancel',stopDrag);
$('pages').addEventListener('dblclick',e=>{const hit=e.target.closest('[data-id]');if(hit){selected=hit.dataset.id;renderProperties();$('p-text')?.focus();$('p-text')?.select()}});
$('layers').onclick=e=>{const b=e.target.closest('[data-layer]');if(b){selected=b.dataset.layer;setMode('select');render()}};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));$('addFurniture').onclick=()=>commit(()=>{activeSheet='plan';const o=furniture($('catalog').value,460,650);state.objects.push(o);selected=o.id;setMode('select')});
for(const [id,key] of Object.entries({sheetTitle:'title',agency:'agency',author:'author',revision:'revision',date:'date',sheetNotes:'notes'}))$(id).addEventListener('change',()=>commit(()=>state[key]=$(id).value));$('showIds').onchange=()=>commit(()=>state.showIds=$('showIds').checked);
$('undo').onclick=()=>{if(!history.length)return;future.push(clone(state));state=history.pop();selected=null;persist();render()};$('redo').onclick=()=>{if(!future.length)return;history.push(clone(state));state=future.pop();selected=null;persist();render()};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){setMode('select');selected=null;render();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate()}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected()}const o=getSelected();if(o&&!o.locked&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();commit(()=>{const step=e.shiftKey?15:1,kx=o.kind==='arrow'?'x2':'x',ky=o.kind==='arrow'?'y2':'y';o[kx]+=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;o[ky]+=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0})}});
function renderFurnitureEditor(){
 const rs=rows();
 $('tableEditor').innerHTML=[['new','Novos itens · aquisição'],['existing','Itens existentes · sem compra']].map(([condition,title])=>`<section class="table-section"><h2>${title}</h2><table><thead><tr>${state.columns.map(c=>`<th><input data-col="${esc(c.id)}" value="${esc(c.title)}" aria-label="Título da coluna"><button data-remove-col="${esc(c.id)}">Excluir coluna</button></th>`).join('')}<th>Tabela de destino</th><th>Ação</th></tr></thead><tbody>${rs.filter(r=>r.condition===condition).map(r=>`<tr>${state.columns.map(c=>`<td><input data-row="${esc(r.id)}" data-cell="${esc(c.id)}" value="${esc(r[c.id]??'')}" aria-label="${esc(c.title)} de ${esc(r.name||r.id)}"></td>`).join('')}<td><select data-route="${esc(r.id)}" aria-label="Tabela de ${esc(r.name)}"><option value="new" ${r.condition==='new'?'selected':''}>Novos itens · compra</option><option value="existing" ${r.condition==='existing'?'selected':''}>Existentes · sem compra</option></select></td><td>${r.id.startsWith('extra')?`<button data-remove-row="${r.id}">Excluir linha</button>`:'Vinculado à planta'}</td></tr>`).join('')}</tbody></table></section>`).join('');
}

let tableMode='furniture';
function renderTableEditor(){
 const models=tableModels(),model=models[tableMode];
 if(!model)renderFurnitureEditor();else $('tableEditor').innerHTML=`<label>Título da tabela</label><input data-generic-title value="${esc(model.title)}"><table><thead><tr>${model.columns.map(c=>`<th><input data-generic-row="@header" data-generic-col="${c.id}" value="${esc(c.title)}"><button data-generic-delete-col="${c.id}">Excluir coluna</button></th>`).join('')}<th>Ação</th></tr></thead><tbody>${model.rows.map(r=>`<tr>${model.columns.map(c=>`<td><textarea rows="2" data-generic-row="${r.id}" data-generic-col="${c.id}" aria-label="${esc(c.title)}">${esc(r.cells[c.id]||'')}</textarea></td>`).join('')}<td><button data-generic-delete-row="${r.id}">Excluir linha</button></td></tr>`).join('')}</tbody></table>`;
 const nav=document.createElement('label');nav.innerHTML='Tabela para editar <select id="tableMode"><option value="furniture">Mobiliário · novos e existentes</option><option value="suppliers">Fornecedores · relação de lojas</option></select>';$('tableEditor').prepend(nav);$('tableMode').value=tableMode;$('syncQty').disabled=tableMode!=='furniture';
}
$('tableDialog').addEventListener('change',e=>{const el=e.target;if(el.id==='tableMode'){tableMode=el.value;renderTableEditor();return;}if(el.hasAttribute('data-generic-title')){commit(()=>tableModels()[tableMode].title=el.value);return;}if(el.dataset.genericCol){commit(()=>{const model=tableModels()[tableMode];if(el.dataset.genericRow==='@header')model.columns.find(c=>c.id===el.dataset.genericCol).title=el.value;else model.rows.find(r=>r.id===el.dataset.genericRow).cells[el.dataset.genericCol]=el.value;});}},true);
$('tableEditor').addEventListener('click',e=>{const col=e.target.dataset.genericDeleteCol,row=e.target.dataset.genericDeleteRow;if(!col&&!row)return;const model=tableModels()[tableMode];if(col&&model.columns.length===1){toast('Mantenha pelo menos uma coluna.');return;}commit(()=>{if(col)model.columns=model.columns.filter(c=>c.id!==col);if(row)model.rows=model.rows.filter(r=>r.id!==row);});renderTableEditor();});
$('tableButton').onclick=()=>{tableMode=activeSheet.startsWith('suppliers')?'suppliers':'furniture';renderTableEditor();$('tableDialog').showModal()};$('closeTable').onclick=()=>$('tableDialog').close();$('tableDialog').addEventListener('change',e=>{const el=e.target;if(el.dataset.route){commit(()=>routeRow(el.dataset.route,el.value));renderTableEditor();}else if(el.dataset.col){commit(()=>state.columns.find(c=>c.id===el.dataset.col).title=el.value);renderTableEditor()}else if(el.dataset.cell){commit(()=>{const id=el.dataset.row,key=el.dataset.cell,r=state.extraRows.find(r=>r.id===id);if(r)r[key]=el.value;else (state.overrides[id]??={})[key]=el.value})}});
$('tableEditor').onclick=e=>{const c=e.target.dataset.removeCol,r=e.target.dataset.removeRow;if(c){if(state.columns.length===1){toast('Mantenha pelo menos uma coluna.');return}commit(()=>state.columns=state.columns.filter(x=>x.id!==c));renderTableEditor()}if(r){commit(()=>state.extraRows=state.extraRows.filter(x=>x.id!==r));renderTableEditor()}};
$('addColumn').onclick=()=>{if(tableMode!=='furniture'){commit(()=>tableModels()[tableMode].columns.push({id:uid(),title:'Novo campo',weight:100}));renderTableEditor();return;}commit(()=>state.columns.push({id:'custom'+uid(),title:'Novo campo'}));renderTableEditor()};$('addRow').onclick=()=>{if(tableMode!=='furniture'){commit(()=>tableModels()[tableMode].rows.push({id:uid(),cells:{}}));renderTableEditor();return;}commit(()=>state.extraRows.push({id:'extra'+uid(),name:'Novo item',qty:'1',condition:'new'}));renderTableEditor()};$('syncQty').onclick=()=>{commit(()=>Object.values(state.overrides).forEach(v=>delete v.qty));renderTableEditor();toast('Quantidades recalculadas a partir dos móveis.')};
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
for(const key of ['p3Width','p3Height','p3Sill','plaqueWidth','plaqueHeight'])$('spec-'+key).onchange=e=>{const val=e.target.value===''?null:Number(e.target.value);if(val!==null&&(!Number.isFinite(val)||val<=0)){toast('Informe uma medida maior que zero.');syncSheet();return;}if(val!==null&&((key==='p3Width'&&val>2.06)||(key==='p3Height'&&val>2.85)||(key==='p3Sill'&&val>2.85)||(key==='plaqueWidth'&&val>.8)||(key==='plaqueHeight'&&val>2.1))){toast('Medida incompatível com o vão disponível.');syncSheet();return;}commit(()=>state.wallSpecs[key]=val);};
$('save').onclick=()=>download('Sala_Bem_Estar_Projeto_Final.json',JSON.stringify(state,null,2),'application/json');$('open').onclick=()=>$('openFile').click();
function validate(v){
if(!v||v.format!=='sehurb-layout'||v.version!==1||!Array.isArray(v.objects)||!Array.isArray(v.columns)||!v.columns.length||v.columns.length>20)throw Error('Arquivo de projeto incompatível.');
removeOldLampSymbols(v);
const dataImage=s=>/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(s||'');
if(v.logo&&!dataImage(v.logo))throw Error('Logo inválido.');if(v.mural&&!dataImage(v.mural))throw Error('Arte inválida.');
const custom=v.customSheets||[],sheetItems=v.sheetItems||{},ids=new Set;if(!Array.isArray(custom)||custom.length>100)throw Error('Folhas inválidas.');
custom.forEach(s=>{if(!/^[a-z0-9_-]+$/i.test(s.id)||!Array.isArray(s.items))throw Error('Folha inválida.')});
if(Object.values(sheetItems).some(items=>!Array.isArray(items)))throw Error('Elementos de folha inválidos.');
const objects=[...v.objects,...custom.flatMap(s=>s.items),...Object.values(sheetItems).flat()];if(objects.length>1200)throw Error('Projeto muito grande.');
for(const o of objects){if(!/^[a-z0-9_-]+$/i.test(o.id)||ids.has(o.id)||!['furniture','text','arrow','image'].includes(o.kind))throw Error('Elementos inválidos.');ids.add(o.id);
if(o.kind==='furniture'&&!catalog[o.type])throw Error('Mobiliário desconhecido.');
for(const key of o.kind==='arrow'?['x1','y1','x2','y2','font']:['x','y','w','h','angle'])if(!Number.isFinite(o[key]))throw Error('Geometria inválida.');
if(o.kind!=='arrow'&&(o.w<=0||o.h<=0))throw Error('Dimensões inválidas.');
if(o.kind==='image'){if(!dataImage(o.src)||!Number.isFinite(o.iw)||o.iw<=0||!Number.isFinite(o.ih)||o.ih<=0)throw Error('Imagem inválida.')}
else if(!/^#[0-9a-f]{6}$/i.test(o.color))throw Error('Cor inválida.')}
return v}
$('openFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const v=validate(JSON.parse(await f.text()));commit(()=>{state=v;selected=null});toast('Projeto aberto.')}catch(err){toast(err.message||'Não foi possível abrir.')}e.target.value=''};
$('savehtml').onclick=async()=>{try{const doc=document.documentElement.cloneNode(true);const encode=v=>JSON.stringify(v).replace(/</g,'\\u003c');doc.querySelector('#saved-state').textContent=encode(state);doc.querySelector('#asset-data').textContent=encode(ASSETS);for(const original of document.querySelectorAll('script[data-app-module][src]')){const target=[...doc.querySelectorAll('script[data-app-module]')].find(x=>x.getAttribute('src')===original.getAttribute('src'));const r=await fetch(original.src);if(!r.ok)throw Error('Módulo indisponível');target.removeAttribute('src');target.textContent=(await r.text()).replace(/<\/script/gi,'<\\/script');}for(const link of doc.querySelectorAll('link[data-app-style]')){const style=document.createElement('style');const r=await fetch(link.href);if(!r.ok)throw Error('Estilos indisponíveis');style.textContent=await r.text();link.replaceWith(style);}doc.querySelector('#pages').innerHTML='';doc.querySelector('#panelBackdrop').hidden=true;doc.querySelector('#fileMenu').hidden=true;delete doc.querySelector('body').dataset.drawer;doc.querySelectorAll('dialog').forEach(d=>d.removeAttribute('open'));download('Sala_Bem_Estar_Projeto_Final.html','<!doctype html>\n'+doc.outerHTML,'text/html');toast('HTML completo baixado.');}catch(e){toast(e.message);}};
$('exportSvg').onclick=()=>{document.querySelectorAll('.page>svg').forEach((svg,i)=>{const copy=svg.cloneNode(true);copy.querySelectorAll('[data-selection]').forEach(g=>g.remove());download('Sala_Bem_Estar_A4_Folha_'+(i+1)+'.svg',new XMLSerializer().serializeToString(copy),'image/svg+xml')})};
$('print').onclick=()=>{stopDrag();window.print()};$('logoButton').onclick=()=>$('logoFile').click();$('logoFile').onchange=e=>{const f=e.target.files[0];if(!f)return;if(!/^image\/(png|jpeg|webp)$/.test(f.type)){toast('Use PNG, JPG ou WebP.');return}if(f.size>8e6){toast('Use uma imagem de até 8 MB.');return}const reader=new FileReader;reader.onload=()=>commit(()=>state.logo=reader.result);reader.readAsDataURL(f);e.target.value=''};
$('reset').onclick=()=>{if(confirm('Restaurar o layout inicial? Você poderá desfazer esta ação.'))commit(()=>{state=initial();selected=null})};let autoFit=true;
function updateZoom(value){zoom=Math.max(15,Math.min(160,value));$('zoom').value=String(zoom);$('zoomValue').textContent=Math.round(zoom)+'%';document.querySelectorAll('.page').forEach(p=>p.style.width=(800*zoom/100)+'px');}
function fitCanvas(){const stage=document.querySelector('.stage'),style=getComputedStyle(stage);const available=stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);if(available>0)updateZoom(Math.min(100,Math.floor(available/8)));}
$('zoom').oninput=()=>{autoFit=false;updateZoom(Number($('zoom').value));};
$('showArt').onchange=()=>commit(()=>state.showArt=$('showArt').checked);
$('pageNav').onclick=e=>{const id=e.target.closest('[data-goto]')?.dataset.goto;if(id){const sheet=$(id)?.dataset.sheet;if(sheet)activateSheet(sheet)}};
$('goArt').onclick=()=>{if(!state.showArt)commit(()=>state.showArt=true);activateSheet('art')};
$('fitPage').onclick=()=>{autoFit=true;fitCanvas();};
let resizeTimer;function resizeCanvas(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(autoFit)fitCanvas()},80);}
window.addEventListener('resize',resizeCanvas);window.addEventListener('layout:resize',resizeCanvas);
window.addEventListener('layout:action',event=>{if(event.detail.action==='plan'){activateSheet('plan');return;}const o=getSelected();if(!o)return;switch(event.detail.action){case 'duplicate':duplicate();break;case 'delete':removeSelected();break;case 'rotate':if(!o.locked&&o.kind!=='arrow')commit(()=>o.angle=((o.angle||0)+90)%360);break;}});
$('artButton').onclick=()=>$('artFile').click();
$('artFile').onchange=e=>{const f=e.target.files[0];if(!f)return;if(!/^image\/(png|jpeg|webp)$/.test(f.type)||f.size>8e6){toast('Use uma imagem PNG, JPG ou WebP de até 8 MB.');return}const reader=new FileReader;reader.onload=()=>commit(()=>state.mural=reader.result);reader.readAsDataURL(f);e.target.value=''};
const basicRenderProperties=renderProperties;
renderProperties=function(){
const o=getSelected();if(o?.kind==='image'){renderImageProperties(o);return}
basicRenderProperties();
if(o){if($('front'))$('front').onclick=()=>commit(()=>moveInLayers(o,true));if($('back'))$('back').onclick=()=>commit(()=>moveInLayers(o,false));
if($('labelObject'))$('labelObject').onclick=()=>commit(()=>{const a={id:uid(),kind:'arrow',target:o.id,dx:0,dy:0,x1:o.x,y1:o.y,x2:860,y2:o.y,text:o.name,color:'#4f6350',font:18};sheetObjects(objectSheet(o.id)).push(a);selected=a.id})}
};
const PXMM=1200/210;
const imagePresets={
free:{name:'Livre (valores abaixo)'},
wide:{name:'16:9 · 160 × 90 mm',w:160,h:90},
classic:{name:'4:3 · 160 × 120 mm',w:160,h:120},
square:{name:'Quadrado · 100 × 100 mm',w:100,h:100},
portrait:{name:'Retrato · 100 × 150 mm',w:100,h:150},
large:{name:'Área grande · 180 × 200 mm',w:180,h:200}};
function renderImageProperties(o){
const mm=v=>(v/PXMM).toFixed(1),input=(key,title,value,type='number')=>`<label>${title}</label><input data-img="${key}" type="${type}" step="0.1" value="${esc(value)}">`;
$('properties').innerHTML='<span class="badge">Imagem · folha A4</span>'+input('name','Nome',o.name,'text')+
`<label>Tamanho predefinido do quadro</label><select id="imagePreset">${Object.entries(imagePresets).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('')}</select>
<div class="row">${input('w','Largura (mm)',mm(o.w))}${input('h','Altura (mm)',mm(o.h))}</div>
<label><input type="checkbox" data-img="keepRatio" ${o.keepRatio!==false?'checked':''}> Manter proporção ao escalar</label>
<div class="row">${input('x','X na folha (mm)',mm(o.x+(activeSheet==='plan'?PLAN_X:0)))}${input('y','Y na folha (mm)',mm(o.y))}</div>
${input('angle','Rotação (graus)',o.angle||0)}
<label>Enquadramento</label><select data-img="fit"><option value="cover" ${o.fit==='cover'?'selected':''}>Preencher quadro e recortar</option><option value="contain" ${o.fit==='contain'?'selected':''}>Mostrar imagem inteira</option></select>
${input('cropZoom','Ampliação dentro do quadro (%)',((o.cropZoom||1)*100).toFixed(0))}
<div class="row">${input('cropX','Recorte X (0–100%)',o.cropX??50)}${input('cropY','Recorte Y (0–100%)',o.cropY??50)}</div>
<button id="cropMove" class="wide ${mode==='crop'?'primary':''}">${mode==='crop'?'Concluir recorte':'Arrastar imagem dentro do recorte'}</button>
<button id="resetCrop" class="wide">Centralizar / restaurar recorte</button>
<label><input type="checkbox" data-img="border" ${o.border?'checked':''}> Contorno do quadro</label>
<label><input type="checkbox" data-img="locked" ${o.locked?'checked':''}> Travar imagem</label>
<div class="row"><button id="duplicateImage">Duplicar</button><button id="deleteImage" class="danger">Excluir</button></div>
<div class="row" style="margin-top:7px"><button id="imageBack">Para trás</button><button id="imageFront">Para frente</button></div>
<p class="hint small">O recorte não altera a imagem original. A alça de tamanho mantém a proporção; Shift permite ajustar livremente.</p>`;
$('properties').querySelectorAll('[data-img]').forEach(el=>el.onchange=()=>{
const k=el.dataset.img;let v=el.type==='checkbox'?el.checked:['name','fit'].includes(k)?el.value:Number(el.value);
if(typeof v==='number'&&!Number.isFinite(v))return;
if(['w','h','cropZoom'].includes(k)&&v<=0){toast('Informe um valor maior que zero.');return}
commit(()=>{if(['w','h'].includes(k)){const ratio=o.w/o.h;o[k]=v*PXMM;if(o.keepRatio!==false){if(k==='w')o.h=o.w/ratio;else o.w=o.h*ratio}}
else if(k==='x')o.x=v*PXMM-(activeSheet==='plan'?PLAN_X:0);else if(k==='y')o.y=v*PXMM;
else if(k==='cropZoom')o.cropZoom=Math.max(.1,Math.min(8,v/100));
else if(k==='cropX'||k==='cropY')o[k]=Math.max(0,Math.min(100,v));else o[k]=v})
});
$('imagePreset').onchange=e=>{const p=imagePresets[e.target.value];if(p.w)commit(()=>{o.w=p.w*PXMM;o.h=p.h*PXMM;o.fit='cover';o.cropX=50;o.cropY=50;o.cropZoom=1})};
$('cropMove').onclick=()=>{mode=mode==='crop'?'select':'crop';$('toolHint').textContent=mode==='crop'?'Arraste a imagem para ajustar seu conteúdo dentro do quadro.':'Arraste os elementos para posicionar na folha.';renderProperties()};
$('resetCrop').onclick=()=>commit(()=>{o.cropX=50;o.cropY=50;o.cropZoom=1});
$('duplicateImage').onclick=duplicate;$('deleteImage').onclick=removeSelected;
$('imageFront').onclick=()=>commit(()=>moveInLayers(o,true));$('imageBack').onclick=()=>commit(()=>moveInLayers(o,false));
}
function sheetDescriptors(){return [...document.querySelectorAll('.page')].map(p=>({id:p.dataset.sheet,title:p.dataset.title}))}
function activateSheet(id,scroll=true){activeSheet=id;selected=null;setMode('select');render();if(scroll)document.querySelector('[data-sheet="'+id+'"]')?.scrollIntoView?.({behavior:'smooth',block:'start'})}
function addSheet(){commit(()=>{const id='sheet'+uid();state.customSheets.push({id,title:'Nova folha '+(state.customSheets.length+1),items:[]});state.sheetOrder=[...sheetDescriptors().map(s=>s.id),id];activeSheet=id;selected=null});if($('sheetsDialog').open)renderSheetManager();document.querySelector('[data-sheet="'+activeSheet+'"]')?.scrollIntoView?.({behavior:'smooth',block:'start'})}
function renderSheetManager(){
$('sheetManager').innerHTML=sheetDescriptors().map((s,i)=>{const custom=state.customSheets.some(p=>p.id===s.id);return `<div style="display:flex;gap:7px;align-items:center;padding:9px 0;border-top:1px solid #dde4d8"><span>${String(i+1).padStart(2,'0')}</span><input data-sheet-title="${s.id}" value="${esc(s.title)}" aria-label="Nome da folha"><button data-sheet-action="up" data-key="${s.id}" title="Subir">↑</button><button data-sheet-action="down" data-key="${s.id}" title="Descer">↓</button><button data-sheet-action="duplicate" data-key="${s.id}" ${custom?'':'disabled'}>Duplicar</button><button data-sheet-action="delete" data-key="${s.id}" ${custom||s.id==='art'?'':'disabled'}>Excluir</button></div>`}).join('');
}
$('addSheet').onclick=addSheet;$('addSheetModal').onclick=addSheet;
$('manageSheets').onclick=()=>{renderSheetManager();$('sheetsDialog').showModal()};$('closeSheets').onclick=()=>$('sheetsDialog').close();
$('activeSheet').onchange=e=>activateSheet(e.target.value);
$('sheetManager').onchange=e=>{const id=e.target.dataset.sheetTitle;if(!id)return;commit(()=>{const custom=state.customSheets.find(s=>s.id===id);if(custom)custom.title=e.target.value;state.sheetTitles[id]=e.target.value});renderSheetManager()};
$('sheetManager').onclick=e=>{const action=e.target.dataset.sheetAction,id=e.target.dataset.key;if(!action)return;
if(action==='up'||action==='down'){const ids=sheetDescriptors().map(s=>s.id),i=ids.indexOf(id),j=i+(action==='up'?-1:1);if(j<0||j>=ids.length)return;commit(()=>{[ids[i],ids[j]]=[ids[j],ids[i]];state.sheetOrder=ids})}
else if(action==='duplicate'){const s=state.customSheets.find(s=>s.id===id);if(!s)return;commit(()=>{const copy=clone(s);copy.id='sheet'+uid();copy.title=s.title+' · cópia';const ids=new Map(copy.items.map(o=>[o.id,uid()]));copy.items.forEach(o=>{o.id=ids.get(o.id);if(o.target)o.target=ids.get(o.target)||null});state.customSheets.push(copy);const order=sheetDescriptors().map(s=>s.id);order.splice(order.indexOf(id)+1,0,copy.id);state.sheetOrder=order;activeSheet=copy.id;selected=null})}
else if(action==='delete'&&confirm('Excluir esta folha e seus elementos? Você poderá desfazer.'))commit(()=>{if(id==='art')state.showArt=false;else state.customSheets=state.customSheets.filter(s=>s.id!==id);state.sheetOrder=state.sheetOrder.filter(k=>k!==id);delete state.sheetItems[id];activeSheet='plan';selected=null});
renderSheetManager()
};
$('insertImage').onclick=()=>$('imageFile').click();
function createImage(src,iw,ih,name,index=0){return {id:uid(),kind:'image',name,src,iw,ih,x:activeSheet==='plan'?465:600,y:700+index*35,w:160*PXMM,h:90*PXMM,angle:0,fit:'cover',cropX:50,cropY:50,cropZoom:1,keepRatio:true,border:false,locked:false,color:'#ffffff'}}
$('imageFile').onchange=async e=>{
const files=[...e.target.files];e.target.value='';if(!files.length)return;const destination=activeSheet,items=[];
try{for(const file of files){if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>12e6){toast('Use PNG, JPG ou WebP de até 12 MB por imagem.');continue}
const src=await new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});
const image=await new Promise((resolve,reject)=>{const img=new Image;img.onload=()=>resolve(img);img.onerror=reject;img.src=src});
items.push(createImage(src,image.naturalWidth,image.naturalHeight,file.name,items.length))}
if(items.length){activeSheet=destination;commit(()=>{sheetObjects(destination).push(...items);selected=items.at(-1).id});toast(items.length+' imagem(ns) adicionada(s). Escolha o tamanho e o recorte nas propriedades.')}
}catch(err){toast('Não foi possível ler uma das imagens.')}
};
window.__finalProject={get state(){return state},rows,validate,render};
window.addEventListener('beforeprint',()=>{stopDrag();updateSelection()});render();fitCanvas();window.dispatchEvent(new Event('layout:ready'));

})().catch(error=>{console.error(error);const status=document.getElementById("status");if(status)status.textContent="Falha ao iniciar o editor. Recarregue a página."});
