const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:min));

/** Shared render/input bounds follow the walkable bitmap floor, not the whole image. */
export function clampRoomPosition(position:{x:number;y:number}) {
  const x=clamp(position.x,12,88);
  const distance=Math.abs(x-50);
  return {x,y:clamp(position.y,Math.max(55,43+distance*.43),Math.min(92,94-distance*.46))};
}

export function clampPlazaPosition(position:{x:number;y:number}) {
  let x=clamp(position.x,10,90);
  const y=clamp(position.y,52,91);
  // Do not stand in the central well or the lower-left stream.
  if(x>48&&x<68&&y>47&&y<63)x=x<58?47:69;
  if(y>85&&x<34)x=34;
  return {x,y};
}
