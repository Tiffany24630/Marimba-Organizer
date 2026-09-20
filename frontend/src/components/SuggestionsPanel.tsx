import {useState} from 'react';
import {api} from '../lib/api';

type Proposal={person_id:number;name:string;position_type:string;marimba_name:string;marimba_position_index:number;reasons:string[];history:{last_position:string|null;last_marimba:string|null;last_song_name:string|null}|null};
type ChangeItem={person_id:number;name:string;position_type:string;from_marimba:string|null;to_marimba:string;is_change:boolean;reason:string;reason_code:string};
type SuggestionBody={song_name:string;position_counts:Record<string,number>;proposals:Proposal[];people_with_history:{person_id:number;name:string;last_position:string|null;last_marimba:string|null;last_song_name:string|null}[];people_without_history:{person_id:number;name:string}[];changes:ChangeItem[]};

export default function SuggestionsPanel({songId,songName,onApplied}:{songId:number;songName:string;onApplied:(comp:any)=>void}){
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [applying,setApplying]=useState(false);
 const [error,setError]=useState('');
 const [data,setData]=useState<SuggestionBody|null>(null);
 const [confirmNeeded,setConfirmNeeded]=useState(false);

 const load=async()=>{
  setLoading(true);setError('');
  try{setData(await api.songSuggestions(songId));setOpen(true);setConfirmNeeded(false);}
  catch(e:any){setError(String(e.message||e));}
  finally{setLoading(false);}
 };

 const apply=async()=>{
  if(!data)return;
  if(!confirmNeeded){setConfirmNeeded(true);return;}
  setApplying(true);setError('');
  try{
   const comp=await api.applySuggestions(songId,{proposals:data.proposals.map(p=>({person_id:p.person_id,name:p.name,position_type:p.position_type,marimba_name:p.marimba_name,marimba_position_index:p.marimba_position_index,reasons:p.reasons})),name:`${songName} - distribución`});
   onApplied(comp);setOpen(false);setConfirmNeeded(false);
  }catch(e:any){setError(String(e.message||e));}
  finally{setApplying(false);}
 };

 if(!open)return(
  <div className="sugg-collapsed">
   {error&&<p className="import-error">{error}</p>}
   <button onClick={load} disabled={loading}>{loading?'Cargando sugerencias…':'Ver sugerencias'}</button>
  </div>);

 if(!data)return(
  <section className="card sugg"><h2>Sugerencias</h2>
   {error&&<p className="import-error">{error}</p>}
   <button onClick={()=>setOpen(false)}>Cerrar</button></section>);

 const counts=Object.entries(data.position_counts||{});
 return(
  <section className="card sugg">
   <h2>Sugerencias para:<br/>{data.song_name||songName}</h2>
   {error&&<p className="import-error">{error}</p>}
   <h3>Requerimientos</h3>
   {counts.length===0
    ?<p className="hint">Esta canción aún no tiene posiciones requeridas.</p>
    :<div className="chips">{counts.map(([k,v])=><span className="chip" key={k}>{k} × {v}</span>)}</div>}
   <h3>Continuidad detectada</h3>
   {data.changes.filter(c=>!c.is_change&&c.from_marimba).length===0
    ?<p className="hint">Sin continuidad de marimba detectada.</p>
    :data.changes.filter(c=>!c.is_change&&c.from_marimba).map(c=><p key={c.person_id} className="hint ok">✓ {c.name} → {c.position_type} → {c.to_marimba}</p>)}
   {data.changes.filter(c=>c.is_change).length>0&&(<>
    <h3>Cambios de marimba</h3>
    {data.changes.filter(c=>c.is_change).map(c=><p key={c.person_id} className="hint warn">⚠ {c.reason}</p>)}
   </>)}
   <h3>Propuestas</h3>
   {data.proposals.length===0
    ?<p className="hint">No hay propuestas para esta canción.</p>
    :data.proposals.map(p=>(<div key={p.person_id} className="sugg-row">
      <strong>{p.name}</strong><small>{p.position_type} → {p.marimba_name}{p.history?.last_song_name?` · antes: ${p.history.last_song_name}`:''}</small>
      <small className="reason">{p.reasons.join(' · ')}</small>
     </div>))}
   {data.people_without_history.length>0&&(<>
    <h3>Sin historial suficiente</h3>
    {data.people_without_history.map(p=><p key={p.person_id} className="hint">- {p.name}</p>)}
   </>)}
   {!confirmNeeded
    ?<button className="primary" onClick={apply} disabled={applying||data.proposals.length===0}>Aplicar sugerencia</button>
    :(<div className="review-block warn">
      <h3>Confirmar aplicación</h3>
      <p>Se creará una nueva composición para esta canción. Revisa las asignaciones existentes antes de continuar.</p>
      <button className="primary" onClick={apply} disabled={applying}>{applying?'Aplicando…':'Confirmar y aplicar'}</button>{' '}
      <button onClick={()=>setConfirmNeeded(false)}>Cancelar</button>
     </div>)}
   <button onClick={()=>{setOpen(false);setConfirmNeeded(false);}}>Cerrar</button>
  </section>);
}
