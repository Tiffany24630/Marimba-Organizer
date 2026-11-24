// Fase 7Z - granularidad del historial en las ediciones NUMERICAS.
//
// PROBLEMA (observado en 7Y, reproducido aqui):
//   Los campos numericos del Inspector llamaban a `update` en CADA pulsacion.
//   Escribir "400" sobre 200 producia las transiciones 200->4->40->400, es
//   decir TRES pasos de historial, y un unico `undo()` solo revocaba el ultimo
//   (200->4->40->400 ; undo ; => 40).
//
// Este archivo fija el CONTRATO DEL STORE del que depende la solucion: quien
// agrupe la edicion es la UI, no el store. El store debe seguir
//
//   - aplicando una transicion por llamada,
//   - rechazando lo invalido (7V/7W),
//   - sin pasos para un no-op,
//   - sin pasos cuando esta bloqueada o en solo lectura.
//
// Si estas pruebas se rompen, significa que alguien ha movido la agrupacion al
// store: eso seria justo lo que 7Z quiere evitar.
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

const S=()=>store.getState();
const m=()=>S().elements.find(e=>e.id==='m1');
const hist=()=>S().history.length;
const MIN_W=layout.minMarimbaWidth(3);   // 360
const MIN_H=layout.minMarimbaHeight();   // 110

function seed(){
 setReadOnly(false);
 S().setElements([
  {id:'m1',type:'marimba',name:'M1',x:200,y:150,width:900,height:150,
   positions:[{id:'s1',type:'Primera'},{id:'s2',type:'Segunda'},
              {id:'s3',type:'Centro'}]},
  {id:'p1',type:'person',name:'Ana',personId:1,positionType:'Primera'},
 ]);
 S().setElements(S().elements);
 assert.equal(hist(),0,'historial limpio');
}

// --- El defecto, demostrado sobre el store -------------------------------

test('Z01 tres pulsaciones producen TRES pasos: por eso hay que agrupar en la UI',
 ()=>{
  seed();
  S().update('m1',{x:4});
  S().update('m1',{x:40});
  S().update('m1',{x:400});
  assert.equal(hist(),3,'una transicion por pulsacion');
  S().undo();
  assert.equal(m().x,40,'un unico undo solo revierte el ULTIMO paso');
});

test('Z02 UNA transicion (= una edicion confirmada) es UN solo paso',()=>{
  seed();
  S().update('m1',{x:400});
  assert.equal(hist(),1,'una edicion confirmada = un paso');
  S().undo();
  assert.equal(m().x,200,'undo devuelve el valor ANTERIOR COMPLETO, no 40');
  S().redo();
  assert.equal(m().x,400,'redo restaura el valor completo');
});

test('Z03 la misma regla para el ancho',()=>{
  seed();
  S().update('m1',{width:1200});
  assert.equal(hist(),1,'un solo paso');
  S().undo();
  assert.equal(m().width,900);
});

test('Z04 la misma regla para el alto',()=>{
  seed();
  S().update('m1',{height:300});
  assert.equal(hist(),1,'un solo paso');
  S().undo();
  assert.equal(m().height,150);
});

test('Z05 un no-op no crea historial',()=>{
  seed();
  const h=hist();
  S().update('m1',{x:200});
  S().update('m1',{width:900});
  assert.equal(hist(),h,'ni un paso');
  assert.equal(S().isDirty,false);
});

test('Z06 ediciones independientes son pasos independientes',()=>{
  seed();
  S().update('m1',{x:400});    // edicion 1
  S().update('m1',{width:1200}); // edicion 2
  assert.equal(hist(),2,'dos ediciones = dos pasos');
  S().undo();
  assert.equal(m().width,900,'el primero deshace la ULTIMA edicion');
  assert.equal(m().x,400,'y deja intacta la anterior');
  S().undo();
  assert.equal(m().x,200);
});

// --- Validaciones que NO deben relajarse (7V / 7W) ----------------------

test('Z07 ancho por debajo del minimo se sigue rechazando sin historial',
 ()=>{
  seed();
  const h=hist();
  S().update('m1',{width:MIN_W-1});
  assert.equal(hist(),h,'sin paso');
  assert.equal(m().width,900);
});

test('Z08 alto por debajo del minimo se sigue rechazando sin historial',
 ()=>{
  seed();
  const h=hist();
  S().update('m1',{height:MIN_H-1});
  assert.equal(hist(),h,'sin paso');
  assert.equal(m().height,150);
});

test('Z09 las DIMENSIONES no finitas se siguen rechazando',()=>{
  seed();
  const h=hist();
  S().update('m1',{width:NaN});
  S().update('m1',{width:Infinity});
  S().update('m1',{height:-Infinity});
  assert.equal(hist(),h,'sin paso');
  assert.equal(m().width,900);
  assert.equal(m().height,150);
});

test('Z09b `update` ya valida x/y (cerrado en 8A)',()=>{
  // 7Z documento aqui un HUECO: `update` no validaba x/y y una coordenada no
  // finita se aplicaba y creaba historial. 8A lo cerro anadiendo la validacion
  // de finitud. Este test pasa de AFIRMAR el hueco a AFIRMAR el contrato nuevo:
  // lo que se mantiene intacto es que queda documentado y probado.
  seed();
  const h=hist();
  S().update('m1',{x:Infinity});
  S().update('m1',{y:NaN});
  assert.equal(hist(),h,'una coordenada no finita NO crea historial');
  assert.equal(m().x,200,'x intacta');
  assert.equal(m().y,150,'y intacta');
});

test('Z10 una edicion bloqueada no crea historial',()=>{
  seed();
  S().toggleLock('m1');
  const h=hist();
  S().update('m1',{x:400});
  S().update('m1',{width:1200});
  assert.equal(hist(),h,'sin paso');
  assert.equal(m().x,200);
  assert.equal(m().width,900);
});

test('Z11 en solo lectura no crea historial',()=>{
  seed();
  setReadOnly(true);
  try{
   const h=hist();
   S().update('m1',{x:400});
   S().update('m1',{width:1200});
   assert.equal(hist(),h,'sin paso');
   assert.equal(m().x,200);
  }finally{ setReadOnly(false); }
});

test('Z12 resizeMarimba mantiene una sola transicion por edicion',()=>{
  seed();
  S().resizeMarimba('m1',1200,260);
  assert.equal(hist(),1,'un paso');
  S().undo();
  assert.equal(m().width,900);
  assert.equal(m().height,150);
  S().redo();
  assert.equal(m().width,1200);
  assert.equal(m().height,260);
});