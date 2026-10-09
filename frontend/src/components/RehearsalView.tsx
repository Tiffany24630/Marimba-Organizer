import {useMemo} from 'react';
import {buildRehearsal} from '../lib/rehearsal';
import type {Element} from '../types';

/**
 * Fase 9D - Vista de ensayo / impresion.
 *
 * Es de CONSULTA. No edita nada: no hay `update`, ni `assign`, ni campos. La
 * unica accion es imprimir.
 *
 * Decisiones:
 *  - Se construye desde los `elements` que ya estan cargados. NO se pide nada
 *    al backend: la composicion ya contiene toda la informacion necesaria.
 *  - NO se usa canvas: es HTML semantico (`table`, `th`, `caption`), que se lee
 *    igual en pantalla que en papel y que un lector de pantalla puede recorrer.
 *  - Los puestos vacios se MUESTRAN ("Vacante"): en un ensayo saber que falta
 *    alguien es justo lo importante.
 *  - Las personas sin asignacion se listan aparte, nunca se ocultan en silencio.
 *  - `window.print()`: la impresion ocurre en el navegador, sin backend.
 */

export default function RehearsalView({elements,compName,songName,onClose,kicker}:{
  elements:Element[];
  compName:string;
  songName?:string|null;
  /**
   * 9E: `onClose` y `kicker` son OPCIONALES a proposito. En el editor se pasan
   * y el comportamiento es identico al de 9D; en la pagina PUBLICA del enlace
   * no hay "volver al editor" (no hay editor) y el encabezado dice otra cosa.
   * Asi la misma proyeccion de solo lectura sirve en los dos sitios sin
   * duplicar la tabla.
   */
  onClose?:()=>void;
  kicker?:string;
}){
 const r=useMemo(()=>buildRehearsal(elements),[elements]);
 const hoy=new Date().toLocaleDateString();

 return <section className="rehearsal" aria-labelledby="rh-title">
  <div className="rh-toolbar no-print">
   {onClose&&<button onClick={onClose}>Volver al editor</button>}
   <button className="primary" onClick={()=>window.print()}>Imprimir</button>
  </div>

  <header className="rh-head">
   <p className="rh-kicker">{kicker??'Vista de ensayo'}</p>
   <h1 id="rh-title">{compName||'Composicion'}</h1>
   {songName&&<p className="rh-sub">{songName}</p>}
   <p className="rh-meta">
    {r.totals.marimbas} marimba{r.totals.marimbas===1?'':'s'} ·
    {' '}{r.totals.occupied} de {r.totals.slots} puestos ocupados ·
    {' '}{r.totals.vacant} vacante{r.totals.vacant===1?'':'s'} ·
    {' '}generada el {hoy}
   </p>
  </header>

  {r.marimbas.length===0&&
   <p className="hint">Esta composicion todavia no tiene marimbas.</p>}

  {r.marimbas.map(m=>(
   <section key={m.id} className="rh-marimba">
    <h2>
     {m.name}
     {m.locked&&<span className="rh-lock"> — bloqueada</span>}
    </h2>
    {(m.label||m.comment)&&
     <p className="rh-note">
      {m.label&&<strong>{m.label}</strong>}
      {m.comment&&<span>{m.comment}</span>}
     </p>}
    <table className="rh-table">
     <caption className="sr-only">{`Puestos de ${m.name}`}</caption>
     <thead>
      <tr><th scope="col">Puesto</th><th scope="col">Persona</th></tr>
     </thead>
     <tbody>
      {m.slots.map(s=>(
       <tr key={s.positionId} className={s.vacant?'rh-vacant':undefined}>
        <th scope="row">
         {s.type}
         <span className="rh-idx"> ({s.index})</span>
        </th>
        <td>
         {s.vacant
          ?<em className="rh-vacante-txt">Vacante</em>
          :<>
            <strong>{s.personName}</strong>
            {s.label&&<span className="rh-chip">{s.label}</span>}
            {s.comment&&<small className="rh-comment">{s.comment}</small>}
           </>}
        </td>
       </tr>))}
     </tbody>
    </table>
   </section>))}

  {r.unassigned.length>0&&
   <section className="rh-unassigned">
    <h2>Personas sin asignar ({r.unassigned.length})</h2>
    <p className="hint">
     No ocupan ningun puesto en esta composicion: no estan sentadas.
    </p>
    <ul>
     {r.unassigned.map(p=>(
      <li key={p.id}>
       <strong>{p.name}</strong>
       {p.positionType&&<span className="rh-idx"> · {p.positionType}</span>}
       {p.label&&<span className="rh-chip">{p.label}</span>}
       {p.comment&&<small className="rh-comment">{p.comment}</small>}
      </li>))}
    </ul>
   </section>}
 </section>;
}