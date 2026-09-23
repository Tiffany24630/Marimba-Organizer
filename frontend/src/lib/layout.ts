import type {Element,MarimbaElement} from '../types';

export const PERSON_W=150;
export const PERSON_H=44;
export const MARIMBA_DEFAULT={width:380,height:150,pad:14,gap:10,slotH:54,slotY:56,minSlotW:104};

export function slotRect(m:MarimbaElement,i:number){
 const n=Math.max(m.positions.length,1);
 const w=(m.width-2*MARIMBA_DEFAULT.pad-MARIMBA_DEFAULT.gap*(n-1))/n;
 return {x:MARIMBA_DEFAULT.pad+i*(w+MARIMBA_DEFAULT.gap),y:MARIMBA_DEFAULT.slotY,width:w,height:MARIMBA_DEFAULT.slotH};
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
   const r=slotRect(marimba,idx);
   w=r.width-6;
   h=r.height-6;
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
