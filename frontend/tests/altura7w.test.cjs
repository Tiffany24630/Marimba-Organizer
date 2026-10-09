// Fase 7W - contrato geometrico VERTICAL de la altura de una marimba.
//
// DIAGNOSTICO (evidencia en el codigo, ver FASE_7W_INTEGRATION.md):
//   - `height` es SOLO el alto del marco: CanvasEditor.tsx:62 dibuja
//     `<Rect height={m.height}>`; render.ts:33 y export.ts:64 igual.
//   - Los puestos viven en una banda vertical FIJA: `slotRect` devuelve
//     `y: slotY (56)` y `height: slotH (54)`, constantes que NO dependen de
//     `m.height`. Concretamente ocupan la banda [56, 110].
//   - La persona sentada se coloca en `slotCenter(...)`, que sale de `slotRect`,
//     asi que tampoco depende del alto. `withCascade` nunca toca `y`.
//   - No existe ninguna funcion que calcule el espacio vertical disponible.
//
// CONSECUENCIA: con `height < 110` los puestos se dibujan FUERA del marco. Hoy
// solo se exige `height >= 1`, asi que ese caso es alcanzable y esta roto.
// Estas pruebas describen el contrato antes de implementarlo.
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
const {slotRect,slotCenter}=layout;

const S=()=>store.getState();
const byId=id=>S().elements.find(e=>e.id===id);
const m=()=>byId('m1');
const firma=()=>JSON.stringify(S().elements);
const hist=()=>S().history.length;

// Banda vertical que ocupan los puestos: la geometria REAL, no un numero inventado.
const BANDA_INI=layout.MARIMBA_DEFAULT.slotY;                       // 56
const BANDA_FIN=layout.MARIMBA_DEFAULT.slotY+layout.MARIMBA_DEFAULT.slotH; // 110
const MIN_H=typeof layout.minMarimbaHeight==='function'
 ?layout.minMarimbaHeight():BANDA_FIN;

function seed(){
 setReadOnly(false);
 S().setElements([
  {id:'m1',type:'marimba',name:'M1',x:200,y:150,width:900,height:150,
   positions:[{id:'s1',type:'Primera'},{id:'s2',type:'Segunda'},{id:'s3',type:'Centro'}]},
  {id:'m2',type:'marimba',name:'M2',x:900,y:600,width:600,height:150,
   positions:[{id:'t1',type:'Primera'}]},
  {id:'p1',type:'person',name:'Ana',personId:1,positionType:'Primera'},
 ]);
 S().assign('p1','m1','s1');
 S().setElements(S().elements);
 assert.equal(hist(),0,'historial limpio');
}

const foto=()=>({f:firma(),h:hist(),d:S().isDirty});
function intacto(msg,a){
 assert.equal(firma(),a.f,`${msg}: el estado no cambia`);
 assert.equal(hist(),a.h,`${msg}: el historial no cambia`);
 assert.equal(S().isDirty,a.d,`${msg}: la marca de sucio no cambia`);
}

// --- DIAGNOSTICO: como se comporta HOY la altura ------------------------

test('W00 la banda de puestos es fija y NO depende de la altura',()=>{
 seed();
 const banda=h=>[slotRect({...m(),height:h},0).y,
                  slotRect({...m(),height:h},0).y+slotRect({...m(),height:h},0).height];
 assert.deepEqual(banda(150),[56,110],'con 150 la banda es [56,110]');
 assert.deepEqual(banda(400),[56,110],'con 400 la banda sigue siendo [56,110]');
 assert.deepEqual(banda(60),[56,110],'incluso con 60: la banda no se mueve');
 assert.equal(BANDA_FIN,110,'la banda termina en slotY+slotH = 110');
});

test('W00b la persona sentada tampoco depende de la altura',()=>{
 seed();
 const y0=personaY();
 S().update('m1',{height:400});
 assert.equal(personaY(),y0,'withCascade no toca la Y de la persona');
});
function personaY(){
 const p=byId('p1');
 return p?p.y:null;
}

// --- CONTRATO: minimo vertical ------------------------------------------

test('W01 la altura minima es slotY+slotH',()=>{
 seed();
 assert.equal(MIN_H,110,'derivada de la banda real, no inventada');
 // Y coincide con lo que haria falta para que el ultimo puesto quepa.
 const r=slotRect(m(),0);
 assert.ok(r.y+r.height<=MIN_H,'el puesto cabe dentro del minimo');
});

test('W02 una altura por debajo del minimo se RECHAZA',()=>{
 seed();const a=foto();
 S().update('m1',{height:MIN_H-1});
 intacto('altura insuficiente',a);
 assert.equal(m().height,150,'la altura no cambia');
});

test('W03 la altura minima EXACTA se acepta',()=>{
 seed();
 S().update('m1',{height:MIN_H});
 assert.equal(m().height,MIN_H);
 const r=slotRect(m(),0);
 assert.ok(r.y+r.height<=m().height,'el puesto cabe justo');
});

