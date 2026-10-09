import {useState} from 'react';
import {api} from '../lib/api';
import {useComposition, elementLocked} from '../store/composition';
import {useConfirm} from '../hooks/useConfirm';
import type {MarimbaElement,PersonElement} from '../types';

export const DRAG_PERSON_MIME='application/x-marimba-person';

export default function PersonPanel({projectId,onDeleted}:{projectId?:number;onDeleted?:(personId:number)=>void}){
 const elements=useComposition(s=>s.elements);
 // 7L: confirmación accesible.
 const confirmar=useConfirm();
 const selectedId=useComposition(s=>s.selectedId);
 const selectedSlot=useComposition(s=>s.selectedSlot);
 const focus=useComposition(s=>s.focus);
 const createPersonElement=useComposition(s=>s.createPersonElement);
 const removeFromComposition=useComposition(s=>s.remove);
 const removePersonFromProject=useComposition(s=>s.removePersonFromProject);
 const assign=useComposition(s=>s.assign);
 const [q,setQ]=useState('');
 const [adding,setAdding]=useState(false);
 const [nName,setNName]=useState('');
 const [nPos,setNPos]=useState('Primera');
 const [busy,setBusy]=useState(false);
 const persons=elements.filter((e):e is PersonElement=>e.type==='person');
 const marimbas=elements.filter((e):e is MarimbaElement=>e.type==='marimba');
 const slotLabel=(()=>{
  if(!selectedSlot)return null;
  const m=marimbas.find(x=>x.id===selectedSlot.marimbaId);
  if(!m)return null;
  const i=m.positions.findIndex(x=>x.id===selectedSlot.positionId);
  return i<0?null:`${m.name} · p${i}`;
 })();
 const rows=persons.map(p=>{
  const m=p.marimbaId?marimbas.find(x=>x.id===p.marimbaId&&x.type==='marimba'):undefined;
  const idx=m?m.positions.findIndex(x=>x.id===p.marimbaPositionId):-1;
  const slot=m&&idx>=0?m.positions[idx]:null;
  return {p,where:m&&slot?`${m.name} · p${idx} (${slot.type})`:null};
 });
 const norm=q.trim().toLowerCase();
 const filtered=norm?rows.filter(x=>x.p.name.toLowerCase().includes(norm)||(x.where||'').toLowerCase().includes(norm)):rows;
 const free=filtered.filter(x=>!x.where);
 const placed=filtered.filter(x=>x.where);
 const createPerson=async()=>{
  const n=nName.trim();if(!n||busy)return;
  setBusy(true);
  try{
   // GLOBAL write first: the catalog row exists before the composition shows it.
   const created=await api.createPerson(n,projectId??undefined);
   createPersonElement({personId:created.id,name:created.name,positionType:nPos.trim()||'Primera'});
   setNName('');setAdding(false);
  }catch(e:any){alert(e.message||'No se pudo crear la persona');}
  finally{setBusy(false);}
 };
 // COMPOSITION-ONLY: drops the visual representation, one undo step, NO api call, so
 // neither the catalog nor any historical assignment is touched.
 const removeFromCompositionOnly=async(x:{p:PersonElement;where:string|null})=>{
  if(elementLocked(elements,x.p.id)){
   alert('El elemento está bloqueado. Desbloquéalo para quitarlo.');
   return;
  }
  const quitarTitulo=`Quitar a ${x.p.name} de esta composicion`;
   const msg=x.where
   ?`${x.p.name} está asignada a ${x.where}.\n\n¿Quitarla de esta composición? El puesto quedará libre.\n\nLa persona seguirá en el catálogo y en el historial de las canciones.`
   :`¿Quitar a ${x.p.name} de esta composición?\n\nLa persona seguirá en el catálogo y en el historial de las canciones.`;
  if(!await confirmar.show({title:quitarTitulo,message:msg}))return;
  removeFromComposition(x.p.id);
 };
 // GLOBAL: removes the visual representation AND the SongAssignment rows of THIS
 // project only. Explicit, confirmed and deliberately NOT part of the undo history.
 const removeFromProject=async(x:{p:PersonElement;where:string|null})=>{
  if(elementLocked(elements,x.p.id)){
   alert('El elemento está bloqueado. Desbloquéalo para quitarla.');
   return;
  }
  if(projectId==null){
   alert('Abre un proyecto para poder quitar personas del proyecto.');
   return;
  }
  const msg=`${x.p.name} será retirada de ESTE proyecto.\n\n`
   +`· Se eliminará de las canciones del proyecto (asignaciones).\n`
   +`· Se quitará de las composiciones guardadas de este proyecto.\n`
   +`· La persona seguirá existiendo en el catálogo global.\n\n`
   +`Esta operación no se puede deshacer con Ctrl+Z. ¿Continuar?`;
  if(!await confirmar.show({
    title:`Quitar a ${x.p.name} de este proyecto`,
    message:msg,
    destructive:true,
   }))return;
  try{
   await api.removePersonFromProject(x.p.personId,projectId,'project');
   removePersonFromProject(x.p.id);
   onDeleted?.(x.p.personId);
  }catch(e:any){alert(e.message||'No se pudo quitar la persona del proyecto');}
 };
 const assignToSelectedSlot=(x:{p:PersonElement;where:string|null})=>{
  if(!selectedSlot){
   alert('Primero toca un puesto de la marimba en el lienzo y después pulsa «Asignar».');
   return;
  }
  if(elementLocked(elements,x.p.id)){
   alert('El elemento está bloqueado. Desbloquéalo para asignarlo.');
   return;
  }
  assign(x.p.id,selectedSlot.marimbaId,selectedSlot.positionId);
 };
 const item=(x:{p:PersonElement;where:string|null})=>{
  const locked=elementLocked(elements,x.p.id);
  return (
   <div key={x.p.id} className={`pp-item ${selectedId===x.p.id?'sel':''} ${locked?'locked':''}`}
    draggable={!locked}
    onDragStart={ev=>{
     ev.dataTransfer.setData(DRAG_PERSON_MIME,x.p.id);
     ev.dataTransfer.setData('text/plain',x.p.name);
     ev.dataTransfer.effectAllowed='move';
    }}
    title={locked?'Bloqueada: desbloquéala para arrastrarla o asignarla':`${x.p.name} — arrastra al lienzo para asignar`}>
    <button className="pp-main" onClick={()=>focus(x.p.id)}
     title={locked?'Elemento bloqueado':x.where?`Asignada a ${x.where} — clic para localizar y seleccionar`:'Sin asignar — clic para seleccionar, o arrastra al lienzo'}>
     <b>{x.p.locked?'🔒 ':''}{x.p.name}</b>
     <small>{x.where?x.where:`Libre · ${x.p.positionType}`}</small>
    </button>
    {/* 7X: botones de icono. El `title` NO basta: con contenido, el contenido gana
         al `title` en el nombre accesible. Se nombra cada accion. */}
    <button className="pp-act"
     aria-label={locked?`${x.p.name} está bloqueada`
      :slotLabel?`${x.where?'Reemplazar en':'Asignar a'} ${slotLabel}`
      :'Asignar a un puesto: selecciona primero un puesto en la marimba'}
     title={slotLabel?`${x.where?'Reemplazar en':'Asignar a'} ${slotLabel}`:'Selecciona primero un puesto en la marimba'}
     disabled={locked} onClick={()=>assignToSelectedSlot(x)}>◎</button>
    <button className="pp-del" disabled={locked}
     aria-label={locked?`${x.p.name} está bloqueada`
      :`Quitar a ${x.p.name} de esta composición`}
     title={locked?'Bloqueada: desbloquéala para quitarla':`Quitar a ${x.p.name} de esta composición`}
     onClick={()=>removeFromCompositionOnly(x)}>🗑</button>
    <button className="pp-del proj" disabled={locked}
     aria-label={locked?`${x.p.name} está bloqueada`
      :`Quitar a ${x.p.name} del proyecto y eliminar sus asignaciones en este proyecto`}
     title={locked?'Bloqueada: desbloquéala para quitarla':`Quitar a ${x.p.name} del proyecto (elimina sus asignaciones en este proyecto)`}
     onClick={()=>removeFromProject(x)}>⛔</button>
   </div>
  );
 };
 return (
  <div className="person-panel">
   <div className="pp-toolbar">
    <button className="primary" onClick={()=>setAdding(v=>!v)}>＋ Persona</button>
   </div>
   {adding&&(
    <div className="pp-form">
     <input value={nName} onChange={e=>setNName(e.target.value)} placeholder="Nombre de la persona" onKeyDown={e=>{if(e.key==='Enter')createPerson();}}/>
     <input value={nPos} onChange={e=>setNPos(e.target.value)} placeholder="Puesto habitual (ej. Primera)"/>
     <div className="pp-form-actions">
      <button className="primary" disabled={busy||!nName.trim()} onClick={createPerson}>Crear</button>
      <button onClick={()=>{setAdding(false);setNName('');}}>Cancelar</button>
     </div>
    </div>
   )}
   <input className="pp-search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar persona o destino..."/>
   <p className="hint">
    {slotLabel
     ?<>Puesto seleccionado: <strong>{slotLabel}</strong>. Pulsa <b>◎</b> en una persona para asignarla o reemplazarla.</>
     :<>Clic para seleccionar · arrastra al lienzo para asignar · con el dedo: toca un puesto y luego <b>◎</b>.</>}
   </p>
   <p className="hint">🗑 quita solo de esta composición (se deshace con Ctrl+Z) · ⛔ quita del proyecto (borra sus asignaciones y no se deshace).</p>
   {persons.length===0&&<p className="hint">Aún no hay personas en el lienzo. Usa «＋ Persona» o personas de la pieza.</p>}
   {persons.length>0&&filtered.length===0&&<p className="hint">Sin coincidencias.</p>}
   <div className="pp-group">
    <h3>Sin asignar ({free.length})</h3>
    {persons.length>0&&free.length===0&&<p className="hint">Todas asignadas.</p>}
    {free.map(item)}
   </div>
   <div className="pp-group">
    <h3>Asignadas ({placed.length})</h3>
    {persons.length>0&&placed.length===0&&<p className="hint">Ninguna asignada aún.</p>}
    {placed.map(item)}
   </div>
  </div>
 );
}