export function nextAlertAngle(angle:number){
 return ((angle+90+180)%360+360)%360-180;
}

export function isAlertRotationKey(e:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'repeat'>){
 return e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.repeat;
}
