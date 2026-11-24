// Fase 7Q - suite geometrica de 20 escenarios (G01..G20).
//
// QUE PRUEBA ESTA SUITE
// ---------------------
// El comportamiento GEOMETRICO QUE YA EXISTE hoy en `src/store/composition.ts`
// y `src/lib/layout.ts`. No prueba `resizeMarimba`, que todavia NO existe.
//
// Objetivo: dejar fijadas las invariantes que una implementacion futura de
// `resizeMarimba` NO PUEDE romper.
//
// IMPORTANTE - LECTURA HONESTA DE LOS ESCENARIOS G04..G09
// ------------------------------------------------------
// Al inspeccionar el codigo se comprobo que `update()` NO valida dimensiones:
// acepta cualquier `width`/`height` (NaN, Infinity, negativo, cero). Tampoco
// hay un minimo de ancho en ningun sitio: `addPosition` solo ENSANCHA con
// `Math.max(e.width, needed)` y nunca rechaza.
//
// Por eso los escenarios de rechazo (G04..G09) documentan la REALIDAD ACTUAL
// --hoy `update` los ACEPTA-- y, sobre todo, la consecuencia geometrica que
// hace obvio por que `resizeMarimba` debera rechazarlos. Esos tests fallen si
// una implementacion futura acepta un valor invalido, que es justo lo que
// tienen que detectar. No se afirma un rechazo que el sistema no hace.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(
 ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
 }).outputText,file);

const mod=require('../src/store/composition.ts');
const store=mod.useComposition;
const {setReadOnly,isReadOnly}=mod;
const layout=require('../src/lib/layout.ts');
const {MARIMBA_DEFAULT,slotRect,slotCenter}=layout;

const S=()=>store.getState();

// --- Constantes geometricas REALES (verificadas en lib/layout.ts) --------
const PAD=MARIMBA_DEFAULT.pad;          // 14
const GAP=MARIMBA_DEFAULT.gap;          // 10
const SLOT_H=MARIMBA_DEFAULT.slotH;     // 54
const SLOT_Y=MARIMBA_DEFAULT.slotY;     // 56
const MIN_SLOT_W=MARIMBA_DEFAULT.minSlotW; // 104
const DEF_W=MARIMBA_DEFAULT.width;      // 380
const DEF_H=MARIMBA_DEFAULT.height;     // 150

/**
 * Ancho minimo para `n` puestos.
 * Misma expresion que `addPosition` (composition.ts:412) y `addMarimba`
 * (composition.ts:327), leida de las constantes compartidas: no se duplica
 * una formula distinta ni se fijan numeros a mano.
 */
const needed=n=>2*PAD+n*MIN_SLOT_W+(n-1)*GAP;

/** Ancho de un puesto segun `slotRect`, la unica regla de verdad del lienzo. */
const anchoPuesto=(m,i)=>slotRect(m,i).width;

// --- Utilidades de inspeccion -------------------------------------------
const byId=id=>S().elements.find(e=>e.id===id);
const marimba=id=>byId(id);
const persona=id=>byId(id);
const asignados=id=>byId(id).marimbaId!==null;
const idxDe=pe=>{
  const m=marimba(pe.marimbaId);
  return m.positions.findIndex(p=>p.id===pe.marimbaPositionId);
};
const firma=()=>JSON.stringify(S().elements);
const hist=()=>S().history.length;
const idsTodos=()=>JSON.stringify({
  elementos:S().elements.map(e=>e.id),
  puestos:S().elements.filter(e=>e.type==='marimba').flatMap(m=>m.positions.map(p=>p.id)),
  asignaciones:S().elements.filter(e=>e.type==='person')
   .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]),
});

/**
 * Composicion de prueba AISLADA. No toca datos reales: son objetos en memoria.
 * Las personas se asientan con la ACCION REAL del store (`assign`), que es la
 * que fija la invariante de centrado, en lugar de escribir x/y a mano.
 */
