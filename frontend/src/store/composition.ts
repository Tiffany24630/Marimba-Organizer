import {create} from 'zustand';
import type {Element,MarimbaElement,PersonElement} from '../types';
import {MARIMBA_DEFAULT,PERSON_H,PERSON_W,nearestSlot,slotCenter,slotRect,worldToLocal} from '../lib/layout';

export const uid=()=>Math.random().toString(36).slice(2)+Date.now();

function num(v:unknown,d:number){const n=Number(v);return Number.isFinite(n)?n:d;}

export function normalizeElement(raw:any):Element|null{
 if(!raw||typeof raw!=='object')return null;
 const isMarimba=raw.type==='marimba';
 const base={
  id:typeof raw.id==='string'&&raw.id?raw.id:uid(),
  x:num(raw.x,60),y:num(raw.y,60),
  width:num(raw.width,isMarimba?MARIMBA_DEFAULT.width:PERSON_W),
  height:num(raw.height,isMarimba?MARIMBA_DEFAULT.height:PERSON_H),
  rotation:num(raw.rotation,0),scaleX:num(raw.scaleX,1),scaleY:num(raw.scaleY,1),
  locked:Boolean(raw.locked??false),
 };
 if(isMarimba){
  const positions=(Array.isArray(raw.positions)?raw.positions:[]).map((p:any)=>{
   if(typeof p==='string')return {id:uid(),type:p,personId:null as number|null};
   return {id:typeof p?.id==='string'&&p.id?p.id:uid(),type:String(p?.type??p?.name??'Primera'),personId:(typeof p?.personId==='number'?p.personId:null) as number|null};
  });
  return {...base,type:'marimba',name:String(raw.name||'Marimba'),positions};
 }
 if(raw.type==='person'){
  return {...base,type:'person',name:String(raw.name||'Persona'),personId:num(raw.personId,0),
   positionType:String(raw.positionType??raw.position??'Primera'),
   marimbaId:typeof raw.marimbaId==='string'?raw.marimbaId:null,
   marimbaPositionId:typeof raw.marimbaPositionId==='string'?raw.marimbaPositionId:null};
 }
 return null;
}

function withRepositioned(els:Element[],m:MarimbaElement):Element[]{
 return els.map(e=>{
  if(e.type!=='person'||e.marimbaId!==m.id)return e;
  const idx=m.positions.findIndex(p=>p.id===e.marimbaPositionId);
  if(idx<0)return {...e,marimbaId:null,marimbaPositionId:null};
  const c=slotCenter(m,idx);
  return {...e,x:c.x,y:c.y,rotation:m.rotation};
 });
}

function applyAssign(els:Element[],personElId:string,marimbaId:string,positionId:string):Element[]{
 const person=els.find(e=>e.id===personElId);
 if(!person||person.type!=='person')return els;
 const marimba=els.find(e=>e.id===marimbaId);
 if(!marimba||marimba.type!=='marimba')return els;
 const idx=marimba.positions.findIndex(p=>p.id===positionId);
 if(idx<0)return els;
 const c=slotCenter(marimba,idx);
 let out:Element[]=els.map(el=>{
  if(el.type==='marimba'){
   const positions=el.positions.map(p=>{
    if(el.id===marimbaId&&p.id===positionId)return {...p,personId:person.personId};
    if(p.personId===person.personId)return {...p,personId:null};
    return p;
   });
   return {...el,positions};
  }
  return el;
 });
 out=out.map(el=>{
  if(el.type!=='person')return el;
  if(el.id===personElId)return {...el,marimbaId,marimbaPositionId:positionId,x:c.x,y:c.y,rotation:marimba.rotation};
  if(el.marimbaId===marimbaId&&el.marimbaPositionId===positionId)return {...el,marimbaId:null,marimbaPositionId:null};
  return el;
 });
 return out;
}

function cloneEls(els:Element[]):Element[]{
 return JSON.parse(JSON.stringify(els));
}

type Geometry={x:number;y:number;rotation:number;scaleX:number;scaleY:number};

