// Fase 7E - modo de solo lectura, en el store.
// Se comprueba el EFECTO REAL de cada operacion (no que el boton exista), que
// es lo que importa: un lector no debe poder modificar nada del lienzo.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,file);
const mod=require('../src/store/composition.ts');
const {useComposition:store,setReadOnly,isReadOnly}=mod;
const state=()=>store.getState();

function seed(){
 setReadOnly(false);
 state().setElements([
  {id:'m',type:'marimba',name:'M',positions:[{id:'s1',type:'Primera',personId:1},{id:'s2',type:'Primera',personId:null}]},
  {id:'p1',type:'person',personId:1,name:'Ana',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s1'}
 ]);
}
const firma=()=>JSON.stringify(state().elements);

test('7E por defecto la composicion es editable',()=>{
 setReadOnly(false);seed();
 assert.equal(isReadOnly(),false);
 state().update('m',{name:'Cambiada'});
 assert.equal(state().elements[0].name,'Cambiada');
});

test('7E un lector NO puede renombrar ni mover una marimba',()=>{
 seed();setReadOnly(true);
 const antes=state().elements;
 state().update('m',{name:'Intrusa',x:999});
 assert.equal(state().elements[0].name,'M');
 assert.equal(state().elements[0].x,antes[0].x);
 assert.equal(state().isDirty,false,'no debe ensuciar la composicion');
});

test('7E un lector NO puede crear ni borrar elementos',()=>{
 seed();setReadOnly(true);
 state().addCustomMarimba('Intrusa');
 assert.equal(state().elements.filter(e=>e.type==='marimba').length,1);
 state().remove('m');
 assert.ok(state().elements.find(e=>e.id==='m'),'la marimba sigue ahi');
 state().remove('p1');
 assert.ok(state().elements.find(e=>e.id==='p1'));
 assert.equal(state().isDirty,false);
});

test('7E un lector NO puede cambiar asignaciones',()=>{
 seed();setReadOnly(true);
 const antes=state().elements.find(e=>e.id==='m').positions.map(p=>p.personId).join(',');
 state().assign('p1','m','s2');
 state().unassign('p1',null);
 assert.equal(
  state().elements.find(e=>e.id==='m').positions.map(p=>p.personId).join(','),
  antes,'los puestos no cambian');
 assert.equal(state().elements.find(e=>e.id==='p1').marimbaPositionId,'s1');
});

test('7E un lector NO puede modificar anotaciones',()=>{
 seed();setReadOnly(true);
 state().setNote({elementId:'p1'},{label:'Intrusa'});
 assert.equal(state().elements.find(e=>e.id==='p1').note,undefined);
 state().setNote({elementId:'m',positionId:'s2'},{comment:'No'});
 assert.equal(state().elements.find(e=>e.id==='m').positions[1].note,undefined);
});

test('7E un lector NO puede bloquear ni desbloquear',()=>{
 seed();setReadOnly(true);
 state().toggleLock('m');
 assert.equal(state().elements.find(e=>e.id==='m').locked,false);
});

test('7E un lector NO puede anadir ni quitar puestos',()=>{
 seed();setReadOnly(true);
 state().addPosition('m','Bajo');
 state().removePosition('m','s2');
 assert.equal(state().elements.find(e=>e.id==='m').positions.length,2);
});

test('7E un lector NO puede deshacer ni rehacer',()=>{
 seed();
 state().update('m',{name:'Editada'});
 assert.equal(state().history.length,1,'un editor sí genera historial');
 setReadOnly(true);
 const antes=state().elements[0].name;
 state().undo();
 assert.equal(state().elements[0].name,antes,'el lector no deshace');
 setReadOnly(false);
 state().undo();
 assert.equal(state().elements[0].name,'M','el editor sí deshace');
});

test('7E al salir del modo lectura la edicion vuelve',()=>{
 seed();setReadOnly(true);
 state().update('m',{name:'Bloqueado'});
 assert.equal(state().elements[0].name,'M');
 setReadOnly(false);
 state().update('m',{name:'Editable'});
 assert.equal(state().elements[0].name,'Editable');
 assert.equal(state().isDirty,true);
});

test('7E un lector no puede escribir aunque llame a las acciones globales',()=>{
 seed();setReadOnly(true);
 // Estas acciones ya escriben en la base, no solo en la composicion: el store
 // las marca como bloqueadas y el backend las rechaza.
 state().renamePerson('p1','Intrusa');
 assert.equal(state().elements.find(e=>e.id==='p1').name,'Ana');
 assert.equal(state().isDirty,false);
});

test('7E el bloqueo es centralizado: cubre raton, tactil y teclado',()=>{
 const src=fs.readFileSync(
  require('node:path').join(__dirname,'..','src','store','composition.ts'),'utf8');
 // El control esta en step/committed/undo/redo, no disperso por componentes.
 assert.ok(src.includes('let READ_ONLY'));
 assert.ok(/function step[\s\S]{0,400}if\(READ_ONLY\)return \{\}/.test(src),
  'step debe bloquear');
 assert.ok(/function committed[\s\S]{0,400}if\(READ_ONLY\)return \{\}/.test(src),
  'committed debe bloquear');
 assert.ok(/undo:\(\)=>set\(s=>\{[\s\S]{0,200}if\(READ_ONLY\)/.test(src),
  'undo debe bloquear');
 assert.ok(/redo:\(\)=>set\(s=>\{[\s\S]{0,200}if\(READ_ONLY\)/.test(src),
  'redo debe bloquear');
});
