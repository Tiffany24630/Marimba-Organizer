// Fase 7R - pruebas de `resizeMarimba`.
//
// Complementa la suite 7Q (`geometria7q.test.cjs`), que sigue verde y NO se
// toca. Aqui se prueba la ACCION nueva: que valide, que rechace de forma
// atomica y que componga una sola operacion logica.
//
// El cargador de TypeScript es el mismo patron que usan las demas suites del
// proyecto; los helpers se replican en minimo porque los de 7Q son privados a
// ese archivo y 7Q no debe modificarse.
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
const {minMarimbaWidth,slotRect,slotCenter}=require('../src/lib/layout.ts');

const S=()=>store.getState();
const byId=id=>S().elements.find(e=>e.id===id);
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
  {id:'p1',type:'person',name:'Ana',personId:1,positionType:'Primera'},
  {id:'p2',type:'person',name:'Luis',personId:2,positionType:'Segunda'},
  {id:'p3',type:'person',name:'Sara',personId:3,positionType:'Primera'},
 ]);
 S().assign('p1','m1','s1');
 S().assign('p2','m1','s2');
 S().setElements(S().elements);
 assert.equal(hist(),0,'historial limpio');
 assert.equal(MIN,360,'el minimo para 3 puestos es 360');
}

/**
 * Requisito central de 7R: un rechazo es ATOMICO. Se comprueba TODO lo que
 * importa a la vez: elementos, personas, IDs, asignaciones, otras marimbas,
 * historial y marca de sucio.
 *
 * `isDirty` se compara con el valor capturado, NO con `false`: en R10 la propia
 * accion previa (bloquear) ya deja la composicion sucia, y lo que exige la
 * atomicidad es que el rechazo NO la vuelva a cambiar.
 */
function intacto(msg,antes){
 assert.equal(firma(),antes.firma,`${msg}: el estado no cambia`);
 assert.equal(hist(),antes.hist,`${msg}: el historial no cambia`);
 assert.equal(S().isDirty,antes.dirty,`${msg}: la marca de sucio no cambia`);
}
const instantanea=()=>({firma:firma(),hist:hist(),dirty:S().isDirty});

// ============================== R01..R10 =================================

test('R01 resize de ancho valido',()=>{
 seed();
 S().resizeMarimba('m1',1200,150);
 const m=byId('m1');
 assert.equal(m.width,1200);
 assert.equal(m.height,150);
 m.positions.forEach((p,i)=>{
  const r=slotRect(m,i);
  assert.ok(r.x>=0&&r.x+r.width<=m.width+1e-9,`puesto ${i} dentro`);
 });
 assert.equal(byId('p1').marimbaId,'m1','asignacion intacta');
});

test('R02 resize de alto valido',()=>{
 seed();
 S().resizeMarimba('m1',900,260);
 assert.equal(byId('m1').height,260,'el alto cambia');
 // El modelo mantiene slotH/slotY constantes: solo cambia el marco.
 const m=byId('m1');
 assert.equal(slotRect(m,0).y,56);
 assert.equal(slotRect(m,0).height,54);
});

test('R03 el ancho minimo exacto se acepta',()=>{
 seed();
 S().resizeMarimba('m1',MIN,150);
 assert.equal(byId('m1').width,360,'width === needed se acepta');
 assert.equal(slotRect(byId('m1'),0).width,104,'el puesto mide minSlotW');
});

test('R04 un ancho menor que el minimo se rechaza',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('m1',MIN-1,150);
 intacto('ancho insuficiente',antes);
 assert.equal(byId('m1').width,900,'el ancho sigue siendo el original');
});

test('R05 NaN se rechaza',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('m1',NaN,150);
 S().resizeMarimba('m1',900,NaN);
 intacto('NaN',antes);
});

test('R06 Infinity se rechaza',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('m1',Infinity,150);
 S().resizeMarimba('m1',900,Infinity);
 intacto('Infinity',antes);
});

test('R07 -Infinity se rechaza',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('m1',-Infinity,150);
 S().resizeMarimba('m1',900,-Infinity);
 intacto('-Infinity',antes);
});

test('R08 los negativos se rechazan',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('m1',-1000,150);
 S().resizeMarimba('m1',900,-1000);
 intacto('negativos',antes);
});

test('R09 el cero se rechaza',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('m1',0,150);
 S().resizeMarimba('m1',900,0);
 intacto('cero',antes);
});

test('R10 una marimba bloqueada se rechaza',()=>{
 seed();
 S().toggleLock('m1');
 const antes=instantanea();
 S().resizeMarimba('m1',1500,400);
 intacto('bloqueada',antes);
 assert.equal(byId('m1').width,900);
 assert.equal(byId('m1').height,150);
});
// ============================== R11..R20 =================================

test('R11 en solo lectura se rechaza',()=>{
 seed();
 setReadOnly(true);
 try{
  const antes=instantanea();
  S().resizeMarimba('m1',1500,400);
  intacto('solo lectura',antes);
 }finally{ setReadOnly(false); }
});