test('W04 resizeMarimba tambien aplica el minimo vertical',()=>{
 seed();const a=foto();
 S().resizeMarimba('m1',900,MIN_H-1);
 intacto('resize por debajo del minimo',a);
 assert.equal(m().height,150);
});

// --- AUMENTAR Y REDUCIR -------------------------------------------------

test('W05 aumentar la altura mueve el marco pero NO los puestos',()=>{
 seed();
 const ys=m().positions.map((p,i)=>slotRect(m(),i).y);
 S().update('m1',{height:400});
 assert.equal(m().height,400,'el marco crece');
 assert.deepEqual(m().positions.map((p,i)=>slotRect(m(),i).y),ys,
  'los puestos conservan su posicion vertical');
});

test('W06 reducir la altura (dentro del minimo) tampoco mueve los puestos',()=>{
 seed();
 const ys=m().positions.map((p,i)=>slotRect(m(),i).y);
 S().update('m1',{height:MIN_H});
 assert.equal(m().height,MIN_H);
 assert.deepEqual(m().positions.map((p,i)=>slotRect(m(),i).y),ys,
  'la banda no se redistribuye');
});

test('W07 no hay solapamiento: los puestos caben dentro del marco',()=>{
 seed();
 S().update('m1',{height:MIN_H});
 const r=slotRect(m(),0);
 assert.ok(r.y>=0,'el puesto no sale por arriba');
 assert.ok(r.y+r.height<=m().height,'ni por abajo');
});

// --- VALORES NO ADMISIBLES (contrato ya vigente, se re-verifica) ---------

test('W08 se siguen rechazando cero, negativos y no finitos',()=>{
 seed();const a=foto();
 S().update('m1',{height:0});
 S().update('m1',{height:-1});
 S().update('m1',{height:NaN});
 S().update('m1',{height:Infinity});
 S().update('m1',{height:-Infinity});
 intacto('alturas no admisibles',a);
 assert.equal(m().height,150);
});

// --- INTEGRIDAD -------------------------------------------------------

test('W09 IDs, asignaciones y personas se conservan al cambiar la altura',()=>{
 seed();
 const snap=()=>JSON.stringify({
  els:S().elements.map(e=>e.id),
  puestos:m().positions.map(p=>[p.id,p.personId]),
  personas:S().elements.filter(e=>e.type==='person')
   .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]),
 });
 const antes=snap();
 S().update('m1',{height:300});
 assert.equal(snap(),antes,'nada se recrea ni se pierde');
 assert.equal(m().positions.length,3,'siguen habiend o 3 puestos');
});

test('W10 la persona sentada sigue centrada en su puesto tras cambiar el alto',()=>{
 seed();
 S().update('m1',{height:400});
 const c=slotCenter(m(),m().positions.findIndex(p=>p.id==='s1'));
 assert.equal(byId('p1').x,c.x,'centrada en X');
 assert.equal(byId('p1').y,c.y,'centrada en Y sobre el mismo puesto');
});

test('W11 una marimba bloqueada no cambia de altura',()=>{
 seed();
 S().toggleLock('m1');
 const a=foto();
 S().update('m1',{height:400});
 S().resizeMarimba('m1',900,400);
 intacto('bloqueada',a);
 assert.equal(m().height,150);
});

test('W12 atomicidad: un alto invalido rechaza el parche COMPLETO',()=>{
 seed();const a=foto();
 S().update('m1',{name:'Renombrada',height:MIN_H-1,x:999});
 intacto('mixta invalida',a);
 assert.equal(m().name,'M1','ni el nombre');
 assert.equal(m().x,200,'ni la posicion');
});

test('W13 un solo paso de historial por cambio efectivo',()=>{
 seed();
 S().update('m1',{height:400});
 assert.equal(hist(),1,'exactamente un paso');
});

test('W14 sin historial para un no-op ni para un rechazo',()=>{
 seed();
 const h=hist();
 S().update('m1',{height:150});          // no-op
 S().update('m1',{height:MIN_H-1});      // rechazo
 assert.equal(hist(),h,'ningun paso');
 assert.equal(S().isDirty,false);
});

test('W15 deshacer y rehacer el cambio de altura',()=>{
 seed();
 const antes=firma();
 S().update('m1',{height:400,width:1100});
 const despues=firma();
 S().undo();
 assert.equal(firma(),antes,'undo exacto');
 S().redo();
 assert.equal(firma(),despues,'redo exacto');
 assert.equal(m().height,400);
});

test('W16 una composicion LEGACY sin altura satisface el minimo',()=>{
 setReadOnly(false);
 S().setElements([{id:'v1',type:'marimba',name:'Vieja',positions:['Primera','Segunda']}]);
 const v=byId('v1');
 assert.equal(v.height,layout.MARIMBA_DEFAULT.height,'valor por defecto 150');
 assert.ok(v.height>=MIN_H,'el valor por defecto ya cumple el minimo: no hay migracion');
 assert.ok(slotRect(v,0).y+slotRect(v,0).height<=v.height,'los puestos caben');
});