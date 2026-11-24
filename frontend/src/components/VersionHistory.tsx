import {useState,useCallback} from 'react';
import {api} from '../lib/api';
import {useConfirm} from '../hooks/useConfirm';

/**
 * Fase 9C - Historial PERSISTENTE de versiones de la composicion.
 *
 * Esto NO es el deshacer/rehacer del lienzo. Aquel vive en memoria y se pierde
 * al recargar (el store hace `history:[], future:[]]` al cargar); este historial
 * esta en el servidor y sobrevive a cerrar la pestana.
 *
 * Decisiones de diseno:
 *  - Crear version es una ACCION EXPLICITA del usuario, no un efecto lateral de
 *    guardar. Guardar no crea versiones: asi el historial contiene estados que
 *    el usuario ha decidido conservar, no cada pulsacion.
 *  - Restaurar pide confirmacion siempre (useConfirm, el dialogo accesible que
 *    ya usa el resto de la aplicacion), porque cambia lo que hay en pantalla.
 *  - El resultado se ANUNCIA con `role="status"`, no solo se cambia el color.
 *  - Todos los botones llevan texto. Ningun icono sin nombre accesible.
 */

export type VersionSummary={
  id:number;composition_id:number;version_number:number;
  created_at:string|null;
  created_by:{id:number|null;name:string|null};
};

const fmt=(iso:string|null)=>{
 if(!iso)return 'sin fecha';
 const d=new Date(iso);
 return isNaN(d.getTime())?'sin fecha':d.toLocaleString();
};

export default function VersionHistory({compositionId,readOnly,onRestored}:{
  compositionId:number;readOnly?:boolean;onRestored:(comp:any)=>void;
}){
 const confirmar=useConfirm();
 const [versiones,setVersiones]=useState<VersionSummary[]>([]);
 const [cargando,setCargando]=useState(false);
 const [ocupado,setOcupado]=useState(false);
 const [error,setError]=useState('');
 const [mensaje,setMensaje]=useState('');

 const cargar=useCallback(async()=>{
  setCargando(true);setError('');
  try{
   const r=await api.compositionVersions(compositionId);
   setVersiones(r.versions||[]);
  }catch(e:any){setError(String(e.message||e));}
  finally{setCargando(false);}
 },[compositionId]);

 const guardarVersion=async()=>{
  setOcupado(true);setError('');setMensaje('');
  try{
   const v=await api.createCompositionVersion(compositionId);
   await cargar();
   setMensaje(`Versión ${v.version_number} guardada.`);
  }catch(e:any){setError(String(e.message||e));}
  finally{setOcupado(false);}
 };

 const restaurar=async(v:VersionSummary)=>{
  const ok=await confirmar.show({
   title:`Restaurar la versión ${v.version_number}`,
   message:'La composición actual será reemplazada por el estado guardado en esa '
    +'versión. El estado actual se guarda antes como una versión nueva, así que '
    +'podrás volver a él. Las versiones existentes no se borran.',
  });
  if(!ok)return;
  setOcupado(true);setError('');setMensaje('');
  try{
   const r=await api.restoreCompositionVersion(compositionId,v.id);
   await cargar();
   setMensaje(`Versión ${r.restored_version} restaurada. El estado anterior quedó `
     +`guardado como versión ${r.previous_state_saved_as}.`);
   // Se devuelve el estado restaurado: la pantalla se repinta desde el servidor.
   onRestored(r.composition);
  }catch(e:any){setError(String(e.message||e));}
  finally{setOcupado(false);}
 };

 return <section className="card version-history" aria-labelledby="vh-title">
  <h2 id="vh-title">Historial de versiones</h2>
  <p className="hint">
   Un historial guardado en el servidor: sobrevive a recargar o cerrar la
   pestaña. El deshacer del lienzo solo recuerda esta sesión.
  </p>

  <div className="vh-actions">
   {!readOnly&&
    <button className="primary" onClick={guardarVersion} disabled={ocupado}>
     {ocupado?'Trabajando…':'Guardar versión ahora'}
    </button>}
   <button onClick={cargar} disabled={cargando||ocupado}>
    {cargando?'Cargando historial…':'Actualizar historial'}
   </button>
  </div>

  {error&&<p className="import-error">{error}</p>}

  {/* El resultado se anuncia, no solo se ve. */}
  <p className="vh-status" role="status" aria-live="polite">{mensaje}</p>

  {!cargando&&versiones.length===0&&
   <p className="hint">Todavía no hay versiones guardadas.</p>}

  <ol className="vh-list">
   {versiones.map(v=>(
    <li key={v.id} className="vh-item">
     <div className="vh-meta">
      <strong>Versión {v.version_number}</strong>
      <small>{fmt(v.created_at)} · {v.created_by?.name||'autor desconocido'}</small>
     </div>
     {!readOnly&&
      <button onClick={()=>restaurar(v)} disabled={ocupado}>
       {ocupado?'Restaurando…':`Restaurar la versión ${v.version_number}`}
      </button>}
    </li>))}
  </ol>
 </section>;
}