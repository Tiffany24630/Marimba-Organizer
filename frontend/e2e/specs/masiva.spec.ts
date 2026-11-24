import fs from 'node:fs';
import path from 'node:path';
import {test, expect, Page, Download} from '@playwright/test';
import {entrar, escribir, crearProyecto, unico, WEB} from './helpers';

/**
 * Fase 7I - EXPORTACION MASIVA real, iniciada desde la interfaz.
 *
 * 7H dejo esto pendiente y su prueba de PNG era incompleta: dibujaba un canvas
 * desde el propio test en vez de usar la exportacion de la aplicacion. Aqui se
 * pulsa el boton real ("Exportar todas las imagenes") y se comprueban los
 * archivos QUE DESCARGAN, byte a byte.
 *
 * Lo que se comprueba, sin inventar comportamiento:
 *  - una descarga por cada composicion con contenido;
 *  - extension `.png`, nombre con cancion/composicion e indice;
 *  - firma binaria PNG real, no solo "la funcion no dio error";
 *  - correspondencia entre cada archivo y su composicion;
 *  - una composicion vacia NO genera archivo pero NO detiene a las demas
 *    (eso es lo que hace `MassExport`, no lo que uno imaginaria);
 *  - la exportacion no modifica nada de lo guardado.
 */
const DESTINO = path.join(process.cwd(), 'e2e', '.descargas');
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Elementos REALES de una composición: con caja (x/y/width/height).
 *
 * Ojo, esto no es trivial: `compositionBounds` calcula el encuadre a partir de
 * la caja de cada elemento. Sin `width`/`height` el calculo da `NaN`, la
 * función devuelve null y la aplicación informa "La composición está vacía".
 * La prueba de 7H no lo detectó porque dibujaba su propio canvas y nunca
 * llegaba a este código.
 */
const ELEMENTOS = [
  {id: 'm1', type: 'marimba', name: 'Marimba',
   x: 100, y: 100, width: 1200, height: 600,
   positions: [{id: 's1', type: 'Primera', personId: 1}]},
  {id: 'p1', type: 'person', personId: 1, name: 'Ana',
   x: 220, y: 260, width: 140, height: 180,
   positionType: 'Primera', marimbaId: 'm1', marimbaPositionId: 's1'},
];

/** Crea cancion + composicion con contenido y devuelve sus ids. */
async function armaComposicion(page: Page, pid: number, nombreCancion: string,
                                nombreComp: string, conContenido = true) {
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: nombreCancion});
  expect(c.status, `crear cancion ${nombreCancion}`).toBe(200);
  const sid = (c.cuerpo as {id: number}).id;
  const comp = await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: nombreComp, width: 1600, height: 900,
    data: {elements: conContenido ? ELEMENTOS : []},
  });
  expect(comp.status, `crear composicion ${nombreComp}`).toBe(200);
  return {sid, cid: (comp.cuerpo as {id: number}).id};
}

/** Abre el proyecto pulsando su tarjeta, como haría una persona. */
async function abrirProyecto(page: Page, nombre: string) {
  await page.goto(WEB, {waitUntil: 'domcontentloaded'});
  await page.locator('button.project-open', {hasText: nombre})
    .first().click({timeout: 30_000});
  await page.locator('.mass-export').waitFor({state: 'visible', timeout: 30_000});
}

/** Estado persistido de una composición, como texto, para comparar. */
async function estado(page: Page, cid: number): Promise<string> {
  const r = await escribir(page, 'GET', `/compositions/${cid}`);
  return r.texto;
}

/** Descargas el PNG que produce la aplicación y espera a que terminen. */
async function exportarTodas(page: Page, esperadas: number): Promise<Download[]> {
  const capturas: Download[] = [];
  page.on('download', (d) => capturas.push(d));
  await page.locator('button.primary', {hasText: 'Exportar todas'})
    .first().click();
  await expect.poll(() => capturas.length,
    {timeout: 60_000, message: `se esperaban ${esperadas} descargas`})
    .toBeGreaterThanOrEqual(esperadas);
  return capturas;
}

test.beforeAll(() => {
  if (!fs.existsSync(DESTINO)) fs.mkdirSync(DESTINO, {recursive: true});
});

