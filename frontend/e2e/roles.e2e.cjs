/**
 * Fase 7G - E2E de roles con el despliegue AISLADO.
 *
 * Runner minimo y directo, a proposito. En este entorno, abrir muchos
 * contextos de Chromium seguidos hacia que el proceso Node muera sin excepcion
 * (fallo nativo que no deja traza). Con un contexto por rol y pocas llamadas
 * por comprobacion es estable, y mide lo mismo que importa: el ESTADO REAL en
 * el backend, no si un boton existe.
 *
 * Informe: e2e/.informe-roles.txt
 */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WEB = process.env.E2E_WEB || 'http://localhost:18080';
const API = process.env.E2E_API || 'http://localhost:18000/api';
const CLAVE = 'Prueba7F-No-Usar-Fuera';
const INFORME = path.join(__dirname, '.informe-roles.txt');

const DUENO = 'despliegue7f-a@prueba.local';
const EDITOR = 'despliegue7f-b@prueba.local';
const LECTOR = 'despliegue7f-rec@prueba.local';
const INTRUSO = 'despliegue7f-d@prueba.local';

const out = [];
const fallos = [];
function guardar() {
  fs.writeFileSync(INFORME, out.join('\n'), 'utf8');
}
async function caso(nombre, fn) {
  try {
    const d = await fn();
    out.push('OK    ' + nombre + (d ? '  -> ' + d : ''));
  } catch (e) {
    out.push('FALLO ' + nombre + '  -> ' +
      String(e && e.message ? e.message : e).slice(0, 200));
    fallos.push(nombre);
  }
  guardar();
}

async function sesion(nav, correo) {
  const ctx = await nav.newContext();
  const page = await ctx.newPage();
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('input[type="email"]').first()
    .waitFor({state: 'visible', timeout: 40000});
  await page.locator('input[type="email"]').first().fill(correo);
  await page.locator('input[type="password"]').first().fill(CLAVE);
  await page.locator('button').filter({hasText: /entrar|acceder|iniciar/i})
    .first().click();
  await page.waitForLoadState('networkidle', {timeout: 40000});
  return {ctx, page};
}

async function csrf(page) {
  return page.evaluate(() =>
    (document.cookie.match(/marimba_csrf=([^;]+)/) || [])[1] || '');
}

/** GET de un recurso desde la pagina. */
async function leer(page, ruta) {
  return page.evaluate(async (d) => {
    const r = await fetch(d.api + d.ruta, {credentials: 'include'});
    return {status: r.status, cuerpo: await r.text()};
  }, {api: API, ruta});
}

async function crearProyecto(page, nombre) {
  const t = await csrf(page);
  const r = await page.evaluate(async (d) => {
    const res = await fetch(d.api + '/projects', {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type': 'application/json', 'X-CSRF-Token': d.t},
      body: JSON.stringify({name: d.nombre})});
    return {status: res.status, cuerpo: await res.json()};
  }, {api: API, t, nombre});
  assert.equal(r.status, 200, 'crear proyecto: ' + JSON.stringify(r.cuerpo));
  return r.cuerpo.id;
}

