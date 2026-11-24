import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7R - redimensionado de marimbas por la INTERFAZ REAL.
 *
 * Nada de llamar al store desde Playwright: se selecciona la marimba y se
 * escriben los campos del inspector, como haria una persona.
 *
 * La seleccion se hace por la RUTA ACCESIBLE (boton "Seleccionar"), porque el
 * lienzo Konva sigue siendo solo de raton.
 */

async function proyecto(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 7R'});
  const sid = (c.cuerpo as {id: number}).id;
  const comp = await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 7R',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba 7R',
       x: 200, y: 150, width: 1200, height: 600,
       positions: [{id: 's1', type: 'Primera', personId: null},
                   {id: 's2', type: 'Segunda', personId: null}]},
      {id: 'm2', type: 'marimba', name: 'Marimba 2',
       x: 200, y: 800, width: 1200, height: 600,
       positions: [{id: 't1', type: 'Primera', personId: null}]},
    ]},
  });
  return {pid, cid: (comp.cuerpo as {id: number}).id};
}

/**
 * Estado REAL y persistido de la marimba, leido por la API de pruebas.
 *
 * Es el mismo mecanismo que usa `geometria.spec.ts`: la UI solo refleja el
 * borrador mientras se edita, asi que el unico modo fiable de comprobar que un
 * rechazo NO modifico la marimba es leer lo que realmente se guardo.
 */
async function guardado(page: Page, cid: number) {
  const r = await escribir(page, 'GET', `/compositions/${cid}`);
  const g = JSON.parse(r.texto);
  return g.data.elements.find((e: {id: string})=>e.id==='m1');
}

async function guardar(page: Page) {
  await page.getByRole('button', {name: 'Guardar'}).first().click();
  await page.waitForTimeout(1500);
}

async function abrirEditor(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first()
    .click({timeout: 30_000});
  await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
    .click({timeout: 30_000});
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
}

/**
 * DIAGNÓSTICO 7S - CONFIRMADO.
 *
 * Hipótesis inicial (7R): que `.acc-editor` + botón "Seleccionar" era la vía.
 * FALLA. El error real fue:
 *   locator.click: Timeout 15000ms exceeded
 *   waiting for locator('.acc-editor').getByRole('button', {name: /Seleccionar/})
 *
 * El panel `.acc-editor` SÍ aparece (su `waitFor` pasa), pero no existe ningún
 * botón con nombre "Seleccionar" dentro: el editor accesible usa controles de
 * asignación, no un botón de selección.
 *
 * VÍA REAL DE SELECCIÓN (verificada leyendo `MarimbaPanel.tsx:23`):
 *   <button className="pp-main" onClick={()=>focus(m.id)}>
 * y en el store `focus:(id)=>set({selectedId:id, focusId:id, selectedSlot:null})`.
 * Es decir, `focus` SÍ fija `selectedId`, que es lo que lee el `Inspector` para
 * decidir mostrar la rama de marimba.
 *
 * Se reutiliza ese mecanismo real: un botón nativo con el nombre de la marimba,
 * dentro del panel de marimbas. No se crea nada nuevo ni se toca producción.
 */
async function seleccionar(page: Page) {
  await page.getByRole('tab', {name: 'Marimbas'}).click();
  await page.locator('.marimba-panel').waitFor({state: 'visible', timeout: 20_000});
  await page.locator('.marimba-panel .pp-main').first().click();
  await page.getByRole('heading', {name: /Marimba seleccionada/}).waitFor
    ({timeout: 20_000});
}

const ancho = (page: Page)=>page.getByLabel('Ancho (px)');
const alto = (page: Page)=>page.getByLabel('Alto (px)');
const aplicar = (page: Page)=>page.getByRole('button', {name: 'Aplicar tamaño'});

// 7T - DIAGNÓSTICO: `getByRole('button', {name:'Deshacer'})` no existia.
// Leyendo `Project.tsx:575-576`, los botones son:
//   <button title="Deshacer (Ctrl+Z)">↶</button>
// El nombre accesible lo aporta el CONTENIDO ("↶"), que tiene prioridad sobre
// `title` en el calculo de nombre accesible, asi que se buscaria por "↶".
// Se usan los `title` reales del DOM, que son estables y no dependen de texto.
const deshacer = (page: Page)=>page.locator('button[title="Deshacer (Ctrl+Z)"]');
const rehacer = (page: Page)=>page.locator('button[title="Rehacer (Ctrl+Y)"]');

