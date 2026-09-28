import type {Element,MarimbaElement} from '../types';

/**
 * Live Konva stage viewport, published by CanvasEditor so that DOM-level
 * interactions (HTML5 drag & drop from the side panels) can convert client
 * coordinates into composition world coordinates.
 */
export const viewport={scale:1,x:0,y:0};

export function syncViewport(scale:number,x:number,y:number){
 viewport.scale=scale||1;
 viewport.x=x;
 viewport.y=y;
}

/** Converts a viewport (client) point into composition world coordinates. */
export function clientToWorld(clientX:number,clientY:number,origin:{left:number;top:number}){
 return {x:(clientX-origin.left-viewport.x)/viewport.scale,y:(clientY-origin.top-viewport.y)/viewport.scale};
}

export const PERSON_W=150;
export const PERSON_H=44;
export const MARIMBA_DEFAULT={width:380,height:150,pad:14,gap:10,slotH:54,slotY:56,minSlotW:104};

export function slotRect(m:MarimbaElement,i:number){
 const n=Math.max(m.positions.length,1);
 const w=(m.width-2*MARIMBA_DEFAULT.pad-MARIMBA_DEFAULT.gap*(n-1))/n;
 return {x:MARIMBA_DEFAULT.pad+i*(w+MARIMBA_DEFAULT.gap),y:MARIMBA_DEFAULT.slotY,width:w,height:MARIMBA_DEFAULT.slotH};
}

/**
 * Limites de escala de una persona sentada en un puesto.
 *
 * Konva escala la marimba con `scaleX/scaleY` y no cambia `width`, asi que el
 * puesto se agranda en pantalla aunque `slotRect` devuelva el valor sin escala.
 * Estas personas acompanan ese crecimiento con tope: por debajo el texto deja de
 * leerse y por encima deja de caber con claridad en el puesto.
 */
export const PERSON_MIN_SCALE=0.55;
export const PERSON_MAX_SCALE=2.2;
export const clampPersonScale=(v:number)=>Number.isFinite(v)
 ?Math.max(PERSON_MIN_SCALE,Math.min(PERSON_MAX_SCALE,v))
 :1;

/** Topes duros en pixeles para que el texto nunca sea ilegible ni desproporcionado. */
export const PERSON_MIN_W=40;
export const PERSON_MAX_W=420;
export const PERSON_MIN_H=24;
export const PERSON_MAX_H=150;
export const clampNumber=(v:number,lo:number,hi:number)=>
 Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):lo;

/**
 * Escala visual que ve una persona sentada en el puesto `i` de la marimba `m`.
 *
 * Devuelve 1 cuando la marimba no esta escalada, de modo que el comportamiento
 * normal no cambia. Se usa el promedio de X e Y para que el texto nunca se
 * deforme, y se acota con `clampPersonScale` para no perder legibilidad.
 */
export function seatScale(m:MarimbaElement,i:number){
 const sx=Math.abs(m.scaleX||1),sy=Math.abs(m.scaleY||1);
 const k=(sx+sy)/2;
 // Un margen del 1% evita reescalados por decimales de Konva al soltar el tirador.
 if(Math.abs(k-1)<0.01)return 1;
 return clampPersonScale(k);
}

export function localToWorld(m:MarimbaElement,lx:number,ly:number){
 const r=m.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 const X=lx*m.scaleX,Y=ly*m.scaleY;
 return {x:m.x+X*c-Y*s,y:m.y+X*s+Y*c};
}

export function worldToLocal(m:MarimbaElement,wx:number,wy:number){
 const r=-m.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 const dx=wx-m.x,dy=wy-m.y;
 return {x:(dx*c-dy*s)/m.scaleX,y:(dx*s+dy*c)/m.scaleY};
}

export function slotCenter(m:MarimbaElement,i:number){
 const r=slotRect(m,i);
 return localToWorld(m,r.x+r.width/2,r.y+r.height/2);
}

export function nearestSlot(m:MarimbaElement,local:{x:number,y:number}):number{
 let best=-1,bestD=Infinity;
 m.positions.forEach((_,i)=>{
  const r=slotRect(m,i);
  const d=Math.abs(local.x-(r.x+r.width/2));
  if(d<bestD){bestD=d;best=i;}
 });
 return best;
}

export function hitTestSlot(els:Element[],p:{x:number,y:number}):{marimba:MarimbaElement,index:number}|null{
 const marimbas=els.filter((e):e is MarimbaElement=>e.type==='marimba');
 for(let i=marimbas.length-1;i>=0;i--){
  const m=marimbas[i];
  if(!m.positions.length)continue;
  const l=worldToLocal(m,p.x,p.y);
  if(l.x<0||l.x>m.width||l.y<0||l.y>m.height)continue;
  const idx=nearestSlot(m,l);
  if(idx>=0)return {marimba:m,index:idx};
 }
 return null;
}

export function elementBBox(e:Element, marimba?:MarimbaElement){
 let w=e.width*(e.scaleX||1), h=e.height*(e.scaleY||1);
 let ox=0, oy=0, rot=e.rotation||0;
 if(e.type==='person'&&e.marimbaId&&marimba){
  const idx=marimba.positions.findIndex(p=>p.id===e.marimbaPositionId);
  if(idx>=0){
   // Misma regla que PersonNode: el puesto sin escala por el factor de la
   // marimba. Si no, la caja de la persona no coincidiria con lo que se dibuja
   // y el PNG exportado la cortaria.
   const k=seatScale(marimba,idx);
   const r=slotRect(marimba,idx);
   w=(r.width-6)*k;
   h=(r.height-6)*k;
   ox=w/2;
   oy=h/2;
   rot=marimba.rotation;
  }
 }
 const rad=rot*Math.PI/180, c=Math.cos(rad), s=Math.sin(rad);
 const pts=[[-ox,-oy],[w-ox,-oy],[w-ox,h-oy],[-ox,h-oy]].map(([X,Y])=>({x:e.x+X*c-Y*s,y:e.y+X*s+Y*c}));
 const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
 const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
 return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}
