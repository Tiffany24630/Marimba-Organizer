import {test, expect, Page} from '@playwright/test';
import {entrar, crearProyecto, escribir, unico, CORREOS, WEB} from './helpers';

/**
 * Fase 7X - AUDITORIA de nombres accesibles en el EDITOR.
 *
 * El test previo de 7O (`interfaz.spec.ts`) daba por bueno un boton si tenia
 * `title`. Eso es una laguna: cuando el boton tiene CONTENIDO, el contenido tiene
 * prioridad sobre `title` en el calculo del nombre accesible, asi que un
 * `<button title="Deshacer">↶</button>` se anuncia como "↶".
 *
 * Aqui se calcula el nombre REAL con la misma precedencia que usa el navegador
 * (aria-label > aria-labelledby > contenido) y se exige que contenga al menos
 * una letra o un digito: un nombre formado solo por simbolos no dice nada.
 */

async function proyecto(page: Page, nombre: string) {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion 7X'});
  const sid = (c.cuerpo as {id: number}).id;
  await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion 7X',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba 7X',
       x: 200, y: 150, width: 1200, height: 600,
       positions: [{id: 's1', type: 'Primera', personId: null},
                   {id: 's2', type: 'Segunda', personId: null}]},
      {id: 'p1', type: 'person', personId: 1, name: 'Ana',
       x: 300, y: 300, width: 140, height: 180, positionType: 'Primera',
       marimbaId: null, marimbaPositionId: null},
    ]},
  });
  return nombre;
}

async function abrirEditor(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre}).first()
    .click({timeout: 30_000});
  await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
    .click({timeout: 30_000});
  await page.locator('.canvas-panel').waitFor({state: 'visible', timeout: 30_000});
}

/** Nombre accesible real, con la precedencia del navegador. */
async function auditar(page: Page) {
  return page.evaluate(() => {
    const malo: {nombre: string; html: string}[] = [];
    document.querySelectorAll('button').forEach(b => {
      const etiqueta = (b.getAttribute('aria-label') || '').trim();
      const porId = b.getAttribute('aria-labelledby');
      let nombre = etiqueta;
      if (!nombre && porId) {
        nombre = (porId.split(/\s+/)
          .map(id => document.getElementById(id)?.textContent || '')
          .join(' ')).trim();
      }
      if (!nombre) nombre = (b.innerText || '').trim();
      // Un nombre solo de simbolos no comunica nada a un lector de pantalla.
      if (!/[\p{L}\p{N}]/u.test(nombre)) {
        malo.push({nombre, html: b.outerHTML.slice(0, 110)});
      }
    });
    return malo;
  });
}

/** Deja visible cada zona del editor: un boton no renderizado tampoco existe. */
async function recorrerTodo(page: Page) {
  for (const t of ['Personas', 'Marimbas', 'Paneles']) {
    await page.getByRole('tab', {name: t}).click();
    await page.waitForTimeout(250);
  }
  // Con una marimba seleccionada se renderiza el Inspector, que es donde hay
  // mas botones de icono. Se usa la misma ruta que 7T ya verifico.
  await page.getByRole('tab', {name: 'Marimbas'}).click();
  await page.locator('.marimba-panel').waitFor({state: 'visible', timeout: 20_000});
  await page.locator('.marimba-panel .pp-main').first().click();
  await page.getByRole('heading', {name: /Marimba seleccionada/}).waitFor
    ({timeout: 20_000});
}

test.describe('Auditoria de nombres accesibles del editor', () => {
  test('ningun boton del editor tiene un nombre solo de simbolos', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Nombres 7X');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);

    // Se recorre TODA la aplicacion: login, dashboard y cada zona del editor,
    // porque un boton no renderizado en la pestana activa tampoco existe.
    const mala: {estado: string; html: string}[] = [];
    const recoger=async(estado:string)=>{
      for(const b of await auditar(page)) mala.push({estado,html:b.html});
    };
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    await recoger('login');
    await entrar(page, CORREOS.dueno);
    await page.waitForTimeout(700);
    await recoger('dashboard');
    await abrirEditor(page, nombre);
    await recoger('editor');
    for (const t of ['Personas', 'Marimbas', 'Paneles']) {
      await page.getByRole('tab', {name: t}).click();
      await page.waitForTimeout(250);
      await recoger('editor:' + t);
    }
    await page.getByRole('tab', {name: 'Marimbas'}).click();
    await page.locator('.marimba-panel .pp-main').first().click();
    await page.getByRole('heading', {name: /Marimba seleccionada/}).waitFor
      ({timeout: 20_000});
    await recoger('editor:inspector');

    const unicos = mala.filter((x,i,a)=>a.findIndex(y=>y.html===x.html)===i);
    expect(unicos,
      'botones cuyo nombre accesible no contiene letra ni digito: ' +
      JSON.stringify(unicos, null, 1)).toEqual([]);
  });

  test('la vista sin raton tambien tiene nombres correctos', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Nombres acc 7X');
    await proyecto(page, nombre);
    await abrirEditor(page, nombre);
    await page.getByRole('button', {name: 'Edición sin ratón'}).click();
    await page.locator('.acc-editor').waitFor({state: 'visible', timeout: 20_000});

    const malos = await auditar(page);
    expect(malos,
      'botones sin nombre real en la vista accesible: ' +
      JSON.stringify(malos, null, 1)).toEqual([]);
  });

  test('deshacer y rehacer se anuncian por su accion, no por un simbolo',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const nombre = unico('Nombres deshacer 7X');
      await proyecto(page, nombre);
      await abrirEditor(page, nombre);

      // Estos botones existen con simbolo + title; el nombre accesible debe ser
      // la ACCION. Con historial vacio estan deshabilitados, asi que NO se
      // pulsan: se comprueba el nombre y que el boton existe.
      for (const etiqueta of [/Deshacer/, /Rehacer/]) {
        const b = page.getByRole('button', {name: etiqueta}).first();
        await expect(b, `debe existir un boton llamado ${etiqueta}`)
          .toBeVisible();
        await expect(b, 'y su nombre debe ser la accion, no un simbolo')
          .toHaveAttribute('aria-label', new RegExp(etiqueta.source));
      }
    });
});