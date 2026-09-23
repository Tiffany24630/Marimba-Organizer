import {useState,createContext,useContext,useRef,useEffect} from 'react';

export interface ConfirmOptions{
 title:string;
 message:string;
 okLabel?:string;
 cancelLabel?:string;
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
 useEffect(()=>()=>{pending.current?.(false);pending.current=null;},[]);
 const resolve=(value:boolean)=>{
  const callback=pending.current;pending.current=null;setState(null);callback?.(value);
 };
 const show=(opts:ConfirmOptions)=>new Promise<boolean>(done=>{
  pending.current?.(false);
  pending.current=done;
  setState({open:true,options:opts,resolve:done});
 });

 return (
  <ConfirmCtx.Provider value={{show}}>
   {children}
   {state&&(
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
     <div className="confirm-card">
      <h3 id="confirm-title" className="confirm-title">{state.options.title}</h3>
      <p className="confirm-message">{state.options.message}</p>
      <div className="confirm-actions">
       <button className="secondary" onClick={()=>resolve(false)}>{state.options.cancelLabel||'Cancelar'}</button>
       <button className="primary danger" onClick={()=>resolve(true)}>{state.options.okLabel||'Continuar'}</button>
      </div>
     </div>
    </div>
   )}
  </ConfirmCtx.Provider>
 );
}