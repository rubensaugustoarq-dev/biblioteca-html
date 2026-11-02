import {build} from '../apps/web/node_modules/esbuild/lib/main.js';
import assert from 'node:assert/strict';
await build({stdin:{contents:`export {HomeDashboard} from './apps/web/src/features/home/HomeDashboard';export {homeProjects,projectDate} from './apps/web/src/features/home/projects';export {createElement} from './apps/web/node_modules/react/index.js';export {renderToStaticMarkup} from './apps/web/node_modules/react-dom/server.node.js';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',packages:'external',loader:{'.css':'empty'},outfile:'apps/web/.home-check.cjs'});

const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
const {HomeDashboard,homeProjects,projectDate,createElement,renderToStaticMarkup}=require('../apps/web/.home-check.cjs');
const projects=[{id:'a',name:'Praça Águas',crs:'EPSG:31979',revision:3,modified:1700000000},{id:'b',name:'Bosque',crs:'EPSG:31979',revision:7,modified:1800000000},{id:'c',name:'<img onerror=alert(1)>',crs:'EPSG:31979',revision:0}];
const before=JSON.stringify(projects);
assert.equal(homeProjects(projects,'praca aguas','recent')[0].id,'a');assert.equal(homeProjects(projects,'31979','recent').length,3);
assert.equal(homeProjects(projects,'','recent')[0].id,'b');assert.equal(homeProjects(projects,'Bosque','name').length,1);assert.equal(JSON.stringify(projects),before);
const props={projects,currentId:'a',lastId:'b',busy:false,error:'',onNew:()=>{},onOpen:()=>{},onRefresh:()=>{}};
const html=renderToStaticMarkup(createElement(HomeDashboard,props));
for(const text of ['Meus projetos','Continuar Praça Águas','Buscar projetos salvos','Abrir projeto Bosque','1.0.0','EM USO'])assert.ok(html.includes(text));
assert.ok(!html.includes('<img onerror=alert'));assert.ok(html.includes('&lt;img'));
const empty=renderToStaticMarkup(createElement(HomeDashboard,{...props,projects:[]}));assert.ok(empty.includes('Criar primeiro projeto'));
console.log('Home: listagem real, busca com acentos, ordenação, continuidade, estado vazio e escape dos nomes aprovados.');
const {unlink}=await import('node:fs/promises');await unlink('apps/web/.home-check.cjs');