type State={
 elements:Element[];
 selectedId:string|null;
 history:Element[][];
 future:Element[][];
 isDirty:boolean;
 setElements:(raw:unknown)=>void;
 select:(id:string|null)=>void;
 markClean:()=>void;
 markDirty:()=>void;
 recordHistory:()=>void;
 undo:()=>void;
 redo:()=>void;
 toggleLock:(id:string)=>void;
 addPerson:(p:{id:number,name:string,position?:string})=>void;
 addMarimba:(m:{name:string,positions:string[]})=>void;
 addCustomMarimba:(name?:string)=>void;
 update:(id:string,patch:Partial<PersonElement>&Partial<MarimbaElement>)=>void;
 remove:(id:string)=>void;
 clear:()=>void;
 addPosition:(marimbaId:string,type:string)=>void;
 removePosition:(marimbaId:string,positionId:string)=>void;
 setPositionType:(marimbaId:string,positionId:string,type:string)=>void;
 movePosition:(marimbaId:string,positionId:string,dir:-1|1)=>void;
 assign:(personElId:string,marimbaId:string,positionId:string)=>void;
 unassign:(personElId:string,at:{x:number,y:number}|null)=>void;
 dropPerson:(personElId:string,pointer:{x:number,y:number}|null,fallback:{x:number,y:number,rotation:number})=>void;
 marimbaDragged:(id:string,x:number,y:number)=>void;
 marimbaTransformed:(id:string,g:Geometry)=>void;
};

