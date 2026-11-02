import type {Ramp} from './types';

/** Compact drawing ID only. Names, slopes and warnings belong in the panels. */
export function rampMapNumber(ramp:Ramp,ramps:Ramp[]=[]){
  const number=ramp.name.match(/\d+/g)?.at(-1);
  return number||String(ramps.findIndex(r=>r.id===ramp.id)+1||ramps.length+1);
}
