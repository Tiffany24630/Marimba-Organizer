import {useState} from 'react';
import {api} from '../lib/api';

export type AdminUser={id:number;name:string;email:string;role:string;
 active:boolean;must_change_password:boolean;created_at:string|null};

/**
 * Fase 7C - dashboard de administracion.
 *
 * Solo un administrador llega aqui: el backend rechaza (403) cualquier
 * peticion de un usuario normal aunque se escriba la URL a mano. Ocultar el
 * enlace no es la proteccion, solo la comodidad.
 */
export default function AdminScreen({onBack}:{onBack:()=>void}){
 const [users,setUsers]=useState<AdminUser[]>([]);
 const [q,setQ]=useState('');
 const [msg,setMsg]=useState<{kind:'ok'|'err';text:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [form,setForm]=useState({name:'',email:'',password:''});
 const [loaded,setLoaded]=useState(false);

 const load=async(term:string=q)=>{
  setBusy(true);
  try{
   const r=await api.adminUsers(term);
   setUsers(r.users);setLoaded(true);setMsg(null);
  }catch(e:any){setMsg({kind:'err',text:String(e.message||e)});}
  finally{setBusy(false);}
 };
 // Primera carga al montar.
 if(!loaded&&!busy)void load('');

 const crear=async(e:React.FormEvent)=>{
  e.preventDefault();
  setBusy(true);setMsg(null);
  try{
   await api.adminCreateUser(form);
   setForm({name:'',email:'',password:''});
   setMsg({kind:'ok',text:'Usuario creado. Puede iniciar sesion con esa contrasena.'});
   await load(q);
  }catch(err:any){
   let t=String(err.message||err);
   try{const j=JSON.parse(t);if(j.detail)t=j.detail;}catch{}
   setMsg({kind:'err',text:t});
  }finally{setBusy(false);}
 };

 const toggle=async(u:AdminUser)=>{
  setMsg(null);
  try{
   await api.adminSetActive(u.id,!u.active);
   setMsg({kind:'ok',text:u.active?'Usuario desactivado.':'Usuario reactivado.'});
   await load(q);
  }catch(e:any){
   let t=String(e.message||e);
   try{const j=JSON.parse(t);if(j.detail)t=j.detail;}catch{}
   setMsg({kind:'err',text:t});
  }
 };

 const recuperar=async(u:AdminUser)=>{
  setMsg(null);
  try{
   const r=await api.adminSendReset(u.id);
   setMsg({kind:'ok',text:r.delivered
    ?'Correo de recuperacion enviado.'
    :'Proceso iniciado, pero NO se envio ningun correo: el proveedor no esta '
     +'configurado. Revisa MAIL_PROVIDER y las variables SMTP en el servidor.'});
  }catch(e:any){setMsg({kind:'err',text:String(e.message||e)});}
 };

 return (
  <div className="admin">
   <header className="admin-head">
    <h1>Administración de usuarios</h1>
    <button onClick={onBack}>← Volver a la aplicación</button>
   </header>

   <form className="admin-create" onSubmit={crear}>
    <h2>Crear usuario</h2>
    <div className="row2">
     <label className="field">Nombre
      <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/>
     </label>
     <label className="field">Correo
      <input type="email" value={form.email}
       onChange={e=>setForm({...form,email:e.target.value})} required/>
     </label>
    </div>
    <label className="field">Contraseña inicial
     <input type="password" value={form.password}
      onChange={e=>setForm({...form,password:e.target.value})}
      placeholder="Mínimo 10 caracteres, con letra y número" required/>
    </label>
    <p className="hint">La cuenta se crea como <strong>usuario normal</strong>.
     El rol lo decide el servidor.</p>
    <button className="primary" disabled={busy}>
     {busy?'Guardando…':'Crear usuario'}
    </button>
   </form>

   {msg&&<p className={msg.kind==='ok'?'auth-ok':'auth-err'}>{msg.text}</p>}

   <div className="admin-list">
    <h2>Usuarios registrados</h2>
    <input type="search" value={q} placeholder="Buscar por nombre o correo…"
     onChange={e=>{setQ(e.target.value);void load(e.target.value);}}/>
    <table>
     <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
     <tbody>
      {users.map(u=>(
       <tr key={u.id}>
        <td>{u.name}</td>
        <td>{u.email}</td>
        <td>{u.role}</td>
        <td>{u.active?'Activo':'Inactivo'}</td>
        <td>
         <button onClick={()=>toggle(u)}>{u.active?'Desactivar':'Activar'}</button>{' '}
         <button onClick={()=>recuperar(u)}>Enviar recuperación</button>
        </td>
       </tr>
      ))}
      {users.length===0&&<tr><td colSpan={5} className="muted">Sin usuarios.</td></tr>}
     </tbody>
    </table>
    <p className="hint">El sistema nunca muestra contraseñas: solo guarda su huella.</p>
   </div>
  </div>
 );
}
