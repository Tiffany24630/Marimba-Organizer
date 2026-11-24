/**
 * Fase 7B.1 - anotaciones (etiquetas y comentarios).
 *
 * Se guardan DENTRO del elemento que describen, no en un store aparte. Asi:
 *  - se persisten con la composicion (ya se guarda `data.elements`);
 *  - se borran solas cuando el elemento se elimina (no dejan huerfanos);
 *  - se copian al duplicar una composicion, como el resto del contenido.
 * No requiere tocar la base de datos ni migraciones.
 */
import type {Element,Note} from '../types';

export const LABEL_MAX=24;
export const COMMENT_MAX=280;

/** Limpia un texto: recorta y colapsa espacios. Devuelve '' si queda vacio. */
export function cleanText(raw:unknown,max:number):string{
 // Se acepta un numero (p.ej. una etiqueta "1"), pero no un objeto ni null:
 // cualquier otra cosa se descarta en vez de romper el lienzo.
 const s=(typeof raw==='string')?raw:(typeof raw==='number'&&Number.isFinite(raw)?String(raw):'');
 if(!s)return '';
 // Colapsa espacios/tabuladores y quita saltos de linea que romperian el lienzo.
 const t=s.replace(/\s+/g,' ').trim();
 if(!t)return '';
 return t.length>max?t.slice(0,max-1).trimEnd()+'…':t;
}

export const cleanLabel=(raw:unknown)=>cleanText(raw,LABEL_MAX);
export const cleanComment=(raw:unknown)=>cleanText(raw,COMMENT_MAX);

/**
 * Normaliza un par etiqueta/comentario. Si ambos quedan vacios devuelve
 * `undefined` para no dejar objetos vacios guardados en la composicion.
 */
export function normalizeNote(raw:unknown):Note|undefined{
 if(!raw||typeof raw!=='object')return undefined;
 const r=raw as Record<string,unknown>;
 const label=cleanLabel(r.label);
 const comment=cleanComment(r.comment);
 if(!label&&!comment)return undefined;
 const n:Note={};
 if(label)n.label=label;
 if(comment)n.comment=comment;
 return n;
}

/** Une un note existente con un par nuevo y lo normaliza. */
export function mergeNote(prev:unknown,patch:{label?:unknown;comment?:unknown}):Note|undefined{
 const base=(prev&&typeof prev==='object'?prev:{}) as Record<string,unknown>;
 return normalizeNote({
  label:'label' in patch?patch.label:base.label,
  comment:'comment' in patch?patch.comment:base.comment,
 });
}

export const hasNote=(n:Note|undefined|null):boolean=>!!(n&&(n.label||n.comment));
export const hasAnyNote=(els:Element[]):boolean=>els.some(e=>
 hasNote(e.note)||(e.type==='marimba'&&e.positions.some(p=>hasNote(p.note))));

/** Texto corto para el chip del lienzo (una linea, sin partir palabras). */
export function chipText(label:string,max=12):string{
 if(label.length<=max)return label;
 const cut=label.slice(0,max);
 const sp=cut.lastIndexOf(' ');
 return (sp>max/2?cut.slice(0,sp):cut)+'…';
}

/** Cuantas lineas de comentario caben en un alto dado sin tapar el elemento. */
export function commentLines(height:number,lineHeight=11):number{
 return Math.max(1,Math.min(3,Math.floor((height-6)/lineHeight)));
}
