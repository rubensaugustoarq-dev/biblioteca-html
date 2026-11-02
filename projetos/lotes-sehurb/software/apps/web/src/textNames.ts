/** Copies share a numbered name family, even when duplicating another copy. */
export function nextTextName(text:string,names:string[]):string{
  const base=text.trim().replace(/\s+\d+$/,'');
  let next=2;
  for(const name of names){
    const match=name.trim().match(/^(.*)\s+(\d+)$/);
    if(match&&match[1]===base)next=Math.max(next,Number(match[2])+1);
  }
  let result='';
  do{const suffix=` ${next++}`;result=base.slice(0,200-suffix.length)+suffix;}while(names.includes(result));
  return result;
}
