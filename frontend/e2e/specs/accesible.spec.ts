import {test, expect, Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7J - ALTERNATIVA ACCESIBLE AL LIENZO, probada en la aplicacion real.
 * No se comprueba que el componente se pinte: se comprueban RESULTADOS.
 */
const ELS = [
  {id: 'm1', type: 'marimba', name: 'Marimba tenor',
   x: 100, y: 100, width: 1200, height: 600,
   positions: [{id: 's1', type: 'Primera', personId: null},
               {id: 's2', type: 'Segunda', personId: null}]},
  {id: 'p1', type: 'person', personId: 1, name: 'Ana',
   x: 220, y: 700, width: 140, height: 180, positionType: 'Primera',
   marimbaId: null, marimbaPositionId: null},
];

const BOTON='Edici\u00f3n sin rat\u00f3n';

async function escena(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 7J'});
  expect(c.status).toBe(200);
  const sid = (c.cuerpo as {id: number}).id;
  const comp = await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 7J',
    width: 1600, height: 900, data: {elements: ELS}});
  expect(comp.status).toBe(200);
  return {pid, cid: (comp.cuerpo as {id: number}).id};
}

async function abrirEditor(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first()
    .click({timeout: 30_000});
  await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
    .click({timeout: 30_000});
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
}

async function estado(page: Page, cid: number): Promise<string> {
  const r = await escribir(page, 'GET', `/compositions/${cid}`);
  return r.texto;
}

test.describe('Alternativa accesible al lienzo', () => {
  test('asigna con el teclado y persiste al recargar', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Accesible 7J');
    const {cid} = await escena(page, nombre);
    await abrirEditor(page, nombre);

    await page.getByRole('button', {name: BOTON}).click();
    const panel = page.locator('.acc-editor');
    await expect(panel, 'debe aparecer la vista accesible').toBeVisible();

    /* Recorrido con teclado: foco, desplegables nativos y Enter. */
    await panel.locator('#acc-persona').focus();
    await panel.locator('#acc-persona').selectOption({index: 1});
    await panel.locator('#acc-puesto').focus();
    await panel.locator('#acc-puesto').selectOption({index: 1});

    const asignar = panel.getByRole('button', {name: 'Asignar'});
    await asignar.focus();
    await expect(asignar, 'el boton debe recibir el foco por teclado')
      .toBeFocused();
    await asignar.press('Enter');

    /* Se anuncia el resultado, no solo se cambia el color. */
    await expect(panel.locator('[role="status"]'))
      .toContainText('Ana', {timeout: 10_000});
    await expect(panel.locator('.acc-slots li', {hasText: 'Ana'}).first())
      .toBeVisible();

    await page.getByRole('button', {name: 'Guardar'}).first().click();
    await page.waitForTimeout(1500);

    /* Recargar: la asignacion PERSISTE y el lienzo la refleja. */
    await page.reload({waitUntil: 'domcontentloaded'});
    const g = JSON.parse(await estado(page, cid));
    const personas = g.data.elements.filter(
      (e: any) => e.type === 'person' && e.personId === 1);
    expect(personas, 'la persona debe seguir guardada').toHaveLength(1);
    expect(personas[0].marimbaId, 'debe seguir asignada a la marimba')
      .toBe('m1');
    expect(personas[0].marimbaPositionId, 'debe seguir en un puesto')
      .not.toBeNull();
    const m = g.data.elements.find((e: any) => e.id === 'm1');
    expect(m.positions.filter((p: any) => p.personId === 1),
      'un puesto debe tener a la persona').toHaveLength(1);
  });

  test('retirar y deshacer, y sin infracciones graves', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Retirar 7J');
    await escena(page, nombre);
    await abrirEditor(page, nombre);
    await page.getByRole('button', {name: BOTON}).click();
    const panel = page.locator('.acc-editor');

    await panel.locator('#acc-persona').selectOption({index: 1});
    await panel.locator('#acc-puesto').selectOption({index: 1});
    await panel.getByRole('button', {name: 'Asignar'}).click();
    await expect(panel.locator('.acc-slots li', {hasText: 'Ana'}).first())
      .toBeVisible();

    /* El control nombra la accion completa: a quien y de que puesto. */
    const retirar = panel.getByRole('button', {name: /Retirar a Ana/});
    await expect(retirar, 'el boton debe describir a quien retira')
      .toBeVisible();
    await retirar.click();
    await expect(panel.locator('[role="status"]'))
      .toContainText('sin sentar', {timeout: 10_000});

    /* Deshacer devuelve la asignacion: la historia es la del store. */
    await panel.getByRole('button', {name: 'Deshacer'}).click();
    await expect(panel.locator('.acc-slots li', {hasText: 'Ana'}).first())
      .toBeVisible();

    /* La vista accesible no tiene infracciones criticas ni graves. */
    const r = await new AxeBuilder({page}).include('.acc-editor').analyze();
    const graves = r.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious');
    expect(graves, graves.map(v => `[${v.impact}] ${v.id}: ${v.help}`)
      .join('\n')).toEqual([]);
  });
});