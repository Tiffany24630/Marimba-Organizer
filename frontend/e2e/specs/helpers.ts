import {Page, Browser, expect, test} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';

/**
 * Fase 7H - utilidades compartidas por las pruebas E2E.
 *
 * Todo apunta al entorno AISLADO de pruebas (proyecto Docker `marimba7f`).
 * No se usa jamas produccion.
 */
export const WEB = process.env.E2E_WEB || 'http://localhost:18080';
export const API = process.env.E2E_API || 'http://localhost:18000/api';
export const MAILPIT = process.env.E2E_MAILPIT || 'http://localhost:18025';

/** Clave de las cuentas de pruebas. No es un secreto ni se usa fuera de 7F. */
export const CLAVE = process.env.E2E_CLAVE || 'Prueba7F-No-Usar-Fuera';

export const CORREOS = {
  dueno: 'despliegue7f-a@prueba.local',
  editor: 'despliegue7f-b@prueba.local',
  lector: 'despliegue7f-rec@prueba.local',
  intruso: 'despliegue7f-d@prueba.local',
};

/**
 * Aísla el estado en memoria del rate-limit entre escenarios E2E.
 *
 * El límite sigue siendo real dentro de cada test. Solo se reinicia el
 * proceso backend del proyecto E2E al terminar el escenario, sin tocar la
 * base de datos ni los volúmenes. No se registra este hook en producción:
 * únicamente los cuatro specs públicos que necesitan aislamiento lo llaman.
 */
export function aislarRateLimitE2E() {
  test.afterEach(async () => {
    const cwd = process.cwd();
    const root = cwd.endsWith('frontend') ? resolve(cwd, '..') : cwd;
    execFileSync('docker', [
      'compose', '-p', 'marimba7f',
      '-f', 'docker-compose.yml',
      '-f', 'docker-compose.7f.yml',
      '-f', 'docker-compose.e2e.yml',
      'restart', 'backend',
    ], {cwd: root, stdio: 'ignore'});

    const limite = Date.now() + 30_000;
    while (Date.now() < limite) {
      try {
        const respuesta = await fetch(`${API}/health`);
        if (respuesta.ok) return;
      } catch { /* el backend aún está iniciando */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('El backend E2E no volvió a estar disponible tras aislar el rate-limit');
  });
}

/**
 * El boton de acceso dice "Iniciar sesion" (sin tilde, por decision del
 * proyecto). Este selector centraliza el texto para que un cambio de interfaz
 * no rompa tests repartidos por varios ficheros, como ocurrio en 7G.
 */
export const BOTON_ENTRAR = 'button:has-text("Iniciar")';

/** Inicia sesion escribiendo en el formulario real. */
export async function entrar(page: Page, correo: string) {
  await page.context().clearCookies();
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('input[type="email"]').first()
    .waitFor({state: 'visible', timeout: 30_000});
  await page.locator('input[type="email"]').first().fill(correo);
  await page.locator('input[type="password"]').first().fill(CLAVE);
  await page.locator(BOTON_ENTRAR).first().click();
  // Se espera a que la sesion exista de verdad, no solo al click.
  await expect.poll(async () => (await ctx(page)).some(c =>
    c.name === 'marimba_session' && c.value), {timeout: 20_000})
    .toBe(true);
}

/**
 * Abre una pestana con SESION PROPIA, en un contexto separado.
 *
 * Es imprescindible usar contextos distintos y no `context.newPage()`: las
 * cookies se comparten dentro de un contexto, asi que iniciar sesion como un
 * segundo usuario en la misma pestana invalidaria la del primero y ambas
 * comprobaciones medirian la sesion equivocada.
 */
export async function abrirComo(browser: Browser, correo: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await entrar(page, correo);
  return {ctx, page};
}

async function ctx(page: Page) {
  return page.context().cookies();
}

/** Token anti-CSRF, legible desde JS por diseño. */
export async function csrf(page: Page): Promise<string> {
  return page.evaluate(() =>
    (document.cookie.match(/marimba_csrf=([^;]+)/) || [])[1] || '');
}

/** GET de un recurso: devuelve código y cuerpo como texto. */
export async function leer(page: Page, ruta: string) {
  return page.evaluate(async (d) => {
    const r = await fetch(d.api + d.ruta, {credentials: 'include'});
    return {status: r.status, cuerpo: await r.text()};
  }, {api: API, ruta});
}

/** GET de un recurso con token anti-CSRF (para cuando hay que escribir). */
export async function escribir(page: Page, metodo: string, ruta: string,
                                cuerpo?: unknown) {
  return page.evaluate(async (d) => {
    const t = (document.cookie.match(/marimba_csrf=([^;]+)/) || [])[1] || '';
    const opciones: RequestInit = {
      method: d.metodo, credentials: 'include',
      headers: {'X-CSRF-Token': t}};
    if (d.cuerpo !== null) {
      opciones.headers = {...opciones.headers,
                         'Content-Type': 'application/json'};
      opciones.body = JSON.stringify(d.cuerpo);
    }
    const r = await fetch(d.api + d.ruta, opciones);
    const texto = await r.text();
    let json: unknown = null;
    try { json = JSON.parse(texto); } catch { /* no es JSON */ }
    return {status: r.status, cuerpo: json, texto};
  }, {api: API, metodo, ruta, cuerpo: cuerpo === undefined ? null : cuerpo});
}

/** Crea un proyecto de pruebas y devuelve su id. */
export async function crearProyecto(page: Page, nombre: string): Promise<number> {
  const r = await escribir(page, 'POST', '/projects', {name: nombre});
  expect(r.status, `crear proyecto ${nombre}`).toBe(200);
  return (r.cuerpo as {id: number}).id;
}

/** Comparte un proyecto y devuelve el id del colaborador. */
export async function compartir(page: Page, pid: number, correo: string,
                                rol: 'editor' | 'reader'): Promise<number> {
  const r = await escribir(page, 'POST', `/projects/${pid}/collaborators`,
    {email: correo, role: rol});
  expect(r.status, 'compartir proyecto').toBe(200);
  return (r.cuerpo as {user_id: number}).user_id;
}

/** Nombre único por prueba, para que los datos no se mezclen. */
export function unico(prefijo: string): string {
  return prefijo + '-' + Math.random().toString(36).slice(2, 8);
}