function seed(){
  setReadOnly(false);
  S().setElements([
   {id:'m1',type:'marimba',name:'M1',x:200,y:150,width:900,height:150,
    positions:[{id:'s1',type:'Primera'},{id:'s2',type:'Segunda'},{id:'s3',type:'Centro'}]},
   {id:'m2',type:'marimba',name:'M2',x:900,y:600,width:600,height:150,
    positions:[{id:'t1',type:'Primera'}]},
   {id:'p1',type:'person',name:'Ana',personId:1,positionType:'Primera'},
   {id:'p2',type:'person',name:'Luis',personId:2,positionType:'Segunda'},
   {id:'p3',type:'person',name:'Sara',personId:3,positionType:'Primera'},
  ]);
  S().assign('p1','m1','s1');
  S().assign('p2','m1','s2');
  // `setElements` sobre el estado ya asentado deja el historial limpio sin
  // perder asignaciones ni coordenadas: es la mismavia que usa la app al abrir.
  S().setElements(S().elements);
  assert.equal(hist(),0,'la semilla parte de un historial limpio');
}

// ============================== G00 =====================================
// ARRANQUE MINIMO DEL HARNESS: demuestra que se puede LEER y MODIFICAR una
// composicion de prueba a traves de las APIs reales.

test('G00 el harness lee y modifica una composicion real del store',()=>{
  seed();
  const m=marimba('m1');
  assert.equal(m.width,900);
  assert.equal(m.positions.length,3);
  assert.equal(asignados('p1'),true,'Ana esta sentada');
  assert.equal(asignados('p3'),false,'Sara esta libre');

  S().update('m1',{width:1000});
  assert.equal(marimba('m1').width,1000,'update cambia el ancho');
});
// ---------------------------------------------------------------------------
// BLOQUE 1 - dimensionamiento y limites (G01..G09)
// ---------------------------------------------------------------------------

test('G01 aumentar el ancho cambia el ancho y conserva puestos y asignaciones',()=>{
 seed();
 const idsAntes=idsTodos();
 S().update('m1',{width:1300});
 const m=marimba('m1');
 assert.equal(m.width,1300,'el ancho cambia');
 m.positions.forEach((p,i)=>{
  const r=slotRect(m,i);
  assert.ok(r.x>=0,`el puesto ${i} no se sale por la izquierda`);
  assert.ok(r.x+r.width<=m.width+1e-9,`el puesto ${i} no se sale por la derecha`);
 });
 assert.equal(m.positions.length,3,'no se pierde ningun puesto');
 assert.equal(idsTodos(),idsAntes,'asignaciones y IDs intactos');
});

test('G02 cambiar el alto no reposiciona los puestos: slotH es constante',()=>{
 seed();
 const ysAntes=marimba('m1').positions.map((p,i)=>slotRect(marimba('m1'),i).y);
 const p1Antes={x:persona('p1').x,y:persona('p1').y};
 S().update('m1',{height:400});
 const m=marimba('m1');
 assert.equal(m.height,400,'el alto cambia');
 assert.deepEqual(m.positions.map((p,i)=>slotRect(m,i).y),ysAntes,
  'slotY no depende de m.height');
 assert.equal(slotRect(m,0).height,SLOT_H,'slotH sigue constante');
 assert.equal(slotRect(m,0).y,SLOT_Y,'slotY sigue constante');
 // `update` -> `withCascade` NO toca x/y: la persona no se mueve.
 assert.deepEqual({x:persona('p1').x,y:persona('p1').y},p1Antes,
  'con alto constante la persona sentada no se desplaza');
});

test('G03 el ancho minimo exacto produce puestos de minSlotW',()=>{
 seed();
 const w=needed(3);
 assert.equal(w,2*PAD+3*MIN_SLOT_W+2*GAP,'la.formula es la de addPosition');
 const m={...marimba('m1'),width:w};
 m.positions.forEach((p,i)=>assert.equal(slotRect(m,i).width,MIN_SLOT_W,
  `el puesto ${i} mide exactamente minSlotW`));
 // La regla real: `addPosition` ensancha hasta `needed` y nunca encoge.
 S().addPosition('m1','Cuarta');
 assert.ok(marimba('m1').width>=needed(4),
  'addPosition mantiene el minimo al anadir un puesto');
});

