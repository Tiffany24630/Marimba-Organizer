import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import RehearsalView from '../components/RehearsalView';
import type {Element} from '../types';

type Datos={name:string;width:number;height:number;
            data:{elements?:Element[]};
            song_name:string|null;project_name:string|null};

/**
 * Fase 9E - pagina del enlace PUBLICO de solo lectura.
 *
 * Se renderiza SIN sesion y fuera de `App` (ver `App.tsx`): un visitante no
 * debe pasar por el login ni ver la barra de sesion.
 *
 * Decisiones:
 *  - La lectura es un UNICO GET con el token. No hay polling ni websockets:
 *    lo que se ve es el estado PERSISTIDO en el momento de abrir el enlace.
 *  - Cualquier fallo (token inexistente, revocado, composicion borrada,
 *    red caida) muestra el MISMO mensaje: ni el error del servidor ni el
 *    token se reflejan aqui.
 *  - La proyeccion es la MISMA de la vista de ensayo (9D): HTML semantico,
 *    sin controles de edicion y imprimible. El lienzo Konva del editor NO se
 *    reutiliza porque arrastra el store editable.
 */
export default function PublicComposition({token}:{token:string}){
 const [datos,setDatos]=useState<Datos|null>(null);
 const [error,setError]=useState(false);
 // Fase 9J: el GET publico puede responder 429 (rate-limit por IP). El fetch
 // central (`api.ts`) propaga el cuerpo como mensaje, asi que se detecta por
 // contenido y se muestra un aviso minimo y accesible, sin IP, contadores,
 // limites internos ni token.
 const [limitado,setLimitado]=useState(false);

 useEffect(()=>{
  let vivo=true;
  setDatos(null);setError(false);setLimitado(false);
  api.publicComposition(token).then(
   r=>{if(vivo)setDatos(r);},
   (e:unknown)=>{
    if(!vivo)return;
    const msg=String((e as {message?:unknown}).message||e||'');
    if(/demasiadas solicitudes/i.test(msg))setLimitado(true);
    else setError(true);
   },
  );
  return ()=>{vivo=false;};
 },[token]);

 if(limitado){
  return (
   <main className="pub-page pub-error">
    <h1>Demasiadas solicitudes</h1>
    <p>Demasiadas solicitudes. Inténtalo de nuevo en unos momentos.</p>
   </main>
  );
 }

 if(error){
  return (
   <main className="pub-page pub-error">
    <h1>Este enlace no funciona</h1>
    <p>El enlace no es valido, ha sido revocado o la composicion ya no existe.</p>
    <p className="hint">Pide a quien lo compartio que genere uno nuevo.</p>
   </main>
  );
 }

 if(!datos){
  return <main className="pub-page pub-error"><p>Cargando…</p></main>;
 }

 const elements=Array.isArray(datos.data?.elements)?datos.data.elements!:[];
 return (
  <main className="pub-page">
   {/* Aviso de solo lectura. Fuera de la vista de ensayo y NO impreso:
       `pub-page .rehearsal` deja de ser capa superpuesta para que este aviso
       no quede debajo. */}
   <header className="pub-banner no-print">
    <strong>Solo lectura</strong>
    <span>
     {datos.project_name?`${datos.project_name} · `:''}
     Compartida sin cuenta; no se puede editar.
    </span>
   </header>
   <RehearsalView elements={elements} compName={datos.name}
     songName={datos.song_name} kicker="Composición compartida"/>
  </main>
 );
}