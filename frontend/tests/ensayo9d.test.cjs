// Fase 9D - logica de la vista de ensayo.
//
// `buildRehearsal` es una FUNCION PURA sobre los `elements` que ya estan
// cargados. Se prueba aqui, sin navegador ni React, porque de ahi sale toda la
// informacion que el músico necesita: quien esta sentado donde y quien se ha
// quedado fuera.
const {test}=require('node:test');
const assert=require('node:assert');
const {buildRehearsal}=require('../src/lib/rehearsal.ts');

// --- helpers de construcción -----------------------------------------------
const marimba=(id,name,positions,extra={})=>({
  id,type:'marimba',name,x:0,y:0,width:900,height:150,
  rotation:0,scaleX:1,scaleY:1,positions,...extra,
});
const puesto=(id,type,personId=null,note)=>({id,type,personId,...(note?{note}:{})});
const persona=(id,name,personId,extra={})=>({
  id,type:'person',name,personId,positionType:'Primera',
  x:0,y:0,width:150,height:44,rotation:0,scaleX:1,scaleY:1,
  marimbaId:null,marimbaPositionId:null,...extra,
});

// --- 1. Caso minimo: una marimba ------------------------------------------
test('9D-01 una marimba con dos puestos: uno ocupado y otro vacante',()=>{
  const r=buildRehearsal([
   marimba('m1','Marimba 1',[puesto('p1','Primera',101),puesto('p2','Bajo')]),
   persona('e1','Ana',101,{marimbaId:'m1',marimbaPositionId:'p1'}),
  ]);
  assert.equal(r.marimbas.length,1);
  const m=r.marimbas[0];
  assert.equal(m.name,'Marimba 1');
  assert.equal(m.slots.length,2);
  assert.equal(m.slots[0].personName,'Ana');
  assert.equal(m.slots[0].vacant,false);
  // El puesto vacio SE MUESTRA, no se oculta.
  assert.equal(m.slots[1].vacant,true);
  assert.equal(m.slots[1].personName,null);
  assert.equal(m.occupied,1);
  assert.equal(m.vacant,1);
});

test('9D-02 una persona sentada NO aparece como sin asignar',()=>{
  const r=buildRehearsal([
   marimba('m1','M',[puesto('p1','Primera',101)]),
   persona('e1','Ana',101,{marimbaId:'m1',marimbaPositionId:'p1'}),
  ]);
  assert.equal(r.unassigned.length,0);
});

