/** F8 belongs to the map even when a properties field retains keyboard focus. */
export function orthoShortcut(event:Pick<KeyboardEvent,'key'|'repeat'|'preventDefault'>,toggle:()=>void){
 if(event.key!=='F8')return false;
 event.preventDefault();
 if(!event.repeat)toggle();
 return true;
}
