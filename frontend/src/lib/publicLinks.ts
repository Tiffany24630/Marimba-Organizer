/**
 * Fase 9I - utilidades del LISTADO agregado de enlaces publicos.
 *
 * Funciones puras, sin navegador ni React: lo que decide como se rotula y
 * formatea cada fila se verifica con `node --test`, igual que `publicLink.ts`
 * en 9E/9G. El estado mismo (`active`/`expired`/`revoked`) lo DERIVA el
 * backend a partir de `revoked_at`/`expires_at`; aqui solo se rotula y se
 * sanea lo que llega por la red.
 */

/** Estados posibles, tal y como los emite `GET /api/public-links`. */
export type EstadoEnlace='active'|'expired'|'revoked';

const ESTADOS:readonly string[]=['active','expired','revoked'];

/** Un elemento del listado. Campos ELEGIDOS: nada de token, hash ni ids. */
export type ItemEnlace={
 project_name:string;
 composition_name:string;
 created_at:string|null;
 expires_at:string|null;
 revoked_at:string|null;
 status:EstadoEnlace;
};

/** Rotulo visible de cada estado. La revocacion manda sobre la expiracion
 *  en el backend; aqui solo se traduce el resultado. */
export function estadoLabel(status:EstadoEnlace):string{
 switch(status){
  case 'active':return 'Activa';
  case 'expired':return 'Expirada';
  case 'revoked':return 'Revocada';
  default:return String(status);
 }
}

/**
 * Fecha legible para auditoria. `null` de `expires_at` = «Sin caducidad»
 * (la convencion 9G); `created_at` nunca llega `null` en la practica, pero
 * por si acaso se rotula con `sinValor` y no con un vacio incomprensible.
 */
export function fechaAuditoria(iso:string|null,
                               sinValor='Sin caducidad'):string{
 if(iso===null||iso===undefined||iso==='')return sinValor;
 const d=new Date(iso);
 if(Number.isNaN(d.getTime()))return sinValor;
 return d.toLocaleString();
}

/**
 * Guard de forma para lo que llega del backend: si un dia el contrato
 * cambiara (o una respuesta de error se colara como lista), la tabla no
 * renderiza filas rotas ni campos inesperados.
 */
export function esItemEnlace(x:unknown):x is ItemEnlace{
 if(typeof x!=='object'||x===null||Array.isArray(x))return false;
 const o=x as Record<string,unknown>;
 if(typeof o.project_name!=='string'||typeof o.composition_name!=='string')
  return false;
 if(ESTADOS.indexOf(String(o.status))<0)return false;
 for(const k of ['created_at','expires_at','revoked_at']){
  if(k in o===false)return false;
  const v=o[k];
  if(v!==null&&typeof v!=='string')return false;
 }
 // Contrato cerrado: ningun campo fuera de los seis declarados.
 const claves=Object.keys(o).sort().join(',');
 return claves==='composition_name,created_at,expires_at,project_name,'+
               'revoked_at,status';
}
