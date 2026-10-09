import {useState,createContext,useContext,useRef,useEffect} from 'react';

export interface ConfirmOptions{
 title:string;
 message:string;
 okLabel?:string;
 cancelLabel?:string;
 // 7L: marca de operación destructiva. Cambia la etiqueta por defecto del
 // botón de confirmación para que la acción real quede dicha de forma explícita
 // ("Eliminar"), en lugar del genérico "Continuar".
 destructive?:boolean;
}

interface ConfirmState{
 open:boolean;
 options:ConfirmOptions;
 resolve:(v:boolean)=>void;
}
type ConfirmAction='SHOW'|'DISMISS'|'RESOLVE';
interface ConfirmActionPayload{
 type:ConfirmAction;
 options?:ConfirmOptions;
 value?:boolean;
}

export const ConfirmCtx=createContext<{
 show:(opts:ConfirmOptions)=>Promise<boolean>;
} |null>(null);

export const useConfirm=()=>{
 const ctx=useContext(ConfirmCtx);
 if(!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
 return ctx;
};

export default function ConfirmProvider({children}:{children:React.ReactNode}){
 const [state,setState]=useState<ConfirmState|null>(null);
 const pending=useRef<((v:boolean)=>void)|null>(null);
 const cardRef=useRef<HTMLDivElement|null>(null);
 const cancelRef=useRef<HTMLButtonElement|null>(null);
 // 7K: elemento que tenía el foco ANTES de abrir, para devolverlo al cerrar.
 // Sin esto el foco se perdía en el body y el usuario tenía que empezar a
 // recorrer la página otra vez.
 const previo=useRef<HTMLElement|null>(null);

 useEffect(()=>()=>{pending.current?.(false);pending.current=null;},[]);

 const resolve=(value:boolean)=>{
  const callback=pending.current;pending.current=null;setState(null);callback?.(value);
 };

 const show=(opts:ConfirmOptions)=>new Promise<boolean>(done=>{
  pending.current?.(false);
  // Se guarda el origen del foco, si sigue siendo un elemento real.
  previo.current=document.activeElement as HTMLElement|null;
  pending.current=done;
  setState({open:true,options:opts,resolve:done});
 });

 // 7K - CICLO DE FOCO DEL DIÁLOGO.
 //
 // Lo que había (7A-7J): el div llevaba `role="dialog" aria-modal="true"`, pero
 // no movía el foco, no lo contenía y no respondía a Escape. Los atributos ARIA
 // describían una modal que en realidad no lo era.
 useEffect(()=>{
  if(!state)return;
  // Foco INICIAL en "Cancelar", nunca en el botón destructivo: pulsarlo por
  // error al confirmar con Enter sería justo el daño que el diálogo evita.
  cancelRef.current?.focus();

  const onKeyDown=(ev:KeyboardEvent)=>{
   // Escape cierra. Se ignora si ya se está cerrando para no resolver dos veces.
   if(ev.key==='Escape'){
    ev.preventDefault();ev.stopPropagation();
    resolve(false);
    return;
   }
   if(ev.key!=='Tab')return;
   // Trampa de foco: Tab cicla entre los controles del diálogo, y nunca sale
   // hacia los elementos que quedan detrás de la capa.
   const raiz=cardRef.current;
   if(!raiz)return;
   const focalizables=Array.from(
    raiz.querySelectorAll<HTMLElement>(
     'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el=>el.offsetParent!==null||el===document.activeElement);
   if(!focalizables.length)return;
   const primero=focalizables[0],ultimo=focalizables[focalizables.length-1];
   const activo=document.activeElement as HTMLElement|null;
   if(ev.shiftKey&&(activo===primero||!raiz.contains(activo))){
    ev.preventDefault();ultimo.focus();
   }else if(!ev.shiftKey&&(activo===ultimo||!raiz.contains(activo))){
    ev.preventDefault();primero.focus();
   }
  };

  document.addEventListener('keydown',onKeyDown,true);
  return ()=>{
   document.removeEventListener('keydown',onKeyDown,true);
   // Recuperación del foco: al elemento que abrió el diálogo. Si ya no existe
   // (p. ej. la fila se borró), no se fuerza nada y el foco queda donde esté.
   const destino=previo.current;
   if(destino&&document.contains(destino))destino.focus();
   else cardRef.current=null;
  };
 },[state]);

 return (
  <ConfirmCtx.Provider value={{show}}>
   {children}
   {state&&(
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
     <div className="confirm-card" ref={cardRef}>
      <h3 id="confirm-title" className="confirm-title">{state.options.title}</h3>
      <p className="confirm-message">{state.options.message}</p>
      <div className="confirm-actions">
       <button ref={cancelRef} className="secondary" onClick={()=>resolve(false)}>{state.options.cancelLabel||'Cancelar'}</button>
       {/* 7L: la etiqueta del botón de confirmación dice la acción real. En una
           operación destructiva nunca queda el ambiguo "Continuar". */}
       <button className={state.options.destructive?'primary danger':'primary'}
        onClick={()=>resolve(true)}>
        {state.options.okLabel||(state.options.destructive?'Eliminar':'Continuar')}
       </button>
      </div>
     </div>
    </div>
   )}
  </ConfirmCtx.Provider>
 );
}