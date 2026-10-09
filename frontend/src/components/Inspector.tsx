import {useState} from 'react';
import Numero from './Numero';
import {useComposition,elementLocked} from '../store/composition';
import type {MarimbaElement,PersonElement} from '../types';
import {slotCenter,slotRect,PERSON_W,PERSON_H,minMarimbaWidth,minMarimbaHeight} from '../lib/layout';
import {compatiblePosition,PERSON_MIN_SCALE,PERSON_MAX_SCALE} from '../store/composition';
import {api} from '../lib/api';
import {useConfirm} from '../hooks/useConfirm';
import NoteEditor from './NoteEditor';
import {isReadOnly} from '../store/composition';

const DEFAULT_TYPES=['Primera','Segunda','Centro','Bajo','Tenor','Timbal','Contra','Teclado','Marimba Doble Agudo'];
// 8A: la semantica de edicion numerica vive en `Numero.tsx` y la comparte con
// el `AccessibleEditor`. Aqui ya no hay una copia local.

export default function Inspector({detectedPositions,drawerOpen,onDrawerToggle,width}:{
 detectedPositions:string[];
 drawerOpen?:boolean;
 onDrawerToggle?:(v:boolean)=>void;
 width?:number;
}){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const selectedSlot=useComposition(s=>s.selectedSlot);
 const selectSlot=useComposition(s=>s.selectSlot);
 const assign=useComposition(s=>s.assign);
 const update=useComposition(s=>s.update);
 const resizeMarimba=useComposition(s=>s.resizeMarimba);
 // 7R: borrador de dimensiones. Se deriva durante el render (sin `useEffect`)
 // para que al cambiar de seleccion vuelva a mostrar los valores reales y no
 // un borrador de la marimba anterior.
 const [borrador,setBorrador]=useState<{id:string;w:string;h:string}|null>(null);
 const [sizeErr,setSizeErr]=useState('');
 const remove=useComposition(s=>s.remove);
 const toggleLock=useComposition(s=>s.toggleLock);
 const addPosition=useComposition(s=>s.addPosition);
 const removePosition=useComposition(s=>s.removePosition);
 const setPositionType=useComposition(s=>s.setPositionType);
 const movePosition=useComposition(s=>s.movePosition);
 const unassign=useComposition(s=>s.unassign);
 const setPersonPositionType=useComposition(s=>s.setPersonPositionType);
 const renamePerson=useComposition(s=>s.renamePerson);
 const removePersonFromProject=useComposition(s=>s.removePersonFromProject);
 const addCustomMarimba=useComposition(s=>s.addCustomMarimba);
 const [newType,setNewType]=useState('Primera');
 const drawer=onDrawerToggle!==undefined;
 const inspStyle=width?({width,maxWidth:width,minWidth:0} as React.CSSProperties):undefined;
 // 7E: en solo lectura el inspector CONSULTA, no edita. El store ya
 // bloquea cualquier mutacion; aqui se deshabilitan los controles.
 const ro=isReadOnly();
 // 7L: confirmación accesible. Se instancia AQUÍ, antes de cualquier retorno
 // temprano, porque las reglas de hooks no admiten nada condicional.
 const confirmar=useConfirm();
 const inspectorCls=drawer?(`inspector drawer ${drawerOpen?'open':'closed'}`):'inspector';

 const e=elements.find(x=>x.id===selectedId)||null;

 // Collect all existing position types dynamically across marimbas and persons
 const dynamicTypes=new Set<string>([...DEFAULT_TYPES,...detectedPositions]);
 for(const el of elements){
  if(el.type==='marimba'){
   for(const p of el.positions){
    if(p.type) dynamicTypes.add(p.type);
   }
  }else if(el.type==='person'&&el.positionType){
   dynamicTypes.add(el.positionType);
  }
 }
 const types=Array.from(dynamicTypes);
 const listId='position-types';
 const datalist=<datalist id={listId}>{types.map(t=><option key={t} value={t}/>)}</datalist>;

  if(selectedSlot&&!e){
  const sm=elements.find((x):x is MarimbaElement=>x.id===selectedSlot.marimbaId&&x.type==='marimba');
  const si=sm?sm.positions.findIndex(x=>x.id===selectedSlot.positionId):-1;
  if(sm&&si>=0){
   const slot=sm.positions[si];
   const sLocked=Boolean(sm.locked);
   const occupant=slot.personId!=null?elements.find((x):x is PersonElement=>x.type==='person'&&x.personId===slot.personId):undefined;
   const candidates=elements.filter((x):x is PersonElement=>x.type==='person'
    &&x.personId!==slot.personId&&compatiblePosition(x.positionType,slot.type));
   return (
    // 7K: hay DOS regiones `complementary` en el editor (la barra lateral y el
    // inspector). axe exige que se distinguan por nombre accesible
    // (`landmark-unique`); sin `aria-label` eran dos AnonymousRegion iguales.
    <aside className={inspectorCls} style={inspStyle} aria-label="Inspector del elemento seleccionado">
     {datalist}
     <div className="inspector-header">
      <h3>Puesto seleccionado</h3>
      <button className="drawer-close" aria-label="Cerrar inspector" title="Cerrar inspector" onClick={()=>{selectSlot(null);onDrawerToggle?.(false);}}>✕</button>
     </div>
     <p className="hint"><strong>{sm.name}</strong> · puesto físico p{si}{sLocked?' 🔒':''}</p>
     {/* 7B.1: anotaciones del PUESTO fisico. */}
     <NoteEditor readOnly={ro} elementId={sm.id} positionId={sm.positions[si].id}
      label={`${sm.name} · p${si} (${sm.positions[si].type})`}/>
     <label className="field">Tipo musical del puesto
      <input list={listId} disabled={sLocked} value={slot.type} onChange={ev=>setPositionType(sm.id,slot.id,ev.target.value)}/>
     </label>
     <h4>Ocupante</h4>
     {occupant
      ?<p className="hint"><strong>{occupant.name}</strong> · {occupant.positionType}{compatiblePosition(occupant.positionType,slot.type)?'':' (no coincide con el tipo del puesto)'}</p>
      :<p className="hint">Puesto libre.</p>}
     {occupant&&<button disabled={sLocked} onClick={()=>{const r=slotRect(sm,si);unassign(occupant.id,{x:occupant.x-r.width/2,y:occupant.y-r.height/2});}}>Liberar ocupante</button>}
     <h4>Asignar persona</h4>
     {candidates.length===0
      ?<p className="hint">Ninguna persona del lienzo tiene el puesto musical «{slot.type}». Cambia el tipo del puesto o el puesto musical de la persona.</p>
      :<label className="field">Personas compatibles ({candidates.length})
       <select disabled={sLocked} value="" onChange={ev=>{const who=candidates.find(x=>x.id===ev.target.value);if(who)assign(who.id,sm.id,slot.id);ev.target.value='';}}>
        <option value="">Elegir persona…</option>
        {candidates.map(x=><option key={x.id} value={x.id}>{x.name} ({x.positionType})</option>)}
       </select>
      </label>}
     <p className="hint">Cambiar tipo, asignar y liberar modifican solo esta composición: un paso de Ctrl+Z cada uno.</p>
     <button onClick={()=>selectSlot(null)}>Deseleccionar puesto</button>
    </aside>
   );
  }
 }

if(e&&e.type==='marimba'){
  const m=e as MarimbaElement;
  const occupied=m.positions.filter(p=>p.personId!=null).length;
  const isLocked=Boolean(m.locked);
  // 7R: valores mostrados. Si no hay borrador para ESTA marimba se muestran los
  // valores reales, de modo que un rechazo del store se refleja solo.
  const realW=String(Math.round(m.width)),realH=String(Math.round(m.height));
  const shownW=borrador&&borrador.id===m.id?borrador.w:realW;
  const shownH=borrador&&borrador.id===m.id?borrador.h:realH;
  // El minimo se pide al helper compartido, nunca se recalcula en React.
  const minWidth=minMarimbaWidth(m.positions.length);
  // 7W: el minimo vertical tambien viene del helper compartido.
  const minHeight=minMarimbaHeight();
  const aplicarTamano=()=>{
   const w=Number(shownW),h=Number(shownH);
   if(!Number.isFinite(w)||!Number.isFinite(h)){setSizeErr('Escribe números válidos para el ancho y el alto.');return;}
   if(w<minWidth){setSizeErr(`El ancho mínimo es ${minWidth} px para ${m.positions.length} puestos.`);return;}
   if(h<minHeight){setSizeErr(`El alto mínimo es ${minHeight} px: es el espacio que ocupan los puestos.`);return;}
   setSizeErr('');
   resizeMarimba(m.id,w,h);
   setBorrador(null);
  };
  const confirmDeleteMarimba=async()=>{
   const occupied=elements.filter((x):x is PersonElement=>x.type==='person'&&x.marimbaId===m.id&&x.marimbaPositionId!=null);
   const names=occupied.map(x=>x.name);
   // 7L: `window.confirm` → diálogo accesible. El aviso solo aparece cuando hay
   // personas sentadas, igual que antes; sin ellas se borra directamente.
   if(names.length>0){
    const ok=await confirmar.show({
     title:`Eliminar «${m.name}»`,
     message:`Esta marimba tiene ${names.length} persona(s) asignada(s):\n`
      +`${names.join('\n')}\n\n¿Eliminarla de todas formas? Se borrarán también sus puestos.`,
     destructive:true,
    });
    if(!ok)return;
   }
   remove(m.id);
  };

  return (
   <aside className={inspectorCls} style={inspStyle}>
    <div className="inspector-header">
     <h3>Marimba seleccionada {isLocked?'🔒':''}</h3>
     <button className="drawer-close" aria-label="Cerrar inspector" title="Cerrar inspector" onClick={()=>onDrawerToggle?.(false)}>✕</button>
     <button className={`lock-btn ${isLocked?'locked':''}`} onClick={()=>toggleLock(m.id)}>
      {isLocked?'🔒 Bloqueada (Desbloquear)':'🔓 Desbloqueada (Bloquear)'}
     </button>
    </div>
    {/* 7B.1: anotaciones de la MARIMBA. */}
    <NoteEditor readOnly={ro} elementId={m.id} label={m.name}/>

    <label className="field">Nombre
     <input value={m.name} onChange={ev=>update(m.id,{name:ev.target.value})}/>
    </label>

    <div className="row2">
     {/* 7Z: antes cada pulsacion llamaba a `update`. Ahora se confirman al
         salir del campo o con Enter, y cada edicion es UN paso. */}
     <Numero etiqueta="X" valor={Math.round(m.x)} disabled={isLocked}
      onCommit={n=>update(m.id,{x:n})}/>
     <Numero etiqueta="Y" valor={Math.round(m.y)} disabled={isLocked}
      onCommit={n=>update(m.id,{y:n})}/>
    </div>

    <div className="row2">
     <Numero etiqueta="Rotación °" valor={Math.round(m.rotation)} disabled={isLocked}
      onCommit={n=>update(m.id,{rotation:n})}/>
     <Numero etiqueta="Escala" valor={Number(m.scaleX.toFixed(2))} step="0.1" min={0.3}
      disabled={isLocked} inputMode="decimal"
      onCommit={n=>{const v=Math.max(0.3,n);update(m.id,{scaleX:v,scaleY:v});}}/>
    </div>

    {/* 7R - redimensionado. La validacion de verdad vive en el store
     * (`resizeMarimba`); aqui solo se avisa antes de llamar, para que el
     * mensaje llegue a la persona sin depender del color. */}
    <h4>Tamaño</h4>
    <div className="row2">
     <label className="field">Ancho (px)
      <input type="number" min={minWidth} step="1" inputMode="numeric"
       disabled={isLocked||ro} value={shownW}
       aria-describedby={sizeErr?'resize-err':'resize-hint'}
       onChange={ev=>{setSizeErr('');setBorrador({id:m.id,w:ev.target.value,h:shownH});}}/>
     </label>
     <label className="field">Alto (px)
      <input type="number" min={minHeight} step="1" inputMode="numeric"
       disabled={isLocked||ro} value={shownH}
       aria-describedby={sizeErr?'resize-err':'resize-hint'}
       onChange={ev=>{setSizeErr('');setBorrador({id:m.id,w:shownW,h:ev.target.value});}}/>
     </label>
    </div>
    {sizeErr
     ?<p className="hint" id="resize-err" role="alert">{sizeErr}</p>
     :<p className="hint" id="resize-hint">Ancho mínimo: {minWidth} px para {m.positions.length} puesto{m.positions.length===1?'':'s'}. Alto mínimo: {minHeight} px.</p>}
    <div className="pos-row add">
     <button className="primary" disabled={isLocked||ro}
      onClick={aplicarTamano}>Aplicar tamaño</button>
     {isLocked&&<span className="hint">Desbloquea la marimba para cambiar su tamaño.</span>}
     {ro&&!isLocked&&<span className="hint">Solo lectura: no puedes cambiar el tamaño.</span>}
    </div>

    <h4>Posiciones ({m.positions.length}) · {occupied} ocupadas</h4>
     {datalist}
    {datalist}

    {m.positions.map((p,i)=>(
     <div className="pos-row" key={p.id}>
      <span className="pos-idx">p{i} →</span>
      <input list={listId} disabled={isLocked} value={p.type} onChange={ev=>setPositionType(m.id,p.id,ev.target.value)}/>
      <span className="occ" title={p.personId?'Ocupado por persona':'Libre'}>{p.personId?'✓':'○'}</span>
      <button title="Subir posición" aria-label={`Subir la posición p${i} (${p.type})`} disabled={isLocked||i===0} onClick={()=>movePosition(m.id,p.id,-1)}>↑</button>
      <button title="Bajar posición" aria-label={`Bajar la posición p${i} (${p.type})`} disabled={isLocked||i===m.positions.length-1} onClick={()=>movePosition(m.id,p.id,1)}>↓</button>
      {p.personId!=null&&(()=>{const who=elements.find((x):x is PersonElement=>x.type==='person'&&x.personId===p.personId);if(!who)return null;const cc=slotCenter(m,i);const rr=slotRect(m,i);return <button className="mini" aria-label={`Quitar a ${who.name} del puesto p${i}`} title={`Quitar a ${who.name} del puesto (la persona no se elimina)`} disabled={isLocked} onClick={()=>unassign(who.id,{x:cc.x-rr.width/2,y:cc.y-rr.height/2})}>⏏</button>;})()}
      <button className="mini danger" aria-label={`Eliminar la posición p${i} (${p.type})`} title="Eliminar posición" disabled={isLocked} onClick={()=>{if(p.personId!=null){const who=elements.find((x):x is PersonElement=>x.type==='person'&&x.personId===p.personId);if(who&&!window.confirm(`Esta posición está ocupada por ${who.name}. ¿Quitarla y eliminar el puesto?`))return;}removePosition(m.id,p.id);}}>✕</button>
     </div>
    ))}

    <div className="pos-row add">
     <input list={listId} disabled={isLocked} value={newType} onChange={ev=>setNewType(ev.target.value)} placeholder="Tipo de puesto nuevo..."
      onKeyDown={ev=>{if(ev.key==='Enter'&&!isLocked){addPosition(m.id,newType);setNewType('Primera');}}}/>
     <button className="primary" disabled={isLocked} onClick={()=>{addPosition(m.id,newType);setNewType('Primera');}}>＋ Agregar posición</button>
    </div>

    <button className="danger" disabled={isLocked} onClick={confirmDeleteMarimba}>
      {isLocked?'Desbloquea para eliminar':'Eliminar marimba'}
    </button>
   </aside>
  );
 }

 if(e&&e.type==='person'){
  const p=e as PersonElement;
  const isLocked=elementLocked(elements,p.id);
  const m=p.marimbaId?elements.find((x):x is MarimbaElement=>x.id===p.marimbaId&&x.type==='marimba'):undefined;
  const idx=m?m.positions.findIndex(x=>x.id===p.marimbaPositionId):-1;
  const pos=m&&idx>=0?m.positions[idx]:null;
 const free=!m||idx<0;

  return (
   <aside className={inspectorCls} style={inspStyle}>
    <div className="inspector-header">
     <h3>Persona seleccionada {isLocked?'🔒':''}</h3>
     <button className="drawer-close" aria-label="Cerrar inspector" title="Cerrar inspector" onClick={()=>onDrawerToggle?.(false)}>✕</button>
     <button className={`lock-btn ${isLocked?'locked':''}`} onClick={()=>toggleLock(p.id)}>
      {isLocked?'🔒 Bloqueada (Desbloquear)':'🔓 Desbloqueada (Bloquear)'}
     </button>
    </div>
    {/* 7B.1: anotaciones de la PERSONA. */}
    <NoteEditor readOnly={ro} elementId={p.id} label={p.name}/>

    <label className="field">Nombre
     <input defaultValue={p.name} key={p.id+p.name} disabled={isLocked} onBlur={async ev=>{
      const n=ev.target.value.trim();
      if(!n||n===p.name){
       ev.target.value=p.name;
       return;
      }
      try{
       await api.renamePerson(p.personId,n);
       if(!renamePerson(p.id,n)){
       alert('El nombre se guardó en el catálogo, pero el elemento está bloqueado: el lienzo no se actualizó.');
       ev.target.value=p.name;
      }
      }catch(e:any){
       alert('No se pudo guardar el nombre: '+(e.message||e));
       ev.target.value=p.name;
      }
     }}/>
    </label>
    {datalist}

    <label className="field">Puesto musical
     <input list={listId} disabled={isLocked} value={p.positionType} onChange={ev=>setPersonPositionType(p.id,ev.target.value)}/>
    </label>

    <button onClick={()=>update(p.id,{width:PERSON_W,height:PERSON_H,scaleX:1,scaleY:1})}
     disabled={isLocked||!free} title="Devuelve el tamaño y la proporcion originales">
     Restaurar tamaño original
    </button>
    <p className="hint">La escala se limita entre {PERSON_MIN_SCALE}× y {PERSON_MAX_SCALE}× para que el texto nunca se deforme.</p>
    <div className="row2">
     <label className="field">X
      <input type="number" disabled={isLocked} value={Math.round(p.x)} onChange={ev=>update(p.id,{x:Number(ev.target.value)||0})}/>
     </label>
     <label className="field">Y
      <input type="number" disabled={isLocked} value={Math.round(p.y)} onChange={ev=>update(p.id,{y:Number(ev.target.value)||0})}/>
     </label>
    </div>

    <h4>Asignación</h4>
    {m&&pos
     ?<p className="hint">En <strong>{m.name}</strong> · posición física p{idx} ({pos.type})</p>
     :<p className="hint">Libre en el lienzo. Selecciona un puesto para asignarle.</p>}

    {m&&pos&&pos.type!==p.positionType&&(
     <button disabled={isLocked||Boolean(m.locked)} onClick={()=>setPositionType(m.id,pos.id,p.positionType)} style={{marginBottom:'8px'}}>
      Sincronizar puesto ({pos.type} → {p.positionType})
     </button>
    )}

    {m&&pos&&<button disabled={isLocked} onClick={()=>{const r=slotRect(m,idx);unassign(p.id,{x:p.x-r.width/2,y:p.y-r.height/2});}}>Quitar del puesto</button>}
    <p className="hint">Asignar, liberar y cambiar el puesto modifican solo esta composición: un paso de Ctrl+Z cada uno.</p>
    <button className="danger" disabled={isLocked} onClick={()=>{
     if(m&&pos&&!window.confirm(`${p.name} está asignada a ${m.name} (${pos.type}). ¿Eliminar la persona del lienzo? El puesto quedará libre.`))return;
     remove(p.id);
    }}>
     {isLocked?'Desbloquea para eliminar':'Eliminar del lienzo'}
    </button>
   </aside>
  );
 }

 return (
  <aside className={inspectorCls} style={inspStyle}>
   <div className="inspector-header">
    <h3>Propiedades</h3>
    <button className="drawer-close" aria-label="Cerrar inspector" title="Cerrar inspector" onClick={()=>onDrawerToggle?.(false)}>✕</button>
   </div>
   <p className="hint">Selecciona una marimba o persona en el lienzo para ver y editar sus propiedades.</p>
   <h4>Resumen</h4>
   <p className="hint">
    {elements.filter(x=>x.type==='marimba').length} marimbas · {elements.filter(x=>x.type==='person').length} personas en el lienzo
   </p>
   <button onClick={()=>addCustomMarimba()}>＋ Marimba personalizada</button>
  </aside>
 );
}