import {useState} from 'react';
import Numero from './Numero';
import {useComposition, assignmentError, elementLocked}
  from '../store/composition';
import type {MarimbaElement, PersonElement} from '../types';

/**
 * Fase 7J - ALTERNATIVA ACCESIBLE AL LIENZO DE KONVA.
 *
 * El lienzo se dibuja en `<canvas>`: colocar y girar solo se puede con el ratón.
 * En 7I se confirmó que eso no tiene equivalente por teclado. Esta vista ofrece
 * ESE equivalente con HTML semántico, sin sustituir el lienzo.
 *
 * Decisiones:
 *
 *  - NO hay motor propio. Todo pasa por las MISMAS acciones del store que usa el
 *    lienzo (`assign`, `unassign`, `update`), así que deshacer/rehacer, el estado
 *    de guardado, el candado y el modo de solo lectura se comportan igual por los
 *    dos caminos, y las dos vistas quedan sincronizadas por leer el mismo estado.
 *  - NO crea marimbas ni puestos: solo consulta y reasigna lo que ya existe,
 *    que es exactamente lo que permite el lienzo con el ratón.
 *  - Controles nativos (`<select>`, `<button>`): Tab, Shift+Tab, Enter y Espacio
 *    funcionan sin manejadores globales, que es lo que evita interferir con los
 *    campos de texto y los diálogos.
 *  - Cada control se nombra con la acción completa ("Retirar a Ana del puesto
 *    Primera de Marimba tenor"), no solo "Retirar".
 */
