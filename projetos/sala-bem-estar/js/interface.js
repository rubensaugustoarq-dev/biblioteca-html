/* Interface responsiva: mantém os controles de edição independentes da apresentação. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),body=document.body;
const compact=()=>window.matchMedia('(max-width:1000px)').matches;
let previousFocus=null;
function syncDock(target='canvas'){
 document.querySelectorAll('[data-dock]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.dock===target)));
}
function closePanels(restore=false){
 delete body.dataset.drawer;$('panelBackdrop').hidden=true;
 $('toolsPanel').inert=compact();$('propertiesPanel').inert=compact();
 $('toggleTools').setAttribute('aria-expanded',String(!compact()&&!body.classList.contains('hide-tools')));
 $('toggleProperties').setAttribute('aria-expanded',String(!compact()&&!body.classList.contains('hide-properties')));syncDock();
 if(restore)previousFocus?.focus();
}
function tab(name){
 const titles={tools:'Ferramentas',sheets:'Folhas',settings:'Prancha'};
 document.querySelectorAll('[data-section]').forEach(section=>section.hidden=section.dataset.section!==name);
 document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===name)));
 $('leftPanelTitle').textContent=titles[name];
}
function openPanel(name,section='tools'){
 if(name==='tools')tab(section);
 if(compact()){
  previousFocus=document.activeElement;body.dataset.drawer=name;$('panelBackdrop').hidden=false;
  $('toolsPanel').inert=name!=='tools';$('propertiesPanel').inert=name!=='properties';
  $(name==='tools'?'toggleTools':'toggleProperties').setAttribute('aria-expanded','true');
  const panel=$(name==='tools'?'toolsPanel':'propertiesPanel');panel.scrollTop=0;
  (panel.querySelector('[data-tab][aria-selected=true]')||panel.querySelector('button'))?.focus();
 }else{body.classList.remove(name==='tools'?'hide-tools':'hide-properties');$(name==='tools'?'toggleTools':'toggleProperties').setAttribute('aria-expanded','true');window.dispatchEvent(new Event('layout:resize'));}
 syncDock(name==='properties'?'properties':section);
}
function togglePanel(name){
 if(compact()){if(body.dataset.drawer===name)closePanels(true);else openPanel(name);}
 else{body.classList.toggle(name==='tools'?'hide-tools':'hide-properties');$(name==='tools'?'toggleTools':'toggleProperties').setAttribute('aria-expanded',String(!body.classList.contains(name==='tools'?'hide-tools':'hide-properties')));window.dispatchEvent(new Event('layout:resize'));}
}
$('toggleTools').onclick=()=>togglePanel('tools');$('toggleProperties').onclick=()=>togglePanel('properties');
$('closeTools').onclick=()=>compact()?closePanels(true):togglePanel('tools');$('closeProperties').onclick=()=>compact()?closePanels(true):togglePanel('properties');$('panelBackdrop').onclick=()=>closePanels(true);
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{tab(button.dataset.tab);if(compact())syncDock(button.dataset.tab)});
document.querySelectorAll('[data-dock]').forEach(button=>button.onclick=()=>{const name=button.dataset.dock;if(name==='canvas'){closePanels();window.dispatchEvent(new CustomEvent('layout:action',{detail:{action:'plan'}}));}else if(name==='properties')openPanel('properties');else openPanel('tools',name)});
$('fileMenuButton').onclick=()=>{const show=$('fileMenu').hidden;$('fileMenu').hidden=!show;$('fileMenuButton').setAttribute('aria-expanded',String(show));};
document.addEventListener('click',e=>{if(!e.target.closest('#fileMenuButton')&&!e.target.closest('#fileMenu')){$('fileMenu').hidden=true;$('fileMenuButton').setAttribute('aria-expanded','false');}});
$('fileMenu').addEventListener('click',e=>{if(e.target.closest('button')){$('fileMenu').hidden=true;$('fileMenuButton').setAttribute('aria-expanded','false');}});
$('shortcutsButton').onclick=()=>$('shortcutsDialog').showModal();$('closeShortcuts').onclick=()=>$('shortcutsDialog').close();
for(const [id,action] of [['quickDuplicate','duplicate'],['quickRotate','rotate'],['quickDelete','delete']])$(id).onclick=()=>window.dispatchEvent(new CustomEvent('layout:action',{detail:{action}}));
const furnitureCards=[
 ['massage','Massagem','M5 12V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5M5 10H2v10h20V10h-3v5H5z'],
 ['quick','Quick massage','m7 4 5 4 5-4M12 8v7M6 20l6-5 6 5M7 11h10'],
 ['maca','Maca','M3 11h18v7H3zM5 18v3M19 18v3M3 11V7h6v4'],
 ['pouf','Pufe','M4 8c0-6 16-6 16 0v9c0 6-16 6-16 0zM4 8c0 6 16 6 16 0'],
 ['plant','Planta','M8 15h8l-1 6H9zM12 15V4M12 10C4 10 3 3 7 3c4 0 5 7 5 7ZM12 12c8 0 9-8 5-8-4 0-5 8-5 8Z'],
 ['humidifier','Umidificador','M6 11c0-5 12-5 12 0v7c0 5-12 5-12 0ZM10 5V2M14 5V2M10 16h4']
];
const grid=document.createElement('div');grid.className='furniture-grid';grid.setAttribute('aria-label','Adicionar mobiliário rapidamente');
for(const [type,label,path] of furnitureCards){const button=document.createElement('button');button.type='button';button.title='Adicionar '+label;button.innerHTML='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg><span>'+label+'</span>';button.onclick=()=>{$('catalog').value=type;$('addFurniture').click();};grid.append(button);}
// Exported HTML already contains the cards; rebuild just this transient view.
document.querySelector('.furniture-grid')?.remove();$('catalog').before(grid);
// On a phone, close the drawer after insertion so the new element remains visible.
for(const id of ['addFurniture','insertImage','goArt'])$(id).addEventListener('click',()=>{if(compact())closePanels()});
document.querySelectorAll('[data-mode]').forEach(button=>{button.title=button.textContent.trim();button.setAttribute('aria-label',button.title);button.addEventListener('click',()=>{if(compact())closePanels()})});
let selected=false;
window.addEventListener('layout:selection',e=>{selected=e.detail.selected;document.querySelectorAll('.selection-action').forEach(b=>b.disabled=!selected);$('quickRotate').disabled=!selected||e.detail.locked||e.detail.arrow;});
window.addEventListener('layout:edit',()=>{if(compact())openPanel('properties');});
window.addEventListener('layout:saved',()=>{const label=document.querySelector('.live-badge span');if(label)label.textContent='Salvo neste navegador';});
// Mirror the editor selection without polling during dragging.
new MutationObserver(()=>{const yes=!!$('properties').querySelector('[data-prop], [data-image-prop]');if(yes!==selected){selected=yes;document.querySelectorAll('.selection-action').forEach(b=>b.disabled=!yes);}}).observe($('properties'),{childList:true,subtree:true});
document.addEventListener('keydown',e=>{
 const editing=e.target.closest?.('input,textarea,select,[contenteditable=true]');
 if(e.key==='Escape'){$('fileMenu').hidden=true;$('fileMenuButton').setAttribute('aria-expanded','false');closePanels(true);}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();$('save').click();return;}
 if(editing||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]'))return;
 const key=e.key.toLowerCase();if(key==='f'){$('fitPage').click();e.preventDefault();}else if(['v','t','a'].includes(key)){document.querySelector('[data-mode="'+({v:'select',t:'text',a:'arrow'}[key])+'"]').click();e.preventDefault();}
});
// Keep focus inside an open drawer; Escape returns it to the opener.
document.addEventListener('keydown',e=>{
 if(e.key!=='Tab'||!body.dataset.drawer||document.querySelector('dialog[open]'))return;
 const panel=$(body.dataset.drawer==='tools'?'toolsPanel':'propertiesPanel');
 const nodes=[...panel.querySelectorAll('button,input,select,textarea,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length&&el.tabIndex>=0);
 if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);
 if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
});
let wasCompact=compact();closePanels();
window.addEventListener('resize',()=>{if(wasCompact!==compact()){wasCompact=compact();closePanels();if(!compact()){$('toolsPanel').inert=false;$('propertiesPanel').inert=false;}}});
})();
