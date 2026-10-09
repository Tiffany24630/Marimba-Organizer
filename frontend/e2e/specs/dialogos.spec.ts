import {test, expect, Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar, crearProyecto, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7L - CICLO DE FOCO DEL DIÁLOGO REAL.
 *
 * En 7K estas pruebas atacaban `window.confirm`, porque el `ConfirmModal` estaba
 * montado pero nunca se invocaba. En 7L TODAS las confirmaciones usan el
 * diálogo accesible, así que aquí se comprueba ese diálogo de verdad: se abre,
 * mueve el foco, atrapa Tab, cierra con Escape y devuelve el foco. Nada se
 * manipula del DOM para forzar un resultado.
 */

const DIALOGO='[role="dialog"][aria-modal="true"]';

async function proyectoParaBorrar(page: Page): Promise<string> {
  const nombre=unico('Borrable 7L');
  await crearProyecto(page, nombre);
  return nombre;
}

async function abrirConfirmacion(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  const tarjeta=page.locator('.project', {hasText: nombre}).first();
  await tarjeta.waitFor({state: 'visible', timeout: 30_000});
  await tarjeta.locator('button.danger').click();
  const dlg=page.locator(DIALOGO);
  await dlg.waitFor({state: 'visible', timeout: 15_000});
  return dlg;
}

test.describe('Diálogo de confirmación real', () => {
  test('se abre, con nombre accesible y foco en Cancelar', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre=await proyectoParaBorrar(page);
    const dlg=await abrirConfirmacion(page, nombre);

    await expect(dlg, 'debe tener aria-modal').toHaveAttribute(
      'aria-modal', 'true');
    await expect(dlg).toHaveAttribute('aria-labelledby', 'confirm-title');
    await expect(page.locator('#confirm-title')).toBeVisible();

    // El foco inicial cae en la salida segura, NUNCA en "Eliminar".
    await expect(page.locator('.confirm-actions button.secondary'),
      'Cancelar debe recibir el foco inicial').toBeFocused();
    await expect(page.locator('.confirm-actions button.danger'))
      .not.toBeFocused();
    // Y el botón destructivo dice la acción real, no "Continuar".
    await expect(page.locator('.confirm-actions button.danger'))
      .toHaveText('Eliminar');
  });

  test('Tab y Shift+Tab quedan atrapados dentro del diálogo',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=await proyectoParaBorrar(page);
      await abrirConfirmacion(page, nombre);

      await page.keyboard.press('Tab');
      await expect(page.locator('.confirm-actions button.danger')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('.confirm-actions button.secondary'))
        .toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('.confirm-actions button.danger')).toBeFocused();
      // Prueba decisiva: el foco sigue DENTRO del diálogo.
      await expect(page.locator(DIALOGO).locator(':focus')).toHaveCount(1);
    });

  test('Escape cancela, NO borra y devuelve el foco al botón de origen',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=await proyectoParaBorrar(page);
      const boton=page.locator('.project', {hasText: nombre}).first()
        .locator('button.danger');
      await abrirConfirmacion(page, nombre);

      await page.keyboard.press('Escape');
      await expect(page.locator(DIALOGO)).toHaveCount(0);
      // Cancelar NO ejecuta nada.
      await expect(page.locator('.project', {hasText: nombre}),
        'Escape no debe eliminar el proyecto').toHaveCount(1);
      // Y el foco vuelve a donde estaba.
      await expect(boton).toBeFocused();
    });

  test('confirmar con Enter sí borra', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre=await proyectoParaBorrar(page);
    await abrirConfirmacion(page, nombre);

    await page.locator('.confirm-actions button.danger').press('Enter');
    await expect(page.locator('.project', {hasText: nombre}),
      'tras confirmar debe desaparecer').toHaveCount(0, {timeout: 15_000});
  });

  test('el botón de origen abre el diálogo con el teclado', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre=await proyectoParaBorrar(page);
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    const boton=page.locator('.project', {hasText: nombre}).first()
      .locator('button.danger');
    await boton.focus();
    await boton.press('Enter');
    await expect(page.locator(DIALOGO)).toBeVisible({timeout: 15_000});
    await page.keyboard.press('Escape');
    await expect(page.locator('.project', {hasText: nombre})).toHaveCount(1);
  });

  test('abrir y cerrar repetidamente mantiene el foco coherente',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre=await proyectoParaBorrar(page);
      const tarjeta=page.locator('.project', {hasText: nombre}).first();
      const boton=tarjeta.locator('button.danger');
      await page.goto(WEB, {waitUntil: 'domcontentloaded'});

      for(let vuelta=0;vuelta<2;vuelta++){
        await boton.click();
        await expect(page.locator('.confirm-actions button.secondary'))
          .toBeFocused();
        await page.keyboard.press('Escape');
        await expect(page.locator(DIALOGO)).toHaveCount(0);
        await expect(boton,
          `vuelta ${vuelta + 1}: el foco debe volver`).toBeFocused();
      }
      await expect(page.locator('.project', {hasText: nombre})).toHaveCount(1);
    });

  test('el diálogo abierto no tiene infracciones graves', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre=await proyectoParaBorrar(page);
    await abrirConfirmacion(page, nombre);

    const r=await new AxeBuilder({page}).include(DIALOGO).analyze();
    const graves=r.violations.filter(
      v=>v.impact==='critical'||v.impact==='serious');
    expect(graves, graves.map(v=>`[${v.impact}] ${v.id}: ${v.help}`)
      .join('\n')).toEqual([]);
  });
});