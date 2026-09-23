import {useState} from 'react';
import {api} from '../lib/api';
import {useComposition} from '../store/composition';
import type {MarimbaElement} from '../types';

export default function MarimbaPanel({onAddTemplate}:{onAddTemplate:(name:string,positions:string[])=>void}){
 const elements=useComposition(s=>s.elements);
 const selectedId=useComposition(s=>s.selectedId);
 const focus=useComposition(s=>s.focus);
 const marimbas=elements.filter((e):e is MarimbaElement=>e.type==='marimba');
 return (
  <div className="marimba-panel">
   <div className="pp-group">
    <h4>En el lienzo ({marimbas.length})</h4>
    {marimbas.length===0&&<p className="hint">Sin marimbas. Agrega una desde las plantillas de abajo.</p>}
    {marimbas.map(m=>{
     const occ=m.positions.filter(p=>p.personId!=null).length;
     return (
      <button key={m.id} className={`pp-item ${selectedId===m.id?'sel':''}`} onClick={()=>focus(m.id)}
       title="Clic para seleccionarla y centrar la vista en ella">
       <b>{m.name}{m.locked?' 🔒':''}</b>
       <small>{m.positions.length} puestos · {occ} ocupados</small>
      </button>
     );
    })}
   </div>
   <div className="pp-group">
    <h4>Plantillas</h4>
    <TemplatePicker onAdd={onAddTemplate}/>
   </div>
  </div>
 );
}

function TemplatePicker({onAdd}:{onAdd:(name:string,positions:string[])=>void}){
 const [open,setOpen]=useState(false);
 const [list,setList]=useState<{id:number;name:string;positions:string[]}[]|null>(null);
 return (
  <>
   <button className="pp-item tpl-toggle" onClick={async()=>{
    if(!list)setList(await api.templates());
    setOpen(v=>!v);
   }}>＋ Nueva marimba (plantilla) {open?'▾':'▸'}</button>
   {open&&list&&list.map(t=>(
    <button key={t.id} className="pp-item" onClick={()=>onAdd(t.name,t.positions)}>
     <b>+ {t.name}</b><small>{t.positions.length} puestos · {t.positions.join(', ')}</small>
    </button>
   ))}
  </>
 );
}