export const useComposition=create<State>((set)=>({
 elements:[],
 selectedId:null,
 history:[],
 future:[],
 isDirty:false,
 setElements:raw=>set({
  elements:(Array.isArray(raw)?raw:[]).map(normalizeElement).filter((e):e is Element=>!!e),
  selectedId:null,
  history:[],
  future:[],
  isDirty:false,
 }),
 select:id=>set({selectedId:id}),
 markClean:()=>set({isDirty:false}),
 markDirty:()=>set({isDirty:true}),
 recordHistory:()=>set(s=>({
  history:[...s.history.slice(-29),cloneEls(s.elements)],
  future:[],
  isDirty:true,
 })),
 undo:()=>set(s=>{
  if(!s.history.length)return {};
  const prev=s.history[s.history.length-1];
  const newHistory=s.history.slice(0,-1);
  return {
   elements:prev,
   history:newHistory,
   future:[cloneEls(s.elements),...s.future.slice(0,29)],
   selectedId:null,
   isDirty:true,
  };
 }),
 redo:()=>set(s=>{
  if(!s.future.length)return {};
  const next=s.future[0];
  const newFuture=s.future.slice(1);
  return {
   elements:next,
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:newFuture,
   selectedId:null,
   isDirty:true,
  };
 }),
 toggleLock:id=>set(s=>{
  const el=s.elements.find(e=>e.id===id);
  if(!el)return {};
  const newLocked=!el.locked;
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:s.elements.map(e=>e.id===id?{...e,locked:newLocked} as Element:e),
   isDirty:true,
  };
 }),
 addPerson:p=>set(s=>{
  const existing=s.elements.find(e=>e.type==='person'&&e.personId===p.id);
  if(existing)return {selectedId:existing.id};
  const el:PersonElement={id:uid(),type:'person',name:p.name,personId:p.id,positionType:p.position||'Primera',
   x:80+Math.random()*220,y:70+Math.random()*160,width:PERSON_W,height:PERSON_H,
   rotation:0,scaleX:1,scaleY:1,locked:false,marimbaId:null,marimbaPositionId:null};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:[...s.elements,el],
   selectedId:el.id,
   isDirty:true,
  };
 }),
 addMarimba:m=>set(s=>{
  const n=Math.max(m.positions.length,1);
  const width=Math.max(MARIMBA_DEFAULT.width,2*MARIMBA_DEFAULT.pad+n*MARIMBA_DEFAULT.minSlotW+(n-1)*MARIMBA_DEFAULT.gap);
  const el:MarimbaElement={id:uid(),type:'marimba',name:m.name,x:260+Math.random()*160,y:200+Math.random()*120,
   width,height:MARIMBA_DEFAULT.height,rotation:0,scaleX:1,scaleY:1,locked:false,
   positions:m.positions.map(t=>({id:uid(),type:t,personId:null}))};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:[...s.elements,el],
   selectedId:el.id,
   isDirty:true,
  };
 }),
 addCustomMarimba:name=>set(s=>{
  const el:MarimbaElement={id:uid(),type:'marimba',name:name||'Marimba personalizada',x:300+Math.random()*160,y:220+Math.random()*120,
   width:MARIMBA_DEFAULT.width,height:MARIMBA_DEFAULT.height,rotation:0,scaleX:1,scaleY:1,locked:false,
   positions:[{id:uid(),type:'Primera',personId:null}]};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:[...s.elements,el],
   selectedId:el.id,
   isDirty:true,
  };
 }),
 update:(id,patch)=>set(s=>{
  const el=s.elements.find(e=>e.id===id);
  if(!el)return {};
  // If locked, disallow modifying geometry directly through update unless toggling locked
  if(el.locked&&!('locked' in patch)&&('x' in patch||'y' in patch||'rotation' in patch||'scaleX' in patch)){
   return {};
  }
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:s.elements.map(e=>e.id===id?{...e,...patch} as Element:e),
   isDirty:true,
  };
 }),
 remove:id=>set(s=>{
  const el=s.elements.find(e=>e.id===id);
  if(!el||el.locked)return {};
  if(el.type==='person'){
   const elements=s.elements.filter(e=>e.id!==id).map(e=>e.type==='marimba'
    ?{...e,positions:e.positions.map(p=>p.personId===el.personId?{...p,personId:null}:p)}:e);
   return {
    history:[...s.history.slice(-29),cloneEls(s.elements)],
    future:[],
    elements,
    selectedId:null,
    isDirty:true,
   };
  }
  const elements=s.elements.filter(e=>e.id!==id).map(e=>e.type==='person'&&e.marimbaId===id
   ?{...e,marimbaId:null,marimbaPositionId:null}:e);
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements,
   selectedId:null,
   isDirty:true,
  };
 }),
 clear:()=>set(s=>({
  history:[...s.history.slice(-29),cloneEls(s.elements)],
  future:[],
  elements:[],
  selectedId:null,
  isDirty:true,
 })),
 addPosition:(marimbaId,type)=>set(s=>{
  const m=s.elements.find(e=>e.id===marimbaId);
  if(!m||m.type!=='marimba'||m.locked)return {};
  const els=s.elements.map(e=>{
   if(e.type!=='marimba'||e.id!==marimbaId)return e;
   const positions=[...e.positions,{id:uid(),type:type.trim()||'Primera',personId:null}];
   const needed=2*MARIMBA_DEFAULT.pad+positions.length*MARIMBA_DEFAULT.minSlotW+(positions.length-1)*MARIMBA_DEFAULT.gap;
   const mm={...e,positions,width:Math.max(e.width,needed)};
   return withRepositioned(s.elements.map(x=>x.id===marimbaId?mm:x),mm).find(x=>x.id===marimbaId)??mm;
  });
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:els,
   isDirty:true,
  };
 }),
 removePosition:(marimbaId,positionId)=>set(s=>{
  const mOld=s.elements.find(e=>e.id===marimbaId);
  if(!mOld||mOld.type!=='marimba'||mOld.locked)return {};
  const idx=mOld.positions.findIndex(p=>p.id===positionId);
  const r=idx>=0?slotRect(mOld,idx):null;
  const c=idx>=0?slotCenter(mOld,idx):null;
  const stripped={...mOld,positions:mOld.positions.filter(p=>p.id!==positionId)};
  const freed=s.elements.map(e=>{
   if(e.id===marimbaId)return stripped;
   if(e.type!=='person'||e.marimbaId!==marimbaId)return e;
   if(e.marimbaPositionId===positionId)return {...e,marimbaId:null,marimbaPositionId:null,rotation:0,
    x:c&&r?c.x-r.width/2:e.x,y:c&&r?c.y-r.height/2:e.y};
   return e;
  });
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:withRepositioned(freed,stripped),
   isDirty:true,
  };
 }),
 setPositionType:(marimbaId,positionId,type)=>set(s=>{
  const m=s.elements.find(e=>e.id===marimbaId);
  if(!m||m.type!=='marimba'||m.locked)return {};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:s.elements.map(e=>e.type==='marimba'&&e.id===marimbaId
    ?{...e,positions:e.positions.map(p=>p.id===positionId?{...p,type:type.trim()||p.type}:p)}:e),
   isDirty:true,
  };
 }),
 movePosition:(marimbaId,positionId,dir)=>set(s=>{
  const m=s.elements.find(e=>e.id===marimbaId);
  if(!m||m.type!=='marimba'||m.locked)return {};
  const i=m.positions.findIndex(p=>p.id===positionId);
  const j=i+dir;
  if(i<0||j<0||j>=m.positions.length)return {};
  const positions=[...m.positions];
  [positions[i],positions[j]]=[positions[j],positions[i]];
  const mm={...m,positions};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:withRepositioned(s.elements.map(e=>e.id===marimbaId?mm:e),mm),
   isDirty:true,
  };
 }),
 assign:(personElId,marimbaId,positionId)=>set(s=>{
  const pe=s.elements.find(e=>e.id===personElId);
  const m=s.elements.find(e=>e.id===marimbaId);
  if(pe?.locked||m?.locked)return {};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:applyAssign(s.elements,personElId,marimbaId,positionId),
   isDirty:true,
  };
 }),
 unassign:(personElId,at)=>set(s=>{
  const pe=s.elements.find(e=>e.id===personElId);
  if(!pe||pe.type!=='person'||pe.locked)return {};
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:s.elements.map(el=>{
    if(el.id===personElId)return {...el,marimbaId:null,marimbaPositionId:null,rotation:0,...(at?{x:at.x,y:at.y}:{})};
    if(el.type==='marimba')return {...el,positions:el.positions.map(p=>p.personId===pe.personId?{...p,personId:null}:p)};
    return el;
   }),
   isDirty:true,
  };
 }),
 dropPerson:(personElId,pointer,fallback)=>set(s=>{
  const pe=s.elements.find(e=>e.id===personElId);
  if(!pe||pe.type!=='person'||pe.locked)return {};
  if(pointer){
   const marimbas=s.elements.filter((e):e is MarimbaElement=>e.type==='marimba');
   for(let i=marimbas.length-1;i>=0;i--){
    const m=marimbas[i];
    if(!m.positions.length)continue;
    const l=worldToLocal(m,pointer.x,pointer.y);
    if(l.x<0||l.x>m.width||l.y<0||l.y>m.height)continue;
    const posId=m.positions[nearestSlot(m,l)]?.id;
    if(!posId)break;
    if(pe.marimbaId===m.id&&pe.marimbaPositionId===posId)return {};
    if(m.locked)return {};
    return {
     history:[...s.history.slice(-29),cloneEls(s.elements)],
     future:[],
     elements:applyAssign(s.elements,personElId,m.id,posId),
     isDirty:true,
    };
   }
  }
  return {
   history:[...s.history.slice(-29),cloneEls(s.elements)],
   future:[],
   elements:s.elements.map(el=>{
    if(el.id===personElId)return {...el,marimbaId:null,marimbaPositionId:null,rotation:fallback.rotation,x:fallback.x,y:fallback.y};
    if(el.type==='marimba')return {...el,positions:el.positions.map(p=>p.personId===pe.personId?{...p,personId:null}:p)};
    return el;
   }),
   isDirty:true,
  };
 }),
 marimbaDragged:(id,x,y)=>set(s=>{
  const m=s.elements.find(e=>e.id===id);
  if(!m||m.type!=='marimba'||m.locked)return {};
  const dx=x-m.x,dy=y-m.y;
  if(dx===0&&dy===0)return {};
  return {
   elements:s.elements.map(e=>{
    if(e.id===id&&e.type==='marimba')return {...e,x,y};
    if(e.type==='person'&&e.marimbaId===id)return {...e,x:e.x+dx,y:e.y+dy};
    return e;
   }),
   isDirty:true,
  };
 }),
 marimbaTransformed:(id,g)=>set(s=>{
  const mOld=s.elements.find(e=>e.id===id);
  if(!mOld||mOld.type!=='marimba'||mOld.locked)return {};
  const els=s.elements.map(e=>e.id===id&&e.type==='marimba'?{...e,...g}:e);
  const m=els.find(e=>e.id===id);
  if(!m||m.type!=='marimba')return {elements:els};
  return {elements:withRepositioned(els,m),isDirty:true};
 }),
}));

