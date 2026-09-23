import {useState} from 'react';
import {useComposition} from '../store/composition';
import type {MarimbaElement,PersonElement} from '../types';
import {slotCenter,slotRect} from '../lib/layout';
import {api} from '../lib/api';
import {useConfirm} from '../hooks/useConfirm';

const DEFAULT_TYPES=['Primera','Segunda','Centro','Bajo','Tenor','Timbal','Contra','Teclado','Marimba Doble Agudo'];

export default function Inspector({detectedPositions,drawerOpen,onDrawerToggle}:{
 detectedPositions:string[];
 drawerOpen?:boolean;
 onDrawerToggle?:(v:boolean)=>void;
}){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const update=useComposition(s=>s.update);
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
 const drawer=onDrawerToggle!==undefined; const inspectorCls=drawer?(`inspector drawer ${drawerOpen?'open':'closed'}`):'inspector';

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

 if(e&&e.type==='marimba'){
  const m=e as MarimbaElement;
  const occupied=m.positions.filter(p=>p.personId!=null).length;
  const isLocked=Boolean(m.locked);
  const confirmDeleteMarimba=()=>{
   const occupied=elements.filter((x):x is PersonElement=>x.type==='person'&&x.marimbaId===m.id&&x.marimbaPositionId!=null);
   const names=occupied.map(x=>x.name);
   if(names.length>0&&!window.confirm(`Esta marimba tiene ${names.length} persona(s) asignada(s):\n${names.join('\n')}\n\n¿Eliminarla de todas formas? Se borrarán también sus puestos.`))return;
   remove(m.id);
  };

  return (
   <aside className={inspectorCls}>
    <div className="inspector-header">
     <h3>Marimba seleccionada {isLocked?'🔒':''}</h3>
     <button className={`lock-btn ${isLocked?'locked':''}`} onClick={()=>toggleLock(m.id)}>
      {isLocked?'🔒 Bloqueada (Desbloquear)':'🔓 Desbloqueada (Bloquear)'}
     </button>
    </div>

    <label className="field">Nombre
     <input value={m.name} onChange={ev=>update(m.id,{name:ev.target.value})}/>
    </label>

    <div className="row2">
     <label className="field">X
      <input type="number" disabled={isLocked} value={Math.round(m.x)} onChange={ev=>update(m.id,{x:Number(ev.target.value)||0})}/>
     </label>
     <label className="field">Y
      <input type="number" disabled={isLocked} value={Math.round(m.y)} onChange={ev=>update(m.id,{y:Number(ev.target.value)||0})}/>
     </label>
    </div>

    <div className="row2">
     <label className="field">Rotación °
      <input type="number" disabled={isLocked} value={Math.round(m.rotation)} onChange={ev=>update(m.id,{rotation:Number(ev.target.value)||0})}/>
     </label>
     <label className="field">Escala
      <input type="number" step="0.1" min="0.3" disabled={isLocked} value={Number(m.scaleX.toFixed(2))}
       onChange={ev=>{const v=Math.max(0.3,Number(ev.target.value)||1);update(m.id,{scaleX:v,scaleY:v});}}/>
     </label>
    </div>

    <h4>Posiciones ({m.positions.length}) · {occupied} ocupadas</h4>
    {datalist}

    {m.positions.map((p,i)=>(
     <div className="pos-row" key={p.id}>
      <span className="pos-idx">p{i} →</span>
      <input list={listId} disabled={isLocked} value={p.type} onChange={ev=>setPositionType(m.id,p.id,ev.target.value)}/>
      <span className="occ" title={p.personId?'Ocupado por persona':'Libre'}>{p.personId?'✓':'○'}</span>
      <button title="Subir posición" disabled={isLocked||i===0} onClick={()=>movePosition(m.id,p.id,-1)}>↑</button>
      <button title="Bajar posición" disabled={isLocked||i===m.positions.length-1} onClick={()=>movePosition(m.id,p.id,1)}>↓</button>
      {p.personId!=null&&(()=>{const who=elements.find((x):x is PersonElement=>x.type==='person'&&x.personId===p.personId);if(!who)return null;const cc=slotCenter(m,i);const rr=slotRect(m,i);return <button className="mini" title={`Quitar a ${who.name} del puesto (la persona no se elimina)`} disabled={isLocked} onClick={()=>unassign(who.id,{x:cc.x-rr.width/2,y:cc.y-rr.height/2})}>⏏</button>;})()}
      <button className="mini danger" title="Eliminar posición" disabled={isLocked} onClick={()=>{if(p.personId!=null){const who=elements.find((x):x is PersonElement=>x.type==='person'&&x.personId===p.personId);if(who&&!window.confirm(`Esta posición está ocupada por ${who.name}. ¿Quitarla y eliminar el puesto?`))return;}removePosition(m.id,p.id);}}>✕</button>
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
  const isLocked=Boolean(p.locked);
  const m=p.marimbaId?elements.find((x):x is MarimbaElement=>x.id===p.marimbaId&&x.type==='marimba'):undefined;
  const idx=m?m.positions.findIndex(x=>x.id===p.marimbaPositionId):-1;
  const pos=m&&idx>=0?m.positions[idx]:null;

  return (
   <aside className={inspectorCls}>
    <div className="inspector-header">
     <h3>Persona seleccionada {isLocked?'🔒':''}</h3>
     <button className={`lock-btn ${isLocked?'locked':''}`} onClick={()=>toggleLock(p.id)}>
      {isLocked?'🔒 Bloqueada (Desbloquear)':'🔓 Desbloqueada (Bloquear)'}
     </button>
    </div>

    <label className="field">Nombre
     <input defaultValue={p.name} key={p.id+p.name} onBlur={ev=>{
      const n=ev.target.value.trim();
      if(!n||n===p.name)return;
      renamePerson(p.id,n);
      api.renamePerson(p.personId,n).catch((e:any)=>{alert('No se pudo guardar el nombre: '+(e.message||e));ev.target.value=p.name;});
     }}/>
    </label>
    {datalist}

    <label className="field">Puesto musical
     <input list={listId} value={p.positionType} onChange={ev=>setPersonPositionType(p.id,ev.target.value)}/>
    </label>

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
     :<p className="hint">Libre en el lienzo. Arrástrala sobre una marimba para asignarle un puesto.</p>}

    {m&&pos&&<button disabled={isLocked} onClick={()=>{const r=slotRect(m,idx);unassign(p.id,{x:p.x-r.width/2,y:p.y-r.height/2});}}>Quitar del puesto</button>}
    <button className="danger" disabled={isLocked} onClick={()=>{
     if(m&&pos&&!window.confirm(`${p.name} está asignada a ${m.name} (${pos.type}). ¿Eliminar la persona del lienzo? El puesto quedará libre.`))return;
     remove(p.id);
    }}>
     {isLocked?'Desbloquea para eliminar':'Eliminar del proyecto'}
    </button>
   </aside>
  );
 }

 return (
  <aside className={inspectorCls}>
   <h3>Propiedades</h3>
   <p className="hint">Selecciona una marimba o persona en el lienzo para ver y editar sus propiedades.</p>
   <h4>Resumen</h4>
   <p className="hint">
    {elements.filter(x=>x.type==='marimba').length} marimbas · {elements.filter(x=>x.type==='person').length} personas en el lienzo
   </p>
   <button onClick={()=>addCustomMarimba()}>＋ Marimba personalizada</button>
  </aside>
 );
}