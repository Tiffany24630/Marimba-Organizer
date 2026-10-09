import {useState} from 'react';
import {api} from '../lib/api';

export type SlotProposal={
 slot_id:string; marimba_id:string; marimba_name:string;
 position_type:string; slot_index:number;
 occupied_by:number|null; proposed_person_id:number|null;
 proposed_name:string|null; changed:boolean;
};
export type Proposal={
 song_id:number; composition_id:number; slots:SlotProposal[];
 unassigned:{person_id:number;name:string;position_type:string}[];
 changed:number; unchanged:number; capacity:Record<string,number>;
};

/**
 * Panel unico de propuesta (Fase 7A).
 *
 * Reemplaza a "Sugerencias" y "Distribucion propuesta": ambas-now convergen en
 * calcular QUIEN ocupa los puestos de las marimbas que el usuario ya coloco.
 * Nada se persiste hasta pulsar "Aplicar": cancelar, cerrar o rechazar solo
 * descarta la propuesta en memoria.
 */
export default function ProposalPreview({songId,songName,onApplied}:{
 songId:number; songName:string; onApplied:(compositionId:number)=>void;
}){
 const [data,setData]=useState<Proposal|null>(null);
 const [busy,setBusy]=useState(false);
 const [applying,setApplying]=useState(false);
 const [error,setError]=useState('');

 const calcular=async()=>{
  setBusy(true); setError('');
  try{ setData(await api.proposeOnComposition(songId)); }
  catch(e:any){ setError(e?.message||'No se pudo calcular la propuesta.'); setData(null); }
  finally{ setBusy(false); }
 };

 // Cancelar / cerrar / rechazar: se descarta TODO. La composicion no se toco.
 const descartar=()=>{ setData(null); setError(''); };

 const aplicar=async()=>{
  if(!data)return;
  setApplying(true); setError('');
  try{
   const assignments=data.slots
    .map(f=>({slot_id:f.slot_id,person_id:f.proposed_person_id}))
    .filter(a=>a.person_id!=null);
   const comp=await api.applyAssignments(data.composition_id,{
    assignments, name:`${songName} - propuesta`});
   setData(null);
   onApplied(comp.id);
  }catch(e:any){ setError(e?.message||'No se pudo aplicar la propuesta.'); }
  finally{ setApplying(false); }
 };

 if(!data) return (
  <div className="proposal">
   <p className="hint">El motor propondrá personas para los puestos de las marimbas
    que ya tienes colocadas. No se creará ni moverá ninguna marimba.</p>
   <button className="primary" onClick={calcular} disabled={busy||!songId}>
    {busy?'Calculando…':'Proponer distribución'}
   </button>
   {error&&<p className="error">{error}</p>}
  </div>
 );

 return (
  <div className="proposal">
   <div className="proposal-summary">
    <strong>{data.changed}</strong> cambios · <strong>{data.unchanged}</strong> sin cambio
   </div>

   <table className="proposal-table">
    <thead><tr><th>Puesto</th><th>Ahora</th><th>Propuesto</th></tr></thead>
    <tbody>
     {data.slots.map(f=>(
      <tr key={f.slot_id} className={f.changed?'row-change':''}>
       <td>{f.marimba_name} · {f.position_type}</td>
       <td className="muted">{f.occupied_by!=null?'ocupado':'vacío'}</td>
       <td className={f.changed?'prop-new':''}>{f.proposed_name??'—'}</td>
      </tr>
     ))}
    </tbody>
   </table>

   {data.unassigned.length>0&&(
    <p className="hint">Sin puesto asignado: {data.unassigned.map(u=>u.name).join(', ')}</p>
   )}

   <div className="proposal-actions">
    <button className="primary" onClick={aplicar} disabled={applying||data.changed===0}>
     {applying?'Aplicando…':`Aplicar ${data.changed} cambios`}
    </button>{' '}
    <button onClick={calcular} disabled={busy}>Recalcular</button>{' '}
    <button onClick={descartar} disabled={applying}>Cancelar</button>
   </div>
   {error&&<p className="error">{error}</p>}
  </div>
 );
}