test('G04 un ancho por debajo del minimo se RECHAZA (7V)',()=>{
 seed();
 // 7Q lo escribio como BRECHA: `update` aceptaba needed(3)-1 y dejaba el puesto
 // por debajo de minSlotW. 7V cierra esa deuda y `update` ya lo rechaza.
 const w=needed(3)-1;
 const firmaAntes=firma(),histAntes=hist();
 S().update('m1',{width:w});
 assert.equal(firma(),firmaAntes,'el rechazo es atomico: nada cambia');
 assert.equal(hist(),histAntes,'sin paso de historial');
 assert.equal(marimba('m1').width,900,'el ancho sigue siendo el original');
 assert.ok(anchoPuesto(marimba('m1'),0)>MIN_SLOT_W,
  'y el puesto NO queda por debajo de minSlotW');
});

test('G05 los rechazos que el store SI aplica son atomicos',()=>{
 seed();
 const firmaAntes=firma(),histAntes=hist();
 S().update('no-existe',{width:999});      // id inexistente
 S().update('m1',{width:900});              // no-op: mismo valor
 assert.equal(firma(),firmaAntes,'nada cambia');
 assert.equal(hist(),histAntes,'ningun paso de historial');
 assert.equal(S().isDirty,false,'ni siquiera se marca como sucio');
 // NOTA: para un ancho invalido NO existe rechazo (ver G04..G09), por lo que
 // hoy no hay atomicidad que comprobar en ese caso. Es la brecha a cerrar.
});

test('G06 NaN se RECHAZA (7V)',()=>{
 seed();
 //BRECHA documentada en 7Q y cerrada en 7V.
 const firmaAntes=firma(),histAntes=hist();
 S().update('m1',{width:NaN,height:NaN});
 assert.equal(firma(),firmaAntes,'rechazo atomico');
 assert.equal(hist(),histAntes,'sin historial');
 assert.ok(Number.isFinite(anchoPuesto(marimba('m1'),0)),
  'el ancho de puesto sigue siendo un numero');
});

test('G07 Infinity y -Infinity se RECHAZAN (7V)',()=>{
 seed();
 const firmaAntes=firma(),histAntes=hist();
 S().update('m1',{width:Infinity});
 S().update('m1',{width:-Infinity});
 S().update('m1',{height:Infinity});
 S().update('m1',{height:-Infinity});
 assert.equal(firma(),firmaAntes,'rechazo atomico');
 assert.equal(hist(),histAntes,'sin historial');
 assert.equal(marimba('m1').width,900);
 assert.ok(Number.isFinite(anchoPuesto(marimba('m1'),0)),'geometria intacta');
});

test('G08 los negativos se RECHAZAN (7V)',()=>{
 seed();
 const firmaAntes=firma(),histAntes=hist();
 S().update('m1',{width:-500});
 S().update('m1',{height:-500});
 assert.equal(firma(),firmaAntes,'rechazo atomico');
 assert.equal(hist(),histAntes,'sin historial');
 assert.equal(marimba('m1').width,900);
 assert.equal(marimba('m1').height,150);
 assert.ok(anchoPuesto(marimba('m1'),0)>0,'el ancho de puesto sigue siendo positivo');
 assert.equal(persona('p1').width,150,'y la persona no se toca');
});

test('G09 el cero se RECHAZA (7V)',()=>{
 seed();
 const firmaAntes=firma(),histAntes=hist();
 S().update('m1',{width:0});
 S().update('m1',{height:0});
 assert.equal(firma(),firmaAntes,'rechazo atomico');
 assert.equal(hist(),histAntes,'sin historial');
 assert.equal(marimba('m1').width,900);
 // 0 no cabia ni un puesto: ahora se rechaza en lugar de dejar un ancho negativo.
 assert.ok(anchoPuesto(marimba('m1'),0)>0,'el ancho de puesto no sale negativo');
});
// ---------------------------------------------------------------------------
// BLOQUE 2 - personas, IDs, aislamiento, historial (G10..G17)
// ---------------------------------------------------------------------------

