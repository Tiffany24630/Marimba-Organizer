import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7O - AUDITORIA DE MENUS.
 *
 * Inventario real (verificado en el codigo, no supuesto):
 *   - Pestañas laterales del editor: `role="tablist"` con `role="tab"` y
 *     `aria-selected`.
 *   - Panel `details`/`summary` de "Agregar mas piezas".
 *   - Botones de zoom y "Exportar PNG" del lienzo.
 *   - Acciones de proyecto (renombrar/eliminar) como botones sueltos, NO menu.
 *
 * HALLAZGO IMPORTANTE: **no existe ningun menu contextual de Konva**. Ni
 * `onContextMenu` ni `role="menu"` en el lienzo: la seleccion se hace con
 * `onClick` sobre la figura y las acciones son botones DOM. No se inventa una
 * alternativa para algo que no existe.
 */

async function proyecto(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 7O'});
  const sid = (c.cuerpo as {id: number}).id;
  await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 7O',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba tenor',
       x: 200, y: 150, width: 1200, height: 600,
       positions: [{id: 's1', type: 'Primera', personId: 1}]},
      {id: 'p1', type: 'person', personId: 1, name: 'Ana',
       x: 260, y: 230, width: 140, height: 180, positionType: 'Primera',
       marimbaId: 'm1', marimbaPositionId: 's1'},
    ]}});
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

test.describe('Auditoria de menus', () => {
  test('las pestanas laterales cambian con teclado y anuncian la activa',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Tabs 7O');
      await proyecto(page, nombre);
      await abrirEditor(page, nombre);

      const personas = page.getByRole('tab', {name: 'Personas'});
      const marimbas = page.getByRole('tab', {name: 'Marimbas'});
      const paneles = page.getByRole('tab', {name: 'Paneles'});

      await expect(personas, 'la pestana activa se anuncia')
        .toHaveAttribute('aria-selected', 'true');
      await expect(marimbas).toHaveAttribute('aria-selected', 'false');

      // Activacion por teclado: foco y Enter.
      await marimbas.focus();
      await expect(marimbas).toBeFocused();
      await marimbas.press('Enter');
      await expect(marimbas, 'Enter activa la pestana')
        .toHaveAttribute('aria-selected', 'true');
      await expect(personas, 'la anterior deja de estar seleccionada')
        .toHaveAttribute('aria-selected', 'false');
      await expect(page.locator('.marimba-panel')).toBeVisible();

      // Y con Espacio.
      await paneles.focus();
      await paneles.press(' ');
      await expect(paneles).toHaveAttribute('aria-selected', 'true');
    });

  test('el panel details de importacion se abre y cierra con teclado',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Details 7O');
      await proyecto(page, nombre);

      await page.goto(WEB, {waitUntil: 'domcontentloaded'});
      await page.locator('button.project-open', {hasText: nombre}).first()
        .click({timeout: 30_000});

      const resumen = page.locator('summary', {hasText: 'Agregar más piezas'});
      await expect(resumen, 'el panel debe existir').toBeVisible();

      const details = page.locator('details.more-songs');
      const abierto = async()=>details.evaluate(
        (d:HTMLDetailsElement)=>d.open);

      // 7O: `more-songs` nace ABIERTO cuando ya hay canciones
      // (`open={songs.length>0}`), que es el comportamiento intencionado.
      expect(await abierto(), 'con canciones, nace abierto').toBe(true);

      await resumen.focus();
      await resumen.press('Enter');
      await expect.poll(abierto,
        {message: 'Enter debe cerrarlo'}).toBe(false);

      await resumen.press('Enter');
      await expect.poll(abierto,
        {message: 'Enter debe volver a abrirlo'}).toBe(true);
      await expect(page.locator('input[type="file"]'),
        'al abrirse, el selector de archivo es alcanzable').toBeVisible();
    });

  test('la barra del lienzo es alcanzable y tiene nombres', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Toolbar 7O');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);

    for (const etiqueta of ['Alejar', 'Acercar', 'Exportar PNG']) {
      const b = page.getByRole('button', {name: new RegExp(etiqueta)});
      await expect(b, `debe existir "${etiqueta}"`).toBeVisible();
      await b.focus();
      await expect(b, `"${etiqueta}" debe recibir el foco`).toBeFocused();
    }
  });

  test('no hay menu contextual propio en el lienzo (documentado)',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Sin menu 7O');
      await proyecto(page, nombre);
      await abrirEditor(page, nombre);

      await expect(page.locator('[role="menu"]'),
        'el lienzo no define un menu ARIA').toHaveCount(0);
      await expect(
        page.locator('.canvas-panel [role="menu"],[role="menuitem"]'),
        'no hay items de menu en el lienzo').toHaveCount(0);

      // El clic derecho tampoco abre nada propio.
      await page.locator('.canvas-panel').click({button: 'right'});
      await expect(page.locator('[role="menu"]')).toHaveCount(0);
    });
});
