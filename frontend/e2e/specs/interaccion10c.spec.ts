import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

async function abrirEditor(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first().click();
  await page.getByRole('button', {name: 'Abrir editor'}).first().click();
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
  await page.locator('canvas').first().waitFor({state: 'visible', timeout: 15_000});
}

test('Space + drag hace pan sin modificar la composicion', async ({page}) => {
  await entrar(page, CORREOS.dueno);
  const nombre = unico('Interaccion 10C');
  const pid = await crearProyecto(page, nombre);
  const song = await escribir(page, 'POST', `/projects/${pid}/songs`, {name: 'Cancion 10C'});
  expect(song.status).toBe(200);
  const sid = (song.cuerpo as {id: number}).id;
  const comp = await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 10C', width: 1600, height: 900,
    data: {elements: [{
      id: 'm10c', type: 'marimba', name: 'Marimba 10C', x: 200, y: 150,
      width: 900, height: 150,
      positions: [{id: 's10c', type: 'Primera', personId: null}],
    }]},
  });
  expect(comp.status).toBe(200);
  const cid = (comp.cuerpo as {id: number}).id;

  await abrirEditor(page, nombre);
  const antes = await escribir(page, 'GET', `/compositions/${cid}`);
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  // Se inicia sobre el propio nodo para demostrar que Space desactiva su drag.
  await page.keyboard.down('Space');
  await page.mouse.move(box.x + 180, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 240, box.y + 230, {steps: 3});
  await page.mouse.up();
  await page.keyboard.up('Space');

  const despues = await escribir(page, 'GET', `/compositions/${cid}`);
  expect(despues.status).toBe(200);
  expect((despues.cuerpo as any).data).toEqual((antes.cuerpo as any).data);
});
