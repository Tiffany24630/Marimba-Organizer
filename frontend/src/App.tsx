import {useCallback,useEffect,useState} from 'react';
import Dashboard from './pages/Dashboard';
import Project from './pages/Project';
import PublicComposition from './pages/PublicComposition';
import ConfirmProvider from './components/ConfirmModal';
import AuthScreen from './components/AuthScreen';
import AdminScreen from './components/AdminScreen';
import {api} from './lib/api';
import {parsePublicPath} from './lib/publicLink';
import './styles.css';

export type Session={id:number;name:string;email:string;role:string;active:boolean};
type View='app'|'admin';

/**
 * Fase 7C - puerta de entrada de la aplicacion.
 *
 * Al arrancar se consulta SIEMPRE `/auth/me`. La autoridad es el backend: si la
 * sesion caduco, el servidor responde 401 y aqui se vuelve al login. No se
 * guarda nada en localStorage, asi que no se puede "quedarse dentro" sin una
 * sesion real del servidor.
 */
export default function App(){
 const [user,setUser]=useState<Session|null>(null);
 const [ready,setReady]=useState(false);
 const [view,setView]=useState<View>('app');
 const [project,setProject]=useState<number>();

 const check=useCallback(async()=>{
  try{
   const r=await api.me();
   setUser(r.user);
  }catch{
   // Sin sesion valida: se limpia el estado de la sesion anterior, para no
   // mostrar datos de otro usuario al cambiar de cuenta.
   setUser(null);setProject(undefined);setView('app');
  }finally{setReady(true);}
 },[]);

 useEffect(()=>{void check();},[check]);

 // 9E: el enlace PUBLICO se decide ANTES de mirar la sesion. Un visitante sin
 // cuenta no debe esperar a `/auth/me` ni ver la pantalla de acceso: la ruta
 // `/public/compositions/<token>` renderiza la pagina de solo lectura y ya.
 // No hay enrutador en la app (la vista es estado); esto es toda la "ruta".
 const tokenPublico=parsePublicPath(window.location.pathname);
 if(tokenPublico)return <PublicComposition token={tokenPublico}/>;

 if(!ready)return <div className="auth-wrap"><p>Cargando…</p></div>;

 if(!user)return <AuthScreen onAuthenticated={()=>{void check();}}/>;

 const salir=async()=>{
  try{await api.logout();}catch{/* se cierra igual: la cookie se limpia */}
  setUser(null);setProject(undefined);
 };

 if(view==='admin'&&user.role==='admin'){
  return <AdminScreen onBack={()=>setView('app')}/>;
 }

 const barra=(
  // 7K: era un `<div>` y axe marcaba su contenido como fuera de cualquier
  // región (`region`). `<header>` en este nivel ES la región `banner`, que es
  // exactamente lo que es: la cabecera de la aplicación.
  <header className="session-bar">
   <span>{user.name} · {user.role}</span>
   {user.role==='admin'&&(
    <button onClick={()=>setView('admin')}>Administración</button>
   )}
   <button onClick={salir}>Cerrar sesión</button>
  </header>
 );

 return (
  <ConfirmProvider>
   {barra}
   {project
    ?<Project id={project} onBack={()=>setProject(undefined)}/>
    :<Dashboard open={setProject}/>}
  </ConfirmProvider>
 );
}