async function compartir(page, pid, correo, rol) {
  const t = await csrf(page);
  const r = await page.evaluate(async (d) => {
    const res = await fetch(d.api + '/projects/' + d.pid + '/collaborators', {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type': 'application/json', 'X-CSRF-Token': d.t},
      body: JSON.stringify({email: d.correo, role: d.rol})});
    return {status: res.status, cuerpo: await res.json()};
(async function () {
  const nav = await chromium.launch();
  out.push('Navegador arrancado: ' + nav.version());
  guardar();

  const dueno = await sesion(nav, DUENO);
  const pid = await crearProyecto(dueno.page, 'Proyecto Roles 7G');
  await compartir(dueno.page, pid, LECTOR, 'reader');
  await compartir(dueno.page, pid, EDITOR, 'editor');
  out.push('Proyecto ' + pid + ' compartido con lector y editor');
  guardar();

  const intruso = await sesion(nav, INTRUSO);
  await caso('SIN ACCESO: 404 y ausente del listado', async () => {
    const r = await leer(intruso.page, '/projects/' + pid);
    assert.equal(r.status, 404, 'respondio ' + r.status);
    const lista = await leer(intruso.page, '/projects');
    assert.ok(!lista.cuerpo.includes('Proyecto Roles 7G'), 'aparece en listado');
    return '404 y no listado';
  });
  await intruso.ctx.close();

  const lector = await sesion(nav, LECTOR);
  await caso('LECTOR: lee pero no escribe y el estado no cambia', async () => {
    assert.equal((await leer(lector.page, '/projects/' + pid)).status, 200);
    const antes = (await leer(lector.page, '/projects/' + pid)).cuerpo;
    const t = await csrf(lector.page);
    const escritura = await lector.page.evaluate(async (d) => {
      const r = await fetch(d.api + '/projects/' + d.pid, {
        method: 'PATCH', credentials: 'include',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': d.t},
        body: JSON.stringify({name: 'Intrusion'})});
      return r.status;
    }, {api: API, t, pid});
    assert.ok([403, 404].includes(escritura), 'escribio: ' + escritura);
    assert.equal((await leer(lector.page, '/projects/' + pid)).cuerpo, antes,
      'el recurso cambio');
    return 'escritura rechazada (' + escritura + ')';
  });

  await caso('LECTOR: no crea canciones ni borra el proyecto', async () => {
    const t = await csrf(lector.page);
    const r = await lector.page.evaluate(async (d) => {
      const c = await fetch(d.api + '/projects/' + d.pid + '/songs', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': d.t},
        body: JSON.stringify({name: 'Intrusa'})});
      const b = await fetch(d.api + '/projects/' + d.pid, {
        method: 'DELETE', credentials: 'include',
        headers: {'X-CSRF-Token': d.t}});
      return {cancion: c.status, borrado: b.status};
    }, {api: API, t, pid});
    assert.ok([403, 404].includes(r.cancion), 'creo cancion: ' + r.cancion);
    assert.ok([403, 404].includes(r.borrado), 'borro: ' + r.borrado);
    return 'cancion ' + r.cancion + ', borrado ' + r.borrado;
  });

  const listaColab = await leer(dueno.page,
    '/projects/' + pid + '/collaborators');
  const colab = JSON.parse(listaColab.cuerpo).find(c => c.email === LECTOR);
  assert.ok(colab, 'el lector debe estar en la lista de colaboradores');
  const uidLector = colab.user_id;

  await caso('REVOCACION: surte efecto sin cerrar sesion', async () => {
    const temp = await sesion(nav, LECTOR);
    assert.equal((await leer(temp.page, '/projects/' + pid)).status, 200,
      'antes de revocar deberia poder leer');
    const t = await csrf(dueno.page);
    await dueno.page.evaluate(async (d) => {
      await fetch(d.api + '/projects/' + d.pid + '/collaborators/' + d.uid, {
        method: 'DELETE', credentials: 'include',
        headers: {'X-CSRF-Token': d.t}});
    }, {api: API, t, pid, uid: uidLector});
    const despues = await leer(temp.page, '/projects/' + pid);
    assert.notEqual(despues.status, 200, 'sigue teniendo acceso');
    await temp.ctx.close();
    return 'acceso retirado en la peticion siguiente';
  });
  await lector.ctx.close();

  const editor = await sesion(nav, EDITOR);
  await caso('EDITOR: puede crear y guardar contenido', async () => {
    const t = await csrf(editor.page);
    const s = await editor.page.evaluate(async (d) => {
      const r = await fetch(d.api + '/projects/' + d.pid + '/songs', {
        method: 'POST', credentials: 'include',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': d.t},
        body: JSON.stringify({name: 'Cancion del editor'})});
      return r.status;
    }, {api: API, t, pid});
    assert.equal(s, 200, 'el editor no pudo crear: ' + s);
    return 'creacion permitida';
  });

  await caso('EDITOR: ni colaboradores, ni auditoria, ni borrado', async () => {
    const t = await csrf(editor.page);
    const r = await editor.page.evaluate(async (d) => {
      const res = {};
      res.colaboradores = (await fetch(d.api + '/projects/' + d.pid +
        '/collaborators', {credentials: 'include'})).status;
      res.auditoria = (await fetch(d.api + '/projects/' + d.pid + '/audit-log',
        {credentials: 'include'})).status;
      res.borrado = (await fetch(d.api + '/projects/' + d.pid, {
        method: 'DELETE', credentials: 'include',
        headers: {'X-CSRF-Token': d.t}})).status;
      return res;
    }, {api: API, t, pid});
    for (const k of Object.keys(r)) {
      assert.ok([403, 404].includes(r[k]), k + ' permitido: ' + r[k]);
    }
    return JSON.stringify(r);
  });

  await editor.ctx.close();
  await dueno.ctx.close();

  out.push('');
  out.push('Correctas: ' + out.filter(l => l.startsWith('OK')).length +
    ' | Fallidas: ' + fallos.length);
  fallos.forEach(f => out.push('  fallo: ' + f));
  await nav.close();
  guardar();
  process.exit(fallos.length ? 1 : 0);
})().catch(e => {
  out.push('FALLO error general: ' +
    String(e && e.stack ? e.stack : e).slice(0, 300));
  guardar();
  process.exit(1);
});

  }, {api: API, t, pid, correo, rol});
  assert.equal(r.status, 200, 'compartir: ' + JSON.stringify(r.cuerpo));
  return r.cuerpo.user_id;
}
