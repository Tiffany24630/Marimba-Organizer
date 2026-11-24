/**
 * Fase 7B.3 - nombres de archivo y utilidades de exportacion masiva.
 *
 * Se separan del componente de React para poder probarlos sin navegador: lo
 * unico que necesita el navegador es el renderizado (Konva) y la descarga.
 */
import type {Element,MarimbaElement} from '../types';
import {seatScale,slotRect} from './layout';

/** Caracteres no permitidos en Windows/macOS/Linux, mas el control. */
// eslint-disable-next-line no-control-regex
const INVALID=/[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Convierte un texto en un nombre de archivo seguro y legible.
 * - Sustituye caracteres invalidos porguiones.
 * - Colapsa espacios y quita puntos/espacios del final (invalidos en Windows).
 * - Nunca devuelve vacio ni un nombre reservado.
 */
export function safeFileName(raw:unknown,fallback='sin-nombre'):string{
 let s=typeof raw==='string'?raw:'';
 s=s.replace(INVALID,'-').replace(/\s+/g,' ').trim();
 s=s.replace(/[. ]+$/,'').replace(/^[. ]+/,'');
 if(!s)s=fallback;
 if(RESERVED.test(s))s=`_${s}`;
 // Limite conservador: 120 caracteres deja sitio para el sufijo y la extension.
 return s.length>120?s.slice(0,120).trimEnd():s;
}

/**
 * Nombre unico para una imagen. Añade un indice y, si dos Composiciones se
 * llaman igual, un discriminante para no sobrescribir ficheros.
 */
export function imageFileName(opts:{index:number;total:number;song?:string|null;composition?:string|null}):string{
 const {index,total,song,composition}=opts;
 const parts:string[]=[];
 if(song)parts.push(safeFileName(song,'cancion'));
 if(composition)parts.push(safeFileName(composition,'composicion'));
 // El indice va SIEMPRE: garantiza unicidad aunque dos composiciones coincidan.
 const tag=String(index+1).padStart(String(total).length,'0');
 parts.push(tag);
 return `${parts.join(' - ')}.png`;
}

/** Recorta un texto largo para la rotulacion de la imagen. */
export function captionText(raw:unknown,max=42):string{
 const s=(typeof raw==='string'?raw:'').replace(/\s+/g,' ').trim();
 if(!s)return '';
 return s.length>max?s.slice(0,max-1).trimEnd()+'…':s;
}

/**
 * Caja REAL de un elemento tal y como se dibuja (ver `lib/render.ts`).
 *
 * No se reutiliza `elementBBox` a proposito: para una persona ASIGNADA esa
 * funcion devuelve la caja en coordenadas locales de la persona (x - w/2), sin
 * sumar la posicion de la marimba. Usarla para el encuadre meteria espacio en
 * blanco sobrante en la imagen exportada. Aqui se calcula la caja que de
 * verdad ocupa cada nodo.
 */
function drawnBox(e:Element,marimba?:MarimbaElement){
 if(e.type==='marimba'||!e.marimbaId||!marimba){
  const w=e.width*(e.scaleX||1),h=e.height*(e.scaleY||1);
  // Rotacion: caja envolvente del rectangulo girado.
  const rad=(e.rotation||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);
  const pts=[[0,0],[w,0],[w,h],[0,h]].map(([X,Y])=>({x:e.x+X*c-Y*s,y:e.y+X*s+Y*c}));
  const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
  return {x:Math.min(...xs),y:Math.min(...ys),
   width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 }
 const idx=marimba.positions.findIndex(p=>p.id===e.marimbaPositionId);
 if(idx<0){
  const w=e.width*(e.scaleX||1),h=e.height*(e.scaleY||1);
  return {x:e.x,y:e.y,width:w,height:h};
 }
 // Sentada: se dibuja centrada en su puesto, escalada por `seatScale`.
 const k=seatScale(marimba,idx);
 const r=slotRect(marimba,idx);
 const w=(r.width-6)*k,h=(r.height-6)*k;
 const cx=marimba.x+r.x+w/2+3,cy=marimba.y+r.y+h/2+3;
 return {x:cx-w/2,y:cy-h/2,width:w,height:h};
}

/**
 * Encuadre de una composicion: caja que contiene TODOS sus elementos.
 * Devuelve null si la composicion esta vacia (no se dibuja nada).
 */
export function compositionBounds(elements:Element[],pad=48){
 const els=Array.isArray(elements)?elements:[];
 if(!els.length)return null;
 const marimbas=els.filter((x):x is MarimbaElement=>x.type==='marimba');
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const e of els){
  const m=e.type==='person'&&e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
  const b=drawnBox(e,m);
  minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);
  maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height);
 }
 if(!Number.isFinite(minX)||!Number.isFinite(minY))return null;
 const width=Math.ceil(Math.max(1,maxX-minX+pad*2));
 const height=Math.ceil(Math.max(1,maxY-minY+pad*2));
 return {x:pad-minX,y:pad-minY,width,height,pad};
}

export type ExportItem={index:number;song:string|null;composition:string;elements:Element[]};

/** Descarga un dataURL y libera el objeto temporal. */
export function downloadDataUrl(url:string,filename:string):void{
 const a=document.createElement('a');
 a.href=url;a.download=filename;
 document.body.appendChild(a);
 a.click();
 a.remove();
}
