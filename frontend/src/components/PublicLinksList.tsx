import {useEffect,useState} from 'react';
import {api} from '../lib/api';
import {estadoLabel,fechaAuditoria,esItemEnlace,type ItemEnlace} from '../lib/publicLinks';

type Fase='carga'|'ok'|'error';

/**
 * Fase 9I - listado AGREGADO de enlaces publicos del propietario.
 *
 * Vista de LECTURA y auditoria: reutiliza `GET /api/public-links`, que ya
 * filtra por propiedad en el servidor. Aqui NO hay «abrir» ni «copiar» ni
 * «revocar»: el token en claro no existe despues de crearlo (solo su huella),
 * la lista no lleva ids internos y revocar sigue siendo cosa del panel
 * individual (`PublicLinkPanel`), que ya lo hacia desde 9E.
 *
 * Los tres estados de la interfaz se distinguen SIEMPRE entre si:
 *  - `carga`  → mensaje con `role="status"` (nunca una lista vacia fingida);
 *  - `error`  → mensaje con `role="alert"` + boton «Reintentar»;
 *  - `ok` sin filas → «No tienes enlaces publicos.» (vacio real, no cargando).
 */
export default function PublicLinksList({id}:{id?:string}){
 const [fase,setFase]=useState<Fase>('carga');
 const [items,setItems]=useState<ItemEnlace[]>([]);
 const [msg,setMsg]=useState('');
 // Contador para «Reintentar»: cambiarlo re-ejecuta el mismo efecto.
 const [intento,setIntento]=useState(0);

 useEffect(()=>{
  let vivo=true;
  setFase('carga');setMsg('');
  api.publicLinksList().then(
   r=>{
    if(!vivo)return;
    // Guard de forma: si la respuesta no es una lista saneada, se trata como
    // vacio en lugar de renderizar filas rotas con campos de mas.
    setItems(Array.isArray(r)?r.filter(esItemEnlace):[]);
    setFase('ok');
   },
   e=>{if(vivo){setMsg(String(e.message||e));setFase('error');}},
  );
  return ()=>{vivo=false;};
 },[intento]);

 if(fase==='carga')
  return <p className="hint" role="status" id={id}>Cargando enlaces…</p>;

 if(fase==='error')
  return (
   <div id={id}>
    <p className="hint warn" role="alert">
     No se pudo cargar el listado de enlaces. Intentalo de nuevo.
    </p>
    <button onClick={()=>setIntento(n=>n+1)}>Reintentar</button>
    {msg&&<span className="visually-hidden">{msg}</span>}
   </div>
  );

 if(items.length===0)
  return <p className="hint" id={id}>No tienes enlaces públicos.</p>;

 return (
  <div id={id}>
   <table className="pl-table">
    <caption>
     Tus composiciones publicadas, con su estado, fecha de creación y caducidad.
    </caption>
    <thead>
     <tr>
      <th scope="col">Proyecto</th>
      <th scope="col">Composición</th>
      <th scope="col">Estado</th>
      <th scope="col">Creado</th>
      <th scope="col">Caducidad</th>
     </tr>
    </thead>
    <tbody>
     {items.map((x,i)=>(
      <tr key={`${x.project_name}|${x.composition_name}|${i}`}>
       <td>{x.project_name}</td>
       <td>{x.composition_name}</td>
       <td><span className="chip">{estadoLabel(x.status)}</span></td>
       <td>{fechaAuditoria(x.created_at,'—')}</td>
       <td>{fechaAuditoria(x.expires_at)}</td>
      </tr>
     ))}
    </tbody>
   </table>
   <p className="hint">
    El listado es solo de auditoría: aquí no se muestran las URL (solo se
    guarda su huella). Para ver o revocar un enlace, ábrelo desde su
    composición.
   </p>
  </div>
 );
}
