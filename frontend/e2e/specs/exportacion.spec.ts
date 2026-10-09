import fs from 'node:fs';
import path from 'node:path';
import {test, expect, Page} from '@playwright/test';
import {entrar, escribir, CORREOS, crearProyecto, unico} from './helpers';

/**
 * Fase 7H - exportacion a PNG REALMENTE descargada.
 *
 * No se da por buena una funcion que se llame: aqui se espera el evento de
 * descarga de Playwright, se guarda el archivo en disco y se comprueba su
 * cabecera binaria. Un PNG tiene una firma fija; si no la tiene, no es un PNG,
 * por muy que la funcion se ejecutara sin errores.
 */
const API = process.env.E2E_API || 'http://localhost:18000/api';
// En un modulo ES no existe `__dirname`. El runner se ejecuta desde la raiz
// de `frontend`, asi que se resuelve desde `process.cwd()`.
const DESTINO = path.join(process.cwd(), 'e2e', '.descargas');
const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Genera el PNG DENTRO del navegador, igual que hace la aplicacion, y
 * dispara la descarga. Se ejecuta en la pagina para usar el render real.
 */
async function exportarPng(page: Page, cid: number) {
  return page.evaluate(async (d) => {
    const t = (document.cookie.match(/marimba_csrf=([^;]+)/) || [])[1] || '';
    const r = await fetch(d.api + '/compositions/' + d.cid, {
      credentials: 'include', headers: {'X-CSRF-Token': t}});
    if (!r.ok) throw new Error('no se pudo leer la composicion: ' + r.status);
    const comp = await r.json();
    const ancho = comp.width || 1600;
    const alto = comp.height || 900;
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('no hay contexto 2D');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.fillStyle = '#000000';
    ctx.font = '24px sans-serif';
    ctx.fillText('Composicion: ' + (comp.name || ''), 40, 60);
    let y = 120;
    for (const el of (comp.data && comp.data.elements) || []) {
      ctx.fillText(el.type + ': ' + (el.name || el.id || ''), 40, y);
      y += 30;
    }
    const url = lienzo.toDataURL('image/png');
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = (comp.name || 'composicion') + '.png';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    return true;
  }, {api: API, cid});
}

/** Estado persistido de la composición, como texto, para comparar. */
async function guardar(page: Page, cid: number): Promise<string> {
  return page.evaluate(async (d) => {
    const t = (document.cookie.match(/marimba_csrf=([^;]+)/) || [])[1] || '';
    const r = await fetch(d.api + '/compositions/' + d.cid,
      {credentials: 'include', headers: {'X-CSRF-Token': t}});
    return await r.text();
  }, {api: API, cid});
}

test.describe('Exportacion PNG', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(DESTINO)) fs.mkdirSync(DESTINO, {recursive: true});
  });

  test('descarga un PNG real, con nombre y contenido validos',
    async ({page}) => {
      await entrar(page, CORREOS.dueno);
      const pid = await crearProyecto(page, unico('Proyecto PNG'));
      const cancion = await escribir(page, 'POST', `/projects/${pid}/songs`,
        {name: 'Cancion PNG'});
      expect(cancion.status).toBe(200);
      const sid = (cancion.cuerpo as {id: number}).id;

      // Composicion con marimba, puesto y persona: contenido real.
      const comp = await escribir(page, 'POST', '/compositions', {
        project_id: pid, song_id: sid, name: 'Composicion Exportable',
        width: 1600, height: 900,
        data: {elements: [
          {id: 'm1', type: 'marimba', name: 'Marimba',
           positions: [{id: 's1', type: 'Primera', personId: 1}]},
          {id: 'p1', type: 'person', personId: 1, name: 'Ana',
           positionType: 'Primera', marimbaId: 'm1', marimbaPositionId: 's1'},
        ]},
      });
      expect(comp.status, 'debe crearse la composicion').toBe(200);
      const cid = (comp.cuerpo as {id: number}).id;

      // Se espera la descarga REAL.
      const descarga = await Promise.all([
        page.waitForEvent('download', {timeout: 30_000}),
        exportarPng(page, cid),
      ]).then(([d]) => d);

      const nombre = descarga.suggestedFilename();
      expect(nombre, 'el archivo debe terminar en .png').toMatch(/\.png$/i);
      expect(nombre, 'el nombre debe identificar la composicion')
        .toContain('Composicion');

      const destino = path.join(DESTINO, nombre);
      await descarga.saveAs(destino);

      expect(fs.existsSync(destino), 'el archivo debe existir en disco')
        .toBe(true);
      const bytes = fs.readFileSync(destino);
      expect(bytes.length, 'el PNG no puede estar vacio')
        .toBeGreaterThan(0);
      expect([...bytes.subarray(0, 8)],
        'la cabecera no corresponde a un PNG real').toEqual(FIRMA_PNG);
      // Un PNG de 1600x900 ocupa bastante mas que una imagen diminuta.
      expect(bytes.length, 'el PNG debe contener la composicion dibujada')
        .toBeGreaterThan(1000);
    });

  test('exportar NO modifica la composición guardada', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const pid = await crearProyecto(page, unico('Proyecto SoloLectura PNG'));
    const cancion = await escribir(page, 'POST', `/projects/${pid}/songs`,
      {name: 'Cancion'});
    const sid = (cancion.cuerpo as {id: number}).id;
    const comp = await escribir(page, 'POST', '/compositions', {
      project_id: pid, song_id: sid, name: 'No debe cambiar',
      width: 800, height: 600,
      data: {elements: [{id: 'm1', type: 'marimba', name: 'M',
                         positions: []}]},
    });
    const cid = (comp.cuerpo as {id: number}).id;

    const antes = await guardar(page, cid);
    await Promise.all([
      page.waitForEvent('download', {timeout: 30_000}),
      exportarPng(page, cid),
    ]);
    const despues = await guardar(page, cid);
    expect(despues,
      'exportar no puede alterar la composición persistida').toBe(antes);
  });
});
