/**
 * Fase 9D - Vista de ensayo / impresion.
 *
 * Aqui NO hay dibujo ni React: solo se convierte la composicion YA CARGADA en
 * una estructura ordenada y legible. Es una funcion pura a proposito:
 *
 *   - se puede probar sin navegador ni DOM (tests unitarios con `node --test`);
 *   - la misma composicion produce SIEMPRE el mismo resultado, porque se
 *     respeta el orden que ya traen los arrays (`elements` y `positions`) en
 *     lugar de inventar uno;
 *   - no duplica la geometria del lienzo: aqui no hay coordenadas, solo
 *     relaciones (que puesto ocupa quien).
 *
 * No modifica nada: recibe `elements` y devuelve datos.
 */
import type {Element,MarimbaElement,PersonElement} from '../types';

export type RehearsalSlot={
  positionId:string;
  index:number;
  type:string;
  /** Nombre de quien ocupa el puesto, o null si esta vacante. */
  personName:string|null;
  label:string|null;
  comment:string|null;
  vacant:boolean;
};

export type RehearsalMarimba={
  id:string;
  name:string;
  locked:boolean;
  label:string|null;
  comment:string|null;
  width:number;
  height:number;
  slots:RehearsalSlot[];
  occupied:number;
  vacant:number;
};

export type RehearsalUnassigned={
  id:string;
  name:string;
  positionType:string;
  label:string|null;
  comment:string|null;
};

export type Rehearsal={
  marimbas:RehearsalMarimba[];
  unassigned:RehearsalUnassigned[];
  totals:{marimbas:number;slots:number;occupied:number;vacant:number;
         people:number;unassigned:number};
};

const esMarimba=(e:Element):e is MarimbaElement=>e.type==='marimba';
const esPersona=(e:Element):e is PersonElement=>e.type==='person';

export function buildRehearsal(elements:Element[]):Rehearsal{
  const els=Array.isArray(elements)?elements:[];
  // Indice por `personId` de la persona_ELEMENT (no el de la base), que es el
  // que guardan los puestos en `positions[].personId`.
  const porPersona=new Map<number,PersonElement>();
  for(const e of els){
   if(esPersona(e)&&!porPersona.has(e.personId))porPersona.set(e.personId,e);
  }

  const marimbas:RehearsalMarimba[]=[];
  const sinAsignar:RehearsalUnassigned[]=[];
  // Puestos REALES por marimba. Sirve para decidir quien esta de verdad
  // sentado: tener `marimbaId` no basta si el puesto al que apunta ya no existe.
  const puestosReales=new Map<string,Set<string>>();
  for(const e of els){
   if(esMarimba(e))puestosReales.set(e.id,new Set(e.positions.map(p=>p.id)));
  }

  let slots=0,occupied=0,vacant=0;

  for(const e of els){
   if(esMarimba(e)){
    // El orden de los puestos es el del array: es el orden que el usuario ve.
    const lista=e.positions.map((p,i)=>{
     const persona=p.personId!=null?porPersona.get(p.personId):undefined;
     const libre=p.personId==null||!persona;
     slots++;
     if(libre)vacant++;else occupied++;
     return {
      positionId:p.id,
      index:i,
      type:p.type,
      personName:libre?null:persona!.name,
      label:p.note?.label??persona?.note?.label??null,
      comment:p.note?.comment??persona?.note?.comment??null,
      vacant:libre,
     };
    });
    marimbas.push({
     id:e.id,name:e.name,locked:Boolean(e.locked),
     label:e.note?.label??null,comment:e.note?.comment??null,
     width:e.width,height:e.height,
     slots:lista,
     occupied:lista.filter(s=>!s.vacant).length,
     vacant:lista.filter(s=>s.vacant).length,
    });
   }else if(esPersona(e)){
    // Una persona esta "sentada" SOLO si su puesto existe de verdad. Tener
    // `marimbaId` no basta: si el puesto al que apunta ya no esta (se borro, o
    // la referencia se perdio), musicalmente NO esta asignada, y en un ensayo
    // eso tiene que verse. Se comprueba contra los puestos REALES, que se
    // recogieron en la PRIMERA pasada: si no, una persona situada antes que su
    // marimba en el array apareceria como suelta sin motivo.
    const puestos=puestosReales.get(e.marimbaId??'');
    const sentada=!!(e.marimbaId&&e.marimbaPositionId
     &&puestos&&puestos.has(e.marimbaPositionId));
    if(!sentada){
     sinAsignar.push({
      id:e.id,name:e.name,positionType:e.positionType,
      label:e.note?.label??null,comment:e.note?.comment??null,
     });
    }
   }
  }

  return {
   marimbas,unassigned:sinAsignar,
   totals:{
    marimbas:marimbas.length,slots,occupied,vacant,
    people:porPersona.size,unassigned:sinAsignar.length,
   },
  };
}