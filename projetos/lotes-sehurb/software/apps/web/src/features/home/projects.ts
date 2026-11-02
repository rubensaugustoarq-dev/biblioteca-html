import type {Recent} from '../../api';
const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
export function homeProjects(items:Recent[],query:string,order:'recent'|'name'){
 const term=normalize(query.trim());return items.filter(item=>normalize(item.name+' '+item.crs).includes(term)).sort((a,b)=>order==='name'?a.name.localeCompare(b.name,'pt-BR'):(b.modified||0)-(a.modified||0)||a.name.localeCompare(b.name,'pt-BR'));
}
export function projectDate(value?:number){return value?new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value*1000)):'Data não disponível';}
