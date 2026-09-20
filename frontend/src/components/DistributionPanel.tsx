import {useState} from 'react';
import {api} from '../lib/api';

type DistA={person_id:number;name:string;musical_position:string;marimba_name:string;marimba_position_id:string;same_position:boolean;same_marimba:boolean;same_physical_slot:boolean;is_position_change:boolean;is_marimba_change:boolean;is_physical_slot_change:boolean;reason:string};
type DistBody={song_id:number;song_name:string;previous_song:string|null;marimbas_available:string[];capacity:Record<string,number>;assignments:DistA[];unfulfilled_requirements:{position:string;required:number;available:number;missing:number}[];warnings:string[]};


export default function DistributionPanel({songId,songName,onApplied}:{songId:number;songName:string;onApplied:(comp:any)=>void}){
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [applying,setApplying]=useState(false);
 const [error,setError]=useState('');
 const [data,setData]=useState<DistBody|null>(null);
 const [confirm,setConfirm]=useState(false);
 const load=async()=>{
  setLoading(true);setError('');
  try{setData(await api.songDistribution(songId));setOpen(true);setConfirm(false);}
  catch(e:any){setError(String(e.message||e));}
  finally{setLoading(false);}
 };
 const apply=async()=>{
  if(!data)return;
  if(!confirm){setConfirm(true);return;}
  setApplying(true);setError('');
  try{
   const comp=await api.applyDistribution(songId,{proposals:data.assignments,name:`${songName} - distribucion`});
   onApplied(comp);setOpen(false);setConfirm(false);
  }catch(e:any){setError(String(e.message||e));}
  finally{setApplying(false);}
 };
 if(!open)return(
  <div className="sugg-collapsed">
   {error&&<p className="import-error">{error}</p>}
   <button onClick={load} disabled={loading}>{loading?'Cargando distribucion…':'Ver distribucion propuesta'}</button>
  </div>);
 if(!data)return(
  <section className="card sugg"><h2>Distribucion propuesta</h2>
   {error&&<p className="import-error">{error}</p>}
   <button onClick={()=>setOpen(false)}>Cerrar</button></section>);
 const groups:Record<string,DistA[]>={};
 for(const a of data.assignments){(groups[a.musical_position]=groups[a.musical_position]||[]).push(a);}
 return(
  <section className="card sugg">
   <h2>Distribucion propuesta<br/>{data.song_name||songName}</h2>
   {error&&<p className="import-error">{error}</p>}
   {data.previous_song&&<p className="hint">Basada en: {data.previous_song}</p>}
   {Object.keys(groups).length===0&&data.unfulfilled_requirements.length===0
    ?<p className="hint">Sin asignaciones posibles. Revisa los faltantes.</p>
    :Object.entries(groups).map(([pos,arr])=>(
     <div key={pos}>
      <h3>{pos}</h3>
      {arr.map(a=>(
       <div key={a.person_id} className="sugg-row">
        <strong>{a.name}</strong><small>{a.musical_position} → {a.marimba_name} → {a.marimba_position_id}</small>
        <small className="reason">
         {a.same_position&&'✓ Mantiene posición '}{a.same_marimba&&'✓ Mantiene marimba '}{a.same_physical_slot&&'✓ Mantiene puesto '}
         {a.is_position_change&&'⚠ Cambia posición '}{a.is_marimba_change&&'⚠ Cambia marimba '}{a.is_physical_slot_change&&'⚠ Cambia puesto físico '}
        </small>
        <small className="reason">{a.reason}</small>
       </div>))}
     </div>))}
   {data.unfulfilled_requirements.length>0&&(<>
    <h3>Faltantes</h3>
    {data.unfulfilled_requirements.map(u=>(<div key={u.position} className="review-block warn">
     <h4>{u.position} — sin cubrir ({u.missing} {u.missing===1?'puesto':'puestos'})</h4>
     <p className="hint warn">Sin persona disponible o sin puesto libre.</p>
     <p className="hint">Requerimiento: {u.position} × {u.required} · Capacidad: {u.position} × {u.available} · Falta: {u.missing} {u.position}</p>
     <p className="hint">Puedes agregar una posición a una marimba o configurar otra marimba; la composición sigue siendo editable manualmente.</p>
    </div>))}
   </>)}
   {data.warnings.length>0&&(<>
    <h3>Avisos</h3>
    {data.warnings.map((w,i)=><p key={i} className="hint warn">{w}</p>)}
   </>)}
   {!confirm
    ?<button className="primary" onClick={apply} disabled={applying||data.assignments.length===0}>Aplicar distribución</button>
    :(<div className="review-block warn">
      <h3>Confirmar aplicación</h3>
      <p>Se creará una nueva composición para esta canción ({data.assignments.length} asignaciones). La canción anterior queda intacta. Podrás editar manualmente después.</p>
      <button className="primary" onClick={apply} disabled={applying}>{applying?'Aplicando…':'Confirmar y aplicar'}</button>{' '}
      <button onClick={()=>setConfirm(false)}>Cancelar</button>
     </div>)}
   <button onClick={()=>{setOpen(false);setConfirm(false);}}>Cerrar</button>
  </section>);
}
