// Fase 7D - colaboracion en el cliente.
// Se comprueba lo que la interfaz REFLEJA; la seguridad real la comprueba el
// backend y se prueba en backend/tests/test_collab_7d.py.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const SRC=path.join(__dirname,'..','src');
const leer=(rel)=>fs.readFileSync(path.join(SRC,rel),'utf8');
/** Quita comentarios: se analiza el codigo, no la documentacion. */
function codigo(rel){
 return leer(rel)
  .replace(/\/\*[\s\S]*?\*\//g,' ')
  .replace(/(^|[^:])\/\/.*$/gm,'$1')
  .replace(/^\s*\*.*$/gm,' ');
}

test('7D la seccion Compartir solo se monta para el propietario',()=>{
 const p=codigo('pages/Project.tsx');
 assert.ok(p.includes('SharePanel'),'debe existir la seccion de compartir');
 // Condicionada a ser propietario: ni editor ni reader la ven.
 assert.ok(/access\s*===?\s*'owner'\s*&&\s*<SharePanel/.test(p.replace(/\s+/g,' ')),
  'SharePanel debe renderizarse solo si access === owner');
});

test('7D el cliente consulta su nivel de acceso al backend',()=>{
 const p=codigo('pages/Project.tsx');
 assert.ok(p.includes('api.projectAccess(id)'),
  'el nivel se pide al servidor, no se deduce en el cliente');
 assert.ok(p.includes('readOnly'),'debe existir el modo de solo lectura');
});

test('7D el modo lectura avisa al usuario',()=>{
 const p=codigo('pages/Project.tsx');
 assert.ok(p.includes('solo lectura'),
  'se avisa de que no se puede modificar');
});

test('7D el panel de compartir expone agregar, cambiar y revocar',()=>{
 const s=codigo('components/SharePanel.tsx');
 assert.ok(s.includes('addCollaborator'),'agregar colaborador');
 assert.ok(s.includes('changeCollaboratorRole'),'cambiar rol');
 assert.ok(s.includes('removeCollaborator'),'revocar acceso');
 // Nunca pide ni muestra contrasenas.
 assert.ok(!s.includes('password'),'el panel no toca contrasenas');
});

test('7D el cliente ofrece los tres niveles con su etiqueta',()=>{
 const s=leer('components/SharePanel.tsx');
 for(const rol of ['owner','editor','reader']){
  assert.ok(s.includes(rol),`debe conocer el rol ${rol}`);
 }
 assert.ok(s.includes('Propietario')&&s.includes('Editor')
  &&s.includes('Solo lectura'),'cada nivel tiene su etiqueta en espanol');
});

test('7D la API expone las rutas de colaboracion',()=>{
 const a=codigo('lib/api.ts');
 for(const r of ['/access','/collaborators','/audit-log']){
  assert.ok(a.includes(r),`falta la ruta ${r}`);
 }
 assert.ok(a.includes('method:\'DELETE\''),'debe poder revocar');
 assert.ok(a.includes('method:\'PATCH\''),'debe poder cambiar el rol');
});
