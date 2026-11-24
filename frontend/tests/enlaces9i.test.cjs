// Fase 9I - listado AGREGADO de enlaces publicos del propietario.
//
// `publicLinks.ts` son las funciones puras que rotulan y sanean cada fila del
// listado (el ESTADO lo deriva el backend). Se prueban sin navegador, igual
// que `toExpiresAt` en 9G. El contrato de la API, los tres estados de la
// interfaz (carga/error/vacio) y la integracion en el Dashboard se verifican
// por analisis de fuente (estilo 7D/9G), porque el componente usa `fetch` via
// `api.ts` y no es importable en node.
const {test}=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const {estadoLabel,fechaAuditoria,esItemEnlace}
 =require('../src/lib/publicLinks.ts');

// --- 1. Rotulos de estado ----------------------------------------------------
test('9I-01 los tres estados se rotulan en castellano claro',()=>{
 assert.equal(estadoLabel('active'),'Activa');
 assert.equal(estadoLabel('expired'),'Expirada');
 assert.equal(estadoLabel('revoked'),'Revocada');
});

test('9I-02 un estado desconocido no rompe la tabla',()=>{
 assert.ok(estadoLabel('???').length>0);
});

// --- 2. Fechas de auditoria --------------------------------------------------
test('9I-03 expires_at null se muestra como «Sin caducidad» (convencion 9G)',()=>{
 assert.equal(fechaAuditoria(null),'Sin caducidad');
 assert.equal(fechaAuditoria(''),'Sin caducidad');
});

test('9I-04 created_at usa el rotulo alternativo, nunca un vacio',()=>{
 assert.equal(fechaAuditoria(null,'—'),'—');
 const f=fechaAuditoria('2026-06-01T12:00:00Z');
 assert.ok(f&&f!=='Sin caducidad');
});

test('9I-05 fecha invalida cae en el rotulo alternativo, sin excepcion',()=>{
 assert.equal(fechaAuditoria('no-es-fecha','—'),'—');
});

// --- 3. Guard de forma de lo que llega del backend ---------------------------
const ITEM={project_name:'Concierto',composition_name:'Pieza 1',
 created_at:'2026-06-01T12:00:00Z',expires_at:null,revoked_at:null,
 status:'active'};

test('9I-06 un item conforme al contrato se acepta',()=>{
 assert.equal(esItemEnlace(ITEM),true);
});

test('9I-07 cualquier campo de mas (token, ids) se rechaza',()=>{
 for(const extra of ['token','token_hash','user_id','composition_id',
                     'id','project_id']){
  assert.equal(esItemEnlace({...ITEM,[extra]:123}),false,extra);
 }
});

test('9I-08 status fuera de contrato, campos ausentes o tipos rotos se rechazan',()=>{
 assert.equal(esItemEnlace({...ITEM,status:'otro'}),false);
 assert.equal(esItemEnlace({...ITEM,composition_name:42}),false);
 const sin=({...ITEM});delete sin.revoked_at;
 assert.equal(esItemEnlace(sin),false);
 assert.equal(esItemEnlace(null),false);
 assert.equal(esItemEnlace([ITEM]),false);
 assert.equal(esItemEnlace('x'),false);
});

// --- 4. Contrato de la API e interfaz (analisis de fuente, estilo 7D) --------
const SRC=path.join(__dirname,'..','src');
const leer=(rel)=>fs.readFileSync(path.join(SRC,rel),'utf8');

test('9I-09 api.ts consulta el listado agregado GET /public-links',()=>{
 const a=leer('lib/api.ts');
 assert.ok(a.includes("publicLinksList:()=>req('/public-links')"),
           'debe existir el metodo del listado 9I');
});

test('9I-10 la vista distingue carga, error y vacio (nunca lista fingida)',()=>{
 const c=leer('components/PublicLinksList.tsx');
 assert.ok(c.includes('role="status"'),'cargando anunciado, no como vacio');
 assert.ok(c.includes('Cargando enlaces'),'mensaje de carga explicito');
 assert.ok(c.includes('role="alert"'),'error anunciado');
 assert.ok(c.includes('Reintentar'),'el error permite reintentar');
 assert.ok(c.includes('No tienes enlaces públicos'),'vacio explicito');
 // Los tres mensajes NO pueden convivir en el mismo render: cada uno vive
 // en su propia rama de `fase`.
 assert.ok(c.includes("fase==='carga'")&&c.includes("fase==='error'"),
           'los estados son excluyentes');
});

test('9I-11 la tabla es semantica, accesible y usa los rotulos de la lib',()=>{
 const c=leer('components/PublicLinksList.tsx');
 assert.ok(c.includes('<caption>'),'caption describe la tabla');
 assert.ok(c.includes('scope="col"'),'encabezados con alcance');
 assert.ok(c.includes('estadoLabel(x.status)'),'rotula con la funcion pura');
 assert.ok(c.includes('fechaAuditoria(x.expires_at)'),
           'la caducidad pasa por la convencion «Sin caducidad»');
 assert.ok(c.includes("fechaAuditoria(x.created_at,'—')"),
           'creado sin huecos vacios');
 assert.ok(c.includes('esItemEnlace'),'guard de forma antes de renderizar');
});

test('9I-12 el listado NO repite crear/revocar ni busca tokens (fuera de alcance)',()=>{
 const c=leer('components/PublicLinksList.tsx');
 // Ni las mutaciones individuales (9E/9G) ni las utilidades del token:
 // este listado es de AUDITORIA y el token en claro no es recuperable.
 for(const prohibido of ['revokePublicLink','createPublicLink','publicUrl',
                         'parsePublicPath']){
  assert.ok(!c.includes(prohibido),
            `${prohibido} no pertenece al listado de auditoria`);
 }
 assert.ok(!c.includes("from '../lib/publicLink'"),
           'no importa las utilidades del token');
 assert.ok(!c.includes('api.publicLink('),
           'tampoco consulta el enlace individual');
});

test('9I-13 el Dashboard integra el listado sin navegacion nueva',()=>{
 const d=leer('pages/Dashboard.tsx');
 assert.ok(d.includes("import PublicLinksList from '../components/PublicLinksList'"),
           'se importa el componente');
 assert.ok(d.includes('<PublicLinksList id="listado-enlaces-9i"/>'),
           'se monta en el panel de proyectos');
 assert.ok(d.includes('aria-expanded={verEnlaces}'),
           'el boton que lo abre declara su estado');
 assert.ok(d.includes("setVerEnlaces(v=>!v)"),
           'se abre y se cierra con el mismo boton');
 assert.ok(d.includes('{verEnlaces&&<PublicLinksList'),
           'se carga SOLO al abrir (sin peticion en cada arranque)');
});

test('9I-14 la respuesta del backend no lleva token ni ids (api.ts y lib)',()=>{
 const a=leer('lib/api.ts');
 const l=leer('lib/publicLinks.ts');
 assert.ok(!a.includes('/public-links?'),'sin parametros extra');
 // La lib solo conoce los seis campos del contrato.
 assert.ok(l.includes("composition_name,created_at,expires_at,project_name,"),
           'el guard exige el contrato cerrado de seis campos');
});
