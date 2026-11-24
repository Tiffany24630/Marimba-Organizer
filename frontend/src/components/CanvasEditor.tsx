import {Stage,Layer,Rect,Text,Group,Transformer,Circle} from 'react-konva';
import {useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import type Konva from 'konva';
import {useComposition,elementLocked} from '../store/composition';
import type {MarimbaElement,PersonElement} from '../types';
import {elementBBox,hitTestSlot,seatScale,syncViewport,slotRect} from '../lib/layout';
import {useConfirm} from '../hooks/useConfirm';
import {chipText,commentLines,hasNote} from '../lib/notes';

/**
 * Fase 7B.1 - insignia de anotaciones.
 *
 * `label` (etiqueta breve) se dibuja como chip junto al nombre; `comment` se
 * recorta a las lineas que caben y NO tapa los puestos: va en una franja
 * reservada por debajo del nombre. El texto completo se consulta con el
 * atributo `title` (raton en computadora) o al tocar el chip.
 */
function NoteBadge({label,comment,x,y,width,align}:{
 label?:string;comment?:string;x:number;y:number;width:number;align:'left'|'center';
}){
 if(!hasNote({label,comment}))return null;
 const chip=label?chipText(label):null;
 return (
  <Group x={x} y={y} listening={false}>
   {chip&&(
    <Group x={align==='center'?x+width/2:x}>
     <Rect x={align==='center'?-chipText(chip).length*3.2-4:0} y={0}
      width={chipText(chip).length*6.4+8} height={15} cornerRadius={7}
      fill="#0ea5e9" opacity={0.95}/>
     <Text text={chip} x={align==='center'?-chipText(chip).length*3.2:4} y={2}
      fontSize={10} fill="#ffffff" fontStyle="bold"/>
    </Group>
   )}
   {comment&&(
    <Text text={comment} x={0} y={chip?17:0} width={width}
     fontSize={9} fill="#93c5fd" opacity={0.95}
     height={commentLines(40)*11} ellipsis={true} wrap="word"/>
   )}
  </Group>
 );
}

function MarimbaNode({m,selected,spacePressed}:{m:MarimbaElement;selected:boolean;spacePressed:boolean}){
 const marimbaDragged=useComposition(s=>s.marimbaDragged);
 const marimbaTransformed=useComposition(s=>s.marimbaTransformed);
 const recordHistory=useComposition(s=>s.recordHistory);
 const endGesture=useComposition(s=>s.endGesture);
 const select=useComposition(s=>s.select);
 const selectedSlot=useComposition(s=>s.selectedSlot);
 const selectSlot=useComposition(s=>s.selectSlot);

 return (
  <Group id={m.id} x={m.x} y={m.y} rotation={m.rotation} scaleX={m.scaleX} scaleY={m.scaleY}
   draggable={!m.locked&&!spacePressed}
   onClick={ev=>{ev.cancelBubble=true;select(m.id);}}
   onTap={ev=>{ev.cancelBubble=true;select(m.id);}}
   onDragStart={()=>recordHistory()}
   onDragMove={ev=>marimbaDragged(m.id,ev.target.x(),ev.target.y())}
   onDragEnd={ev=>{marimbaDragged(m.id,ev.target.x(),ev.target.y());endGesture();}}
   onTransformStart={()=>recordHistory()}
   onTransformEnd={ev=>{const n=ev.target;marimbaTransformed(m.id,{x:n.x(),y:n.y(),rotation:n.rotation(),scaleX:n.scaleX(),scaleY:n.scaleY()});endGesture();}}>
   <Rect width={m.width} height={m.height} fill="#1f2937"
    stroke={selected?'#22c55e':'#0f172a'} strokeWidth={selected?3:1}
    shadowColor={selected?'#22c55e':'transparent'} shadowBlur={selected?8:0} cornerRadius={12}/>
   <Text text={m.name} x={8} y={10} width={m.width-16} align="center" fontSize={17} fontStyle="bold" fill="#ffffff"/>
   {m.locked&&<Text text="🔒" x={m.width-28} y={8} fontSize={14} fill="#f59e0b"/>}
   <Text text={`${m.positions.length} puesto${m.positions.length===1?'':'s'}${m.locked?' · Bloqueada':''}`} x={8} y={33} width={m.width-16} align="center" fontSize={10} fill="#9ca3af"/>
    {/* 7B.1: anotacion de la MARIMBA, en su propia franja bajo el contador, para
        no tapar los puestos. */}
    <NoteBadge label={m.note?.label} comment={m.note?.comment}
     x={8} y={46} width={m.width-16} align="center"/>
   {m.positions.map((p,i)=>{const r=slotRect(m,i);const isSel=selectedSlot?.marimbaId===m.id&&selectedSlot?.positionId===p.id;return (
    <Group key={p.id}>
     <Rect x={r.x} y={r.y} width={r.width} height={r.height}
      fill={isSel?'#1d4ed8':p.personId?'#14532d':'#374151'} stroke={isSel?'#93c5fd':p.personId?'#22c55e':'#4b5563'} strokeWidth={isSel?3:1} cornerRadius={6}
      onClick={ev=>{ev.cancelBubble=true;selectSlot({marimbaId:m.id,positionId:p.id});}}
      onTap={ev=>{ev.cancelBubble=true;selectSlot({marimbaId:m.id,positionId:p.id});}}/>
     <Text text={p.type} x={r.x} y={r.y+5} width={r.width} align="center" fontSize={11} fill="#d1d5db" listening={false}/>
     <Text text={String(i)} x={r.x+3} y={r.y+r.height-13} fontSize={9} fill="#9ca3af" listening={false}/>
      {/* 7B.1: anotacion del PUESTO. Solo un punto indicador: un texto largo
          dentro del puesto taparia al vecino. Se edita y consulta en el Inspector. */}
      {hasNote(p.note)&&<Circle x={r.x+r.width-7} y={r.y+6} radius={3.5} fill="#0ea5e9" listening={false}/>}
    </Group>);})}
  </Group>
 );
}

function PersonNode({e,selected,spacePressed}:{e:PersonElement;selected:boolean;spacePressed:boolean}){
 const elements=useComposition(s=>s.elements);
 const select=useComposition(s=>s.select);
 const update=useComposition(s=>s.update);
 const dropPerson=useComposition(s=>s.dropPerson);
 const assign=useComposition(s=>s.assign);
 const endGesture=useComposition(s=>s.endGesture);
 const confirm=useConfirm();

 const m=e.marimbaId?elements.find((x):x is MarimbaElement=>x.id===e.marimbaId&&x.type==='marimba'):undefined;
 const idx=m?m.positions.findIndex(p=>p.id===e.marimbaPositionId):-1;
 const assigned=!!m&&idx>=0;
 const r=assigned&&m?slotRect(m,idx):null;
 // UX-4: al redimensionar la marimba sus personas se redimensionan con ella.
 // `slotRect` devuelve el puesto SIN escala (Konva escala con scaleX/scaleY y no
 // toca `width`), asi que antes la persona se quedaba en su tamano original
 // mientras su puesto crecia en pantalla. `seatScale` aplica el mismo factor,
 // acotado para que el texto siga siendo legible.
 const k=assigned&&m?seatScale(m,idx):1;
 const pw=(assigned&&r?r.width-6:e.width)*k;
 const ph=(assigned&&r?r.height-6:e.height)*k;
 const rotation=assigned&&m?m.rotation:e.rotation;
 const fontSize=pw<120?11:14;
 // A person sitting on a locked marimba is locked too: the drag handle must not lie.
 const locked=elementLocked(elements,e.id);

 return (
  <Group id={e.id} x={e.x} y={e.y} rotation={rotation} scaleX={assigned?1:e.scaleX} scaleY={assigned?1:e.scaleY}
   offsetX={assigned?pw/2:0} offsetY={assigned?ph/2:0}
   draggable={!locked&&!spacePressed}
   onClick={ev=>{ev.cancelBubble=true;select(e.id);}}
   onTap={ev=>{ev.cancelBubble=true;select(e.id);}}
   onDragStart={()=>{/* the store is mutated only on drag end, so no pre-snapshot is needed */}}
   onDragEnd={ev=>{
     const node=ev.target;
     const stage=node.getStage();
     let pointer: {x:number;y:number}|null=null;
     if(stage){
      const transform=stage.getAbsoluteTransform().copy().invert();
      const raw=stage.getPointerPosition();
      if(raw) pointer=transform.point(raw);
     }
     const fallback=assigned&&r?{x:node.x()-pw/2,y:node.y()-ph/2,rotation:0}:{x:node.x(),y:node.y(),rotation:node.rotation()};
     const snapBack=()=>{endGesture();
      if(assigned){node.x(e.x);node.y(e.y);node.rotation(m?m.rotation:0);}
      else{node.x(e.x);node.y(e.y);node.rotation(e.rotation);}
      node.getLayer()?.batchDraw();
     };
     const target=pointer?hitTestSlot(elements,pointer):null;
     if(!target){dropPerson(e.id,null,fallback);return;}
     const tm=target.marimba;
     const tslot=tm.positions[target.index];
     if(tm.locked){snapBack();return;}
     if(tm.id===e.marimbaId&&tslot.id===e.marimbaPositionId){snapBack();return;}
     const selfOccupies=tslot.personId===e.personId;
     const occupant=selfOccupies?null:(tslot.personId!=null?elements.find((x):x is PersonElement=>x.type==='person'&&x.personId===tslot.personId):null);
     const dest=`${tm.name} · p${target.index} (${tslot.type})`;
     void (async()=>{
      if(occupant){
       const ok=await confirm.show({title:'Puesto ocupado',
        message:`${dest} está ocupado por ${occupant.name}. ¿Reemplazarlo? ${occupant.name} quedará sin asignar (no se elimina).`,
        okLabel:'Reemplazar'});
       if(!ok){snapBack();return;}
      }else if(!selfOccupies&&e.marimbaId){
       const om=elements.find((x):x is MarimbaElement=>x.id===e.marimbaId&&x.type==='marimba');
       const oi=om?om.positions.findIndex(pp=>pp.id===e.marimbaPositionId):-1;
       const from=om&&oi>=0?`${om.name} · p${oi} (${om.positions[oi].type})`:'otro puesto';
       const ok=await confirm.show({title:'Mover persona',
        message:`${e.name} ya está asignada a ${from}. ¿Moverla a ${dest}?`,
        okLabel:'Mover'});
       if(!ok){snapBack();return;}
      }
      assign(e.id,tm.id,tslot.id);
     })();
    }}
    onTransformStart={()=>{}}
   onTransformEnd={ev=>{const n=ev.target;update(e.id,{x:n.x(),y:n.y(),rotation:n.rotation(),scaleX:n.scaleX(),scaleY:n.scaleY()});}}>
   <Rect width={pw} height={ph} fill="#ffffff"
    stroke={selected?'#22c55e':'#111827'} strokeWidth={selected?3:1}
    shadowColor={selected?'#22c55e':'transparent'} shadowBlur={selected?8:0} cornerRadius={8}/>
   {e.locked&&<Text text="🔒" x={pw-18} y={4} fontSize={10} fill="#f59e0b"/>}
   <Text text={e.name} y={ph>40?7:3} width={pw} align="center" fontSize={fontSize} fontStyle="bold" fill="#111827"/>
   <Text text={e.positionType} y={ph>40?26:20} width={pw} align="center" fontSize={10} fill="#4b5563"/>
  </Group>
 );
}

export default function CanvasEditor(){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const select=useComposition(s=>s.select);
 const selectSlot=useComposition(s=>s.selectSlot);
 const remove=useComposition(s=>s.remove);
 const undo=useComposition(s=>s.undo);
 const redo=useComposition(s=>s.redo);

 const trRef=useRef<Konva.Transformer>(null);
 const layerRef=useRef<Konva.Layer>(null);
 const stageRef=useRef<Konva.Stage>(null);
 const wrapRef=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState({w:900,h:620});
 const [zoom,setZoom]=useState(1);
 const [stagePos,setStagePos]=useState({x:0,y:0});
 const [spacePressed,setSpacePressed]=useState(false);
 const [cursor,setCursor]=useState<'default'|'grab'|'grabbing'>('default');
 const panStart=useRef<{sx:number;sy:number;px:number;py:number}|null>(null);
 const pinch=useRef<{zoom:number;stx:number;sty:number;dist:number;cx:number;cy:number}|null>(null);
 const touchMode=useRef<'idle'|'pan'|'pinch'|'element'>('idle');
 useEffect(()=>{const el=wrapRef.current;if(el)el.style.cursor=cursor;},[cursor]);

 useLayoutEffect(()=>{
  const el=wrapRef.current;
  if(!el)return;
  const apply=()=>{const w=el.clientWidth-24,h=el.clientHeight-58;if(w>240)setSize({w,h:Math.max(320,h)});};
  apply();
  const ro=new ResizeObserver(apply);
  ro.observe(el);
  return()=>ro.disconnect();
 },[]);

 const selEl=elements.find(e=>e.id===selectedId);
 // A person on a locked marimba counts as locked everywhere (transformer, delete key).
 const isLocked=selectedId?elementLocked(elements,selectedId):false;
 // Publish the live stage transform so DOM drag & drop (side panel -> canvas) can map
 // client coordinates into composition world coordinates.
 useEffect(()=>{syncViewport(zoom,stagePos.x,stagePos.y);},[zoom,stagePos]);
 const focusId=useComposition(s=>s.focusId);
 const clearFocus=useComposition(s=>s.clearFocus);

 useEffect(()=>{
  if(!focusId)return;
  const el=elements.find(x=>x.id===focusId);
  clearFocus();
  if(!el)return;
  const st=stageRef.current;if(!st)return;
  const m=el.type==='person'&&el.marimbaId?elements.find((x):x is MarimbaElement=>x.id===el.marimbaId&&x.type==='marimba'):undefined;
  const b=elementBBox(el,m);
  setStagePos({x:size.w/2-(b.x+b.width/2)*zoom,y:size.h/2-(b.y+b.height/2)*zoom});
 },[focusId]);

 const handleFit=()=>{
  const st=stageRef.current;if(!st||!elements.length)return;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const marimbas=elements.filter((x):x is MarimbaElement=>x.type==='marimba');
  for(const e of elements){
   const m=e.type==='person'&&e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
   const b=elementBBox(e,m);
   minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
   maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
  }
  const pad=60;
  const w=maxX-minX+pad*2,h=maxY-minY+pad*2;
  const z=clampZoom(Math.min(size.w/w,size.h/h));
  setZoom(z);
  setStagePos({x:size.w/2-(minX+maxX)/2*z,y:size.h/2-(minY+maxY)/2*z});
 };

 useEffect(()=>{
  const tr=trRef.current;
  if(!tr)return;
  const node=selectedId?layerRef.current?.findOne<Konva.Group>('#'+selectedId):null;
  const attach=!!(node&&selEl&&!(selEl.type==='person'&&selEl.marimbaId));
  tr.nodes(attach?[node]:[]);
  tr.getLayer()?.batchDraw();
 },[selectedId,elements,selEl]);

 useEffect(()=>{
  const onKey=(ev:KeyboardEvent)=>{
   const tag=(ev.target as HTMLElement|null)?.tagName;
   const target=ev.target as HTMLElement|null;
   const isTextTarget=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||!!target?.isContentEditable;
   if(isTextTarget)return;

   // Space is an explicit viewport gesture. Native editing controls are
   // excluded above so their normal keyboard behavior remains intact.
   if(ev.code==='Space'){
    ev.preventDefault();
    setSpacePressed(true);
    return;
   }

   // Undo / Redo shortcuts
   if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z'){
    ev.preventDefault();
    if(ev.shiftKey) redo(); else undo();
    return;
   }
   if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='y'){
    ev.preventDefault();
    redo();
    return;
   }

   if((ev.key==='Delete'||ev.key==='Backspace')&&selectedId){
    if(!isLocked) remove(selectedId);
   }
   if(ev.key==='Escape'){setSpacePressed(false);select(null);selectSlot(null);}
  };
  const onKeyUp=(ev:KeyboardEvent)=>{if(ev.code==='Space')setSpacePressed(false);};
  const onBlur=()=>setSpacePressed(false);
  window.addEventListener('keydown',onKey);
  window.addEventListener('keyup',onKeyUp);
  window.addEventListener('blur',onBlur);
  return()=>{
   window.removeEventListener('keydown',onKey);
   window.removeEventListener('keyup',onKeyUp);
   window.removeEventListener('blur',onBlur);
  };
 },[selectedId,isLocked,remove,select,undo,redo]);

 const handleZoomIn=()=>setZoom(z=>Math.min(3,+(z*1.2).toFixed(2)));
 const handleZoomOut=()=>setZoom(z=>Math.max(0.3,+(z/1.2).toFixed(2)));
 const handleResetZoom=()=>{setZoom(1);setStagePos({x:0,y:0});};

 const handleCenter=useCallback(()=>{
  if(!elements.length){
   setZoom(1);setStagePos({x:0,y:0});
   return;
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const marimbas=elements.filter((x):x is MarimbaElement=>x.type==='marimba');
  for(const e of elements){
   const m=e.type==='person'&&e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
   const b=elementBBox(e,m);
   minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
   maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
  }
  const cx=(minX+maxX)/2;
  const cy=(minY+maxY)/2;
  setStagePos({
   x:Math.round(size.w/2 - cx*zoom),
   y:Math.round(size.h/2 - cy*zoom),
  });
 },[elements,size,zoom]);

 const clampZoom=(z:number)=>Math.max(0.3,Math.min(3,z));
 const toStageXY=(t:any,rect:DOMRect)=>{return {x:t.clientX-rect.left,y:t.clientY-rect.top};};
 const startPan=(px:number,py:number)=>{
  const st=stageRef.current;if(!st)return;
  panStart.current={sx:st.x(),sy:st.y(),px,py};
  setCursor('grabbing');
 };
 const doPan=(px:number,py:number)=>{
  if(!panStart.current)return;
  const st=stageRef.current;if(!st)return;
    const ps=panStart.current;
  st.x(ps.sx+(px-ps.px));st.y(ps.sy+(py-ps.py));
  layerRef.current?.batchDraw();
 };
 const endPan=()=>{
  if(!panStart.current){setCursor('grab');return;}
  panStart.current=null;
  const st=stageRef.current;if(st){setStagePos({x:st.x(),y:st.y()});}
  setCursor('default');
 };
 const onStageWheel=(e:any)=>{
  e.evt.preventDefault();
  const st=stageRef.current;if(!st)return;
  const p=st.getPointerPosition();if(!p)return;
  const oldZ=st.scaleX();
  const delta=e.evt.deltaY<0?1.12:1/1.12;
  const newZ=clampZoom(oldZ*delta);
  const wx=(p.x-st.x())/oldZ,wy=(p.y-st.y())/oldZ;
  setZoom(newZ);
  setStagePos({x:p.x-wx*newZ,y:p.y-wy*newZ});
 };
 const onStageMouseDown=(e:any)=>{
  const st=e.target.getStage();if(!st)return;
  if(spacePressed){
   e.evt.preventDefault();
   const p=st.getPointerPosition();if(p)startPan(p.x,p.y);
   return;
  }
  if(e.target!==st)return;
  select(null);
  const p=st.getPointerPosition();if(!p)return;
  startPan(p.x,p.y);
 };
 const onStageMouseMove=(e:any)=>{
  if(!panStart.current)return;
  const st=e.target.getStage();if(!st)return;
  const p=st.getPointerPosition();if(!p)return;
  doPan(p.x,p.y);
 };
 const onStageMouseUp=()=>{ endPan(); };
 const onStageMouseLeave=()=>{ if(panStart.current)endPan(); else setCursor('default'); };
 const onStageMouseEnter=(e:any)=>{ const st=e.target.getStage();if(st&&!panStart.current)setCursor('grab'); };
 const onStageTouchStart=(e:any)=>{
  const st=e.target.getStage();if(!st)return;
  const t=e.evt.touches;
  if(t.length>=2){
   // A second finger cancels the one-finger viewport gesture. The Stage
   // transform is visual state only, so this does not create a composition
   // mutation or history entry.
   panStart.current=null;
   touchMode.current='pinch';
   select(null);
   const rect=st.container().getBoundingClientRect();
   const a=toStageXY(t[0],rect),b=toStageXY(t[1],rect);
   const dist=Math.hypot(b.x-a.x,b.y-a.y);
   if(dist>10){
    pinch.current={zoom:st.scaleX(),stx:st.x(),sty:st.y(),dist,cx:(a.x+b.x)/2,cy:(a.y+b.y)/2};
   }
   e.evt.preventDefault();
   setCursor('grabbing');
   return;
  }
  if(t.length===1&&e.target===st){
   select(null);
   const p=st.getPointerPosition();if(p)startPan(p.x,p.y);
   touchMode.current='pan';
  }else if(t.length===1){
   touchMode.current='element';
  }
 };
 const onStageTouchMove=(e:any)=>{
  const st=e.target.getStage();if(!st)return;
  const t=e.evt.touches;
  if(t.length>=2&&touchMode.current!=='pinch'){
   onStageTouchStart(e);
   return;
  }
  if(t.length===1&&touchMode.current==='pan'&&panStart.current){
   const p=st.getPointerPosition();if(p)doPan(p.x,p.y);
   return;
  }
  if(t.length===2&&pinch.current){
   e.evt.preventDefault();
   const rect=st.container().getBoundingClientRect();
   const a=toStageXY(t[0],rect),b=toStageXY(t[1],rect);
   const dist=Math.hypot(b.x-a.x,b.y-a.y);
   if(dist<10)return;
   const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
   const pc=pinch.current;
   const newZ=clampZoom(pc.zoom*dist/pc.dist);
   const wx=(cx-pc.stx)/pc.zoom,wy=(cy-pc.sty)/pc.zoom;
   st.x(cx-newZ*wx);st.y(cy-newZ*wy);st.scale({x:newZ,y:newZ});
   layerRef.current?.batchDraw();
  }
 };
 const onStageTouchEnd=(e:any)=>{
  const st=e.target.getStage();if(!st)return;
  const t=e.evt.touches;
  if(pinch.current){
   // Keep the gesture in viewport mode while one finger remains after a
   // pinch. Only the final end commits the live Stage transform to React
   // state, avoiding a one-finger pan or element drag in the transition.
   if(t.length>0)return;
   setZoom(clampZoom(st.scaleX()));
   setStagePos({x:st.x(),y:st.y()});
   pinch.current=null;
   panStart.current=null;
   touchMode.current='idle';
   setCursor('grab');
   return;
  }
  if(t.length===0&&panStart.current){
   endPan();
   touchMode.current='idle';
   return;
  }
  if(t.length===0)touchMode.current='idle';
 };
 const onStageTouchCancel=(e:any)=>{
  const st=e.target.getStage();
  if(st){
   // A cancelled viewport gesture may have moved the live Konva Stage. Keep
   // that visual viewport in React state, but never write element data/history.
   if(pinch.current)setZoom(clampZoom(st.scaleX()));
   if(pinch.current||panStart.current)setStagePos({x:st.x(),y:st.y()});
  }
  panStart.current=null;
  pinch.current=null;
  touchMode.current='idle';
  setCursor('default');
 };

 const exportPNG=()=>{
  const st=stageRef.current,ly=layerRef.current,tr=trRef.current;
  if(!st||!ly||!elements.length)return;

  // Temporarily hide transformer
  const activeNodes=tr?tr.nodes():[];
  if(tr) tr.nodes([]);

  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const marimbas=elements.filter((x):x is MarimbaElement=>x.type==='marimba');
  for(const e of elements){
   const m=e.type==='person'&&e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
   const b=elementBBox(e,m);
   minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
   maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
  }
  const pad=48;
  const w=Math.ceil(maxX-minX+pad*2),h=Math.ceil(maxY-minY+pad*2);
  const oldW=st.width(),oldH=st.height();
  const oldScale={x:st.scaleX(),y:st.scaleY()};
  const oldPos={x:st.x(),y:st.y()};
  const oldLx=ly.x(),oldLy=ly.y();

  st.width(w);
  st.height(h);
  st.scale({x:1,y:1});
  st.position({x:0,y:0});
  ly.position({x:pad-minX,y:pad-minY});
  ly.batchDraw();

  const url=st.toDataURL({pixelRatio:2});

  // Restore previous stage geometry
  st.width(oldW);
  st.height(oldH);
  st.scale(oldScale);
  st.position(oldPos);
  ly.position({x:oldLx,y:oldLy});
  if(tr&&activeNodes.length) tr.nodes(activeNodes);
  ly.batchDraw();

  const a=document.createElement('a');
  a.href=url;
  a.download='distribucion-marimba.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
 };

 return (
  <div className="canvas-wrap" ref={wrapRef}>
   <div className="canvas-top-bar">
    <div className="zoom-controls">
     <button onClick={handleZoomOut} title="Alejar (Zoom -)" aria-label="Alejar (zoom out)">－</button>
     <span className="zoom-label">{Math.round(zoom*100)}%</span>
     <button onClick={handleZoomIn} title="Acercar (Zoom +)" aria-label="Acercar (zoom in)">＋</button>
     <button onClick={handleResetZoom} title="Restablecer zoom a 100%" aria-label="Restablecer el zoom al 100%">↺ 100%</button>
     <button onClick={handleFit} title="Ajustar a pantalla (ver toda la composición)" aria-label="Ajustar a pantalla para ver toda la composición">⛶ Ajustar</button>
     <button onClick={handleCenter} title="Centrar composición" aria-label="Centrar la composición">⛶ Centrar</button>
    </div>
    <button className="export" onClick={exportPNG} disabled={!elements.length}>Exportar PNG</button>
   </div>

   <Stage ref={stageRef} width={size.w} height={size.h}
  scaleX={zoom} scaleY={zoom} x={stagePos.x} y={stagePos.y}
  onMouseEnter={onStageMouseEnter}
  onMouseLeave={onStageMouseLeave}
  onMouseDown={onStageMouseDown}
  onMouseMove={onStageMouseMove}
  onMouseUp={onStageMouseUp}
  onWheel={onStageWheel}
  onTouchStart={onStageTouchStart}
  onTouchMove={onStageTouchMove}
  onTouchEnd={onStageTouchEnd}
  onTouchCancel={onStageTouchCancel}>
    <Layer ref={layerRef}>
     {elements.filter(e=>e.type==='marimba').map(e=>(
      <MarimbaNode key={e.id} m={e as MarimbaElement} selected={selectedId===e.id} spacePressed={spacePressed}/>))}
     {elements.filter(e=>e.type==='person').map(e=>(
      <PersonNode key={e.id} e={e as PersonElement} selected={selectedId===e.id} spacePressed={spacePressed}/>))}
     <Transformer ref={trRef}
      rotateEnabled={!isLocked}
      keepRatio={false}
      rotateSnaps={[0,45,90,135,180,225,270,315]}
      enabledAnchors={isLocked?[]:['top-left','top-right','bottom-left','bottom-right']}
      anchorSize={9} anchorFill="#ffffff" anchorStroke="#15803d" borderStroke={isLocked?'#f59e0b':'#22c55e'}
      boundBoxFunc={(oldBox,newBox)=>newBox.width<40||newBox.height<40?oldBox:newBox}/>
    </Layer>
   </Stage>

   <div className="canvas-help">
    Arrastra personas sobre los puestos de una marimba para asignarlas; arrástralas fuera para liberarlas. También puedes arrastrar desde el panel de Personas, o tocar un puesto y usar ◎. Selecciona y usa Supr para eliminar. Esc deselecciona.
   </div>
   {selectedId&&!isLocked&&<button className="danger floating" onClick={()=>remove(selectedId)}>Eliminar seleccionado</button>}
  </div>
 );
}
