const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,file);
const {useComposition:store,elementLocked}=require('../src/store/composition.ts');
const {seatScale,slotRect,PERSON_MAX_SCALE,PERSON_MIN_SCALE}=require('../src/lib/layout.ts');
const state=()=>store.getState();
const clone=(v)=>JSON.parse(JSON.stringify(v));
function seed(){
 state().setElements([
  {id:'m',type:'marimba',name:'M',positions:[
    {id:'s1',type:'Primera',personId:1},
    {id:'s2',type:'Primera',personId:2},
    {id:'s3',type:'Bajo',personId:null}]},
  {id:'p1',type:'person',personId:1,name:'Ana',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s1'},
  {id:'p2',type:'person',personId:2,name:'Luis',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s2'},
  {id:'p3',type:'person',personId:3,name:'Zoe',positionType:'Bajo',marimbaId:null,marimbaPositionId:null},
  {id:'p4',type:'person',personId:4,name:'Ana II',positionType:'Primera',marimbaId:null,marimbaPositionId:null}
 ]);
}

// ============================================ P3: undo/redo y acciones logicas

test('assign / replace / free are exactly one logical undo step each',()=>{
 seed();
 const s0=JSON.stringify(state().elements);

 state().assign('p3','m','s3');
 assert.equal(state().history.length,1);
 assert.equal(state().elements.find(e=>e.id==='p3').marimbaPositionId,'s3');
 state().undo();
 assert.equal(JSON.stringify(state().elements),s0);

 // Replacement: p4 takes p1's slot; p1 is released, never deleted.
 state().assign('p4','m','s1');
 assert.equal(state().history.length,1);
 assert.equal(state().elements.find(e=>e.id==='p1').marimbaId,null);
 assert.equal(state().elements[0].positions.find(p=>p.id==='s1').personId,4);
 state().undo();
 assert.equal(JSON.stringify(state().elements),s0);

 state().assign('p3','m','s3');
 state().unassign('p3',null);
 assert.equal(state().history.length,2);
 state().undo();
 assert.equal(state().elements.find(e=>e.id==='p3').marimbaId,'m');
 state().undo();
 assert.equal(JSON.stringify(state().elements),s0);
});

test('moving a free person is one undo step and a no-op drag changes nothing',()=>{
 seed();
 const before=JSON.stringify(state().elements);
 const p3=state().elements.find(e=>e.id==='p3');
 state().dropPerson('p3',null,{x:p3.x,y:p3.y,rotation:p3.rotation});
 assert.equal(state().history.length,0);
 assert.equal(state().isDirty,false);
 assert.equal(JSON.stringify(state().elements),before);

 state().dropPerson('p3',null,{x:500,y:520,rotation:0});
 assert.equal(state().history.length,1);
 assert.equal(state().isDirty,true);
 state().undo();
 assert.equal(JSON.stringify(state().elements),before);
 assert.equal(state().isDirty,false);
});

test('endGesture drops the pre-snapshot of a gesture that changed nothing',()=>{
 seed();
 state().markClean();
 state().recordHistory();
 state().endGesture();
 assert.equal(state().history.length,0);
 assert.equal(state().isDirty,false);

 state().recordHistory();
 state().marimbaDragged('m',10,10);
 state().endGesture();
 assert.equal(state().history.length,1);
 assert.equal(state().isDirty,true);
 state().undo();
 assert.equal(state().isDirty,false);
});

// ============================= P2/P6: operaciones globales fuera del historial

test('global writes (create/rename) dirty the composition but never fake an undo step',()=>{
 seed();
 state().markClean();

 const id=state().createPersonElement({personId:9,name:'Nueva',positionType:'Tenor'});
 assert.ok(id);
 assert.equal(state().history.length,0);
 assert.equal(state().isDirty,true);

 assert.equal(state().renamePerson('p1','Ana 2'),true);
 assert.equal(state().history.length,0);
 assert.equal(state().isDirty,true);
 assert.equal(state().elements.find(e=>e.id==='p1').name,'Ana 2');

 // Undo only walks composition history: it must not claim to revert the catalog.
 state().undo();
 assert.equal(state().history.length,0);
 assert.equal(state().elements.find(e=>e.id==='p1').name,'Ana 2');
 assert.equal(state().elements.some(e=>e.id===id),true);
});

test('removePersonFromProject is a global write: no undo step, slots freed, no data lost',()=>{
 seed();
 state().markClean();
 state().removePersonFromProject('p1');

 assert.equal(state().history.length,0);
 assert.equal(state().isDirty,true);
 assert.equal(state().elements.some(e=>e.type==='person'&&e.personId===1),false);
 assert.equal(state().elements[0].positions.find(p=>p.id==='s1').personId,null);
 assert.equal(state().elements.some(e=>e.type==='person'&&e.personId===2),true);
 assert.equal(state().elements[0].positions[0].type,'Primera');
});

test('rename is refused for locked people and for an empty name',()=>{
 seed();
 assert.equal(state().renamePerson('p1','   '),false);
 state().toggleLock('p1');
 const before=JSON.stringify(state().elements);
 assert.equal(state().renamePerson('p1','Ana Bloqueada'),false);
 assert.equal(JSON.stringify(state().elements),before);
});

// ================================================ P5: locks en rutas secundarias

test('a person on a locked marimba is locked for every secondary route',()=>{
 seed();
 state().toggleLock('m');
 state().markClean();
 assert.equal(elementLocked(state().elements,'p1'),true);

 const before=JSON.stringify(state().elements);
 const history=state().history.length;
 state().update('p1',{name:'Intrusa'});
 state().remove('p1');
 state().unassign('p1',null);
 state().dropPerson('p1',{x:20,y:80},{x:20,y:80,rotation:0});
 state().setPersonPositionType('p1','Bajo');
 state().renamePerson('p1','Intrusa');
 state().removePersonFromProject('p1');
 state().assign('p4','m','s1');
 state().removePosition('m','s3');
 state().setPositionType('m','s3','Timbal');
 assert.equal(JSON.stringify(state().elements),before);
 assert.equal(state().history.length,history);
 assert.equal(state().isDirty,false);
});

test('assigning into a locked marimba is rejected from the panel route too',()=>{
 seed();
 state().setElements([
  ...clone(state().elements),
  {id:'m2',type:'marimba',name:'M2',locked:true,positions:[{id:'t1',type:'Bajo',personId:null}]}
 ]);
 state().assign('p3','m2','t1');
 assert.equal(state().elements.find(e=>e.id==='p3').marimbaId,null);
 assert.equal(state().history.length,0);
 assert.equal(state().isDirty,false);
});


// ============================================ P9: seleccion independiente de slot

test('slot selection is exclusive with element selection',()=>{
 seed();
 state().select('p1');
 assert.equal(state().selectedSlot,null);

 state().selectSlot({marimbaId:'m',positionId:'s3'});
 assert.deepEqual(state().selectedSlot,{marimbaId:'m',positionId:'s3'});
 assert.equal(state().selectedId,null);

 state().select('p1');
 assert.equal(state().selectedSlot,null);

 state().setElements([]);
 assert.equal(state().selectedSlot,null);
 assert.equal(state().selectedId,null);
});

// ============================================ P10: dirty state y guardado

test('markClean pins the payload that was actually saved',()=>{
 seed();
 const payload=clone(state().elements);
 state().assign('p3','m','s3');
 state().markClean(payload);
 // The newer change is NOT marked as saved.
 assert.equal(state().isDirty,true);

 state().undo();
 state().markClean(payload);
 assert.equal(state().isDirty,false);
});

test('undo back to the saved state clears dirty; undo elsewhere keeps it dirty',()=>{
 seed();
 state().assign('p3','m','s3');
 state().markClean(state().elements);
 assert.equal(state().isDirty,false);

 state().undo();
 assert.equal(state().isDirty,true);
 state().redo();
 assert.equal(state().isDirty,false);
});

// ============================== P8: tipo musical vs puesto fisico (coherencia)

test('a musical type never silently rewrites a physical slot',()=>{
 seed();
 // UX-4: en edicion manual se puede cambiar el puesto musical sentado.
 state().setPersonPositionType('p1','Bajo');
 assert.equal(state().elements.find(e=>e.id==='p1').positionType,'Bajo');
 assert.equal(state().history.length,1);
 // El invariante se mantiene: el tipo FISICO del puesto nunca se reescribe solo.
 assert.equal(state().elements[0].positions[0].type,'Primera');
 assert.equal(state().elements[0].positions[2].type,'Bajo');
 state().undo();
 assert.equal(state().elements.find(e=>e.id==='p1').positionType,'Primera');
 assert.equal(state().history.length,0);

 state().setPersonPositionType('p3','Tenor');
 assert.equal(state().history.length,1);
 assert.equal(state().elements.find(e=>e.id==='p3').positionType,'Tenor');
 assert.equal(state().elements[0].positions[0].type,'Primera');
 state().undo();
 assert.equal(state().elements.find(e=>e.id==='p3').positionType,'Bajo');
});

test('resizing a marimba resizes its people and never squashes the text',()=>{
 seed();
 const p1=state().elements.find(e=>e.id==='p1');
 const w0=state().elements[0].width;
 state().update('m',{width:w0+200});
 const m=state().elements[0];
 const seated=state().elements.find(e=>e.id==='p1');
 assert.ok(m.width>w0);
 assert.notEqual(seated.width,p1.width,'la persona debe seguir al ancho de su puesto');
 assert.equal(seated.scaleX,1);
 assert.equal(seated.scaleY,1);

 // Escala extrema: se acota y se conserva la proporcion.
 state().update('p3',{scaleX:0.01,scaleY:0.01});
 const p3=state().elements.find(e=>e.id==='p3');
 assert.ok(p3.scaleX>=0.55,'escala minima acotada');
 assert.equal(p3.scaleX,p3.scaleY,'la proporcion se conserva');
 state().undo();
 // Y siempre se puede devolver a su forma original.
 state().update('p3',{width:150,height:44,scaleX:1,scaleY:1});
 const r=state().elements.find(e=>e.id==='p3');
 assert.equal(r.scaleX,1);
 assert.equal(r.scaleY,1);
});

// UX-4: la marimba se escala con scaleX/scaleY (Konva no cambia `width`), asi que
// la persona DEBE acompañar ese escalado. Antes `PersonNode` usaba siempre
// `slotRect` sin escala y la persona se quedaba quieta mientras su puesto crecia.
test('a seated person visually follows the marimba scale, with limits',()=>{
 const m={id:'m',type:'marimba',name:'M',x:0,y:0,width:380,height:150,rotation:0,
  scaleX:1,scaleY:1,locked:false,positions:[
   {id:'s1',type:'Primera',personId:1},
   {id:'s2',type:'Primera',personId:2}]};

 // Sin escala no hay cambio de comportamiento.
 assert.equal(seatScale(m,0),1);
 assert.equal(seatScale(m,1),1);

 // Crecer x2 duplica el ancho dibujado de la persona.
 const base=slotRect(m,0).width-6;
 const up=seatScale({...m,scaleX:2,scaleY:2},0);
 assert.equal(up,2);
 assert.equal(base*up,base*2,'la persona crece con la marimba');

 // Reducir la deja en el minimo acotado: 0.5 < PERSON_MIN_SCALE.
 // Ese es justo el limite pedido ("que no pierda calidad"): por debajo de 0.55
 // el nombre deja de leerse.
 const down=seatScale({...m,scaleX:0.5,scaleY:0.5},0);
 assert.equal(down,PERSON_MIN_SCALE,'se acota al minimo legible');
 assert.ok(base*down<base,'la persona se hace mas pequena que su puesto');

 // LIMITES: nunca se deforma ni se vuelve ilegible.
 assert.equal(seatScale({...m,scaleX:9,scaleY:9},0),PERSON_MAX_SCALE);
 assert.equal(seatScale({...m,scaleX:0.02,scaleY:0.02},0),PERSON_MIN_SCALE);
 // Escala no uniforme: se promedia para que el texto no se deforme.
 assert.equal(seatScale({...m,scaleX:2,scaleY:1},0),1.5);
 // Ruido de decimales de Konva al soltar el tirador: no debe reescalar.
 assert.equal(seatScale({...m,scaleX:1.004,scaleY:1.004},0),1);
 assert.equal(seatScale({...m,scaleX:0,scaleY:0},0),1,'escala 0 no colapsa el texto');
});

