import {useState} from 'react';
import {api} from '../lib/api';

export type Mode='login'|'forgot'|'reset';

/**
 * Fase 7C - pantallas de acceso.
 *
 * La sesion se resuelve SIEMPRE contra el backend (`/auth/me`): esta pantalla
 * no decide quien esta dentro, solo muestra lo que el servidor responde. El
 * token nunca se guarda en localStorage, vive en una cookie HttpOnly.
 */
export default function AuthScreen({onAuthenticated}:{onAuthenticated:()=>void}){
 const [mode,setMode]=useState<Mode>('login');
 const [email,setEmail]=useState('');
 const [password,setPassword]=useState('');
 const [token,setToken]=useState(()=>new URLSearchParams(location.search).get('token')||'');
 const [newPass,setNewPass]=useState('');
 const [msg,setMsg]=useState<{kind:'ok'|'err';text:string}|null>(null);
 const [busy,setBusy]=useState(false);

 const run=async(fn:()=>Promise<void>)=>{
  setBusy(true);setMsg(null);
  try{await fn();}
  catch(e:any){
   // El backend devuelve JSON con `detail`; se muestra el texto tal cual.
   let t=String(e?.message||e);
   try{const j=JSON.parse(t);if(j.detail)t=j.detail;}catch{}
   setMsg({kind:'err',text:t});
  }finally{setBusy(false);}
 };

 const doLogin=()=>run(async()=>{
  await api.login(email.trim(),password);
  setPassword('');
  onAuthenticated();
 });

 const doForgot=()=>run(async()=>{
  const r=await api.forgotPassword(email.trim());
  // Mensaje generico: el servidor nunca dice si la cuenta existe.
  setMsg({kind:'ok',text:r.message});
 });

 const doReset=()=>run(async()=>{
  await api.resetPassword(token,newPass);
  setMsg({kind:'ok',text:'Contrasena actualizada. Ya puedes iniciar sesion.'});
  setMode('login');setToken('');setNewPass('');
 });

 if(mode==='reset')return (
  // 7K: `<main>` real. Antes era un `<div>` suelto y axe pedía la región
  // principal (`landmark-one-main`) y marcaba el contenido como fuera de
  // cualquier región (`region`).
  <main className="auth-wrap">
   <form className="auth-card" onSubmit={e=>{e.preventDefault();doReset();}}>
    <h1>Nueva contrasena</h1>
    <label className="field">Enlace de recuperacion
     <input value={token} onChange={e=>setToken(e.target.value)} required/>
    </label>
    <label className="field">Nueva contrasena
     <input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} required/>
    </label>
    {msg&&<p className={msg.kind==='ok'?'auth-ok':'auth-err'}>{msg.text}</p>}
    <button className="primary" disabled={busy||!token||!newPass}>
     {busy?'Guardando…':'Establecer contrasena'}
    </button>
    <button type="button" onClick={()=>{setMode('login');setMsg(null);}}>Volver</button>
   </form>
  </main>
 );

 if(mode==='forgot')return (
  <main className="auth-wrap">
   <form className="auth-card" onSubmit={e=>{e.preventDefault();doForgot();}}>
    <h1>Recuperar acceso</h1>
    <p className="hint">Escribe tu correo. Si la cuenta existe, recibiras un enlace
     para establecer una nueva contrasena.</p>
    <label className="field">Correo
     <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus/>
    </label>
    {msg&&<p className={msg.kind==='ok'?'auth-ok':'auth-err'}>{msg.text}</p>}
    <button className="primary" disabled={busy||!email.trim()}>
     {busy?'Enviando…':'Enviar enlace'}
    </button>
    <button type="button" onClick={()=>{setMode('login');setMsg(null);}}>Volver</button>
   </form>
  </main>
 );

 return (
  <main className="auth-wrap">
   <form className="auth-card" onSubmit={e=>{e.preventDefault();doLogin();}}>
    <h1>Marimba Organizer</h1>
    <label className="field">Correo
     <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
      required autoFocus autoComplete="username"/>
    </label>
    <label className="field">Contrasena
     <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
      required autoComplete="current-password"/>
    </label>
    {msg&&<p className="auth-err">{msg.text}</p>}
    <button className="primary" disabled={busy||!email.trim()||!password}>
     {busy?'Entrando…':'Iniciar sesion'}
    </button>
    <button type="button" className="link" onClick={()=>{setMode('forgot');setMsg(null);}}>
     Olvide mi contrasena
    </button>
   </form>
  </main>
 );
}
