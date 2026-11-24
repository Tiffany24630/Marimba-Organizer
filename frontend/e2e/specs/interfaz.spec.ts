import {test, expect} from '@playwright/test';
import {entrar, escribir, leer, CORREOS, crearProyecto, unico}
  from './helpers';

/**
 * Fase 7H - responsive, accesibilidad basica y exportacion PNG.
 */

const VIEWPORTS = [
  {nombre: 'desktop', width: 1280, height: 800},
  {nombre: 'tablet', width: 820, height: 1180},
  {nombre: 'movil', width: 390, height: 844},
];

test.describe('Responsive', () => {
  for (const v of VIEWPORTS) {
    test(`sin desbordamiento horizontal en ${v.nombre} (${v.width}px)`,
      async ({page}) => {
        await page.setViewportSize({width: v.width, height: v.height});
        await entrar(page, CORREOS.dueno);
        await page.waitForTimeout(900);
        const d = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          cliente: document.documentElement.clientWidth}));
        // Se tolera 1px de redondeo, no una pagina que se desplaza de lado.
        expect(d.scroll,
          `${v.nombre}: el contenido desborda (${d.scroll} > ${d.cliente})`)
          .toBeLessThanOrEqual(d.cliente + 2);
      });
  }

  test('el boton de acceso es alcanzable con el teclado', async ({page}) => {
    await page.goto(process.env.E2E_WEB || 'http://localhost:18080');
    const correo = page.locator('input[type="email"]').first();
    await correo.waitFor({state: 'visible'});
    await page.locator('body').click({position: {x: 5, y: 5}});

    // Recorrido real de un usuario de teclado: se tabula hasta el campo de
    // correo, se escribe, se sigue hasta el de contrasena y se sigue hasta el
    // boton. No se busca el boton en una pantalla vacia porque, estando
    // deshabilitado, un `<button disabled>` NO recibe el foco: forma parte de
    // como funciona HTML, y buscarse ahiseria una prueba que no mide nada.
    const alcanzado: string[] = [];
    let hayBoton = false;
    for (let i = 0; i < 30; i++) {
      const info = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return {tag: a ? a.tagName : '', tipo: a ? a.getAttribute('type') || '' : '',
                texto: a ? (a.textContent || '').trim() : ''};
      });
      alcanzado.push(info.tag + ':' + info.texto.slice(0, 20));
      if (info.tag === 'INPUT' && info.tipo === 'email') {
        await correo.fill(CORREOS.dueno);
        await page.keyboard.press('Tab');
        const clave = await page.evaluate(() =>
          document.activeElement === document.querySelector(
            'input[type="password"]'));
        expect(clave, 'el campo de contrasena debe seguir al de correo')
          .toBe(true);
        await page.locator('input[type="password"]').first().fill('Temporal7H');
      }
      if (info.tag === 'BUTTON' &&
          /iniciar|entrar|acceder/i.test(info.texto)) {
        hayBoton = true;
        break;
      }
      await page.keyboard.press('Tab');
    }
    expect(hayBoton,
      'con los campos rellenos, el boton de acceso debe ser alcanzable. ' +
      'Recorrido: ' + alcanzado.join(' > ')).toBe(true);
  });
});

test.describe('Accesibilidad', () => {
  test('todos los botones tienen nombre accesible', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    await page.waitForTimeout(700);
    const sinNombre = await page.evaluate(() => {
      const malos: string[] = [];
      document.querySelectorAll('button').forEach(b => {
        // 7X: se calcula el nombre REAL con la precedencia del navegador
        // (aria-label > aria-labelledby > contenido). Antes se aceptaba un
        // simple `title`, lo cual es incorrecto cuando el boton tiene
        // contenido: ahi el contenido gana y el nombre quedaba en "↶" o "🗑".
        const etiqueta = (b.getAttribute('aria-label') || '').trim();
        const porId = b.getAttribute('aria-labelledby');
        let nombre = etiqueta;
        if (!nombre && porId) {
          nombre = (porId.split(/\s+/)
            .map(id => document.getElementById(id)?.textContent || '')
            .join(' ')).trim();
        }
        if (!nombre) nombre = (b.innerText || '').trim();
        if (!/[\p{L}\p{N}]/u.test(nombre)) {
          malos.push(b.outerHTML.slice(0, 90));
        }
      });
      return malos;
    });
    expect(sinNombre, 'botones sin nombre accesible').toEqual([]);
  });

  test('los campos de la pantalla de acceso tienen etiqueta',
    async ({page}) => {
      await page.goto(process.env.E2E_WEB || 'http://localhost:18080');
      const sinEtiqueta = await page.evaluate(() => {
        const malos: string[] = [];
        document.querySelectorAll('input').forEach(i => {
          const id = i.getAttribute('id');
          const etiquetado = i.getAttribute('aria-label') ||
            (id && document.querySelector('label[for="' + id + '"]')) ||
            i.closest('label');
          if (!etiquetado) malos.push(i.outerHTML.slice(0, 90));
        });
        return malos;
      });
      expect(sinEtiqueta, 'campos sin etiqueta asociada').toEqual([]);
    });

  test('el foco es visible al navegar con teclado', async ({page}) => {
    await page.goto(process.env.E2E_WEB || 'http://localhost:18080');
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible'});
    await page.locator('input[type="email"]').first().focus();
    const estilos = await page.evaluate(() => {
      const e = getComputedStyle(document.activeElement as Element);
      return {outline: e.outlineStyle, sombra: e.boxShadow};
    });
    // No se exige un diseno concreto: basta con que el foco no desaparece.
    expect(estilos.outline !== 'none' || estilos.sombra !== 'none',
      'el elemento enfocado debe tener alguna senal de foco').toBe(true);
  });
});
