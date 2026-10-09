import {useState,useEffect} from 'react';
import {api} from '../lib/api';

export type Collaborator={user_id:number;name:string;email:string;
 role:'owner'|'editor'|'reader';created_at:string|null};

export const ACCESS_LABEL:Record<string,string>={
 owner:'Propietario',editor:'Editor',reader:'Solo lectura'};

/**
 * Fase 7D - seccion "Compartir" de un proyecto.
 *
 * Solo se muestra al PROPIETARIO. Ocultarlo no es la proteccion: el backend
 * rechaza por igual a editor y reader. Solo refleja lo que el servidor permite.
 */
export default function SharePanel({projectId,onChanged}:{
 projectId:number;onChanged?:()=>void;
}){
 const [list,setList]=useState<Collaborator[]|null>(null);
 const [email,setEmail]=useState('');
 const [role,setRole]=useState<'editor'|'reader'>('editor');
 const [msg,setMsg]=useState<{kind:'ok'|'err';text:string}|null>(null);
 const [busy,setBusy]=useState(false);

 const load=async()=>{
  try{setList(await api.collaborators(projectId));setMsg(null);}
  catch(e:any){setMsg({kind:'err',text:String(e.message||e)});}
 };
  // 7E: la carga va en un efecto. Llamarla durante el render lanza la peticion
  // en cada repintado y, mientras la respuesta no llega, list sigue a null y
  // se vuelve a pedir: bucles de red. Ademas el error queda distinguible.
  useEffect(()=>{
   let vivo=true;
   setList(null);setMsg(null);
   api.collaborators(projectId).then(
    r=>{if(vivo)setList(r);},
    e=>{if(vivo){setList([]);setMsg({kind:'err',text:String(e.message||e)});}}
   );
   return ()=>{vivo=false;};
  },[projectId]);

 const run=async(fn:()=>Promise<void>)=>{
  setBusy(true);setMsg(null);
  try{await fn();await load();onChanged?.();}
  catch(e:any){
   let t=String(e.message||e);
   try{const j=JSON.parse(t);if(j.detail)t=j.detail;}catch{}
   setMsg({kind:'err',text:t});
  }finally{setBusy(false);}
 };

 const add=(e:React.FormEvent)=>{
  e.preventDefault();
  void run(async()=>{
   await api.addCollaborator(projectId,{email:email.trim(),role});
   setEmail('');
  });
 };

 const toggle=(c:Collaborator)=>{
  const nuevo=c.role==='editor'?'reader':'editor';
  void run(async()=>{await api.changeCollaboratorRole(projectId,c.user_id,nuevo);});
 };

 const quitar=(c:Collaborator)=>{
  if(!window.confirm(`¿Quitar el acceso de ${c.email}?`))return;
  void run(async()=>{await api.removeCollaborator(projectId,c.user_id);});
 };

 return (
  <section className="share-panel">
   <h3>Compartir proyecto</h3>
   <p className="hint">
    Un <strong>editor</strong> puede modificar el contenido. Un
    <strong> lector</strong> solo puede consultarlo. Tu siempre conservas el
    control total.
   </p>

   {list===null
    ?<p className="hint">Cargando…</p>
    :<ul className="share-list">
     {list.map(c=>(
      <li key={c.user_id}>
       <div className="share-who">
        <strong>{c.name||c.email}</strong>
        <small>{c.email}</small>
       </div>
       <span className={`badge role-${c.role}`}>{ACCESS_LABEL[c.role]}</span>
       {c.role!=='owner'&&(
        <>
         <button onClick={()=>toggle(c)} disabled={busy}>
          {c.role==='editor'?'Pasar a lector':'Pasar a editor'}
         </button>
         <button className="danger" onClick={()=>quitar(c)} disabled={busy}>Revocar</button>
        </>
       )}
      </li>
     ))}
    </ul>}

   <form className="share-add" onSubmit={add}>
    <input type="email" value={email} placeholder="correo del colaborador"
     onChange={e=>setEmail(e.target.value)} required/>
    <select value={role} onChange={e=>setRole(e.target.value as 'editor'|'reader')}>
     <option value="editor">Editor</option>
     <option value="reader">Lector</option>
    </select>
    <button className="primary" disabled={busy||!email.trim()}>Agregar</button>
   </form>

   {msg&&<p className={msg.kind==='ok'?'auth-ok':'auth-err'}>{msg.text}</p>}
  </section>
 );
}
