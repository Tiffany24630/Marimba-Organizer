import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import type {SongRequirements,RequirementStatus} from '../types';

const ICON:Record<RequirementStatus,string>={covered:'✓',partial:'⚠',missing:'✕'};
const TITLE:Record<RequirementStatus,string>={covered:'Cubierto',partial:'Parcial',missing:'Faltante'};

export default function RequirementsPanel({songId,compositionId,refreshKey,dirty}:
 {songId:number;compositionId:number|null;refreshKey?:string|number|null;dirty?:boolean}){
 const [data,setData]=useState<SongRequirements|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');

 const load=async()=>{
  setLoading(true);setError('');
  try{setData(await api.songRequirements(songId,compositionId));}
  catch(e:any){setError(String(e.message||e));}
  finally{setLoading(false);}
 };

 useEffect(()=>{load();},[songId,compositionId,refreshKey]);

 const faltantes=(data?.requirements||[]).filter(r=>r.missing>0);
 const detalle=faltantes.map(r=>`falta ${r.missing} ${r.missing===1?'puesto':'puestos'} ${r.position_type}`).join(', ');

 return(
  <section className="card sugg req-panel">
   <div className="req-head">
    <h2>Requisitos de la canción</h2>
    <button className="mini-link" onClick={load} disabled={loading}>{loading?'…':'Recalcular'}</button>
   </div>

   {error&&<p className="import-error">{error}</p>}
   {dirty&&<p className="hint warn">Cambios sin guardar: guarda la composición para recalcular la capacidad.</p>}
   {!data&&loading&&<p className="hint">Calculando capacidad…</p>}

   {data&&!data.has_requirements&&(
    <p className="hint">Esta canción no tiene requisitos registrados. Importa el Excel o asigna personas para definirlos.</p>)}

   {data&&data.has_requirements&&(<>
    {data.requirements.map(r=>(
     <div className={'req-row '+r.status} key={r.position_type}>
      <span className="req-pos">{r.position_type}</span>
      <span className="req-count">{r.available} / {r.required}</span>
      <span className={'req-status '+r.status} title={TITLE[r.status]}>{ICON[r.status]}</span>
     </div>))}

    <div className="req-totals">
     <span>Requeridos <b>{data.totals.required}</b></span>
     <span>Disponibles <b>{data.totals.available}</b></span>
     <span>Faltantes <b>{data.totals.missing}</b></span>
    </div>

    {data.capacity_source==='sin_composicion'
     ?<p className="hint warn">Sin composición para esta canción: abre o crea una composición para calcular la capacidad real de las marimbas.</p>
     :data.complete
      ?<p className="hint ok">✓ Capacidad suficiente</p>
      :<p className="hint warn">⚠ Falta capacidad: {detalle}</p>}

    {data.extra_capacity.length>0&&(
     <p className="hint">Puestos sin requisito en esta canción: {data.extra_capacity.map(x=>`${x.position_type} × ${x.available}`).join(', ')}.</p>)}
   </>)}
  </section>);
}