/**
 * Fase 7B.3 - dibujo de una composicion para la exportacion masiva.
 *
 * Usa EXACTAMENTE las mismas reglas geometricas que `CanvasEditor`
 * (`slotRect`, `seatScale`, `elementBBox`), para que la imagen descargada sea
 * identica a lo que el usuario ve en pantalla. Se dibuja con Konva "plano"
 * (sin React) porque se instancia y se destruye por composicion.
 */
import Konva from 'konva';
import type {Element,MarimbaElement} from '../types';
import {seatScale,slotRect} from './layout';
import {chipText,hasNote} from './notes';

const BGC='#111827';

export function drawElements(g:Konva.Group,els:Element[]){
 const list=Array.isArray(els)?els:[];
 if(!list.length)return;
 const marimbas=list.filter((x):x is MarimbaElement=>x.type==='marimba');
 // Primero las marimbas y despues las personas: las personas quedan encima,
 // igual que en el editor.
 for(const e of list){
  if(e.type==='marimba')drawMarimba(g,e);
 }
 for(const e of list){
  if(e.type!=='person')continue;
  const m=e.marimbaId?marimbas.find(x=>x.id===e.marimbaId):undefined;
  drawPerson(g,e,m);
 }
}

function drawMarimba(g:Konva.Group,m:MarimbaElement){
 g.add(new Konva.Rect({x:m.x,y:m.y,width:m.width,height:m.height,
  fill:'#1f2937',stroke:'#0f172a',strokeWidth:1,cornerRadius:12}));
 g.add(new Konva.Text({text:m.name,x:m.x+8,y:m.y+10,width:m.width-16,
  align:'center',fontSize:17,fontStyle:'bold',fill:'#ffffff'}));
 g.add(new Konva.Text({text:`${m.positions.length} puesto${m.positions.length===1?'':'s'}`,
  x:m.x+8,y:m.y+33,width:m.width-16,align:'center',fontSize:10,fill:'#9ca3af'}));

 // 7B.1: las anotaciones visibles tambien salen en la imagen exportada.
 if(hasNote(m.note)){
  if(m.note?.label){
   const t=chipText(m.note.label);
   const w=t.length*6.4+8;
   g.add(new Konva.Rect({x:m.x+8,y:m.y+46,width:w,height:15,cornerRadius:7,fill:'#0ea5e9'}));
   g.add(new Konva.Text({text:t,x:m.x+12,y:m.y+48,fontSize:10,fontStyle:'bold',fill:'#ffffff'}));
  }
  if(m.note?.comment){
   g.add(new Konva.Text({text:m.note.comment,x:m.x+8,y:m.y+62,width:m.width-16,
    fontSize:9,fill:'#93c5fd',height:24,ellipsis:true,wrap:'word'}));
  }
 }

 m.positions.forEach((p,i)=>{
  const r=slotRect(m,i);
  g.add(new Konva.Rect({x:m.x+r.x,y:m.y+r.y,width:r.width,height:r.height,
   fill:p.personId?'#14532d':'#374151',
   stroke:p.personId?'#22c55e':'#4b5563',strokeWidth:1,cornerRadius:6}));
  g.add(new Konva.Text({text:p.type,x:m.x+r.x,y:m.y+r.y+5,width:r.width,
   align:'center',fontSize:11,fill:'#d1d5db'}));
  g.add(new Konva.Text({text:String(i),x:m.x+r.x+3,y:m.y+r.y+r.height-13,
   fontSize:9,fill:'#9ca3af'}));
  if(hasNote(p.note)){
   g.add(new Konva.Circle({x:m.x+r.x+r.width-7,y:m.y+r.y+6,radius:3.5,fill:'#0ea5e9'}));
  }
 });
}

function drawPerson(g:Konva.Group,e:Element&{type:'person'},m?:MarimbaElement){
 const idx=m?m.positions.findIndex(p=>p.id===e.marimbaPositionId):-1;
 const assigned=!!m&&idx>=0;
 // Misma regla que PersonNode: la persona sentada se escala con `seatScale`.
 const k=assigned&&m?seatScale(m,idx):1;
 const r=assigned&&m?slotRect(m,idx):null;
 const w=(assigned&&r?r.width-6:e.width)*k;
 const h=(assigned&&r?r.height-6:e.height)*k;
 const x=assigned&&r&&m?m.x+r.x+w/2+3:e.x;
 const y=assigned&&r&&m?m.y+r.y+h/2+3:e.y;

 g.add(new Konva.Rect({x,y,width:w,height:h,fill:'#374151',
  stroke:'#22c55e',strokeWidth:1,cornerRadius:6}));
 g.add(new Konva.Text({text:e.name,x:x+3,y:y+4,width:Math.max(1,w-6),height:Math.max(1,h-8),
  align:'center',fontSize:w<120?11:14,fill:'#ffffff',ellipsis:true,wrap:'word'}));

 if(hasNote(e.note)&&e.note?.label){
  const t=chipText(e.note.label);
  const cw=t.length*5.2+6;
  g.add(new Konva.Rect({x:x+w-cw-2,y:y+2,width:cw,height:11,cornerRadius:5,fill:'#0ea5e9'}));
  g.add(new Konva.Text({text:t,x:x+w-cw+1,y:y+3,fontSize:8,fontStyle:'bold',fill:'#ffffff'}));
 }
}

export {BGC};
