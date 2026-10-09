// Fase 9E - logica del enlace PUBLICO de solo lectura.
//
// `parsePublicPath` es lo que decide QUE renderiza `App.tsx`: si la ruta no es
// la publica, la app normal (y su login) se hace cargo. Se prueba aqui, sin
// navegador, porque es la pieza que no debe fallar jamas.
const {test}=require('node:test');
const assert=require('node:assert');
const {parsePublicPath,publicUrl}=require('../src/lib/publicLink.ts');

// Un token real de `secrets.token_urlsafe(32)`: 43 caracteres url-safe.
const TOKEN='aB3_-xZ9QwErTyUiOpAsDfGhJkL0123456789abcd';

// --- 1. Ruta valida ----------------------------------------------------------
test('9E-01 extrae el token de la ruta publica',()=>{
  assert.equal(parsePublicPath(`/public/compositions/${TOKEN}`),TOKEN);
});

test('9E-02 tokens cortos tambien se aceptan (el filtro real es el hash)',()=>{
  assert.equal(parsePublicPath('/public/compositions/abc-123'),'abc-123');
});

// --- 2. Todo lo demas NO es la ruta publica ---------------------------------
test('9E-03 token vacio -> null',()=>{
  assert.equal(parsePublicPath('/public/compositions/'),null);
});

test('9E-04 subrutas y barras extra -> null',()=>{
  assert.equal(parsePublicPath(`/public/compositions/${TOKEN}/edit`),null);
  assert.equal(parsePublicPath(`/public/compositions//${TOKEN}`),null);
});

test('9E-05 prefijos parecidos -> null',()=>{
  assert.equal(parsePublicPath('/public/composition/abc'),null);
  assert.equal(parsePublicPath('/api/public/compositions/abc'),null);
  assert.equal(parsePublicPath('/otro/public/compositions/abc'),null);
  assert.equal(parsePublicPath('/'),null);
});

test('9E-06 caracteres fuera de token_urlsafe -> null',()=>{
  // `%` (percent-codificado), espacio y `.` no genera jamas `token_urlsafe`.
  assert.equal(parsePublicPath('/public/compositions/ab%20cd'),null);
  assert.equal(parsePublicPath('/public/compositions/ab cd'),null);
  assert.equal(parsePublicPath('/public/compositions/abc.def'),null);
});

test('9E-07 no-string -> null',()=>{
  assert.equal(parsePublicPath(undefined),null);
  assert.equal(parsePublicPath(null),null);
});

// --- 3. URL absoluta ---------------------------------------------------------
test('9E-08 publicUrl monta la URL con el origen dado',()=>{
  assert.equal(publicUrl('http://localhost:18080',TOKEN),
               `http://localhost:18080/public/compositions/${TOKEN}`);
});

test('9E-09 publicUrl no duplica la barra del origen',()=>{
  assert.equal(publicUrl('http://localhost:18080/',TOKEN),
               `http://localhost:18080/public/compositions/${TOKEN}`);
});

test('9E-10 la URL montada vuelve a parsearse (ida y vuelta)',()=>{
  const url=publicUrl('http://localhost:18080',TOKEN);
  const ruta=new URL(url).pathname;
  assert.equal(parsePublicPath(ruta),TOKEN);
});