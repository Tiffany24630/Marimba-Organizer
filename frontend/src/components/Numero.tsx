/**
 * Fase 7Z/8A - campo numerico que agrupa la edicion en UNA operacion logica.
 *
 * Se creo en 7Z para el `Inspector` y en 8A se comparte con el
 * `AccessibleEditor`, para que NO existan dos semanticas distintas de editar
 * coordenadas segun desde que vista se haga.
 *
 * El problema original (observado en 7Y): el campo llamaba a la accion del store
 * en CADA pulsacion, asi que escribir "400" generaba las transiciones
 * 200->4->40->400: TRES pasos de historial, y un unico Ctrl+Z solo revocaba el
 * ultimo (-> 40).
 *
 * Aqui el campo mantiene un BORRADOR mientras se escribe y confirma una sola
 * vez. NO hay `setTimeout` ni debounce: la agrupacion depende de la ACCION del
 * usuario (confirma o cancela), no de una ventana temporal. Editar durante un
 * segundo o durante diez sigue siendo la misma edicion mientras no se confirme.
 *
 * Contrato (identico en ambas vistas):
 *  - `blur`   -> confirma.
 *  - `Enter`  -> confirma; el blur posterior ya no confirma nada (el borrador
 *                queda a null), asi que no se genera doble paso.
 *  - `Escape` -> cancela y vuelve al valor real.
 *  - Vacio o no numerico -> no confirma (se muestra el valor real).
 *  - Igual al valor real -> no confirma (no-op).
 *
 * Quien aplica la transicion sigue siendo la accion del store que ya existe
 * (`update`, `marimbaDragged`, ...). Este componente solo decide CUANDO llamarla.
 */
import {useState} from 'react';

export default function Numero(props:{
 etiqueta:string;valor:number;disabled?:boolean;
 min?:number;step?:number|string;inputMode?:'numeric'|'decimal';
 // 8B: se conserva el `id` que el DOM tenia antes. Los lectores internos lo
 // usan para localizar el campo (`input[id^="acc-x-"]` en `geometria.spec.ts`).
 id?:string;
 onCommit:(n:number)=>void;
}){
 const {etiqueta,valor,disabled,min,step,inputMode,id,onCommit}=props;
 const [borrador,setBorrador]=useState<string|null>(null);
 const mostrado=borrador??String(valor);
 const confirmar=()=>{
  if(borrador===null)return;          // ya confirmado o cancelado
  const texto=borrador;
  setBorrador(null);
  const n=Number(texto);
  if(texto.trim()===''||!Number.isFinite(n)||n===valor)return;
  onCommit(n);
 };
 return <label className="field">{etiqueta}
  <input id={id} type="number" min={min} step={step} inputMode={inputMode}
   disabled={disabled} value={mostrado}
   onChange={ev=>setBorrador(ev.target.value)}
   onBlur={confirmar}
   onKeyDown={ev=>{
    if(ev.key==='Enter'){ev.preventDefault();confirmar();return;}
    if(ev.key==='Escape'){setBorrador(null);return;}
   }}/>
 </label>;
}