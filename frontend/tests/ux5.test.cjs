const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}
}).outputText,file);

// Regresion UX-5: abrir un proyecto recien creado (sin Excel analizado) renderiza
// el ImportPanel con `data === null`. `buildPayload()` hacia `data!.sheets`, asi
// que la cuenta de piezas reventaba al renderizar y React dejaba la pantalla en
// blanco. Se reproduce aqui la expresion exacta que fallaba.
test('countPiezas does not throw when no Excel has been analyzed yet',()=>{
 const buildPayload=()=>{
  const data=null;               // proyecto recien creado: sin preview
  if(!data)return [];
  return data.sheets;
 };
 // La forma que se usaba antes (sin guarda) reventaba:
 assert.throws(()=>{ const d=null; return d.sheets.map(()=>1); });
 // La forma corregida devuelve 0 sin reventar:
 const count=buildPayload().reduce((n,sh)=>n+sh.songs.length,0);
 assert.equal(count,0);
});

test('countPiezas is 0 for a fresh project and correct after an analysis',()=>{
 const mk=(data)=>{
  const buildPayload=()=>{
   if(!data)return [];
   return data.sheets;
  };
  return buildPayload().reduce((n,sh)=>n+sh.songs.length,0);
 };
 // Sin analisis: 0 piezas (y, sobre todo, sin exception).
 assert.equal(mk(null),0);
 // Con analisis de 1 hoja y 2 canciones: 2 piezas.
 assert.equal(mk({sheets:[{name:'H',songs:[{name:'A'},{name:'B'}]}]}),2);
 // Varias hojas y canciones sin participaciones validas: solo cuenta lo que queda.
 assert.equal(mk({sheets:[
  {name:'H1',songs:[{name:'A'}]},
  {name:'H2',songs:[{name:'B'},{name:'C'}]}]}),3);
 // Sin canciones: 0.
 assert.equal(mk({sheets:[{name:'H',songs:[]}]}),0);
});

// --- El ImportPanel REAL, renderizado de verdad ---------------------------
// React 19 y react-dom estan instalados, asi que el componente se monta en
// serio. Es el escenario que dejaba la pantalla en blanco: dentro de un
// proyecto recien creado, sin Excel analizado.
const ROOT=path.resolve(__dirname,'..');
require.extensions['.tsx']=(m,file)=>{
 const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
                   jsx:ts.JsxEmit.React,esModuleInterop:true},
 }).outputText;
 m._compile(out,file);
};
require.extensions['.ts']=require.extensions['.tsx'];

// La API no debe tocarse durante el render.
const apiPath=path.join(ROOT,'src','lib','api.ts');
require.cache[apiPath]={id:apiPath,filename:apiPath,loaded:true,
 exports:{api:new Proxy({},{get:()=>async()=>({})})}};

const React=require('react');
// El JSX transpilado emite `React.createElement`, asi que el identificador
// tiene que existir en el ambito del modulo evaluado.
global.React=React;
const {renderToStaticMarkup}=require('react-dom/server');
const ImportPanel=
 require(path.join(ROOT,'src','components','ImportPanel.tsx')).default;

const renderEnProyecto=()=>renderToStaticMarkup(
 React.createElement(ImportPanel,{projectId:1,existingSongNames:[],onDone:()=>{}}));

test('the real ImportPanel renders inside a fresh project without throwing',()=>{
 let html='';
 // Si esto lanza, el componente revienta al renderizar y React borra la
 // pantalla: exactamente la pagina en blanco que reporto el usuario.
 assert.doesNotThrow(()=>{html=renderEnProyecto();});
 assert.ok(html.length>0,'el render produjo HTML');
 assert.match(html,/Agregar piezas con Excel/);
 // Explica que las piezas se suman, sinreplace de lo que ya hay.
 assert.match(html,/se SUMAN/);
 // Ya se esta dentro de un proyecto: no se vuelve a pedir nombre ni destino.
 assert.doesNotMatch(html,/Nombre del trabajo/);
 assert.doesNotMatch(html,/crear proyecto nuevo/);
 // La cuenta de piezas solo aparece cuando hay analisis.
 assert.doesNotMatch(html,/pieza\(s\) a este proyecto/);
});

test('the render check would catch a regression of the white-screen bug',()=>{
 const src=path.join(ROOT,'src','components','ImportPanel.tsx');
 const original=fs.readFileSync(src,'utf8');
 // Se deshace la guarda a proposito.
 const roto=original
  .replace('const countPiezas=intoExisting&&data','const countPiezas=intoExisting')
  .replace('if(!data)return [];','');
 assert.notEqual(roto,original,'el codigo sigue teniendo las guardas');
 if(roto===original)return;   // si cambian, la sonda ya no aplica

 const mod=new (require('module').Module)(src,null);
 mod.filename=src;
 mod.paths=require('module').Module._nodeModulePaths(path.dirname(src));
 mod._compile(ts.transpileModule(roto,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,src);

 // Sin el fix, este render LANZA (y la pantalla queda en blanco).
 assert.throws(()=>renderToStaticMarkup(
  React.createElement(mod.exports.default,
   {projectId:1,existingSongNames:[],onDone:()=>{}})));
});

