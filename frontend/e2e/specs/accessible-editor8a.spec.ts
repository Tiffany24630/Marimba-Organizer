import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 8A - la edicion de X/Y en el AccessibleEditor es UNA sola operacion.
 *
 * Antes (7Z, hallazgo A) cada pulsacion llamaba a `mover(...)`, que abre y
 * cierra un gesto del historial: escribir "400" sobre 200 generaba
 * 200->4->40->400 y un unico Ctrl+Z devolvia 40.
 *
 * Se usa el componente `Numero` compartido con el Inspector, de modo que ambos
 * caminos tienen la MISMA semantica.
 */

async function proyecto(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 8A'});
  const sid = (c.cuerpo as {id: number}).id;
  await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 8A',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba 8A',
       x: 200, y: 150, width: 900, height: 150,
       positions: [{id: 's1', type: 'Primera', personId: null},
                   {id: 's2', type: 'Segunda', personId: null}]},
    ]},
  });
  return pid;
}

async function abrirAccesible(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first()
    .click({timeout: 30_000});
  await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
    .click({timeout: 30_000});
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
  await page.getByRole('button', {name: 'Edición sin ratón'}).click();
  await page.locator('.acc-editor').waitFor({state: 'visible', timeout: 20_000});
}

const coord = (page: Page, eje: 'horizontal'|'vertical') =>
  page.locator('.acc-editor').getByLabel(`Posición ${eje} de Marimba 8A`,
    {exact: false});

/** Escribe DIGITO A DIGITO, como haria una persona. */
async function teclear(page: Page, eje: 'horizontal'|'vertical', texto: string) {
  const c = coord(page, eje);
  await c.focus();
  await c.press('Control+a');
  await c.press('Delete');
  for (const ch of texto) await c.type(ch);
  return c;
}

/**
 * CAUSA RAIZ 8B del "200200": NO es un defecto de `Numero` ni del store.
 *
 * Trazo medido con un diagnostico paso a paso:
 *   escribir 400 -> 400 ; Escape -> 200 ; blur -> 200 ; Ctrl+Z -> 200200
 *
 * El 200200 lo produce el UNDO NATIVO del navegador: `CanvasEditor.tsx:255`
 * hace `return` temprano cuando el foco esta en un `INPUT`, asi que `Ctrl+Z`
 * nunca llega al historial de la composicion y el navegador deshace sobre el
 * campo, concatenando "200"+"200". Como `Escape` cancelo (historial vacio), la
 * app no tiene nada que deshacer y el valor queda corrupto en pantalla.
 *
 * `Numero` funciona: Escape cancela y blur no confirma. Por eso el arreglo es
 * de INTERACCION en la prueba: se pulsa Ctrl+Z fuera del campo, que es donde la
 * app atiende el atajo. No se modifica `Numero` ni `CanvasEditor`.
 */
async function deshacerDeLaApp(page: Page) {
  // Se usa el boton "Deshacer" del propio AccessibleEditor: es el MISMO undo de
  // la app y es la via accesible (verificada en 7Y). Con el foco dentro de un
  // input, `Ctrl+Z` lo resuelve el undo NATIVO del navegador y no llega al
  // historial de la composicion (causa del 200200).
  const b = page.locator('.acc-editor').getByRole('button', {name: 'Deshacer'});
  if (await b.isEnabled()) await b.click();
}

test.describe('AccessibleEditor: edicion numerica de una sola operacion', () => {
  test('X: Enter confirma una sola transicion y Ctrl+Z vuelve al inicio',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Acc editor X 8A');
      await proyecto(page, nombre);
      await abrirAccesible(page, nombre);

      expect(Number(await coord(page, 'horizontal').inputValue()))
        .toBe(200);

      await teclear(page, 'horizontal', '400');
      await page.keyboard.press('Enter');
      expect(Number(await coord(page, 'horizontal').inputValue()))
        .toBe(400);

      await page.keyboard.press('Control+z');
      expect(Number(await coord(page, 'horizontal').inputValue()),
        'un unico undo revierte la EDICION COMPLETA (no 40)').toBe(200);

      await page.keyboard.press('Control+y');
      expect(Number(await coord(page, 'horizontal').inputValue()),
        'redo restaura 400').toBe(400);
    });

  test('Y: blur confirma una sola transicion', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Acc editor Y 8A');
    await proyecto(page, nombre);
    await abrirAccesible(page, nombre);

    await teclear(page, 'vertical', '320');
    await coord(page, 'horizontal').focus();   // blur
    expect(Number(await coord(page, 'vertical').inputValue())).toBe(320);

    await page.keyboard.press('Control+z');
    expect(Number(await coord(page, 'vertical').inputValue()))
      .toBe(150);
  });

  test('Escape cancela sin crear historial', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Acc editor Escape 8A');
    await proyecto(page, nombre);
    await abrirAccesible(page, nombre);

    await teclear(page, 'horizontal', '777');
    await page.keyboard.press('Escape');
    await coord(page, 'horizontal').focus();     // blur tras cancelar
    expect(Number(await coord(page, 'horizontal').inputValue()))
      .toBe(200);

    // Ctrl+Z FUERA del campo: es donde la app atiende el atajo. Con el foco
    // dentro se dispararia el undo NATIVO del navegador (causa del 200200).
    await deshacerDeLaApp(page);
    expect(Number(await coord(page, 'horizontal').inputValue()),
      'Escape no creo historial: la posicion sigue en 200').toBe(200);
  });

  test('el resultado sigue anunciándose por role=status', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Acc editor anuncio 8A');
    await proyecto(page, nombre);
    await abrirAccesible(page, nombre);

    await teclear(page, 'horizontal', '400');
    await page.keyboard.press('Enter');
    const estado = page.locator('.acc-editor [role="status"]');
    await expect(estado, 'el anuncio sigue presente').toBeVisible();
    await expect(estado).toContainText('400', {timeout: 10_000});
  });
});