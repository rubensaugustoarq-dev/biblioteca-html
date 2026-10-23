
// RV09: individual components, one curtain + one rod + the required accessories.
const kitChoice={curtain:'HV32',rod:'HV36',accessory:'HV38',qty:2};
function kitItem(id){return state.items.find(i=>i.id===id)}
function updateKitTotal(){
 const a=kitItem(kitChoice.curtain),b=kitItem(kitChoice.rod),c=kitItem(kitChoice.accessory),q=Number(kitChoice.qty);
 const valid=a&&b&&c&&Number.isFinite(q)&&q>=0,total=valid&&[a,b,c].every(i=>net(i)!=null)?Math.round((net(a)+net(b)+net(c)*q)*100)/100:null;
 const el=document.querySelector('#kittotal');if(el)el.textContent=money(total);
 const parts=document.querySelector('#kitparts');if(parts)parts.innerHTML=[a,b,c].filter(Boolean).map((i,k)=>`<div>${k===2?esc(q):'1'} × ${esc(i.name)} — ${money(net(i))} ${i.links?`<a href="${safeUrl(i.links)}" target="_blank" rel="noopener">Ver produto ↗</a>`:''}</div>`).join('');
 const note=document.querySelector('#kitnotice');if(note)note.textContent=(a?.notes||'Selecione uma cortina cadastrada.')+' '+(b?.notes||'')+' Abraçadeira: confirmar se preço corresponde à unidade ou ao par. Frete, costura e instalação não incluídos.';
 return {a,b,c,q,total,valid};
}
function renderCurtainKit(){
 const existing=document.querySelector('#curtainkit');if(existing)existing.remove();if(view!=='catalog')return;
 const eligible=state.items.filter(i=>i.category==='Cortinas'),curtains=eligible.filter(i=>i.code==='M12'),rods=eligible.filter(i=>i.code==='M12-V'),accessories=eligible.filter(i=>i.code==='M12-A');if(!curtains.length||!rods.length||!accessories.length)return;
 for(const [key,list] of [['curtain',curtains],['rod',rods],['accessory',accessories]])if(!list.some(i=>i.id===kitChoice[key]))kitChoice[key]=list[0].id;
 const options=(list,key)=>list.map(i=>`<option value="${esc(i.id)}" ${i.id===kitChoice[key]?'selected':''}>${esc(i.name)} · ${money(net(i))}</option>`).join('');
 const host=document.createElement('details');host.id='curtainkit';host.className='kitbox';host.innerHTML=`<summary>Montar kit de cortina · comparar o valor completo</summary><div class="kitgrid"><label>Cortina<select id="kitcurtain">${options(curtains,'curtain')}</select></label><label>Varão<select id="kitrod">${options(rods,'rod')}</select></label><label>Qtd. de abraçadeiras<input id="kitqty" type="number" min="0" step="1" value="${kitChoice.qty}"></label></div><div class="kitparts" id="kitparts"></div><p class="kitnotice" id="kitnotice"></p><div class="kitbottom"><div><small>Total do kit, sem frete</small><br><strong id="kittotal"></strong></div><button id="kitselect" type="button">Escolher os componentes do kit</button></div><p class="kitstatus" id="kitstatus" role="status"></p>`;
 document.querySelector('#content').before(host);updateKitTotal();
 host.querySelector('#kitcurtain').onchange=e=>{kitChoice.curtain=e.target.value;updateKitTotal()};host.querySelector('#kitrod').onchange=e=>{kitChoice.rod=e.target.value;updateKitTotal()};host.querySelector('#kitqty').oninput=e=>{kitChoice.qty=e.target.value;updateKitTotal()};
 host.querySelector('#kitselect').onclick=()=>{const {a,b,c,q,valid}=updateKitTotal();if(!valid||!Number.isInteger(q)){toast('Informe uma quantidade inteira de abraçadeiras');return}commit(()=>{for(const i of [a,b]){i.selected=true;i.qty=1}c.qty=q;c.selected=q>0});document.querySelector('#curtainkit').open=true;document.querySelector('#kitstatus').textContent='Componentes marcados no catálogo. Revise outras alternativas já selecionadas para evitar somas em duplicidade.';toast('Kit selecionado; cada componente mantém seu preço e loja')};
}
const renderBeforeKit=render;render=function(){renderBeforeKit();renderCurtainKit()};renderCurtainKit();