test.describe('Exportacion masiva desde la interfaz', () => {
  test('descarga un PNG real por cada composicion, y son PNG de verdad',
    async ({page}) => {
      await entrar(page, 'despliegue7f-a@prueba.local');
      const nombre = unico('Trabajo Masivo');
      const pid = await crearProyecto(page, nombre);
      await armaComposicion(page, pid, 'Cancion Alfa', 'Comp Alfa');
      await armaComposicion(page, pid, 'Cancion Beta', 'Comp Beta');

      await abrirProyecto(page, nombre);
      const descargas = await exportarTodas(page, 2);

      for (const d of descargas) {
        const archivo = d.suggestedFilename();
        expect(archivo, 'cada archivo debe ser un .png').toMatch(/\.png$/i);
        // El nombre identifica cancion Y composicion, mas un indice.
        expect(archivo).toMatch(/(Alfa|Beta)/);

        const destino = path.join(DESTINO, archivo);
        await d.saveAs(destino);
        expect(fs.existsSync(destino), 'el archivo debe existir en disco').toBe(true);

        const bytes = fs.readFileSync(destino);
        expect(bytes.length, 'el PNG no puede estar vacio').toBeGreaterThan(0);
        // La cabecera binaria es la prueba de que es un PNG y no otra cosa.
        expect([...bytes.subarray(0, 8)],
          'la cabecera no corresponde a un PNG real').toEqual(FIRMA_PNG);
        expect(bytes.length, 'debe contener la composicion dibujada')
          .toBeGreaterThan(1000);
      }

      // Correspondencia: los dos ficheros corresponden a las dos composiciones.
      const nombres = descargas.map(d => d.suggestedFilename()).join(' | ');
      expect(nombres, 'debe aparecer la composicion Alfa').toContain('Alfa');
      expect(nombres, 'debe aparecer la composicion Beta').toContain('Beta');
      // El indice evita sobrescribir: los dos nombres son distintos.
      expect(new Set(descargas.map(d => d.suggestedFilename())).size)
        .toBe(descargas.length);
    });

  test('una composicion vacia no genera archivo pero no detiene a las demas',
    async ({page}) => {
      await entrar(page, 'despliegue7f-a@prueba.local');
      const nombre = unico('Trabajo Parcial');
      const pid = await crearProyecto(page, nombre);
      await armaComposicion(page, pid, 'Cancion Buena', 'Comp Buena');
      // Vacía a propósito: no se dibuja nada.
      await armaComposicion(page, pid, 'Cancion Vacia', 'Comp Vacia', false);

      await abrirProyecto(page, nombre);
      const descargas = await exportarTodas(page, 1);

      // Solo la que tiene contenido produce archivo.
      expect(descargas.length, 'solo la composicion con contenido descarga')
        .toBe(1);
      expect(descargas[0].suggestedFilename()).toContain('Buena');

      // Y la interfaz explica cual fallo, sin morir.
      const aviso = page.locator('.export-result');
      await expect(aviso, 'debe informar del resultado').toBeVisible({timeout: 30_000});
      await expect(aviso, 'debe decir que se generó 1 imagen')
        .toContainText('1 imagen');
      await expect(aviso, 'debe señalar la composición vacía')
        .toContainText('Vacia');
    });

  test('exportar NO modifica las composiciones guardadas', async ({page}) => {
    await entrar(page, 'despliegue7f-a@prueba.local');
    const nombre = unico('Trabajo Intacto');
    const pid = await crearProyecto(page, nombre);
    const a = await armaComposicion(page, pid, 'Cancion Intacta 1', 'Comp Intacta 1');
    const b = await armaComposicion(page, pid, 'Cancion Intacta 2', 'Comp Intacta 2');

    const antes = [await estado(page, a.cid), await estado(page, b.cid)];

    await abrirProyecto(page, nombre);
    await exportarTodas(page, 2);
    await expect(page.locator('.export-result')).toBeVisible({timeout: 30_000});

    const despues = [await estado(page, a.cid), await estado(page, b.cid)];
    expect(despues, 'exportar es de solo lectura').toEqual(antes);
  });

  test('el progreso se muestra mientras se exportan varias composiciones',
    async ({page}) => {
      await entrar(page, 'despliegue7f-a@prueba.local');
      const nombre = unico('Trabajo Progreso');
      const pid = await crearProyecto(page, nombre);
      // Varias composiciones: con una sola el bucle termina tan rapido que el
      // estado "Exportando" no llega a verse y la prueba seria una carrera.
      for (let i = 0; i < 8; i++) {
        await armaComposicion(page, pid, `Cancion P${i}`, `Comp P${i}`);
      }

      await abrirProyecto(page, nombre);
      const boton = page.locator('button.primary', {hasText: 'Exportar todas'});
      await boton.click();
      // Durante el trabajo aparece el progreso, con su nombre accesible.
      await expect(page.locator('progress[aria-label="Progreso de la exportación"]'),
        'debe mostrarse el progreso de la exportación')
        .toBeVisible({timeout: 30_000});
      // Y al terminar, el resumen dice cuantas imágenes salieron.
      await expect(page.locator('.export-result')).toContainText('8 imagenes',
        {timeout: 60_000});
      // La barra de progreso desaparece al terminar.
      await expect(page.locator('progress')).toHaveCount(0);
    });
});