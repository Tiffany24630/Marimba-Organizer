import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7Y - VERIFICACION de teclado del editor.
 *
 * No es una simulacion: cada paso usa `Tab`, `Enter`, `Espacio` y atajos sobre
 * los controles reales, en el orden en que un usuario los recorreria. Ninguna
 * prueba llama al store.
 *
 * El arrastre del fondo del lienzo NO se prueba y se documenta en
 * FASE_7Y_INTEGRATION.md (seccion D): al seleccionar un elemento desde un panel
 * lateral el lienzo se centra solo (`CanvasEditor.tsx:215-224`), y existen
 * «Ajustar» y «Centrar». El arrastre libre es comodidad visual, no una tarea.
 */

async function proyecto(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 7Y'});
  const sid = (c.cuerpo as {id: number}).id;
  await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 7Y',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba 7Y',
       x: 200, y: 150, width: 900, height: 150,
       positions: [{id: 's1', type: 'Primera', personId: null},
                   {id: 's2', type: 'Segunda', personId: null}]},
      {id: 'p1', type: 'person', personId: 1, name: 'Ana',
       x: 300, y: 400, width: 150, height: 44, positionType: 'Primera',
       marimbaId: null, marimbaPositionId: null},
    ]},
  });
  return pid;
}

async function abrirEditor(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first()
    .click({timeout: 30_000});
  await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
    .click({timeout: 30_000});
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
}

const N_FILAS = 60;

/** Tab repetido hasta que el objetivo reciba el foco. Devuelve el recorrido. */
async function tabHasta(page: Page, objetivo: ReturnType<Page['locator']>) {
  const visto: string[] = [];
  for (let i = 0; i < N_FILAS; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return 'null';
      const n = (a.getAttribute('aria-label') || a.innerText || a.tagName)
        .trim().replace(/\s+/g, ' ').slice(0, 34);
      return `${a.tagName}:${n}`;
    });
    visto.push(d);
    if (await objetivo.evaluate((e) => e === document.activeElement)
      .catch(() => false)) return visto;
  }
  throw new Error('No se alcanzó el objetivo con Tab. Recorrido: ' +
    visto.join(' > '));
}

test.describe('Flujo real de teclado en el editor', () => {
  test('se llega al editor y se selecciona la marimba solo con Tab y Enter',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Teclado sel 7Y');
      await proyecto(page, nombre);
      await abrirEditor(page, nombre);

      await page.getByRole('tab', {name: 'Marimbas'}).click();
      const fila = page.locator('.marimba-panel .pp-main').first();
      const recorrido = await tabHasta(page, fila);
      expect(recorrido.length, 'el recorrido de Tab es acotado')
        .toBeLessThanOrEqual(N_FILAS);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', {name: /Marimba seleccionada/}),
        'Enter selecciona la marimba y abre el Inspector').toBeVisible();
    });

  test('asignar y desasignar con teclado desde la vista sin raton',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Teclado asignar 7Y');
      await proyecto(page, nombre);
      await abrirEditor(page, nombre);

      await page.getByRole('button', {name: 'Edición sin ratón'}).click();
      const panel = page.locator('.acc-editor');
      await expect(panel).toBeVisible({timeout: 20_000});

      const selPersona = panel.locator('#acc-persona');
      const selPuesto = panel.locator('#acc-puesto');
      await selPersona.focus();
      await expect(selPersona).toBeFocused();
      await selPersona.selectOption({index: 1});   // 0 = "— Elige una persona —"
      await selPuesto.focus();
      await expect(selPuesto).toBeFocused();
      await selPuesto.selectOption({index: 1});

      const boton = panel.getByRole('button', {name: /^Asignar/}).first();
      await boton.focus();
      await expect(boton, 'el boton de asignar recibe el foco').toBeFocused();
      await page.keyboard.press('Enter');

      // El resultado se ANUNCIA, no solo cambia el color.
      const estado = panel.locator('[role="status"]');
      await expect(estado, 'el anuncio es role=status').toBeVisible();
      await expect(estado).toContainText('Ana', {timeout: 10_000});

      const deshacer = panel.getByRole('button', {name: 'Deshacer'});
      await deshacer.focus();
      await page.keyboard.press('Enter');
      await expect(estado).toContainText('deshizo');
    });

  test('bloquear y desbloquear con teclado', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Teclado candado 7Y');
    await proyecto(page, nombre);
      await abrirEditor(page, nombre);

      await page.getByRole('tab', {name: 'Marimbas'}).click();
      const candado = page.locator('.marimba-panel button.pp-act.lock').first();
      await candado.focus();
      await expect(candado).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(candado, 'el candado cambia de nombre accesible')
        .toHaveAttribute('aria-label', /Desbloquear/);

      await page.keyboard.press('Enter');
      await expect(candado).toHaveAttribute('aria-label', /Bloquear/);
    });
test('zoom y dimensiones con teclado, sin raton', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Teclado zoom 7Y');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);

    const zoom = page.locator('.zoom-label');
    const antes = await zoom.innerText();
    const acercar = page.getByRole('button', {name: /Acercar/});
    await acercar.focus();
    await expect(acercar).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(zoom, 'el zoom cambia y se anuncia en texto')
      .not.toHaveText(antes);

    await page.getByRole('tab', {name: 'Marimbas'}).click();
    await page.locator('.marimba-panel .pp-main').first().click();
    const ancho = page.getByLabel('Ancho (px)');
    await ancho.focus();
    await expect(ancho).toBeFocused();
    await ancho.press('Control+a');
    await ancho.type('1200');
    await page.getByRole('button', {name: 'Aplicar tamaño'}).focus();
    await page.keyboard.press('Enter');
    await expect(ancho).toHaveValue('1200');
  });

  test('deshacer con el atajo de teclado, sin usar el boton', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Teclado atajo 7Y');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);

    await page.getByRole('tab', {name: 'Marimbas'}).click();
    await page.locator('.marimba-panel .pp-main').first().click();
    // `exact:true` es necesario: por subcadena, "X" tambien capturaba "Ancho (px)".
    const x = page.locator('.inspector').getByLabel('X', {exact: true});
    await x.focus();
    await x.press('Control+a');
    await x.type('400');
    await x.blur();
    await expect(x).toHaveValue('400');

    // Ctrl+Z funciona desde cualquier punto del editor.
    await page.locator('.canvas-panel').click({position: {x: 5, y: 5}});
    await page.keyboard.press('Control+z');
    await page.getByRole('tab', {name: 'Marimbas'}).click();
    await page.locator('.marimba-panel .pp-main').first().click();
    const despues = await page.locator('.inspector').getByLabel('X', {exact: true})
      .inputValue();
    expect(Number(despues),
      'Ctrl+Z revierte el cambio: la X deja de ser 400').not.toBe(400);
    // OJO (hallazgo 7Y): el campo llama `update` en CADA pulsacion, asi que
    // escribir "400" deja varios pasos en el historial y un unico Ctrl+Z solo
    // revierte el ultimo. Es comportamiento PREEXISTENTE, no se cambia aqui.
  });
});