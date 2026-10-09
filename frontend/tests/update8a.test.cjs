// Fase 8A - `update` valida que las COORDENADAS sean finitas.
//
// HALLAZGO (7Z, test Z09b): la validacion de 7V solo se activa cuando el parche
// trae `width` o `height`. Una coordenada no finita pasaba y creaba historial:
//   update('m1',{x:Infinity})  ->  se aplicaba
//
// 8A anade el contrato de finitud para `x`/`y`. IMPORTANTE: validar finitud NO
// significa inventar limites de posicion; las coordenadas negativas siguen
// siendo validas (el lienzo admite elementos fuera del origen).
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

const S=()=>store.getState();
const byId=id=>S().elements.find(e=>e.id===id);
const hist=()=>S().history.length;
const firma=()=>JSON.stringify(S().elements);
const foto=()=>({f:firma(),h:hist(),d:S().isDirty});
function intacto(msg,a){
 assert.equal(firma(),a.f,`${msg}: el estado no cambia`);
 assert.equal(hist(),a.h,`${msg}: el historial no cambia`);
 assert.equal(S().isDirty,a.d,`${msg}: la marca de sucio no cambia`);
}

function seed(){
 setReadOnly(false);
 S().setElements([
  {id:'m1',type:'marimba',name:'M1',x:200,y:150,width:900,height:150,
   positions:[{id:'s1',type:'Primera'}]},
  {id:'p1',type:'person',name:'Ana',personId:1,positionType:'Primera',
   x:300,y:400,width:150,height:44},
 ]);
 S().setElements(S().elements);
 assert.equal(hist(),0,'historial limpio');
}

// --- Valores validos --------------------------------------------------

test('8A-01 x finito se acepta',()=>{
 seed();
 S().update('m1',{x:100});
 assert.equal(byId('m1').x,100);
 assert.equal(hist(),1,'un paso');
});

test('8A-02 y finito se acepta',()=>{
 seed();
 S().update('m1',{y:100});
 assert.equal(byId('m1').y,100);
 assert.equal(hist(),1,'un paso');
});

test('8A-03 coordenadas NEGATIVAS se aceptan (no se inventan limites)',()=>{
 seed();
 S().update('m1',{x:-100,y:-200});
 assert.equal(byId('m1').x,-100,'x negativa valida');
 assert.equal(byId('m1').y,-200,'y negativa valida');
 S().undo();
 assert.equal(byId('m1').x,200);
 assert.equal(byId('m1').y,150);
});

test('8A-04 las coordenadas de una PERSONA tambien se validan',()=>{
 seed();
 const a=foto();
 S().update('p1',{x:NaN});
 intacto('persona x NaN',a);
 S().update('p1',{y:Infinity});
 intacto('persona y Infinity',a);
});

// --- No finitos: rechazo ----------------------------------------------

test('8A-05 x NaN se rechaza',()=>{
 seed();const a=foto();
 S().update('m1',{x:NaN});
 intacto('x NaN',a);
 assert.equal(byId('m1').x,200);
});

test('8A-06 y NaN se rechaza',()=>{
 seed();const a=foto();
 S().update('m1',{y:NaN});
 intacto('y NaN',a);
 assert.equal(byId('m1').y,150);
});

test('8A-07 x Infinity y -Infinity se rechazan',()=>{
 seed();const a=foto();
 S().update('m1',{x:Infinity});
 S().update('m1',{x:-Infinity});
 intacto('x infinitos',a);
 assert.equal(byId('m1').x,200);
});

test('8A-08 y Infinity y -Infinity se rechazan',()=>{
 seed();const a=foto();
 S().update('m1',{y:Infinity});
 S().update('m1',{y:-Infinity});
 intacto('y infinitos',a);
 assert.equal(byId('m1').y,150);
});

// --- Atomicidad -------------------------------------------------------

test('8A-09 un parche MIXTO invalido se rechaza ENTERO',()=>{
 seed();const a=foto();
 // x no finito invalida TODO el parche: la rotacion no debe aplicarse.
 S().update('m1',{x:NaN,rotation:45});
 intacto('mixto',a);
 assert.equal(byId('m1').rotation,0,'la rotacion NO se aplica a medias');
 assert.equal(byId('m1').x,200);
});

test('8A-10 un parche mixto VALIDO si aplica completo',()=>{
 seed();
 S().update('m1',{x:50,rotation:45});
 assert.equal(byId('m1').x,50);
 assert.equal(byId('m1').rotation,45);
 assert.equal(hist(),1,'una sola operacion logica');
 S().undo();
 assert.equal(byId('m1').x,200);
 assert.equal(byId('m1').rotation,0);
});

test('8A-11 no-op de coordenadas no crea historial',()=>{
 seed();
 const h=hist();
 S().update('m1',{x:200});
 S().update('m1',{y:150});
 assert.equal(hist(),h,'sin paso');
});

// --- Coexistencia con 7V (dimensiones) --------------------------------

test('8A-12 la validacion de dimensiones de 7V SIGUE activa',()=>{
 const {minMarimbaWidth,minMarimbaHeight}=require('../src/lib/layout.ts');
 seed();const a=foto();
 S().update('m1',{width:minMarimbaWidth(1)-1});
 S().update('m1',{height:minMarimbaHeight()-1});
 S().update('m1',{width:NaN});
 intacto('dimensiones 7V',a);
 assert.equal(byId('m1').width,900);
 assert.equal(byId('m1').height,150);
});

test('8A-13 una coordinada no finita no esquiva la validacion de dimensiones',()=>{
 seed();
 // width valido + x no finito: se rechaza el parche COMPLETO.
 const a=foto();
 S().update('m1',{width:1200,x:NaN});
 intacto('mixto dimension+coordenada',a);
 assert.equal(byId('m1').width,900,'la dimension valida tampoco se aplica');
});

// --- Lock y readonly --------------------------------------------------

test('8A-14 bloqueada no cambia coordenadas ni crea historial',()=>{
 seed();
 S().toggleLock('m1');
 const a=foto();
 S().update('m1',{x:500,y:500});
 intacto('bloqueada',a);
});

test('8A-15 en solo lectura no cambia coordenadas ni crea historial',()=>{
 seed();
 setReadOnly(true);
 try{
  const a=foto();
  S().update('m1',{x:500,y:500});
  intacto('solo lectura',a);
 }finally{ setReadOnly(false); }
});

test('8A-16 resizeMarimba no se ve afectado por la validacion de coordenadas',()=>{
 seed();
 S().resizeMarimba('m1',1200,260);
 assert.equal(byId('m1').width,1200);
 assert.equal(byId('m1').height,260);
 assert.equal(hist(),1,'una sola transicion');
 S().undo();
 assert.equal(byId('m1').width,900);
 assert.equal(byId('m1').height,150);
});