test('G10 las personas asignadas conservan personId, marimbaId y marimbaPositionId',()=>{
 seed();
 const antes=S().elements.filter(e=>e.type==='person')
  .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]);
 S().update('m1',{width:1300});
 const despues=S().elements.filter(e=>e.type==='person')
  .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]);
 assert.deepEqual(despues,antes,'ninguna asignacion cambia');
 assert.equal(S().elements.filter(e=>e.type==='person').length,3,
  'no se crean personas nuevas');
 assert.deepEqual(marimba('m1').positions.map(p=>p.personId),[1,2,null],
  'los puestos siguen ocupados por los mismos IDs de persona');
});

test('G11 la relacion persona/puesto: update NO reposiciona, marimbaTransformed SI centra',()=>{
 seed();
 const m=marimba('m1');
 const centro=slotCenter(m,0);

 // (a) `update` -> withCascade no toca x/y: la persona se queda donde estaba.
 const antes={x:persona('p1').x,y:persona('p1').y};
 S().update('m1',{width:1300});
 assert.deepEqual({x:persona('p1').x,y:persona('p1').y},antes,
  'REALIDAD: update no reposiciona (brecha para resizeMarimba)');

 // (b) `marimbaTransformed` es la referencia REAL del proyecto para un cambio
 //     geometrico: `withCascade(withRepositioned(...))`. Desplazamos a mano y
 //     comprobamos que devuelve el centro exacto del puesto.
 seed();
 S().setElements([
  {...marimba('m1')},
  {...persona('p1'),x:centro.x+300,y:centro.y+200},
  persona('p2'),persona('p3'),marimba('m2'),
 ]);
 const mm=marimba('m1');
 S().marimbaTransformed('m1',{x:mm.x,y:mm.y,rotation:mm.rotation,scaleX:1,scaleY:1});
 const c=slotCenter(marimba('m1'),0);
 assert.equal(persona('p1').x,c.x,'centrada en X sobre el puesto');
 assert.equal(persona('p1').y,c.y,'centrada en Y sobre el puesto');
});

test('G12 las personas NO asignadas no se mueven',()=>{
 seed();
 const antes={x:persona('p3').x,y:persona('p3').y};
 S().update('m1',{width:1300});
 assert.deepEqual({x:persona('p3').x,y:persona('p3').y},antes,
  'update no toca a quien no esta sentado');
 seed();
 const antes2={x:persona('p3').x,y:persona('p3').y};
 const mm=marimba('m1');
 S().marimbaTransformed('m1',{x:mm.x+40,y:mm.y+40,rotation:0,scaleX:1,scaleY:1});
 assert.deepEqual({x:persona('p3').x,y:persona('p3').y},antes2,
  'withRepositioned solo afecta a las personas sentadas en esa marimba');
});

test('G13 el redimensionamiento no crea ni cambia IDs',()=>{
 seed();
 const antes=idsTodos();
 S().update('m1',{width:1500,height:300});
 assert.equal(idsTodos(),antes,'elementos, puestos y asignaciones identicos');
});

test('G14 redimensionar m1 deja m2 exactamente igual',()=>{
 seed();
 const m2Antes=JSON.stringify(marimba('m2'));
 const p3Antes={x:persona('p3').x,y:persona('p3').y};
 S().update('m1',{width:1600,height:260});
 assert.equal(JSON.stringify(marimba('m2')),m2Antes,'m2 intacta (x,y,w,h,puestos)');
 assert.deepEqual({x:persona('p3').x,y:persona('p3').y},p3Antes,'y sus personas');
 assert.deepEqual(marimba('m2').positions.map(p=>p.personId),[null],
  'asignaciones de m2 intactas');
});

test('G15 deshacer devuelve al estado previo exacto',()=>{
 seed();
 const antes=firma();
 S().update('m1',{width:1500,height:300});
 assert.notEqual(firma(),antes,'hubo cambio');
 S().undo();
 assert.equal(firma(),antes,'undo restaura el estado EXACTO');
});

test('G16 rehacer devuelve al estado posterior exacto',()=>{
 seed();
 S().update('m1',{width:1500,height:300});
 const despues=firma();
 S().undo();
 S().redo();
 assert.equal(firma(),despues,'redo restaura el estado POSTERIOR exacto');
 assert.equal(marimba('m1').width,1500);
 assert.equal(marimba('m1').height,300);
});

