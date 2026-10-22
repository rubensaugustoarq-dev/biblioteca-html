(async function(){
'use strict';
const ASSETS=window.LAYOUT_ASSETS||JSON.parse(document.getElementById('asset-data').textContent),NS='http://www.w3.org/2000/svg',W=1200,H=1697.142857,SCALE=150,PLAN_X=135,STORE='sehurb-bem-estar-editor-interface-v2';
if(ASSETS.logo && !ASSETS.logo.startsWith('data:')){
 try {const response=await fetch(ASSETS.logo);if(!response.ok)throw Error('Logo indisponível');const blob=await response.blob();ASSETS.logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});}catch(error){ASSETS.logo='';console.warn(error);}
}
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),clone=o=>JSON.parse(JSON.stringify(o));
let seq=0;function uid(){return 'e'+Date.now().toString(36)+(seq++).toString(36)}
const catalog={massage:{name:'Poltrona de massagem',code:'M01',w:120,h:195,color:'#434e41'},quick:{name:'Cadeira quick massage',code:'M02',w:82.5,h:135,color:'#333b35'},maca:{name:'Maca',code:'M03',w:97.5,h:270,color:'#c2c9b9'},pouf:{name:'Pufe',code:'M04',w:98,h:98,color:'#9da98c'},chair:{name:'Poltrona',code:'M05',w:113,h:129,color:'#99a78b'},coffee:{name:'Cantinho do café',code:'M06',w:115,h:70,color:'#c9a77b'},rug:{name:'Tapete orgânico',code:'M07',w:230,h:310,color:'#d6c4a9'},roundrug:{name:'Tapete redondo',code:'M08',w:240,h:240,color:'#d6c4a9'},plant:{name:'Planta decorativa',code:'M09',w:85,h:85,color:'#729063'},tv:{name:'Televisor',code:'M10',w:9,h:128,color:'#26332c'}};
catalog.humidifier={name:'Umidificador de ar',code:'M11',w:45,h:45,color:'#dce7e1'};
catalog.coffee.name='Aparador para cantinho do café';
document.querySelector('#catalog option[value="coffee"]').textContent=catalog.coffee.name;
const itemCondition={massage:'Existente',quick:'Existente',maca:'Existente',pouf:'Novo',coffee:'Novo',rug:'Novo',plant:'Novo',tv:'Existente',led_strip:'Novo',humidifier:'Novo'};
document.querySelector('#catalog').add(new Option('Umidificador de ar','humidifier'));
function furniture(type,x,y,angle=0){return {id:uid(),kind:'furniture',type,x,y,angle,...clone(catalog[type]),locked:false}}
function initial(){return {
format:'sehurb-layout',version:1,updated:0,title:'SALA DE BEM-ESTAR E DESCOMPRESSÃO',
agency:'SEHURB · Governo do Estado do Acre',author:'Rubens Augusto Rebelo Neto',revision:'R05',date:'21/10/2026',
notes:'Estudo preliminar. Sala: 3,80 × 4,08 m; área de referência: 15,49 m². P01 / P02: acabamentos a definir; adesivo na janela de P01. Conferir medidas e folgas no local.',
logo:ASSETS.logo,mural:ASSETS.mural,showArt:true,showIds:true,
objects:[furniture('rug',632,690),furniture('coffee',713,681,90),furniture('massage',380,473,-18),furniture('maca',230,672.5),furniture('pouf',545,412),furniture('pouf',704,575),furniture('chair',438,887.5),furniture('plant',235,380),furniture('tv',743.5,749),furniture('quick',255,885,-140),{id:uid(),kind:'text',x:463,y:732,w:280,h:55,angle:0,text:'BEM-ESTAR',font:23,color:'#3d5140',bold:true}],
columns:[{id:'code',title:'Código'},{id:'name',title:'Mobiliário / equipamento'},{id:'qty',title:'Qtd.'},{id:'dim',title:'Dimensões (m)'},{id:'notes',title:'Observações'}],overrides:{},extraRows:[]}}
let state=initial(),selected=null,activeSheet='plan',mode='select',drawStart=null,drag=null,history=[],future=[],zoom=85;
const embedded=JSON.parse($('saved-state').textContent||'null');if(embedded)state=embedded;
try{const auto=JSON.parse(localStorage.getItem(STORE)||'null');if(auto&&auto.format==='sehurb-layout'&&auto.updated>state.updated)state=auto}catch(e){}
function removeOldLampSymbols(v){
const lists=[v.objects,...(v.customSheets||[]).map(s=>s.items),...Object.values(v.sheetItems||{})].filter(Array.isArray);
const ids=new Set(lists.flat().filter(o=>o.type==='t8').map(o=>o.id));
for(const list of lists)for(let i=list.length-1;i>=0;i--)if(list[i].type==='t8'||(list[i].kind==='arrow'&&ids.has(list[i].target)))list.splice(i,1);
if(v.overrides)delete v.overrides.t8;if(v.extraRows)v.extraRows=v.extraRows.filter(r=>r.id!=='t8');
return v
}
function migrate(){if(!state.mural)state.mural=ASSETS.mural;if(state.showArt===undefined)state.showArt=true;state.customSheets??=[];state.sheetOrder??=[];state.sheetItems??={};state.sheetTitles??={};
removeOldLampSymbols(state);
if(!state.itemConditionMigrated){
for(const [type,condition] of Object.entries(itemCondition)){const previous=state.overrides[type]?.notes;state.overrides[type]={...state.overrides[type],notes:condition+(previous?' · '+previous:'')}}
for(const o of state.objects)if(o.type==='coffee')o.name=catalog.coffee.name;
if(state.overrides.coffee)state.overrides.coffee.name=catalog.coffee.name;
state.itemConditionMigrated=true;
}
if(!state.humidifierMigrated){if(!state.objects.some(o=>o.type==='humidifier'))state.objects.push(furniture('humidifier',560,890));state.humidifierMigrated=true}
if(!state.ledContourMigrated){if(!state.columns.some(c=>c.id==='unit'))state.columns.splice(Math.max(0,state.columns.findIndex(c=>c.id==='qty')+1),0,{id:'unit',title:'Unid.'});state.ledContourMigrated=true}
}
migrate();
function checkpoint(){history.push(clone(state));if(history.length>60)history.shift();future=[]}
function commit(fn){checkpoint();fn();persist();render();}
function persist(){state.updated=Date.now();try{localStorage.setItem(STORE,JSON.stringify(state));$('status').textContent='Cópia automática neste navegador · '+new Date().toLocaleTimeString('pt-BR');window.dispatchEvent(new Event('layout:saved'))}catch(e){$('status').textContent='Use Salvar projeto para guardar suas alterações.';const label=document.querySelector('.live-badge span');if(label)label.textContent='Salve uma cópia do projeto'}}
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
case 'tv':return `<rect x="2" y="1" width="96" height="98" rx="4" fill="${c}"/><rect x="14" y="5" width="50" height="90" rx="3" fill="#161f1a"/>`;
default:return ''}}
function objectMarkup(o){if(o.kind==='furniture')return `<g class="object ${o.locked?'locked':''}" data-id="${o.id}" transform="translate(${o.x} ${o.y}) rotate(${o.angle})"><svg x="${-o.w/2}" y="${-o.h/2}" width="${o.w}" height="${o.h}" viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow:visible">${shape(o)}</svg>${state.showIds?`<g style="pointer-events:none"><rect x="-23" y="-11" width="46" height="22" rx="5" fill="white" fill-opacity=".88"/><text x="0" y="5" text-anchor="middle" style="font:12px Arial;fill:#364333">${esc(o.code)}</text></g>`:''}</g>`;
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
function frame(n){return `<rect width="1200" height="1697.142857" fill="white"/><rect x="43" y="43" width="1114" height="1611" fill="none" stroke="#334936" stroke-width="2"/><rect x="56" y="56" width="1088" height="1585" fill="none" stroke="#9dac95" stroke-width=".6"/><image href="${state.logo}" xlink:href="${state.logo}" x="80" y="70" width="108" height="156" preserveAspectRatio="xMidYMid meet"/><path d="M210 56V250" stroke="#9dac95"/><text x="675" y="105" text-anchor="middle" font-family="Arial" font-size="46" font-weight="bold" fill="#008446">SEHURB</text><text x="675" y="140" text-anchor="middle" font-family="Arial" font-size="21" fill="#008446">SECRETARIA DE ESTADO DE</text><text x="675" y="177" text-anchor="middle" font-family="Arial" font-size="30" font-weight="bold" fill="#008446">HABITAÇÃO E URBANISMO</text>${wrap(state.title,70).slice(0,1).map(t=>`<text x="235" y="215" font-family="Arial" font-size="20" font-weight="bold" fill="#2f4634">${esc(t)}</text>`).join('')}<text x="235" y="238" font-family="Arial" font-size="13" fill="#61765c">${esc(state.agency)}</text><path d="M70 250H1130" stroke="#9dac95"/><path d="M70 1537H1130M70 1595H1130M800 1537V1595" stroke="#9dac95"/><text x="85" y="1559" font-family="Arial" font-size="12" fill="#76816c">RESPONSÁVEL</text><text x="85" y="1582" font-family="Arial" font-size="17" fill="#2d432e">${esc(state.author)}</text><text x="815" y="1559" font-family="Arial" font-size="12" fill="#76816c">REVISÃO / DATA / FOLHA</text><text x="815" y="1582" font-family="Arial" font-size="16" fill="#2d432e">${esc(state.revision)} · ${esc(state.date)} · ${String(n).padStart(2,'0')}</text><text x="85" y="1620" font-family="Arial" font-size="12" fill="#718168">A4 · 210 × 297 mm | Escala gráfica proporcional | ESTUDO PRELIMINAR</text>`}
function wrap(text,n){return String(text).split('\n').flatMap(line=>{const out=[];let cur='';for(const word of line.split(/\s+/)){if((cur+' '+word).trim().length>n&&cur){out.push(cur);cur=word}else cur=(cur+' '+word).trim()}out.push(cur);return out})}
function ledLength(){return 2*(3.80+4.08)}
function rows(){const grouped={};for(const o of state.objects.filter(o=>o.kind==='furniture')){if(!grouped[o.type])grouped[o.type]=[];grouped[o.type].push(o)}const furnitureRows=Object.entries(grouped).sort((a,b)=>catalog[a[0]].code.localeCompare(catalog[b[0]].code)).map(([type,os])=>{const dim=o=>(o.w/SCALE).toFixed(2).replace('.',',')+' × '+(o.h/SCALE).toFixed(2).replace('.',',');return {id:type,code:catalog[type].code,name:os[0].name,qty:os.length,unit:'un',dim:os.every(o=>dim(o)===dim(os[0]))?dim(os[0]):'Variadas',notes:itemCondition[type]||'',...state.overrides[type]}});
return furnitureRows.concat({id:'led_strip',code:'L01',name:'Fita LED multicores de sobrepor',qty:ledLength().toFixed(2).replace('.',','),unit:'m',dim:'Perímetro do forro',notes:'Novo',...state.overrides.led_strip},state.extraRows)}
function tableSvg(rs,y){const cols=state.columns,weights=cols.map(c=>c.id==='name'?2.8:c.id==='notes'?2.2:c.id==='qty'?0.7:c.id==='dim'?1.6:1),total=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>1040*w/total);let out=`<text x="80" y="${y-18}" font-family="Arial" font-size="20" font-weight="bold" fill="#334b37">QUADRO DE MOBILIÁRIO</text>`;for(let r=-1;r<rs.length;r++){let x=80;cols.forEach((c,i)=>{const val=r<0?c.title:rs[r][c.id]??'',w=widths[i];out+=`<rect x="${x}" y="${y+(r+1)*32}" width="${w}" height="32" fill="${r<0?'#e5ece0':r%2?'#fafbf8':'white'}" stroke="#c9d2c2" stroke-width=".7"/>`;const max=Math.max(4,Math.floor(w/6.2)),lines=wrap(val,max).slice(0,2);out+=lines.map((t,j)=>`<text x="${x+7}" y="${y+(r+1)*32+13+j*13}" font-family="Arial" font-size="11.5" fill="#3e503c">${esc(t.length>max?t.slice(0,max-1)+'…':t)}</text>`).join('');x+=w})}return out}
function svgShell(contents){return `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="210mm" height="297mm"><defs>${ASSETS.defs}<marker id="leaderArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#4f6350"/></marker></defs>${contents}</svg>`}
function selectionMarkup(){const o=getSelected();if(!o)return '';if(o.kind==='arrow'){const a=anchor(o);return `<g class="selection"><circle cx="${a.x}" cy="${a.y}" r="7" fill="white" stroke="#416f91"/><circle cx="${o.x2}" cy="${o.y2}" r="7" fill="white" stroke="#416f91"/></g><circle class="handle" data-handle="start" cx="${a.x}" cy="${a.y}" r="14" fill="transparent"/><circle class="handle" data-handle="end" cx="${o.x2}" cy="${o.y2}" r="14" fill="transparent"/>`}
return `<g transform="translate(${o.x} ${o.y}) rotate(${o.angle||0})"><rect class="selection" x="${-o.w/2-5}" y="${-o.h/2-5}" width="${o.w+10}" height="${o.h+10}" fill="none" stroke="#487eaa" stroke-width="2" stroke-dasharray="7 4"/>${o.locked?'':`<path class="selection" d="M0 ${-o.h/2-5}V${-o.h/2-33}" stroke="#487eaa"/><circle class="handle" data-handle="rotate" cx="0" cy="${-o.h/2-34}" r="9" fill="white" stroke="#487eaa" stroke-width="2"/><rect class="handle" data-handle="size" x="${o.w/2-6}" y="${o.h/2-6}" width="13" height="13" fill="white" stroke="#487eaa" stroke-width="2"/>`}</g>`}
function planMarkup(){
const ordered=[...state.objects.filter(o=>o.type==='rug'||o.type==='roundrug'),...state.objects.filter(o=>o.type!=='rug'&&o.type!=='roundrug')];
return `<g id="planViewport" transform="translate(${PLAN_X} 0)">
<g transform="translate(0 140)"><rect x="180" y="200" width="570" height="612" fill="url(#tile)"/>${ASSETS.base}
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
<g fill="#815f54" font-size="13"><text x="465" y="314" text-anchor="middle">P01 · FUNDOS</text><text x="435" y="1008" text-anchor="middle">P02 · ENTRADA</text></g>
<path d="M180 1048H330M180 1042V1054M255 1042V1054M330 1042V1054" stroke="#51674b" stroke-width="2"/>
<text x="180" y="1073" font-size="13">0</text><text x="245" y="1073" font-size="13">0,5</text><text x="323" y="1073" font-size="13">1 m</text>
<text x="440" y="1055" font-size="13" fill="#6b7d62">P01 / P02: acabamentos · Portas 0,80 × 2,10 m</text></g>`}
function wallQuantities(){const gross=3.80*2.85,adhesive=1.70*1.60,door=.80*2.10;return {gross,adhesive,door,p1Art:gross-adhesive,p2Art:gross-door}}
function wallArtMarkup(){
const areas=wallQuantities(),area=v=>v.toFixed(2).replace('.',',')+' m²';
let out='<text x="600" y="290" text-anchor="middle" font-size="21" font-weight="bold" fill="#36523d">ACABAMENTOS · PAREDES P01 E P02</text>';
for(const [i,y] of [350,935].entries()){
out+=`<text x="80" y="${y-25}" font-size="17" font-weight="bold">${i?'P02 · PAREDE DA ENTRADA':'P01 · PAREDE DOS FUNDOS'}</text>
${state.mural?`<image href="${state.mural}" xlink:href="${state.mural}" x="270" y="${y}" width="660" height="495" preserveAspectRatio="none"/>`:""}
<rect x="270" y="${y}" width="660" height="495" fill="none" stroke="#8c9b82"/>`;
if(!i)out+=`<rect x="290" y="${y+35}" width="165" height="57" rx="6" fill="#f5f4ee" stroke="#a4a99c"/>
<path d="M303 ${y+81}H441" stroke="#b8bdae"/>
<rect x="630" y="${y+35}" width="295" height="278" fill="none" stroke="#f4f4ed" stroke-width="5"/>
<path d="M777.5 ${y+35}V${y+313}" stroke="#dddeda" stroke-width="3"/>
<text x="80" y="${y+155}" font-size="13" fill="#687a60">Ar-condicionado</text><path d="M190 ${y+151}H236V${y+63}H290" fill="none" stroke="#96a18d"/>
<text x="80" y="${y+330}" font-size="13" fill="#687a60">Janela adesivada</text><path d="M195 ${y+327}H236V${y+322}H630" fill="none" stroke="#96a18d"/>
<text x="80" y="${y+380}" font-size="11" fill="#687a60">ADESIVO · JANELA</text><text x="80" y="${y+404}" font-size="20" font-weight="bold" fill="#36523d">${area(areas.adhesive)}</text>
<text x="80" y="${y+445}" font-size="11" fill="#687a60">ARTE · ALVENARIA</text><text x="80" y="${y+470}" font-size="20" font-weight="bold" fill="#36523d">${area(areas.p1Art)}</text>`;
else out+=`<rect x="287" y="${y+130}" width="139" height="365" fill="#f4f4ee" stroke="#9da88f" stroke-width="2"/>
<circle cx="412" cy="${y+320}" r="3" fill="#88947d"/><text x="357" y="${y+342}" font-size="12" text-anchor="middle" fill="#6b7d62">PORTA</text>
<text x="80" y="${y+380}" font-size="11" fill="#687a60">ARTE · ALVENARIA</text><text x="80" y="${y+407}" font-size="20" font-weight="bold" fill="#36523d">${area(areas.p2Art)}</text>`;
}
out+='<text x="80" y="1464" font-size="12.5" fill="#687a60">P01: parede 3,80 × 2,85 = 10,83 m²; janela 1,70 × 1,60 = 2,72 m²; arte = 8,11 m².</text><text x="80" y="1487" font-size="12.5" fill="#687a60">P02: parede 10,83 m² − porta 0,80 × 2,10 (1,68 m²) = 9,15 m² de arte.</text><text x="80" y="1510" font-size="12" fill="#687a60">Áreas geométricas, sem perdas. Descontados apenas os vãos; P01 sem desconto do ar-condicionado.</text>';
return out}
function renderPages(){
const rs=rows(),first=rs.slice(0,10),remaining=rs.slice(10),chunks=[];for(let i=0;i<remaining.length;i+=34)chunks.push(remaining.slice(i,i+34));
const descriptors=[{id:'plan',title:'Planta e mobiliário',body:()=>planMarkup()+tableSvg(first,1120)+wrap(state.notes,136).slice(0,3).map((t,i)=>`<text x="85" y="${1490+i*18}" font-family="Arial" font-size="13" fill="#718168">${esc(t)}</text>`).join('')}];
chunks.forEach((ch,i)=>descriptors.push({id:'table'+i,title:'Tabela · continuação',body:()=>tableSvg(ch,340)}));
if(state.showArt)descriptors.push({id:'art',title:'Arte · P01 e P02',body:wallArtMarkup});
state.customSheets.forEach(s=>descriptors.push({id:s.id,title:s.title||'Folha de imagens',body:()=>`<text x="80" y="305" font-size="22" font-weight="bold" fill="#38553c">${esc(s.title)}</text>`}));
const defaultRanks=new Map(descriptors.map((d,i)=>[d.id,i])),rank=id=>{const i=state.sheetOrder.indexOf(id);return i<0?10000+defaultRanks.get(id):i};descriptors.sort((a,b)=>rank(a.id)-rank(b.id));
if(!descriptors.some(d=>d.id===activeSheet))activeSheet='plan';
$('pages').innerHTML=descriptors.map((d,i)=>{const title=state.sheetTitles[d.id]||d.title;
const extras=d.id==='plan'?'':sheetObjects(d.id).map(objectMarkup).join('')+`<g data-selection="${d.id}">${activeSheet===d.id?selectionMarkup():''}</g>`;
return `<div class="page" id="sheet-${d.id}" data-sheet="${d.id}" data-page="${i+1}" ${d.id==='art'?'data-art="true"':''} data-title="${esc(title)}">${svgShell(frame(i+1)+d.body()+extras)}</div>`}).join('');
const pages=[...document.querySelectorAll('.page')];pages.forEach(p=>p.style.width=(800*zoom/100)+'px');
$('pageCount').textContent=`A4 · 210 × 297 mm · ${pages.length} folha(s)`;
$('pageNav').innerHTML=pages.map((p,i)=>`<button data-goto="${p.id}" class="${p.dataset.sheet===activeSheet?'active':''}">${i+1}. ${esc(p.dataset.title)}</button>`).join('');
$('activeSheet').innerHTML=pages.map((p,i)=>`<option value="${p.dataset.sheet}" ${p.dataset.sheet===activeSheet?'selected':''}>${i+1}. ${esc(p.dataset.title)}</option>`).join('');
}
function render(){notifySelection();migrate();renderPages();renderProperties();renderLayers();$('undo').disabled=!history.length;$('redo').disabled=!future.length;syncSheet();$('showArt').checked=state.showArt;$('artThumb').hidden=!state.mural;if(state.mural&&$('artThumb').getAttribute('src')!==state.mural)$('artThumb').src=state.mural;else if(!state.mural)$('artThumb').removeAttribute('src')}
function syncSheet(){for(const [id,key] of Object.entries({sheetTitle:'title',agency:'agency',author:'author',revision:'revision',date:'date',sheetNotes:'notes'})){if(document.activeElement!==$(id))$(id).value=state[key]}$('showIds').checked=state.showIds}
function renderLayers(){$('layers').innerHTML=[...sheetObjects()].reverse().map(o=>`<button data-layer="${o.id}" class="${selected===o.id?'selected':''}"><span>${esc(o.kind==='furniture'||o.kind==='image'?o.name:o.kind==='text'?o.text:'↗ '+o.text)}</span><span>${o.locked?'🔒':''}</span></button>`).join('')}
function field(id,title,value,type='number',step='1'){return `<label>${title}</label><input id="p-${id}" data-prop="${id}" type="${type}" value="${esc(value)}" step="${step}">`}
function renderProperties(){const o=getSelected();if(!o){$('properties').innerHTML='<div class="property-empty">Selecione um móvel, texto ou chamada na prancha.</div>';return}let html=`<span class="badge">${o.kind==='furniture'?esc(o.code):o.kind==='arrow'?'Chamada':'Texto'}</span>`;if(o.kind==='arrow'){html+=field('text','Texto da chamada',o.text,'text')+field('font','Tamanho da fonte',o.font)+field('color','Cor',o.color,'color')}else{if(o.kind==='furniture')html+=field('name','Nome do móvel',o.name,'text');else html+=`<label>Conteúdo (aceita várias linhas)</label><textarea id="p-text" data-prop="text">${esc(o.text)}</textarea>`+field('font','Tamanho da fonte',o.font)+`<label><input type="checkbox" data-prop="bold" ${o.bold?'checked':''}> Negrito</label>`;
html+=`<div class="row">${field('x','X na prancha',o.x.toFixed(1))}${field('y','Y na prancha',o.y.toFixed(1))}</div><div class="row">${field('w',o.kind==='furniture'?'Largura (m)':'Largura do texto',o.kind==='furniture'?(o.w/SCALE).toFixed(2):o.w,'number','0.01')}${field('h',o.kind==='furniture'?'Profundidade (m)':'Altura do texto',o.kind==='furniture'?(o.h/SCALE).toFixed(2):o.h,'number','0.01')}</div>`+field('angle','Rotação (graus)',o.angle||0)+field('color','Cor',o.color,'color')+`<label><input type="checkbox" data-prop="locked" ${o.locked?'checked':''}> Travar elemento</label>`}
html+='<div class="row"><button id="duplicate">Duplicar</button><button id="delete" class="danger">Excluir</button></div><div class="row" style="margin-top:8px"><button id="back">Para trás</button><button id="front">Para frente</button></div>';if(o.kind==='furniture')html+='<button id="labelObject" class="wide">↗ Criar chamada deste móvel</button>';$('properties').innerHTML=html;
$('properties').querySelectorAll('[data-prop]').forEach(el=>el.addEventListener('change',()=>{const key=el.dataset.prop;let v=el.type==='checkbox'?el.checked:['text','textarea','color'].includes(el.type)?el.value:Number(el.value);if(typeof v==='number'&&!Number.isFinite(v))return;if(['w','h','font'].includes(key)){if(v<=0){toast('Informe um valor maior que zero.');renderProperties();return}if(o.kind==='furniture'&&['w','h'].includes(key))v*=SCALE}commit(()=>o[key]=v)}));$('duplicate').onclick=duplicate;$('delete').onclick=removeSelected;$('front').onclick=()=>commit(()=>{state.objects=state.objects.filter(x=>x.id!==o.id);state.objects.push(o)});$('back').onclick=()=>commit(()=>{state.objects=state.objects.filter(x=>x.id!==o.id);state.objects.unshift(o)});if($('labelObject'))$('labelObject').onclick=()=>commit(()=>{const a={id:uid(),kind:'arrow',target:o.id,dx:0,dy:0,x1:o.x,y1:o.y,x2:860,y2:o.y,text:o.name,color:'#4f6350',font:18};state.objects.push(a);selected=a.id})}
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
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('tableDialog').open)return;if(e.key==='Escape'){setMode('select');selected=null;render();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click()}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();duplicate()}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected()}const o=getSelected();if(o&&!o.locked&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();commit(()=>{const step=e.shiftKey?15:1,kx=o.kind==='arrow'?'x2':'x',ky=o.kind==='arrow'?'y2':'y';o[kx]+=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;o[ky]+=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0})}});
function renderTableEditor(){const rs=rows();$('tableEditor').innerHTML=`<table><thead><tr>${state.columns.map(c=>`<th><input data-col="${esc(c.id)}" value="${esc(c.title)}" aria-label="Título da coluna"><button data-remove-col="${esc(c.id)}">Excluir coluna</button></th>`).join('')}<th>Ação</th></tr></thead><tbody>${rs.map(r=>`<tr>${state.columns.map(c=>`<td><input data-row="${esc(r.id)}" data-cell="${esc(c.id)}" value="${esc(r[c.id]??'')}" aria-label="${esc(c.title)} de ${esc(r.name||r.id)}"></td>`).join('')}<td>${r.id.startsWith('extra')?`<button data-remove-row="${r.id}">Excluir linha</button>`:'Vinculado à planta'}</td></tr>`).join('')}</tbody></table>`}
$('tableButton').onclick=()=>{renderTableEditor();$('tableDialog').showModal()};$('closeTable').onclick=()=>$('tableDialog').close();$('tableDialog').addEventListener('change',e=>{const el=e.target;if(el.dataset.col){commit(()=>state.columns.find(c=>c.id===el.dataset.col).title=el.value)}else if(el.dataset.cell){commit(()=>{const id=el.dataset.row,key=el.dataset.cell,r=state.extraRows.find(r=>r.id===id);if(r)r[key]=el.value;else (state.overrides[id]??={})[key]=el.value})}});
$('tableEditor').onclick=e=>{const c=e.target.dataset.removeCol,r=e.target.dataset.removeRow;if(c){if(state.columns.length===1){toast('Mantenha pelo menos uma coluna.');return}commit(()=>state.columns=state.columns.filter(x=>x.id!==c));renderTableEditor()}if(r){commit(()=>state.extraRows=state.extraRows.filter(x=>x.id!==r));renderTableEditor()}};
$('addColumn').onclick=()=>{commit(()=>state.columns.push({id:'custom'+uid(),title:'Novo campo'}));renderTableEditor()};$('addRow').onclick=()=>{commit(()=>state.extraRows.push({id:'extra'+uid(),name:'Novo item',qty:'1'}));renderTableEditor()};$('syncQty').onclick=()=>{commit(()=>Object.values(state.overrides).forEach(v=>delete v.qty));renderTableEditor();toast('Quantidades recalculadas a partir dos móveis.')};
function download(name,text,mime){const url=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
$('save').onclick=()=>download('Sala_Bem_Estar_V2_Projeto.json',JSON.stringify(state,null,2),'application/json');$('open').onclick=()=>$('openFile').click();
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
$('savehtml').onclick=async()=>{
try{
 const doc=document.documentElement.cloneNode(true);
 const encode=value=>JSON.stringify(value).replace(/</g,'\\u003c');
 doc.querySelector('#saved-state').textContent=encode(state);
 const modules=[...document.querySelectorAll('script[data-app-module][src]')];
 if(modules.length){
  for(const module of modules){
   const response=await fetch(module.src);if(!response.ok)throw Error('Falha ao carregar um módulo para exportação.');
   const target=[...doc.querySelectorAll('script[data-app-module]')].find(el=>el.getAttribute('src')===module.getAttribute('src'));
   target.removeAttribute('src');target.textContent=(await response.text()).replace(/<\/script/gi,'<\\/script');
  }
  doc.querySelector('script[src$="recursos.js"]').remove();
  const data=document.createElement('script');data.id='asset-data';data.type='application/json';data.textContent=encode(ASSETS);doc.querySelector('script[data-app-module]').before(data);
  const link=doc.querySelector('link[rel="stylesheet"]');const style=document.createElement('style');style.textContent=Array.from(document.styleSheets).flatMap(sheet=>Array.from(sheet.cssRules).map(rule=>rule.cssText)).join('\n');link.replaceWith(style);
 }
 delete doc.querySelector('body').dataset.drawer;doc.querySelector('#panelBackdrop').hidden=true;doc.querySelector('#fileMenu').hidden=true;
 doc.querySelector('#pages').innerHTML='';doc.querySelector('#toast').style.display='none';doc.querySelectorAll('dialog').forEach(d=>d.removeAttribute('open'));
 download('Editor_Sala_Bem_Estar_V2_Editado.html','<!doctype html>\n'+doc.outerHTML,'text/html');toast('HTML completo baixado com o layout e as imagens atuais.');
}catch(error){toast(error.message||'Não foi possível exportar o HTML.');}
};
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
window.addEventListener('beforeprint',()=>{stopDrag();updateSelection()});render();fitCanvas();window.dispatchEvent(new Event('layout:ready'));

})().catch(error=>{console.error(error);const status=document.getElementById("status");if(status)status.textContent="Falha ao iniciar o editor. Recarregue a página."});
