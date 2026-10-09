import {useEffect,useState} from 'react';
import {useComposition} from '../store/composition';
import {COMMENT_MAX,LABEL_MAX,hasNote} from '../lib/notes';

/**
 * Fase 7B.1 - editor de anotaciones de UN elemento.
 *
 * Dos campos con proposito distinto, distinguished tambien en la interfaz:
 *  - Etiqueta: texto breve (hasta 24). Se ve como chip en el lienzo.
 *  - Comentario: texto descriptivo (hasta 280). Se recorta en el lienzo y se
 *    consulta entero aqui, sin ocupar espacio.
 *
 * `target.positionId` edita el puesto; sin el, el elemento (persona o marimba).
 * No toca asignaciones ni geometria, y respeta el bloqueo del elemento.
 */
export default function NoteEditor({elementId,positionId,label,readOnly}:{
 elementId:string;positionId?:string|null;label:string;readOnly?:boolean;
}){
 const setNote=useComposition(s=>s.setNote);
 const clearNote=useComposition(s=>s.clearNote);
 const el=useComposition(s=>s.elements.find(x=>x.id===elementId));
 const slot=positionId&&el&&el.type==='marimba'
  ?el.positions.find(p=>p.id===positionId):undefined;
 const current=(slot?slot.note:el?el.note:undefined)||{};
 const [text,setText]=useState(current.label||'');
 const [comment,setComment]=useState(current.comment||'');

 // Si se selecciona otro elemento, el formulario se recarga con sus datos.
 useEffect(()=>{setText(current.label||'');setComment(current.comment||'');
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[elementId,positionId,current.label,current.comment]);

 const slotExists=!!positionId?!!slot:true;
 if(!el||!slotExists)return null;

 const commitLabel=(v:string)=>{
  if(readOnly)return;
  setText(v);setNote({elementId,positionId},{label:v});};
 const commitComment=(v:string)=>{
  if(readOnly)return;
  setComment(v);setNote({elementId,positionId},{comment:v});};
 const wipe=()=>{
  if(readOnly)return;
  setText('');setComment('');clearNote({elementId,positionId});};

 return (
  <section className="note-editor">
   <header>
    <strong>Anotación</strong>
    <span className="note-target">{label}</span>
   </header>

   <label className="field">
    <span>Etiqueta breve</span>
    <input value={text} readOnly={readOnly} maxLength={LABEL_MAX+1} placeholder="Kay, 2ª fila…"
     onChange={e=>commitLabel(e.target.value)}/>
    <small>{text.length}/{LABEL_MAX} · se muestra como chip</small>
   </label>

   <label className="field">
    <span>Comentario</span>
    <textarea value={comment} readOnly={readOnly} maxLength={COMMENT_MAX+1} rows={3}
     placeholder="Notas para el conjunto (no tapa los puestos)"
     onChange={e=>commitComment(e.target.value)}/>
    <small>{comment.length}/{COMMENT_MAX} · texto completo visible aquí</small>
   </label>

   {hasNote({label:current.label,comment:current.comment})&&(
    <button type="button" className="ghost" onClick={wipe} disabled={readOnly}>Borrar anotación</button>
   )}
  </section>
 );
}
