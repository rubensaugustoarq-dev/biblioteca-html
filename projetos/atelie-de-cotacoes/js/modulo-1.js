'use strict';
window.AtelieStorage=(()=>{
 const dbName='atelie-cotacoes-sala-bem-estar-v1',storeName='projetos';let connection;
 const copy=x=>JSON.parse(JSON.stringify(x));
 function validate(input){
  if(!input||typeof input!=='object')throw Error('dados ausentes');
  if(input.format&&input.format!=='atelie-cotacoes')throw Error('formato de outro aplicativo');
  if(input.version&&input.version!==1)throw Error('versão não suportada');
  for(const k of ['items','stores','layout','tasks'])if(!Array.isArray(input[k])||input[k].length>5000)throw Error('lista inválida: '+k);
  if(!input.meta||typeof input.meta.title!=='string')throw Error('nome do projeto ausente');
  const data=copy(input);data.format='atelie-cotacoes';data.version=1;data.projectId='sala-bem-estar';
  const text=(v,label)=>{if(v!=null&&typeof v!=='string')throw Error(label+' deve ser texto');return v??''};
  const number=(v,label)=>{if(v==null||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error(label+' inválido');return v};
  const photo=v=>{if(typeof v!=='string'||!(/^(data:image\/(png|jpeg|webp);base64,|imagens\/[a-zA-Z0-9_.-]+$|https?:\/\/)/.test(v)))throw Error('formato de imagem inválido');return v};
  for(const list of [data.items,data.stores,data.layout,data.tasks]){const ids=new Set();for(const r of list){if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('identificador ausente ou repetido');ids.add(r.id);r.name=text(r.name,'nome');}}
  for(const i of data.items){for(const k of ['code','store','scope','notes','source','links','category','status','unit'])i[k]=text(i[k],k);i.price=number(i.price,'preço');i.qty=number(i.qty,'quantidade');i.discount=number(i.discount,'desconto')||0;if(i.discount>100)throw Error('desconto acima de 100%');i.selected=!!i.selected;if(!Array.isArray(i.photos)||i.photos.length>40)throw Error('lista de fotos inválida');i.photos=i.photos.map(photo)}
  for(const s of data.stores)for(const k of ['address','seller','phone','status','products','notes','link'])s[k]=text(s[k],k);
  for(const l of data.layout){for(const k of ['code','condition','unit','dimensions','notes','source'])l[k]=text(l[k],k);l.qty=number(l.qty,'quantidade do layout');if(!['Novo','Existente','A definir'].includes(l.condition))l.condition='A definir'}
  for(const t of data.tasks)for(const k of ['code','dimensions','owner','notes','status','source'])t[k]=text(t[k],k);
  for(const k of ['title','subtitle','responsible','date','revision','notes'])data.meta[k]=text(data.meta[k],k);
  data.meta.logo=data.meta.logo?photo(data.meta.logo):'';data.checks=Object.fromEntries(Object.entries(data.checks||{}).filter(([k,v])=>typeof v==='boolean'));data.savedAt=number(data.savedAt,'data de salvamento')||0;
  return data;
 }
 function open(){if(!window.indexedDB)return Promise.reject(Error('IndexedDB indisponível'));if(!connection)connection=new Promise((resolve,reject)=>{const request=indexedDB.open(dbName,1);request.onupgradeneeded=()=>request.result.createObjectStore(storeName);request.onsuccess=()=>resolve(request.result);request.onerror=()=>{connection=null;reject(request.error)}});return connection}
 async function read(key){const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction(storeName,'readonly').objectStore(storeName).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}
 async function load(){const current=await read('atual');if(!current)return null;try{return validate(current)}catch(e){const backup=await read('anterior');if(backup)return validate(backup);throw e}}
 async function previous(){const data=await read('anterior');return data?validate(data):null}
 async function save(input){const data=validate(input),db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),request=store.get('atual');request.onsuccess=()=>{if(request.result)store.put(request.result,'anterior');store.put(data,'atual')};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('salvamento cancelado'))})}
 async function portable(input){const data=validate(input),cache=new Map();async function image(src){if(!src||src.startsWith('data:'))return src;if(!cache.has(src))cache.set(src,(async()=>{const response=await fetch(src);if(!response.ok)throw Error('Foto não encontrada: '+src);const blob=await response.blob();if(!blob.type.startsWith('image/'))throw Error('Recurso não é imagem');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})})());return cache.get(src)}
  data.meta.logo=await image(data.meta.logo);await Promise.all(data.items.map(async i=>{i.photos=await Promise.all(i.photos.map(image))}));return data;
 }
 return {validate,load,save,portable,previous};
})();
