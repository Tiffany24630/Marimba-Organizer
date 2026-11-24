import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {publicUrl,toExpiresAt} from '../lib/publicLink';

type Estado={active:boolean;created_at:string|null;revoked_at:string|null;expires_at:string|null;expired?:boolean};

/**
 * Fase 9E - enlace publico de SOLO LECTURA (seccion del panel «Paneles»).
 *
 * Como en 9D, va en el panel lateral y NO en la barra del editor: alla
 * cualquier boton nuevo altera el orden de foco y rompe la confirmacion por
 * `blur` de `Numero` (regresion documentada en FASE_9D).
 *
 * Solo se muestra al PROPIETARIO. Ocultar no protege: el backend rechaza por
 * igual a editor y reader. Esto solo refleja lo que el servidor permite.
 *
 * La URL solo puede mostrarse AL CREARLA: en la base unicamente vive su
 * huella (SHA-256), no el token. Si se pierde, hay que revocar y crear otra;
 * eso es asi a proposito y se explica en la propia interfaz.
 */
export default function PublicLinkPanel({compositionId}:{compositionId:number}){
 const [estado,setEstado]=useState<Estado|null>(null);
 /** Token recien creado: la unica vez que la URL existe para mostrarla. */
 const [token,setToken]=useState<string|null>(null);
 const [copiado,setCopiado]=useState(false);
 const [msg,setMsg]=useState<{kind:'ok'|'err';text:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [expira,setExpira]=useState('');

 useEffect(()=>{
  let vivo=true;
  setEstado(null);setToken(null);setMsg(null);setCopiado(false);
  api.publicLink(compositionId).then(
   r=>{if(vivo)setEstado(r);},
   e=>{if(vivo)setMsg({kind:'err',text:String(e.message||e)});},
  );
  return ()=>{vivo=false;};
 },[compositionId]);

 const run=async(fn:()=>Promise<void>)=>{
  setBusy(true);setMsg(null);
  try{await fn();}
  catch(e:any){
   let t=String(e.message||e);
   try{const j=JSON.parse(t);if(j.detail)t=String(j.detail);}catch{}
   setMsg({kind:'err',text:t});
  }finally{setBusy(false);}
 };

 const crear=()=>void run(async()=>{
  // 9G: caducidad OPCIONAL. Vacio = sin caducidad (9E intacto). El
  // `datetime-local` entrega hora local sin zona; `toExpiresAt` lo valida y lo
  // normaliza a ISO UTC. El backend lo revalida (rechaza pasado con 422).
  const exp=toExpiresAt(expira);
  const r=await api.createPublicLink(compositionId,exp);
  setToken(r.token);
  setEstado({active:true,created_at:r.created_at,revoked_at:null,
             expires_at:r.expires_at??null});
  setCopiado(false);
 });

 const revocar=()=>{
  if(!window.confirm(
   '¿Revocar el enlace publico? La URL actual dejara de funcionar de inmediato.'
  ))return;
  void run(async()=>{
   const r=await api.revokePublicLink(compositionId);
   setToken(null);
   setEstado({active:false,created_at:estado?.created_at??null,
              revoked_at:r.revoked_at,expires_at:estado?.expires_at??null});
   setCopiado(false);
  });
 };

 const url=token?publicUrl(window.location.origin,token):null;

 const copiar=async()=>{
  if(!url)return;
  try{
   await navigator.clipboard.writeText(url);
   setCopiado(true);
   setMsg({kind:'ok',text:'Enlace copiado al portapapeles.'});
  }catch{
   setCopiado(false);
   setMsg({kind:'err',text:'No se pudo copiar: selecciona la URL y copiala a mano.'});
  }
 };

 return (
  <section className="link-panel">
   <h3>Enlace publico</h3>
   <p className="hint">
    Cualquier persona con el enlace puede VER la composicion en modo consulta,
    sin cuenta y sin poder editarla. Solo tu, como propietario, puedes crearlo
    o revocarlo.
   </p>

   {estado===null&&!msg&&<p className="hint">Cargando…</p>}

   {estado?.active&&(
    <div className="link-box">
     {url
      ?<>
        <label htmlFor="public-link-url">Enlace (solo se muestra al crearlo)</label>
        <input id="public-link-url" readOnly value={url}
         onFocus={e=>e.currentTarget.select()}/>
        <div className="link-actions">
         <button onClick={()=>void copiar()} disabled={busy}>
          {copiado?'Copiado ✓':'Copiar enlace'}
         </button>
         <button className="danger" onClick={revocar} disabled={busy}>
          Revocar
         </button>
        </div>
       </>
      :<>
        <p className="hint">
         El enlace esta activo, pero su URL ya no se puede volver a mostrar:
         solo se guarda la huella. Si la perdiste, revocalo y crea otro nuevo.
        </p>
        <button className="danger" onClick={revocar} disabled={busy}>
         Revocar enlace
        </button>
       </>}
     {estado.created_at&&(
      <p className="hint">
       Creado el {new Date(estado.created_at).toLocaleString()}{estado.expires_at&&` · expira el ${new Date(estado.expires_at).toLocaleString()}`}
      </p>)}
    </div>
   )}

   {estado&&!estado.active&&(
    <div className="link-box">
     <p className="hint">
      {estado.revoked_at
       ?`Revocado el ${new Date(estado.revoked_at).toLocaleString()}: la URL anterior ya no funciona.`
       :'Sin enlace activo.'}
     </p>
      <label htmlFor="public-link-expira">Caduca (opcional)</label>
      <input id="public-link-expira" type="datetime-local" value={expira}
       onChange={e=>setExpira(e.target.value)} disabled={busy}
       aria-describedby="public-link-expira-ayuda"/>
      <p className="hint" id="public-link-expira-ayuda">Vacio = sin caducidad (como hasta ahora).</p>
     <button className="primary" onClick={crear} disabled={busy}>
      Crear enlace publico
     </button>
    </div>
   )}

   {msg&&<p className={msg.kind==='ok'?'auth-ok':'auth-err'}>{msg.text}</p>}
  </section>
 );
}