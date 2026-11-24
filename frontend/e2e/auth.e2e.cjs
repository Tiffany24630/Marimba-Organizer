/**
 * Fase 7G - pruebas E2E de navegador.
 *
 * Contra el entorno AISLADO de pruebas:
 *   - Frontend: http://localhost:18080
 *   - Buzon SMTP de pruebas (Mailpit): http://localhost:18025
 *
 * No toca produccion: todo ocurre contra el volumen Docker `marimba7f_db_data`.
 *
 * Se usa el runner nativo de Node (`node --test`) con la libreria `playwright`,
 * que ya era dependencia del proyecto. NO se anade `@playwright/test`: evitar
 * dependencias nuevas es parte del criterio de la fase.
 */
const {test, before, after, describe} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WEB = process.env.E2E_WEB || 'http://localhost:18080';
// Incluye el prefijo `/api`: es la base real que usa `lib/api.ts`.
const API = process.env.E2E_API || 'http://localhost:18000/api';
const MAILPIT = process.env.E2E_MAILPIT || 'http://localhost:18025';
const CLAVE = 'Prueba7F-No-Usar-Fuera';

const CORREOS = {
  admin: 'despliegue7f-a@prueba.local',
  editor: 'despliegue7f-b@prueba.local',
  reader: 'despliegue7f-rec@prueba.local',
  sinAcceso: 'despliegue7f-d@prueba.local',
};

const DESCARGAS = path.join(__dirname, '.descargas');
let navegador = null;

before(async () => {
  if (!fs.existsSync(DESCARGAS)) fs.mkdirSync(DESCARGAS, {recursive: true});
  navegador = await chromium.launch();
}, {timeout: 180000});

after(async () => {
  if (navegador) await navegador.close();
});

/** Abre un contexto limpio y entra con la cuenta indicada. */
async function abrirComo(correo) {
  const ctx = await navegador.newContext();
  const page = await ctx.newPage();
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  const campo = page.locator('input[type="email"]').first();
  await campo.waitFor({state: 'visible', timeout: 40000});
  await campo.fill(correo);
  await page.locator('input[type="password"]').first().fill(CLAVE);
  await page.locator('button')
    .filter({hasText: /entrar|acceder|iniciar/i}).first().click();
  await page.waitForLoadState('networkidle', {timeout: 40000});
  return {ctx, page};
}

describe('7G Autenticacion E2E', () => {
  test('el login valido entra y crea sesion HttpOnly', async () => {
    const {ctx, page} = await abrirComo(CORREOS.admin);
    const cookies = await ctx.cookies();
    const cookie = cookies.find(c => c.name === 'marimba_session');
    assert.ok(cookie, 'debe existir la cookie de sesion');
    assert.equal(cookie.httpOnly, true,
      'la cookie debe ser HttpOnly: el JS no puede leerla');
    assert.equal(String(cookie.sameSite).toLowerCase(), 'lax');
    const almacen = await page.evaluate(() =>
      JSON.stringify({...localStorage, ...sessionStorage}));
    assert.ok(!almacen.includes(cookie.value),
      'el token no debe estar en localStorage ni sessionStorage');
    await ctx.close();
  });

  test('credenciales invalidas se rechazan y no abren sesion', async () => {
    const ctx = await navegador.newContext();
    const page = await ctx.newPage();
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    await page.locator('input[type="email"]').first().waitFor({state: 'visible'});
    await page.locator('input[type="email"]').first().fill(CORREOS.admin);
    await page.locator('input[type="password"]').first().fill('ClaveIncorrecta7F');
    await page.locator('button')
      .filter({hasText: /entrar|acceder|iniciar/i}).first().click();
    await page.waitForTimeout(2500);
    const cookies = await ctx.cookies();
    assert.ok(!cookies.find(c => c.name === 'marimba_session' && c.value),
      'no debe haber sesion con una clave incorrecta');
    await ctx.close();
  });

  test('la sesion sobrevive a recargar la pagina', async () => {
    const {ctx, page} = await abrirComo(CORREOS.admin);
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.waitForLoadState('networkidle');
    const cookies = await ctx.cookies();
    assert.ok(cookies.find(c => c.name === 'marimba_session' && c.value),
      'tras recargar debe seguir having sesion');
    assert.ok(!page.url().includes('login'),
      'no debe volver a la pantalla de acceso: %s', page.url());
    await ctx.close();
  });

  test('el cierre de sesion bloquea el acceso posterior', async () => {
    const {ctx, page} = await abrirComo(CORREOS.admin);
    // Las llamadas se hacen contra la URL del BACKEND, no con rutas relativas:
    // el frontend se sirve en otro puerto y nginx no hace proxy de /api.
    const codigo = await page.evaluate(async (api) => {
      const csrf = (document.cookie.match(/marimba_csrf=([^;]+)/) || [])[1] || '';
      const r = await fetch(api + '/auth/logout', {
        method: 'POST', credentials: 'include',
        headers: {'X-CSRF-Token': csrf}});
      return r.status;
    }, API);
    assert.equal(codigo, 200);
    const despues = await page.evaluate(async (api) => {
      const r = await fetch(api + '/projects', {credentials: 'include'});
      return r.status;
    }, API);
    assert.ok([401, 403].includes(despues),
      'tras cerrar sesion las rutas privadas deben rechazarse: %s', despues);
    await ctx.close();
  });
});
