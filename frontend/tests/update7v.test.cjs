// Fase 7V - contrato de validacion geometrica de `update`.
//
// Estas pruebas se escribieron ANTES de tocar la implementacion, contra el
// comportamiento real de `update`. Objetivo: cerrar la deuda documentada en
// FASE_7T §18.1, donde `resizeMarimba` validaba dimensiones pero `update` no.
//
// `update` NO es `resizeMarimba`: tiene responsabilidades mas amplias (nombre,
// x, y, rotacion, escala y las dimensiones de una PERSONA). Este archivo
// comprueba que la validacion se aplica SOLO al ancho/alto de una MARIMBA y que
// el resto de responsabilidades siguen intactas.
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
const {setReadOnly}=mod;
const layout=require('../src/lib/layout.ts');
const {minMarimbaWidth}=layout;

const S=()=>store.getState();
const byId=id=>S().elements.find(e=>e.id===id);
const m=()=>byId('m1');
const firma=()=>JSON.stringify(S().elements);
const hist=()=>S().history.length;
const MIN=minMarimbaWidth(3);   // 2*14 + 3*104 + 2*10 = 360

function seed(){
 setReadOnly(false);
 S().setElements([
  {id:'m1',type:'marimba',name:'M1',x:200,y:150,width:900,height:150,
   positions:[{id:'s1',type:'Primera'},{id:'s2',type:'Segunda'},{id:'s3',type:'Centro'}]},
  {id:'m2',type:'marimba',name:'M2',x:900,y:600,width:600,height:150,
   positions:[{id:'t1',type:'Primera'}]},
  {id:'p1',type:'person',name:'Ana',personId:1,positionType:'Primera',
   width:150,height:44,scaleX:1,scaleY:1},
 ]);
 S().assign('p1','m1','s1');
 S().setElements(S().elements);
 assert.equal(hist(),0,'historial limpio');
 assert.equal(MIN,360,'minimo para 3 puestos = 360');
}

/** Instantanea completa: estado, historial y marca de sucio. */
const foto=()=>({f:firma(),h:hist(),d:S().isDirty});
function intacto(msg,antes){
 assert.equal(firma(),antes.f,`${msg}: el estado no cambia`);
 assert.equal(hist(),antes.h,`${msg}: el historial no cambia`);
 assert.equal(S().isDirty,antes.d,`${msg}: la marca de sucio no cambia`);
}

// ============================ RECHAZOS ===================================

test('U01 update rechaza un ancho negativo',()=>{
 seed();const a=foto();
 S().update('m1',{width:-500});
 intacto('ancho negativo',a);
 assert.equal(m().width,900,'el ancho sigue siendo 900');
});

test('U02 update rechaza un ancho igual a cero',()=>{
 seed();const a=foto();
 S().update('m1',{width:0});
 intacto('ancho cero',a);
 assert.equal(m().width,900);
});

test('U03 update rechaza un ancho inferior al minimo',()=>{
 seed();const a=foto();
 S().update('m1',{width:MIN-1});
 intacto('ancho bajo minimo',a);
 assert.equal(m().width,900);
});

test('U04 update rechaza un alto negativo',()=>{
 seed();const a=foto();
 S().update('m1',{height:-1});
 intacto('alto negativo',a);
 assert.equal(m().height,150);
});

test('U05 update rechaza un alto igual a cero',()=>{
 seed();const a=foto();
 S().update('m1',{height:0});
 intacto('alto cero',a);
 assert.equal(m().height,150);
});

test('U06 update rechaza NaN',()=>{
 seed();const a=foto();
 S().update('m1',{width:NaN});
 S().update('m1',{height:NaN});
 intacto('NaN',a);
 assert.equal(Number.isNaN(m().width),false,'el ancho sigue siendo un numero');
});

test('U07 update rechaza Infinity y -Infinity',()=>{
 seed();const a=foto();
 S().update('m1',{width:Infinity});
 S().update('m1',{width:-Infinity});
 S().update('m1',{height:Infinity});
 S().update('m1',{height:-Infinity});
 intacto('infinitos',a);
 assert.equal(m().width,900);
 assert.equal(m().height,150);
});

test('U13 update rechaza una marimba bloqueada',()=>{
 seed();
 S().toggleLock('m1');
 const a=foto();
 S().update('m1',{width:1500,height:400});
 intacto('bloqueada',a);
 assert.equal(m().width,900);
 assert.equal(m().height,150);
});