// --- 2. Varias marimbas y orden determinista -------------------------------
test('9D-03 varias marimbas conservan el orden del modelo',()=>{
  const r=buildRehearsal([
   marimba('m1','Primera marimba',[puesto('p1','Primera',1)]),
   marimba('m2','Segunda marimba',[puesto('p2','Segunda',2)]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1'}),
   persona('e2','Luis',2,{marimbaId:'m2',marimbaPositionId:'p2'}),
  ]);
  assert.deepEqual(r.marimbas.map(m=>m.name),
                   ['Primera marimba','Segunda marimba']);
  assert.equal(r.totals.marimbas,2);
  assert.equal(r.totals.occupied,2);
});

test('9D-04 la misma composicion produce SIEMPRE el mismo resultado',()=>{
  const els=[
   marimba('m1','M',[puesto('p1','Primera',1),puesto('p2','Segunda',2)]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1'}),
   persona('e2','Luis',2,{marimbaId:'m1',marimbaPositionId:'p2'}),
  ];
  assert.deepEqual(buildRehearsal(els),buildRehearsal(els));
});

// --- 3. Personas sin asignar -----------------------------------------------
test('9D-05 las personas sueltas se listan aparte',()=>{
  const r=buildRehearsal([
   marimba('m1','M',[puesto('p1','Primera',1)]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1'}),
   persona('e2','Beto',2),
   persona('e3','Caro',3),
  ]);
  assert.equal(r.unassigned.length,2);
  assert.deepEqual(r.unassigned.map(p=>p.name),['Beto','Caro']);
  assert.equal(r.totals.unassigned,2);
  assert.equal(r.totals.people,3);
});

test('9D-06 una persona con marimba pero sin puesto sigue sin asignar',()=>{
  // Referencia al puesto perdida: el sitio NO existe, asi que no esta sentada.
  const r=buildRehearsal([
   marimba('m1','M',[puesto('p1','Primera',1)]),
   persona('e2','Beto',2,{marimbaId:'m1',marimbaPositionId:'NO_EXISTE'}),
  ]);
  assert.equal(r.unassigned.length,1);
});

// --- 4. Puestos que apuntan a una persona inexistente ----------------------
test('9D-07 un puesto cuya persona no esta en la composicion queda vacante',()=>{
  // El id esta, pero la persona no: el puesto NO puede aparecer ocupado.
  const r=buildRehearsal([
   marimba('m1','M',[puesto('p1','Primera',999)]),
  ]);
  assert.equal(r.marimbas[0].slots[0].vacant,true);
  assert.equal(r.marimbas[0].occupied,0);
});

// --- 5. Etiquetas y comentarios --------------------------------------------
test('9D-08 la etiqueta del puesto se muestra y se antepone la propia',()=>{
  const r=buildRehearsal([
   marimba('m1','M',[puesto('p1','Primera',1,{label:'Fila 1',comment:' delante'})]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1',
                          note:{label:'Kay',comment:'del grupo A'}}),
  ]);
  const s=r.marimbas[0].slots[0];
  // La del puesto tiene prioridad: es la que describe ESA posicion.
  assert.equal(s.label,'Fila 1');
  assert.equal(s.comment,' delante');
});

test('9D-09 si el puesto no tiene nota se usa la de la persona',()=>{
  const r=buildRehearsal([
   marimba('m1','M',[puesto('p1','Primera',1)]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1',note:{label:'Kay'}}),
  ]);
  assert.equal(r.marimbas[0].slots[0].label,'Kay');
});

test('9D-10 una marimba bloqueada se marca como tal',()=>{
  const r=buildRehearsal([marimba('m1','M',[puesto('p1','Primera')],{locked:true})]);
  assert.equal(r.marimbas[0].locked,true);
});

// --- 6. Casos limite -------------------------------------------------------
test('9D-11 una composicion vacia no rompe nada',()=>{
  for(const entrada of[[],null,undefined,[]]){
   const r=buildRehearsal(entrada);
   assert.equal(r.marimbas.length,0);
   assert.equal(r.unassigned.length,0);
   assert.equal(r.totals.slots,0);
  }
});

test('9D-12 una marimba sin puestos aparece igualmente',()=>{
  const r=buildRehearsal([marimba('m1','Vacia',[])]);
  assert.equal(r.marimbas.length,1);
  assert.equal(r.marimbas[0].slots.length,0);
});

test('9D-13 el resumen cuadra con lo mostrado',()=>{
  const r=buildRehearsal([
   marimba('m1','A',[puesto('p1','Primera',1),puesto('p2','Segunda')]),
   marimba('m2','B',[puesto('p3','Bajo',2)]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1'}),
   persona('e2','Luis',2,{marimbaId:'m2',marimbaPositionId:'p3'}),
   persona('e3','Caro',3),
  ]);
  assert.equal(r.totals.slots,3);
  assert.equal(r.totals.occupied,2);
  assert.equal(r.totals.vacant,1);
  assert.equal(r.totals.unassigned,1);
  assert.equal(r.totals.occupied+r.totals.vacant,r.totals.slots);
});

// --- 7. No muta la entrada -------------------------------------------------
test('9D-14 la composicion de entrada NO se modifica',()=>{
  const els=[
   marimba('m1','M',[puesto('p1','Primera',1),puesto('p2','Segunda')]),
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1'}),
  ];
  const antes=JSON.stringify(els);
  buildRehearsal(els);
  assert.equal(JSON.stringify(els),antes);
});

test('9D-15 el orden del array NO cambia quien aparece sentado',()=>{
  // La persona va ANTES que su marimba. Si la deteccion de "sentada" dependiera
  // del orden de recorrido, apareceria como sin asignar sin motivo.
  const r=buildRehearsal([
   persona('e1','Ana',1,{marimbaId:'m1',marimbaPositionId:'p1'}),
   marimba('m1','M',[puesto('p1','Primera',1)]),
  ]);
  assert.equal(r.unassigned.length,0,'Ana esta sentada de verdad');
  assert.equal(r.marimbas[0].slots[0].personName,'Ana');
});