test('G17 un resize logico produce UN solo paso de historial',()=>{
 seed();
 const h=hist();
 S().update('m1',{width:1500});
 assert.equal(hist(),h+1,'exactamente un paso, ni mas ni menos');
 // Ni el cascade de personas ni nada mas genera pasos por su cuenta.
 // `withCascade` acota el tamano al tope de legibilidad (PERSON_MAX_W=420),
 // que es la regla real y no un descuido.
 assert.equal(persona('p1').width,
  layout.clampNumber(anchoPuesto(marimba('m1'),0)-6,
   layout.PERSON_MIN_W,layout.PERSON_MAX_W),
  'la persona acompana al puesto, acotada, en el MISMO paso');
});
// ---------------------------------------------------------------------------
// BLOQUE 3 - candado, solo lectura y serializacion (G18..G20)
// ---------------------------------------------------------------------------

test('G18 una marimba bloqueada rechaza el cambio sin tocar nada',()=>{
 seed();
 S().toggleLock('m1');
 assert.equal(marimba('m1').locked,true,'marimba bloqueada');
 const firmaAntes=firma(),histAntes=hist();
 S().update('m1',{width:2000,height:400});
 assert.equal(firma(),firmaAntes,'estado intacto');
 assert.equal(hist(),histAntes,'sin paso de historial');
 assert.equal(marimba('m1').width,900,'el ancho no cambia');
});

test('G19 en solo lectura el store no modifica absolutamente nada',()=>{
 seed();
 setReadOnly(true);
 try{
  assert.equal(isReadOnly(),true,'modo solo lectura activo');
  const firmaAntes=firma(),histAntes=hist();
  S().update('m1',{width:2000,height:400});
  assert.equal(firma(),firmaAntes,'estado intacto');
  assert.equal(hist(),histAntes,'sin historial');
  assert.equal(S().isDirty,false,'no se marca sucio');
  S().undo();
  assert.equal(firma(),firmaAntes,'tampoco undo muta');
 }finally{ setReadOnly(false); }
});

test('G20 serializacion: guardar y recargar conserva dimensiones, IDs y asignaciones',()=>{
 seed();
 S().update('m1',{width:1450,height:320});
 const guardado=JSON.stringify(S().elements);   // lo que va en Composition.data

 // `setElements` es EXACTAMENTE la via de carga que usa la app al abrir
 // una composicion: normaliza lo que venga del backend.
 S().setElements(JSON.parse(guardado));

 assert.equal(marimba('m1').width,1450,'ancho conservado');
 assert.equal(marimba('m1').height,320,'alto conservado');
 assert.equal(marimba('m1').x,200);
 assert.equal(marimba('m1').y,150);
 assert.equal(marimba('m1').positions.length,3,'puestos conservados');
 assert.deepEqual(marimba('m1').positions.map(p=>[p.id,p.personId]),
  [['s1',1],['s2',2],['s3',null]],'asignaciones conservadas');
 assert.equal(JSON.stringify(S().elements),guardado,
  'el viaje de ida y vuelta no anade ni quita campos');
});

test('G20b una composicion ANTIGUA sin dimensiones carga con los valores por defecto',()=>{
 setReadOnly(false);
 // Formato legacy: sin width/height/scale/rotation y con puestos como cadenas.
 S().setElements([
  {id:'v1',type:'marimba',name:'Vieja',positions:['Primera','Segunda']},
 ]);
 const v=marimba('v1');
 assert.equal(v.width,DEF_W,'ancho por defecto');
 assert.equal(v.height,DEF_H,'alto por defecto');
 assert.equal(v.scaleX,1);
 assert.equal(v.positions.length,2,'los puestos文字列 se normalizan');
 // Y sigue siendo redimensionable con la misma regla de minimo.
 assert.ok(needed(2)<DEF_W,'un ancho por defecto puede alojar sus puestos');
 assert.ok(anchoPuesto(v,0)>=MIN_SLOT_W,'los puestos caben sin tocar nada');
});