test('U14 update rechaza un id inexistente',()=>{
 seed();const a=foto();
 S().update('no-existe',{width:1500});
 S().update('no-existe',{name:'X'});
 // Ojo: actualizar una PERSONA es valido y SI cambia el estado; por eso no se
 // mezcla aqui (error mio en la primera redaccion de esta prueba).
 intacto('id inexistente',a);
});
test('U12 una actualizacion MIXTA invalida se rechaza ENTERA',()=>{
 seed();const a=foto();
 // El nombre es valido, pero el ancho no: no se aplica NADA (atomicidad).
 S().update('m1',{name:'Renombrada',width:-10,x:999});
 intacto('mixta invalida',a);
 assert.equal(m().name,'M1','ni siquiera cambia el nombre');
 assert.equal(m().x,200,'ni la posicion');
});

test('U15 los rechazos no anaden pasos de historial',()=>{
 seed();
 const h=hist();
 S().update('m1',{width:-1});
 S().update('m1',{height:0});
 S().update('m1',{width:NaN});
 S().update('m1',{width:MIN-1});
 assert.equal(hist(),h,'ningun paso de historial');
 assert.equal(S().isDirty,false,'ni se marca sucio');
});

test('U16 una actualizacion sin cambios no anade paso',()=>{
 seed();
 const h=hist();
 S().update('m1',{width:900});
 S().update('m1',{height:150});
 S().update('m1',{name:'M1'});
 assert.equal(hist(),h,'ningun paso para un no-op');
 assert.equal(S().isDirty,false);
});

// ============================ ACEPTACIONES ===============================

test('U08 update acepta un ancho valido',()=>{
 seed();
 S().update('m1',{width:1300});
 assert.equal(m().width,1300);
 assert.equal(hist(),1,'un unico paso');
});

test('U09 update acepta un alto valido y NO mueve los puestos',()=>{
 seed();
 const y0=layout.slotRect(m(),0).y;
 S().update('m1',{height:400});
 assert.equal(m().height,400,'el alto cambia');
 assert.equal(layout.slotRect(m(),0).y,y0,
  'slotY sigue constante: no se introduce distribucion vertical');
});

test('U10 update acepta ambas dimensiones a la vez',()=>{
 seed();
 S().update('m1',{width:1400,height:320});
 assert.equal(m().width,1400);
 assert.equal(m().height,320);
 assert.equal(hist(),1,'un unico paso logico');
});

test('U11 una actualizacion parcial conserva el resto de propiedades',()=>{
 seed();
 S().update('m1',{name:'Renombrada'});
 assert.equal(m().name,'Renombrada');
 assert.equal(m().width,900,'el ancho no cambia');
 assert.equal(m().height,150);
 assert.equal(m().x,200);
 assert.equal(m().y,150);
 assert.equal(m().rotation,0);
});

test('U11b update sigue moviendo la marimba (x, y)',()=>{
 seed();
 S().update('m1',{x:400,y:300});
 assert.equal(m().x,400);
 assert.equal(m().y,300);
 assert.equal(m().width,900,'las dimensiones no se tocan');
});

test('U11c update sigue funcionando con las dimensiones de una PERSONA',()=>{
 seed();
 // La persona tiene su propia regla (min 60x28); no debe verse afectada.
 S().update('p1',{width:10,height:10});
 assert.equal(byId('p1').width,60,'la persona se acota a 60');
 assert.equal(byId('p1').height,28,'y a 28');
});

test('U17 deshacer y rehacer una actualizacion valida',()=>{
 seed();
 const antes=firma();
 S().update('m1',{width:1300,height:260});
 const despues=firma();
 S().undo();
 assert.equal(firma(),antes,'undo exacto');
 S().redo();
 assert.equal(firma(),despues,'redo exacto');
 assert.equal(m().width,1300);
 assert.equal(m().height,260);
});

test('U18 se conservan IDs, puestos, personas y asignaciones',()=>{
 seed();
 const snap=()=>JSON.stringify({
  els:S().elements.map(e=>e.id),
  puestos:m().positions.map(p=>[p.id,p.personId]),
  personas:S().elements.filter(e=>e.type==='person')
   .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]),
 });
 const ids=snap();
 S().update('m1',{width:1500,height:300});
 assert.equal(snap(),ids,'nada se recrea ni se pierde');
});

test('U19 la validacion no afecta a resizeMarimba',()=>{
 seed();
 S().resizeMarimba('m1',1400,300);
 assert.equal(m().width,1400);
 assert.equal(m().height,300);
 const a=foto();
 S().resizeMarimba('m1',MIN-1,300);
 intacto('resizeMarimba sigue rechazando',a);
});