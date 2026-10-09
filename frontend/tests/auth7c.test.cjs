// Fase 7C - autenticacion en el cliente.
// Se prueban las PIEZAS testeables sin navegador: la sesion se resuelve
// siempre contra el backend y el token nunca se guarda en localStorage.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const SRC=path.join(__dirname,'..','src');

function leer(rel){return fs.readFileSync(path.join(SRC,rel),'utf8');}

/** Quita los comentarios para no analizar texto que solo explica la regla. */
function codigo(rel){
 return leer(rel)
  .replace(/\/\*[\s\S]*?\*\//g,' ')
  .replace(/(^|[^:])\/\/.*$/gm,'$1')
  .replace(/^\s*\*.*$/gm,' ');
}

test('7C la sesion NO se guarda en localStorage ni sessionStorage',()=>{
 const api=leer('lib/api.ts');
 const app=leer('App.tsx');
 const auth=leer('components/AuthScreen.tsx');
 // Se analiza el CODIGO, no los comentarios que explican la regla.
 for(const fuente of [codigo('lib/api.ts'),codigo('App.tsx'),
                      codigo('components/AuthScreen.tsx')]){
  assert.ok(!fuente.includes('localStorage'),
   'el codigo no debe usar localStorage');
  assert.ok(!fuente.includes('sessionStorage'),
   'el codigo no debe usar sessionStorage');
 }
 // La cookie HttpOnly es la que mantiene la sesion.
 assert.ok(api.includes("credentials:'include'"),
  'las peticiones deben enviar la cookie de sesion');
});

test('7C las peticiones mutables llevan el token anti-CSRF',()=>{
 const api=leer('lib/api.ts');
 assert.ok(api.includes("'X-CSRF-Token'"),'debe anadir la cabecera CSRF');
 assert.ok(api.includes("marimba_csrf"),'debe leer la cookie del token');
 // Solo en metodos que cambian estado.
 assert.ok(api.includes("const UNSAFE=['POST','PUT','PATCH','DELETE']"));
});

test('7C la pantalla de acceso tiene los tres estados',()=>{
 const auth=leer('components/AuthScreen.tsx');
 assert.ok(auth.includes("mode === 'login'")
  ||auth.includes("mode==='login'")
  ||auth.includes("useState<Mode>('login')"),
  'pantalla de inicio de sesion');
 assert.ok(auth.includes("mode === 'forgot'")
  ||auth.includes("mode==='forgot'"),'pantalla de recuperacion');
 assert.ok(auth.includes("mode === 'reset'")
  ||auth.includes("mode==='reset'"),'pantalla de nueva contrasena');
 // Estados de carga y de error.
 assert.ok(auth.includes('busy'),'estado de carga');
 assert.ok(auth.includes("kind:'err'"),'mensaje de error');
 assert.ok(auth.includes("kind:'ok'"),'mensaje de exito');
});

test('7C la app consulta /auth/me al arrancar y sale si caduca',()=>{
 const app=leer('App.tsx');
 assert.ok(app.includes('api.me()'),'debe preguntar al backend quien es el usuario');
 // La autoridad es el servidor: si falla, se vuelve al login.
 assert.ok(app.includes('setUser(null)'),'sin sesion debe limpiar el estado');
 assert.ok(app.includes('setProject(undefined)'),
  'debe limpiar el proyecto abierto, para no mostrar datos ajenos');
 assert.ok(app.includes("import AuthScreen"),'debe mostrar la pantalla de acceso');
});

test('7C el cierre de sesion llama al backend',()=>{
 const app=leer('App.tsx');
 assert.ok(app.includes('api.logout()'),'debe cerrar sesion en el servidor');
 assert.ok(app.includes('Cerrar sesión'),'debe haber una accion visible');
});

test('7C la administracion solo se enlaza para administradores',()=>{
 const app=leer('App.tsx');
 assert.ok(app.includes("user.role==='admin'"),
  'el enlace de administracion solo aparece a administradores');
 // Y el backend es quien la protege de verdad.
 const deps=fs.readFileSync(
  path.join(__dirname,'..','..','backend','app','api','deps.py'),'utf8');
 assert.ok(deps.includes('def require_admin'),
  'el backend debe exigir rol de administrador');
 assert.ok(deps.includes('def check_admin'),
  'las escrituras administrativas tambien exigen CSRF');
});

test('7C la recuperacion no revela si la cuenta existe',()=>{
 const auth=leer('components/AuthScreen.tsx');
 // Usa el mensaje que devuelve el servidor, no uno propio que distinga casos.
 assert.ok(auth.includes('r.message'),'debe mostrar el mensaje del servidor');
 const routes=fs.readFileSync(
  path.join(__dirname,'..','..','backend','app','api','auth_routes.py'),'utf8');
 assert.ok(routes.includes('_RESET_MSG'),'el backend tiene un unico mensaje');
 // No se guarda ni se imprime el token en la interfaz.
 assert.ok(!auth.includes('console.log'));
});
