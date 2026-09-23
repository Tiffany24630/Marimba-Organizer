const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,file);
const {useComposition:store}=require('../src/store/composition.ts');
const state=()=>store.getState();
function seed(){
 state().setElements([
  {id:'m',type:'marimba',name:'M',positions:[{id:'s1',type:'Primera',personId:1},{id:'s2',type:'Primera',personId:2},{id:'s3',type:'Bajo',personId:null}]},
  {id:'p1',type:'person',personId:1,name:'Ana',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s1'},
  {id:'p2',type:'person',personId:2,name:'Luis',positionType:'Primera',marimbaId:'m',marimbaPositionId:'s2'}
 ]);
}
test('same-slot assignment is a clean no-op',()=>{
 seed();state().assign('p1','m','s1');assert.equal(state().history.length,0);assert.equal(state().isDirty,false);
});
test('incompatible assignment preserves types, slots and history',()=>{
 seed();const before=JSON.stringify(state().elements);state().assign('p1','m','s3');
 assert.equal(JSON.stringify(state().elements),before);assert.equal(state().history.length,0);
});
test('replacement is one undo step and restores saved dirty state',()=>{
 seed();const before=JSON.stringify(state().elements);state().assign('p1','m','s2');
 assert.equal(state().history.length,1);assert.equal(state().elements.find(e=>e.id==='p2').marimbaId,null);
 state().undo();assert.equal(JSON.stringify(state().elements),before);assert.equal(state().isDirty,false);
 state().redo();assert.equal(state().elements.find(e=>e.id==='p1').marimbaPositionId,'s2');
});
test('locked source marimba blocks secondary person operations',()=>{
 seed();state().toggleLock('m');state().markClean();const before=JSON.stringify(state().elements),history=state().history.length;
 state().removePersonFromProject('p1');state().setPersonPositionType('p2','Bajo');state().unassign('p2',null);
 assert.equal(JSON.stringify(state().elements),before);assert.equal(state().history.length,history);assert.equal(state().isDirty,false);
});
test('locked occupant cannot be replaced',()=>{
 seed();state().toggleLock('p2');const before=JSON.stringify(state().elements);state().assign('p1','m','s2');assert.equal(JSON.stringify(state().elements),before);
});
test('musical type does not silently rewrite occupied physical slot',()=>{
 seed();const before=JSON.stringify(state().elements);state().setPersonPositionType('p1','Bajo');assert.equal(JSON.stringify(state().elements),before);
 state().unassign('p1',null);state().setPersonPositionType('p1','Bajo');
 assert.equal(state().elements.find(e=>e.id==='p1').positionType,'Bajo');assert.equal(state().elements[0].positions[0].type,'Primera');
});
test('identical property edit does not add an undo step',()=>{
 seed();state().update('m',{name:'M'});assert.equal(state().history.length,0);assert.equal(state().isDirty,false);
});