export default function AccessibleEditor({readOnly}:{readOnly:boolean}) {
  const elements=useComposition(s=>s.elements);
  const assign=useComposition(s=>s.assign);
  const unassign=useComposition(s=>s.unassign);
  const update=useComposition(s=>s.update);
  const select=useComposition(s=>s.select);
  const undo=useComposition(s=>s.undo);
  const redo=useComposition(s=>s.redo);
  const canUndo=useComposition(s=>s.history.length>0);
  const canRedo=useComposition(s=>s.future.length>0);
  // 7M - colocación por teclado. Se usa `marimbaDragged`, la MISMA acción que el
  // arrastre del lienzo: traslada la marimba y desplaza a las personas
  // sentadas el mismo delta, así que la geometría se conserva intacta.
  // `recordHistory` + `endGesture` son el mecanismo de un paso de deshacer que ya
  // usa el lienzo; con ellos cada desplazamiento es deshacible.
  const marimbaDragged=useComposition(s=>s.marimbaDragged);
  const recordHistory=useComposition(s=>s.recordHistory);
  const endGesture=useComposition(s=>s.endGesture);

  const [personaId,setPersonaId]=useState('');
  const [puestoId,setPuestoId]=useState('');
  const [mensaje,setMensaje]=useState('');

  const marimbas=elements.filter((e):e is MarimbaElement=>e.type==='marimba');
  const personas=elements.filter((e):e is PersonElement=>e.type==='person');

  /** Persona que ocupa un puesto, o null si esta vacio. */
  const ocupante=(p:{personId:number|null})=>{
    if(p.personId==null)return null;
    return personas.find(x=>x.personId===p.personId)?.name??null;
  };

  /** Donde esta sentada una persona, o null si esta libre. */
  const puestosDe=(pe:PersonElement)=>{
    for(const m of marimbas){
      if(m.id===pe.marimbaId){
        const i=m.positions.findIndex(p=>p.id===pe.marimbaPositionId);
        if(i>=0)return {marimba:m,indice:i};
      }
    }
    return null;
  };

  const nombresPuestos=(m:MarimbaElement)=>m.positions
    .map((p,i)=>`${i+1}. ${p.type}${ocupante(p)?` (${ocupante(p)})`:' (vacio)'}`)
    .join(', ');

  const errorVista=personaId&&puestoId
    ?assignmentError(elements,personaId,puestoId.split('|')[0],puestoId.split('|')[1])
    :null;

  const hacerAsignar=()=>{
    if(!personaId||!puestoId)return;
    const partes=puestoId.split('|');
    const fallo=assignmentError(elements,personaId,partes[0],partes[1]);
    if(fallo){setMensaje(`No se pudo asignar: ${fallo}`);return;}
    const pe=personas.find(x=>x.id===personaId);
    const antes=pe?puestosDe(pe):null;
    assign(personaId,partes[0],partes[1]);
    const m=marimbas.find(x=>x.id===partes[0]);
    const puesto=m?.positions.find(p=>p.id===partes[1]);
    const destino=`${puesto?.type??''} de ${m?.name??''}`;
    setMensaje(antes
      ?`${pe!.name} se movio de su puesto a ${destino}.`
      :`${pe!.name} quedo asignado a ${destino}.`);
    select(personaId);
    setPuestoId('');
  };

  const hacerRetirar=(pe:PersonElement)=>{
    const donde=puestosDe(pe);
    if(!donde)return;
    const tipo=donde.marimba.positions[donde.indice]?.type??'';
    unassign(pe.id,null);
    setMensaje(`${pe.name} salio del puesto ${tipo} de ${donde.marimba.name}. Queda sin sentar.`);
    select(pe.id);
  };

  const girar=(m:MarimbaElement)=>{
    if(elementLocked(elements,m.id))return;
    const siguiente=(m.rotation+90)%360;
    update(m.id,{rotation:siguiente});
    setMensaje(`${m.name} girada a ${siguiente} grados.`);
  };

  // 7M - mover una marimba sin arrastrar. `PASO` es el incremento con los
  // botones; los campos numéricos permiten escribir una posición exacta.
  // No se inventan limites que el modelo no tenga: solo se impide que el
  // origen sea negativo, que sacaria la marimba fuera del lienzo.
  const PASO=10;

  const mover=(m:MarimbaElement,dx:number,dy:number)=>{
    if(readOnly||elementLocked(elements,m.id))return;
    const nx=Math.max(0,Math.round(m.x+dx));
    const ny=Math.max(0,Math.round(m.y+dy));
    if(nx===m.x&&ny===m.y){
     setMensaje(`${m.name} no se puede mover más: ya está en el borde.`);
     return;
    }
    recordHistory();
    marimbaDragged(m.id,nx,ny);
    endGesture();
    setMensaje(`${m.name} movida a la posición ${nx}, ${ny}.`);
  };

  if(!marimbas.length){
    return (
     <section className="acc-editor" aria-labelledby="acc-editor-titulo">
      <h2 id="acc-editor-titulo">Edicion sin raton</h2>
      <p className="hint">
       Todavia no hay ninguna marimba en esta composicion. Anadela desde la
       pestana «Marimbas»; cuando exista, aqui podras asignar y retirar personas
       sin usar el raton.
      </p>
     </section>
    );
  }
return (
   <section className="acc-editor" aria-labelledby="acc-editor-titulo">
    <h2 id="acc-editor-titulo">Edicion sin raton</h2>
    <p className="hint">
     Esta vista hace lo mismo que el lienzo, con el teclado. Los cambios se ven
     al instante en el lienzo y se guardan con el mismo boton «Guardar».
    </p>

    {readOnly&&(
     <p className="hint warn" role="note">
      Estas en modo solo lectura: puedes consultar todo, pero no modificar
      asignaciones.
     </p>
    )}

    {/* Lo que un lector de pantalla necesita saber tras cada operacion. */}
    <p className="acc-live" role="status" aria-live="polite">{mensaje}</p>

    <div className="acc-toolbar">
     <button type="button" disabled={readOnly||!canUndo}
      onClick={()=>{undo();setMensaje('Se deshizo el ultimo cambio.');}}>
      Deshacer
     </button>
     <button type="button" disabled={readOnly||!canRedo}
      onClick={()=>{redo();setMensaje('Se rehizo el cambio.');}}>
      Rehacer
     </button>
    </div>

    <fieldset className="acc-fieldset" disabled={readOnly}>
     <legend>Asignar una persona a un puesto</legend>

     <label className="field" htmlFor="acc-persona">Persona</label>
     <select id="acc-persona" value={personaId}
      onChange={e=>setPersonaId(e.target.value)}>
      <option value="">— Elige una persona —</option>
      {personas.map(p=>{
       const donde=puestosDe(p);
       return (
        <option key={p.id} value={p.id}>
         {p.name}
         {donde?` (en ${donde.marimba.positions[donde.indice]?.type??''})`:' (sin sentar)'}
         {elementLocked(elements,p.id)?' — bloqueada':''}
        </option>);
      })}
     </select>

     <label className="field" htmlFor="acc-puesto">Puesto</label>
     <select id="acc-puesto" value={puestoId}
      onChange={e=>setPuestoId(e.target.value)}>
      <option value="">— Elige un puesto —</option>
      {marimbas.map(m=>(
       <optgroup key={m.id} label={`${m.name}${m.locked?' (bloqueada)':''}`}>
        {m.positions.map((p,i)=>(
         <option key={p.id} value={`${m.id}|${p.id}`}>
          {i+1}. {p.type}{ocupante(p)?` — ocupado por ${ocupante(p)}`:' — vacio'}
         </option>))}
       </optgroup>))}
     </select>

     <button type="button" className="primary" onClick={hacerAsignar}
      disabled={!personaId||!puestoId}>
      Asignar
     </button>
     {errorVista&&<p className="hint warn" role="alert">{errorVista}</p>}
    </fieldset>

    {marimbas.map(m=>(
     <section key={m.id} className="acc-marimba" aria-label={`Marimba ${m.name}`}>
      <h3>{m.name}{m.locked&&<span className="acc-lock"> (bloqueada)</span>}</h3>
      <p className="hint">Puestos: {nombresPuestos(m)}</p>
      <button type="button" disabled={readOnly||elementLocked(elements,m.id)}
       onClick={()=>girar(m)}
       aria-label={`Girar la marimba ${m.name} 90 grados`}>
       Girar 90 grados
      </button>

      {/* 7M - mover sin arrastrar. Botones de incremento y campos para la
          posición exacta. Cada pulsación es UN paso de deshacer. */}
      <h4>Mover la marimba</h4>
      <p className="hint">
       Posición actual: horizontal {Math.round(m.x)}, vertical {Math.round(m.y)}.
      </p>
      <div className="acc-mover">
       <button type="button" disabled={readOnly||elementLocked(elements,m.id)}
        onClick={()=>mover(m,-PASO,0)}
        aria-label={`Mover ${m.name} 10 a la izquierda`}>←</button>
       <button type="button" disabled={readOnly||elementLocked(elements,m.id)}
        onClick={()=>mover(m,PASO,0)}
        aria-label={`Mover ${m.name} 10 a la derecha`}>→</button>
       <button type="button" disabled={readOnly||elementLocked(elements,m.id)}
        onClick={()=>mover(m,0,-PASO)}
        aria-label={`Mover ${m.name} 10 arriba`}>↑</button>
       <button type="button" disabled={readOnly||elementLocked(elements,m.id)}
        onClick={()=>mover(m,0,PASO)}
        aria-label={`Mover ${m.name} 10 abajo`}>↓</button>
      </div>
      <div className="acc-coords">
       {/* 8A: se usa el MISMO componente que el Inspector. Antes cada pulsacion
           llamaba a `mover(...)`, que abre y cierra un gesto del historial:
           escribir "400" generaba tres pasos y un unico Ctrl+Z solo revocaba
           el ultimo. Ahora la edicion se confirma una sola vez. */}
       <Numero etiqueta={`Posición horizontal de ${m.name}`}
        id={`acc-x-${m.id}`}
        valor={Math.round(m.x)} step={PASO}
        disabled={readOnly||elementLocked(elements,m.id)}
        onCommit={v=>mover(m,v-m.x,0)}/>
       <Numero etiqueta={`Posición vertical de ${m.name}`}
        id={`acc-y-${m.id}`}
        valor={Math.round(m.y)} step={PASO}
        disabled={readOnly||elementLocked(elements,m.id)}
        onCommit={v=>mover(m,0,v-m.y)}/>
      </div>

      <h4>Puestos de esta marimba</h4>
      <ul className="acc-slots">
       {m.positions.map((p,i)=>{
        const quien=ocupante(p);
        const pe=quien?personas.find(x=>x.personId===p.personId):null;
        return (
         <li key={p.id}>
          <span>{i+1}. {p.type}: {quien||'vacio'}</span>
          {pe&&(
           <button type="button" disabled={readOnly||elementLocked(elements,pe.id)}
            onClick={()=>hacerRetirar(pe)}
            aria-label={`Retirar a ${pe.name} del puesto ${p.type} de ${m.name}`}>
            Retirar
           </button>
          )}
         </li>);
       })}
      </ul>
     </section>))}

    <section className="acc-sin-sentar" aria-label="Personas sin sentar">
     <h3>Personas sin sentar</h3>
     {personas.filter(p=>!p.marimbaId).length===0
      ?<p className="hint">Todas las personas estan sentadas.</p>
      :<ul className="acc-slots">
        {personas.filter(p=>!p.marimbaId).map(p=>(
         <li key={p.id}><span>{p.name}</span></li>))}
       </ul>}
    </section>
   </section>
  );
}