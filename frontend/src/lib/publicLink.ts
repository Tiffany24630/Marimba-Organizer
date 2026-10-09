/**
 * Fase 9E - utilidades del enlace PUBLICO de solo lectura.
 *
 * Funciones puras, sin navegador ni React, para que lo que decide QUE se
 * renderice (la ruta) se pueda verificar con `node --test`.
 */
const PREFIX='/public/compositions/';

/**
 * Extrae el token de una ruta. Devuelve `null` si la ruta NO es la publica.
 *
 * Reglas, deliberadamente estrictas:
 *  - solo EXACTAMENTE `/public/compositions/<token>`: nada de subrutas,
 *    barras dobles ni tokens vacios;
 *  - el token solo acepta caracteres de `secrets.token_urlsafe`
 *    (`A-Za-z0-9_-`), que es lo unico que genera el backend. Cualquier otra
 *    cosa (espacios, `%`, barras) se descarta AQUI y no llega ni a la red.
 */
export function parsePublicPath(pathname:string):string|null{
  if(typeof pathname!=='string'||!pathname.startsWith(PREFIX))return null;
  const token=pathname.slice(PREFIX.length);
  if(!token)return null;
  if(!/^[A-Za-z0-9_-]+$/.test(token))return null;
  return token;
}

/** URL absoluta del enlace: para mostrarla y copiarla. */
export function publicUrl(origin:string,token:string):string{
  return `${origin.replace(/\/+$/,'')}${PREFIX}${token}`;
}

/**
 * Fase 9G - normaliza el valor de un `<input type="datetime-local">` a ISO UTC
 * para enviarlo al backend como `expires_at`.
 *
 * Devuelve `null` si el campo esta VACIO (sin caducidad: comportamiento 9E).
 * Lanza `Error` si la fecha no es valida o no esta en el futuro; el panel lo
 * muestra como error accesible sin tocar la red.
 *
 * Es pura a proposito: se verifica con `node --test` sin navegador ni React.
 *
 * `ahora` solo existe para los tests (frontera `<= now` determinista); en la
 * app siempre es `Date.now()`.
 */
export function toExpiresAt(valor:string,ahora:number=Date.now()):string|null{
  if(!valor||!valor.trim())return null;
  const d=new Date(valor);
  if(Number.isNaN(d.getTime()))throw new Error('La fecha de expiración no es válida.');
  if(d.getTime()<=ahora)throw new Error('La fecha de expiración debe estar en el futuro.');
  return d.toISOString();
}