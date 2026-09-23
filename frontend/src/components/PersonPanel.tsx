import {useState} from 'react';
import {api} from '../lib/api';
import {useComposition} from '../store/composition';
import type {MarimbaElement,PersonElement} from '../types';

export default function PersonPanel({onDeleted}:{onDeleted?:(personId:number)=>void}){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const select=useComposition(s=>s.select);
 const focus=useComposition(s=>s.focus);
 const renamePerson=useComposition(s=>s.renamePerson);
 const removePersonFromProject=useComposition(s=>s.removePersonFromProject);
 const [q,setQ]=useState('');
 const [adding,setAdding]=useState(false);
 const [nName,setNName]=useState('');
 const [nPos,setNPos]=useState('Primera');
 const [busy,setBusy]=useState(false);
 const persons=elements.filter((e):e is PersonElement=>e.type==='person');
 const marimbas=elements.filter((e):e is MarimbaElement=>e.type==='marimba');
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
   const created=await api.createPerson(n);
   const el:PersonElement={id:Math.random().toString(36).slice(2)+Date.now(),type:'person',name:created.name,personId:created.id,positionType:nPos.trim()||'Primera',
    x:80+Math.random()*220,y:70+Math.random()*160,width:150,height:44,rotation:0,scaleX:1,scaleY:1,locked:false,marimbaId:null,marimbaPositionId:null};
   useComposition.setState(s=>({
    history:[...s.history.slice(-29),JSON.parse(JSON.stringify(s.elements))],
    future:[],elements:[...s.elements,el],selectedId:el.id,isDirty:true}));
   setNName('');setAdding(false);
  }catch(e:any){alert(e.message||'No se pudo crear la persona');}
  finally{setBusy(false);}
 };
 const removePerson=async(x:{p:PersonElement;where:string|null})=>{
  const msg=x.where
   ?`${x.p.name} está asignada a ${x.where}.\n\n"Eliminar persona" la quita del proyecto y de esta composición. ¿Continuar?`
   :`¿Eliminar a ${x.p.name} del proyecto? Ya no aparecerá en esta pieza.`;
  if(!window.confirm(msg))return;
  try{
   await api.deletePerson(x.p.personId);
   removePersonFromProject(x.p.id);
   onDeleted?.(x.p.personId);
  }catch(e:any){alert(e.message||'No se pudo eliminar la persona');}
 };
 const item=(x:{p:PersonElement;where:string|null})=>(
  <div key={x.p.id} className={`pp-item ${selectedId===x.p.id?'sel':''}`}>
   <button className="pp-main" onClick={()=>focus(x.p.id)}
    title={x.where?`Asignada a ${x.where} — clic para localizar y seleccionar`:'Sin asignar — clic para seleccionar'}>
    <b>{x.p.name}</b>
    <small>{x.where?x.where:`Libre · ${x.p.positionType}`}</small>
   </button>
   <button className="pp-del" title={`Eliminar a ${x.p.name} del proyecto`} onClick={()=>removePerson(x)}>🗑</button>
  </div>
 );
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
   {persons.length===0&&<p className="hint">Aún no hay personas en el lienzo. Usa «＋ Persona» o arrastra desde «Personas de la pieza».</p>}
   {persons.length>0&&filtered.length===0&&<p className="hint">Sin coincidencias.</p>}
   <div className="pp-group">
    <h4>Sin asignar ({free.length})</h4>
    {persons.length>0&&free.length===0&&<p className="hint">Todas asignadas.</p>}
    {free.map(item)}
   </div>
   <div className="pp-group">
    <h4>Asignadas ({placed.length})</h4>
    {persons.length>0&&placed.length===0&&<p className="hint">Ninguna asignada aún.</p>}
    {placed.map(item)}
   </div>
  </div>
 );
}