test('R12 un id inexistente se rechaza',()=>{
 seed();
 const antes=instantanea();
 S().resizeMarimba('no-existe',1500,400);
 S().resizeMarimba('p1',1500,400);          // una persona no es una marimba
 intacto('id inexistente',antes);
});

test('R13 un no-op no genera historial adicional',()=>{
 seed();
 const h=hist();
 S().resizeMarimba('m1',900,150);          // identico al actual
 assert.equal(hist(),h,'ningun paso nuevo');
 assert.equal(S().isDirty,false,'ni se marca sucio');
});

test('R14 la persona asignada conserva personId, marimbaId y marimbaPositionId',()=>{
 seed();
 const antes=S().elements.filter(e=>e.type==='person')
  .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]);
 S().resizeMarimba('m1',1400,200);
 assert.deepEqual(S().elements.filter(e=>e.type==='person')
  .map(e=>[e.id,e.personId,e.marimbaId,e.marimbaPositionId]),antes);
 assert.deepEqual(byId('m1').positions.map(p=>p.personId),[1,2,null]);
 assert.equal(S().elements.filter(e=>e.type==='person').length,3,'no se crean');
});

test('R15 la persona queda centrada en SU puesto',()=>{
 seed();
 S().resizeMarimba('m1',1400,200);
 const m=byId('m1');
 const c0=slotCenter(m,m.positions.findIndex(p=>p.id==='s1'));
 assert.equal(byId('p1').x,c0.x,'centrada en X sobre su puesto');
 assert.equal(byId('p1').y,c0.y,'centrada en Y sobre su puesto');
 const c1=slotCenter(m,m.positions.findIndex(p=>p.id==='s2'));
 assert.equal(byId('p2').x,c1.x,'Luis sigue en su propio puesto');
 assert.notEqual(c0.x,c1.x,'los puestos siguen siendo distintos');
 // Y el tamano acompana al puesto nuevo, acotado por withCascade.
 const layout2=require('../src/lib/layout.ts');
 assert.equal(byId('p1').width,
  layout2.clampNumber(slotRect(m,0).width-6,
   layout2.PERSON_MIN_W,layout2.PERSON_MAX_W));
});

test('R16 otra marimba queda intacta',()=>{
 seed();
 const m2=JSON.stringify(byId('m2'));
 const p3={x:byId('p3').x,y:byId('p3').y};
 S().resizeMarimba('m1',1700,300);
 assert.equal(JSON.stringify(byId('m2')),m2,'m2 identica');
 assert.deepEqual({x:byId('p3').x,y:byId('p3').y},p3,'la persona libre no se mueve');
});

test('R17 deshacer restaura el estado previo exacto',()=>{
 seed();
 const antes=firma();
 S().resizeMarimba('m1',1400,220);
 S().undo();
 assert.equal(firma(),antes,'undo exacto');
 assert.equal(hist(),0,'el historial queda vacio');
});

test('R18 rehacer restaura el estado posterior exacto',()=>{
 seed();
 S().resizeMarimba('m1',1400,220);
 const despues=firma();
 S().undo();
 S().redo();
 assert.equal(firma(),despues,'redo exacto');
 assert.equal(byId('m1').width,1400);
 assert.equal(byId('m1').height,220);
});

test('R19 el resize produce UN solo paso de historial',()=>{
 seed();
 const h=hist();
 S().resizeMarimba('m1',1400,220);
 assert.equal(hist(),h+1,'exactamente un paso');
 // Ni reposicion ni cascade generan pasos propios.
 const p1=byId('p1');
 assert.notEqual(p1.x,undefined);
 assert.equal(hist(),h+1,'sigue habiendo un unico paso');
});

test('R20 el resize sobrevive a serializar y recargar',()=>{
 seed();
 S().resizeMarimba('m1',1450,320);
 const guardado=JSON.stringify(S().elements);
 S().setElements(JSON.parse(guardado));
 assert.equal(byId('m1').width,1450);
 assert.equal(byId('m1').height,320);
 assert.equal(byId('m1').x,200);
 assert.equal(byId('m1').y,150);
 assert.deepEqual(byId('m1').positions.map(p=>[p.id,p.personId]),
  [['s1',1],['s2',2],['s3',null]]);
 const m=byId('m1');
 const c0=slotCenter(m,m.positions.findIndex(p=>p.id==='s1'));
 assert.equal(byId('p1').x,c0.x,'la persona sigue centrada tras recargar');
 assert.equal(JSON.stringify(S().elements),guardado,'el formato no cambia');
});

test('R20b una composicion legacy pasa por el flujo de resize',()=>{
 setReadOnly(false);
 S().setElements([
  {id:'v1',type:'marimba',name:'Vieja',positions:['Primera','Segunda']},
 ]);
 const v=byId('v1');
 assert.equal(v.width,380,'valor por defecto al cargar');
 S().resizeMarimba('v1',500,200);
 assert.equal(byId('v1').width,500);
 assert.equal(byId('v1').height,200);
 assert.equal(S().elements.length,1,'no se crean elementos nuevos');
 assert.equal(byId('v1').positions.length,2,'los puestos siguen ahi');
});