test.describe('Resize de marimba por la interfaz', () => {
  test('cambia el ancho, respeta el minimo y avisa sin dejar cambiar nada',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Resize 7T');
      const {cid} = await proyecto(page, nombre);
      await abrirEditor(page, nombre);
      await seleccionar(page);

      // 2 puestos: minMarimbaWidth(2) = 2*14 + 2*104 + 1*10 = 246.
      // El valor 246 es el que produce `minMarimbaWidth`; manda produccion.
      await expect(page.locator('#resize-hint')).toContainText('246');
      await expect(ancho(page)).toHaveValue('1200');
      await expect(alto(page)).toHaveValue('600');

      await ancho(page).fill('1400');
      await alto(page).fill('640');
      await aplicar(page).click();
      await expect(ancho(page)).toHaveValue('1400');
      await expect(alto(page)).toHaveValue('640');

      // Estado REAL ya aplicado, comprobado sobre lo persistido.
      await guardar(page);
      let real = await guardado(page, cid);
      expect(real.width, 'el ancho valido se aplico de verdad').toBe(1400);
      expect(real.height, 'el alto valido se aplico de verdad').toBe(640);

      // Por debajo del minimo: mensaje accesible y la marimba NO cambia.
      await ancho(page).fill('100');
      await aplicar(page).click();
      await expect(page.getByRole('alert'), 'el error se anuncia')
        .toContainText('246');
      // 7T - OPCION A: el borrador se conserva (el usuario edita su valor y ve
      // el error). Lo que hay que demostrar es que la marimba real no cambio, y
      // eso se lee de lo guardado, no del input.
      await expect(ancho(page), 'el borrador invalido se conserva')
        .toHaveValue('100');
      await guardar(page);
      real = await guardado(page, cid);
      expect(real.width, 'el rechazo NO cambio el ancho real').toBe(1400);
      expect(real.height, 'ni el alto real').toBe(640);
      expect(real.positions.length, 'ni los puestos')
        .toBe(2);

      // Cero: ahora lo cubre el mensaje de ancho minimo (0 < 246), que es mas
      // informativo que "mayores que cero"; el rechazo sigue siendo total.
      await ancho(page).fill('0');
      await aplicar(page).click();
      await expect(page.getByRole('alert')).toContainText('246');
      await guardar(page);
      real = await guardado(page, cid);
      expect(real.width, 'el cero tampoco cambia el ancho real').toBe(1400);
      expect(real.height).toBe(640);

      // 7W - contrato vertical: el alto no puede ser menor que la banda que
      // ocupan los puestos (slotY+slotH = 110).
      // Ojo: tras el paso anterior el campo de ANCHO sigue mostrando el 0
      // rechazado (el borrador se conserva a proposito), y se valida el ancho
      // antes que el alto. Se restituye un ancho valido para aislar el alto.
      await ancho(page).fill('1400');
      await alto(page).fill('50');
      await aplicar(page).click();
      await expect(page.getByRole('alert'), 'avisa del minimo vertical')
        .toContainText('110');
      await guardar(page);
      real = await guardado(page, cid);
      expect(real.height, 'un alto insuficiente no cambia la marimba').toBe(640);
      expect(real.width).toBe(1400);
    });

  test('deshacer y rehacer el redimensionado', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Resize undo 7R');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);
    await seleccionar(page);

    await ancho(page).fill('1500');
    await alto(page).fill('700');
    await aplicar(page).click();
    await expect(ancho(page)).toHaveValue('1500');

    // 7T - DIAGNÓSTICO: `undo()` hace `selectedId:null` en el store, asi que tras
    // deshacer el Inspector deja de mostrar la rama de marimba y sus campos
    // desaparecen. No es un fallo del resize: hay que volver a seleccionar para
    // poder LEER el valor restaurado.
    await deshacer(page).click();
    await seleccionar(page);
    await expect(ancho(page), 'deshacer restaura 1200').toHaveValue('1200');
    await expect(alto(page)).toHaveValue('600');

    await rehacer(page).click();
    await seleccionar(page);
    await expect(ancho(page), 'rehacer restaura 1500').toHaveValue('1500');
    await expect(alto(page)).toHaveValue('700');
  });

  test('guarda, recarga y reabre: las dimensiones persisten', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Resize guardar 7R');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);
    await seleccionar(page);

    await ancho(page).fill('1600');
    await alto(page).fill('680');
    await aplicar(page).click();
    await expect(ancho(page)).toHaveValue('1600');

    await page.getByRole('button', {name: 'Guardar'}).first().click();
    await page.waitForTimeout(2500);

    await abrirEditor(page, nombre);
    await seleccionar(page);
    await expect(ancho(page), 'el ancho persiste tras reabrir')
      .toHaveValue('1600');
    await expect(alto(page), 'el alto persiste tras reabrir')
      .toHaveValue('680');
  });

  test('una marimba bloqueada no se puede redimensionar', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Resize lock 7R');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);
    await seleccionar(page);

    // 7X: se acota al INSPECTOR. El panel de marimbas tambien tiene un boton de
    // candado y su nombre accesible menciona "Bloquear", asi que un selector
    // global seria ambiguo.
    await page.locator('.inspector').getByRole('button', {name: /Bloquear/}).click();
    await expect(ancho(page), 'bloqueada: el control se deshabilita')
      .toBeDisabled();
    await expect(aplicar(page)).toBeDisabled();
    await expect(page.getByText(/Desbloquea la marimba/)).toBeVisible();
  });

  test('el redimensionado es accesible y no depende del raton', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Resize a11y 7R');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);
    await seleccionar(page);

    for (const campo of [ancho(page), alto(page)]) {
      await campo.focus();
      await expect(campo).toBeFocused();
    }
    await ancho(page).focus();
    await ancho(page).press('Control+a');
    await ancho(page).type('1450');
    await aplicar(page).focus();
    await page.keyboard.press('Enter');
    await expect(ancho(page), 'aplicado con teclado').toHaveValue('1450');
    await expect(ancho(page)).toHaveAttribute('aria-describedby',
      /resize-(err|hint)/);
  });
});