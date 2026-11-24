// Fase 9G - caducidad OPCIONAL del enlace publico.
//
// `toExpiresAt` es la funcion pura que normaliza el `datetime-local` del
// panel a ISO UTC (o `null` = sin caducidad, 9E intacto). Se prueba sin
// navegador, igual que `parsePublicPath` en 9E. El envio real al backend y
// el contrato de la API se verifican por analisis de fuente (estilo 7D),
// porque `api.ts` usa `fetch` + `import.meta.env` y no es importable en node.
const {test}=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const {toExpiresAt}=require('../src/lib/publicLink.ts');

const AHORA=new Date('2026-06-01T12:00:00.000Z').getTime();

// --- 1. Funcion pura -------------------------------------------------------
test('9G-01 vacio = sin caducidad (null, comportamiento 9E)',()=>{
  assert.equal(toExpiresAt('',AHORA),null);
  assert.equal(toExpiresAt('   ',AHORA),null);
});

test('9G-02 futuro se normaliza a ISO UTC',()=>{
  const iso=toExpiresAt('2026-12-31T23:00',AHORA);
  assert.ok(iso&&iso.endsWith('Z'),'debe ser ISO UTC');
  assert.ok(new Date(iso).getTime()>AHORA,'debe quedar en el futuro');
});

test('9G-03 pasado se rechaza sin tocar la red',()=>{
  assert.throws(()=>toExpiresAt('2020-01-01T00:00',AHORA),
                /futuro/);
});

test('9G-04 la frontera es determinista: <= ahora expira',()=>{
  // La cadena se construye en HORA LOCAL (lo que devuelve el input
  // datetime-local), para que represente exactamente AHORA en cualquier TZ.
  const d=new Date(AHORA);
  const p=(n)=>String(n).padStart(2,'0');
  const local=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  assert.throws(()=>toExpiresAt(local,AHORA),/futuro/,
                'igual-a-ahora ya esta expirado');
});

test('9G-05 fecha invalida se rechaza',()=>{
  assert.throws(()=>toExpiresAt('no-es-fecha',AHORA),/válida/);
});

// --- 2. Contrato de la API (analisis de fuente, estilo 7D) -----------------
const SRC=path.join(__dirname,'..','src');
const leer=(rel)=>fs.readFileSync(path.join(SRC,rel),'utf8');

test('9G-06 createPublicLink transmite expires_at solo si hay caducidad',()=>{
  const a=leer('lib/api.ts');
  assert.ok(a.includes('expires_at'),'debe conocer el campo expires_at');
  assert.ok(a.includes('expires_at?{expires_at}:{}'),
            'vacio = cuerpo {} (sin caducidad, 9E intacto)');
});

test('9G-07 el panel valida antes de enviar y conserva crear/revocar/copiar',()=>{
  const p=leer('components/PublicLinkPanel.tsx');
  assert.ok(p.includes('toExpiresAt(expira)'),'valida con el helper puro');
  assert.ok(p.includes('type="datetime-local"'),'control nativo accesible');
  assert.ok(p.includes('Caduca (opcional)'),'la caducidad se marca opcional');
  assert.ok(p.includes('aria-describedby'),'error accesible descrito');
  assert.ok(p.includes('api.createPublicLink(compositionId,exp)'),
            'envia la caducidad normalizada');
  assert.ok(p.includes('Copiar enlace')&&p.includes('Revocar'),
            'copiar y revocar siguen intactos');
  assert.ok(p.includes('expira el'),'el estado muestra la caducidad');
});
