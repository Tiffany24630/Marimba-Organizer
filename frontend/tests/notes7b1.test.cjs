// Fase 7B.1 - anotaciones (etiquetas y comentarios)
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,file);
const {useComposition:store}=require('../src/store/composition.ts');
const notes=require('../src/lib/notes.ts');
const state=()=>store.getState();
function seed(){
 state().setElements([
  {id:'m',type:'marimba',name:'M',positions:[{id:'s1',type:'Primera',personId:1},{id:'s2',type:'Primera',personId:2},{id:'s3',type:'Bajo',personId:null}]},
  {id:'p1',type:'person',personId:1,name:'Ana',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s1'},
  {id:'p2',type:'person',personId:2,name:'Luis',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s2'}
 ]);
}

test('7B.1 normaliza, recorta y descarta anotaciones vacias',()=>{
 assert.equal(notes.cleanLabel('  Ana  '),'Ana');
 // Vacio / solo espacios / null -> sin anotacion.
 assert.equal(notes.normalizeNote({label:'   ',comment:''}),undefined);
 assert.equal(notes.normalizeNote(null),undefined);
 assert.equal(notes.normalizeNote({label:undefined,comment:undefined}),undefined);
 // Exceso de longitud: se recorta con elipsis.
 const largo=notes.cleanLabel('a'.repeat(200));
 assert.equal(largo.length,notes.LABEL_MAX);
 assert.ok(largo.endsWith('…'));
 assert.equal(notes.cleanComment('b'.repeat(999)).length,notes.COMMENT_MAX);
 // Saltos de linea colapsados: romperian el lienzo.
 assert.equal(notes.cleanComment('hola\n  mundo'),'hola mundo');
 // Solo conserva etiqueta: el comentario vacio no aparece.
 assert.deepEqual(notes.normalizeNote({label:'Kay'}),{label:'Kay'});
 // Datos malformados (numeros, objetos) no rompen nada.
 assert.equal(notes.cleanLabel(123),'123');
 assert.equal(notes.cleanLabel({}),'');
 assert.equal(notes.normalizeNote(42),undefined);
});

test('7B.1 crea etiqueta y comentario en persona, marimba y puesto',()=>{
 seed();
 state().setNote({elementId:'p1'},{label:'Kay'});
 state().setNote({elementId:'m'},{comment:'Marimba principal del conjunto'});
 state().setNote({elementId:'m',positionId:'s3'},{label:'Bajo'});
 const els=state().elements;
 assert.equal(els.find(e=>e.id==='p1').note.label,'Kay');
 assert.equal(els.find(e=>e.id==='m').note.comment,'Marimba principal del conjunto');
 assert.equal(els.find(e=>e.id==='m').positions[2].note.label,'Bajo');
 // Las anotaciones NO tocan asignaciones ni geometria.
 assert.equal(els.find(e=>e.id==='p1').marimbaPositionId,'s1');
 assert.equal(els.find(e=>e.id==='m').positions[0].personId,1);
});

test('7B.1 editar no pisa el otro campo y permite borrar',()=>{
 seed();
 state().setNote({elementId:'p1'},{label:'Kay'});
 state().setNote({elementId:'p1'},{comment:'Toca la campana al entrar'});
 // Editar la etiqueta conserva el comentario.
 state().setNote({elementId:'p1'},{label:'Ana'});
 const n=state().elements.find(e=>e.id==='p1').note;
 assert.equal(n.label,'Ana');
 assert.equal(n.comment,'Toca la campana al entrar');
 // clearNote elimina la anotacion entera.
 state().clearNote({elementId:'p1'});
 assert.equal(state().elements.find(e=>e.id==='p1').note,undefined);
 // Borrar el ultimo campo tambien limpia el objeto (no deja {} guardado).
 state().setNote({elementId:'p1'},{label:'X'});
 state().setNote({elementId:'p1'},{label:''});
 assert.equal(state().elements.find(e=>e.id==='p1').note,undefined);
});

test('7B.1 las anotaciones sobreviven a guardar y reabrir',()=>{
 seed();
 state().setNote({elementId:'p1'},{label:'Kay',comment:'Primera fila'});
 state().setNote({elementId:'m',positionId:'s3'},{label:'Bajo'});
 // Guardar manda `elements`; reabrir vuelve a normalizar.
 const guardado=JSON.parse(JSON.stringify(state().elements));
 state().setElements(guardado);
 const p=state().elements.find(e=>e.id==='p1');
 const s3=state().elements.find(e=>e.id==='m').positions[2];
 assert.equal(p.note.label,'Kay');
 assert.equal(p.note.comment,'Primera fila');
 assert.equal(s3.note.label,'Bajo');
 assert.equal(state().isDirty,false,'reabrir no debe marcar sucio');
});

test('7B.1 no deja anotaciones huerfanas al borrar elementos o puestos',()=>{
 seed();
 state().setNote({elementId:'p1'},{label:'Kay'});
 state().setNote({elementId:'m',positionId:'s3'},{label:'Bajo'});
 state().remove('p1');
 state().remove('m');
 // Al borrar la marimba, sus personas quedan sueltas (comportamiento previo del
 // proyecto) pero SIN anotacion: ninguna sobrevive a su elemento.
 assert.equal(notes.hasAnyNote(state().elements),false);
 // Al quitar un puesto desaparece solo la anotacion de ESE puesto.
 seed();
 state().setNote({elementId:'m',positionId:'s3'},{label:'Bajo'});
 state().setNote({elementId:'m',positionId:'s1'},{label:'Uno'});
 state().removePosition('m','s3');
 const m=state().elements.find(e=>e.id==='m');
 assert.equal(m.positions.find(p=>p.id==='s3'),undefined);
 assert.equal(m.positions.find(p=>p.id==='s1').note.label,'Uno');
 // Si la persona se queda sin puesto, conserva su anotacion (sigue en el
 // lienzo): no es un huerfano, es un elemento vivo.
 seed();
 state().setNote({elementId:'p1'},{label:'Kay'});
 state().remove('m');
 const p=state().elements.find(e=>e.id==='p1');
 assert.ok(p,'la persona sigue en el lienzo, suelta');
 assert.equal(p.marimbaId,null);
 assert.equal(p.note.label,'Kay');
});

test('7B.1 duplicar copia las anotaciones de forma independiente',()=>{
 seed();
 state().setNote({elementId:'p1'},{label:'Kay'});
 state().setNote({elementId:'m',positionId:'s3'},{label:'Bajo'});
 const original=JSON.parse(JSON.stringify(state().elements));
 const copia=JSON.parse(JSON.stringify(original));
 // Editar la copia NO toca el original.
 copia.find(e=>e.id==='p1').note.label='Cambiada';
 assert.equal(original.find(e=>e.id==='p1').note.label,'Kay');
 assert.equal(copia[0].positions[2].note.label,'Bajo');
});

test('7B.1 un elemento bloqueado no se puede anotar',()=>{
 seed();
 state().toggleLock('p1');
 const before=JSON.stringify(state().elements);
 state().setNote({elementId:'p1'},{label:'X'});
 assert.equal(JSON.stringify(state().elements),before);
 state().toggleLock('p1');
 state().setNote({elementId:'p1'},{label:'X'});
 assert.equal(state().elements.find(e=>e.id==='p1').note.label,'X');
});

test('7B.1 un puesto inexistente o una persona no se pueden anotar',()=>{
 seed();
 const before=JSON.stringify(state().elements);
 state().setNote({elementId:'m',positionId:'no-existe'},{label:'X'});
 state().setNote({elementId:'p1',positionId:'s1'},{label:'X'});
 assert.equal(JSON.stringify(state().elements),before);
});

test('7B.1 anotar es un paso de deshacer y se puede rehacer',()=>{
 seed();
 const before=JSON.stringify(state().elements);
 state().setNote({elementId:'p1'},{label:'Kay'});
 assert.equal(state().history.length,1);
 state().undo();
 assert.equal(JSON.stringify(state().elements),before);
 state().redo();
 assert.equal(state().elements.find(e=>e.id==='p1').note.label,'Kay');
});

test('7B.1 el texto del chip se recorta sin partir palabras',()=>{
 assert.equal(notes.chipText('Corto'),'Corto');
 assert.ok(notes.chipText('segunda fila derecha').endsWith('…'));
 assert.ok(notes.chipText('segunda fila derecha').length<=13);
 assert.equal(notes.chipText('abcdefghijklmnop',8),'abcdefgh…');
});
