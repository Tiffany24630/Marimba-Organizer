import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7Z - la edicion de un campo numerico es UNA operacion de historial.
 *
 * Defecto reproducido (7Y): los campos numericos del Inspector llamaban a
 * `update` en cada pulsacion. Escribir "400" sobre 200 generaba
 * 200->4->40->400, tres pasos, y un unico Ctrl+Z solo revocaba el ultimo (-> 40).
 *
 * Se comprueba sobre la UI real, sin llamar al store.
 */

async function proyecto(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 7Z'});
  const sid = (c.cuerpo as {id: number}).id;
  await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 7Z',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba 7Z',
       x: 200, y: 150, width: 900, height: 150,
       positions: [{id: 's1', type: 'Primera', personId: null},
                   {id: 's2', type: 'Segunda', personId: null},
                   {id: 's3', type: 'Centro', personId: null}]},
    ]},
  });
  return pid;
}

const campo = (page: Page, etiqueta: string) =>
  page.locator('.inspector').getByLabel(etiqueta, {exact: true});

async function seleccionar(page: Page) {
  await page.getByRole('tab', {name: 'Marimbas'}).click();
  await page.locator('.marimba-panel .pp-main').first().click();
  await page.getByRole('heading', {name: /Marimba seleccionada/}).waitFor
    ({timeout: 20_000});
}

async function abrirYSeleccionar(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first()
    .click({timeout: 30_000});
  await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
    .click({timeout: 30_000});
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
  await seleccionar(page);
}

/** Escribe DIGITO A DIGITO, como haria una persona. */
async function teclear(page: Page, etiqueta: string, texto: string) {
  const c = campo(page, etiqueta);
  await c.focus();
  await c.press('Control+a');
  await c.press('Delete');
  for (const ch of texto) await c.type(ch);
}

/** Vuelve a leer el valor REAL (reselecciona, como si el usuario lo hiciera). */
async function releer(page: Page, etiqueta: string) {
  await seleccionar(page);
  return Number(await campo(page, etiqueta).inputValue());
}

/** Pulsa Ctrl+Z FUERA de un input: el store de la app solo atiende el atajo
 *  cuando el foco NO esta en un campo (`CanvasEditor.tsx:255` hace return
 *  temprano para INPUT). Con el foco dentro, `Ctrl+Z` lo resuelve el undo NATIVO
 *  del navegador sobre ese campo y no toca el historial de la composicion. */
async function deshacerDeLaApp(page: Page) {
  await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
  await page.keyboard.press('Control+z');
}
async function rehacerDeLaApp(page: Page) {
  await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
  await page.keyboard.press('Control+y');
}
test.describe('Historial de las ediciones numericas', () => {
  test('X: la edicion completa es UN paso y Ctrl+Z vuelve al valor inicial',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Historial X 7Z');
      await proyecto(page, nombre);
      await abrirYSeleccionar(page, nombre);

      expect(await releer(page, 'X'), 'parte de 200').toBe(200);

      await teclear(page, 'X', '400');
      await page.keyboard.press('Enter');
      expect(await releer(page, 'X'), 'la edicion se aplica').toBe(400);

      await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
      await page.keyboard.press('Control+z');
      expect(await releer(page, 'X'),
        'un unico undo revierte la EDICION COMPLETA').toBe(200);

      await page.keyboard.press('Control+y');
      expect(await releer(page, 'X'), 'redo restaura 400').toBe(400);
    });

  test('Y: mismo comportamiento, y el blur tambien confirma una vez',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Historial Y 7Z');
      await proyecto(page, nombre);
      await abrirYSeleccionar(page, nombre);

      expect(await releer(page, 'Y')).toBe(150);
      await teclear(page, 'Y', '320');
      await campo(page, 'Rotación °').focus();   // confirmar con BLUR
      expect(await releer(page, 'Y'), 'blur confirma').toBe(320);

      await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
      await page.keyboard.press('Control+z');
      expect(await releer(page, 'Y'), 'un unico undo tras blur').toBe(150);
    });

  test('Enter seguido de blur NO genera doble paso', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Historial doble 7Z');
    await proyecto(page, nombre);
    await abrirYSeleccionar(page, nombre);

    await teclear(page, 'X', '500');
    await page.keyboard.press('Enter');
    await campo(page, 'Y').focus();      // provoca el blur posterior
    expect(await releer(page, 'X')).toBe(500);

    // Si Enter y blur hubieran creado dos pasos, este primer undo dejaria un
    // valor intermedio; con una sola transicion vuelve directo a 200.
    await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
    await page.keyboard.press('Control+z');
    expect(await releer(page, 'X'),
      'una sola transicion: el undo vuelve al inicio').toBe(200);
  });

  test('Escape cancela la edicion sin crear historial', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Historial escape 7Z');
    await proyecto(page, nombre);
    await abrirYSeleccionar(page, nombre);

    await teclear(page, 'X', '777');
    await page.keyboard.press('Escape');
    await campo(page, 'Y').focus();     // blur tras cancelar
    expect(await releer(page, 'X'), 'Escape descarta el borrador').toBe(200);

    await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
    await page.keyboard.press('Control+z');
    expect(await releer(page, 'X'),
      'no habia nada que deshacer: sigue en 200').toBe(200);
  });

  test('ediciones independientes siguen siendo pasos independientes',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Historial dos 7Z');
      await proyecto(page, nombre);
      await abrirYSeleccionar(page, nombre);

      await teclear(page, 'X', '400');
      await page.keyboard.press('Enter');
      await teclear(page, 'Y', '360');
      await page.keyboard.press('Enter');
      expect(await releer(page, 'X')).toBe(400);
      expect(await releer(page, 'Y')).toBe(360);

      await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
      await page.keyboard.press('Control+z');
      expect(await releer(page, 'Y'), 'el 1er undo deshace la 2a edicion').toBe(150);
      expect(await releer(page, 'X'), 'y deja intacta la 1a edicion').toBe(400);
    });
});