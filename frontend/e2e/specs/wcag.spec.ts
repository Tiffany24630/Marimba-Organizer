import {test, expect, Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {entrar, crearProyecto, escribir, unico, WEB, CORREOS} from './helpers';

/**
 * Fase 7I - AUDITORIA DE ACCESIBILIDAD (WCAG) con axe-core en navegador real.
 *
 * 7H solo comprobo a mano nombres, etiquetas y foco. Aqui se anade la
 * herramienta estandar, que cubre ademas contraste, jerarquia de encabezados,
 * ARIA y elementos interactivos en varias vistas reales.
 *
 * Importante y honesto: superar axe-core NO es conformidad WCAG. La herramienta
 * cubre la parte automatizable; el orden del foco, el sentido de los mensajes y
 * el lienzo siguen siendo revision manual.
 */
const GRAVES = ['critical', 'serious'];

type Violacion = {
  id: string;
  impacto: string;
  ayuda: string;
  nodos: number;
  objetivo: string;
  detalle: string;
};

/**
 * Ejecuta axe y devuelve las infracciones, sin desactivar ninguna regla.
 *
 * 7J: para `color-contrast` se extraen los colores REALES que calculó axe
 * (fgColor, bgColor, ratio y tamaño de fuente). En 7I se corrigieron colores a
 * ciegas y no bastó: sin estos datos no hay forma de saber qué corregir.
 */
async function auditar(page: Page, contexto: string, scope?: string): Promise<Violacion[]> {
  const axe = new AxeBuilder({page});
  if (scope) axe.include(scope).setLegacyMode(true);
  const resultados = await axe.analyze();
  const infracciones: Violacion[] = resultados.violations.map(v => {
    const primero = v.nodes[0];
    const d: any = primero?.any?.[0]?.data ?? {};
    // `fgColor`/`bgColor` llegan como string hex en axe 4.x, o como objeto
    // {r,g,b} en versiones anteriores. Se cubren ambos casos.
    const rgb = (x: any) => {
      if (typeof x === 'string') return x;
      if (x && typeof x === 'object') return `rgb(${x.r},${x.g},${x.b})`;
      return '?';
    };
    const detalle = v.id === 'color-contrast'
      ? `fg=rgb(${rgb(d.fgColor)}) bg=rgb(${rgb(d.bgColor)}) ` +
        `ratio=${d.contrastRatio} size=${d.fontSize} weight=${d.fontWeight}`
      : '';
    return {
      id: v.id,
      impacto: v.impact ?? 'unknown',
      ayuda: v.help,
      nodos: v.nodes.length,
      objetivo: (primero?.target ?? []).join(' '),
      detalle,
    };
  });
  console.log(`\n[axe] ${contexto}: ${infracciones.length} infracciones`);
  for (const v of infracciones) {
    console.log(`   - [${v.impacto}] ${v.id} (${v.nodos}) ${v.objetivo} ${v.detalle}`);
  }
  return infracciones;
}

/** Falla si hay infracciones criticas o graves, con detalle util. */
function exigirSinGraves(infracciones: Violacion[], contexto: string) {
  const graves = infracciones.filter(v => GRAVES.includes(v.impacto));
  expect(graves,
    'Infracciones graves/criticas en ' + contexto + ':\n' +
    graves.map(v => `  [${v.impacto}] ${v.id} - ${v.ayuda} (${v.nodos}) ${v.objetivo}`)
      .join('\n')).toEqual([]);
}

/** Proyecto con una cancion y una composicion con contenido real. */
async function proyectoDePrueba(page: Page, nombre: string): Promise<number> {
  const pid = await crearProyecto(page, nombre);
  const c = await escribir(page, 'POST', `/projects/${pid}/songs`,
    {name: 'Cancion WCAG'});
  expect(c.status).toBe(200);
  const sid = (c.cuerpo as {id: number}).id;
  const comp = await escribir(page, 'POST', '/compositions', {
    project_id: pid, song_id: sid, name: 'Composicion WCAG',
    width: 1600, height: 900,
    data: {elements: [
      {id: 'm1', type: 'marimba', name: 'Marimba', x: 100, y: 100,
       width: 1200, height: 600,
       positions: [{id: 's1', type: 'Primera', personId: 1}]},
      {id: 'p1', type: 'person', personId: 1, name: 'Ana', x: 220, y: 260,
       width: 140, height: 180, positionType: 'Primera',
       marimbaId: 'm1', marimbaPositionId: 's1'},
    ]},
  });
  expect(comp.status).toBe(200);
  return pid;
}
test.describe('Accesibilidad WCAG (axe-core)', () => {
  test('pantalla de inicio de sesion', async ({page}) => {
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible', timeout: 30_000});
    exigirSinGraves(await auditar(page, 'inicio de sesion'), 'inicio de sesion');
  });

  test('formulario de recuperacion de contrasena', async ({page}) => {
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible', timeout: 30_000});
    await page.locator('a,button', {hasText: /recuperar|olvid/i}).first().click();
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible', timeout: 30_000});
    exigirSinGraves(await auditar(page, 'recuperacion'), 'recuperacion');
  });

  test('panel principal de proyectos', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    await page.locator('.dash-hero').waitFor({state: 'visible', timeout: 30_000});
    // El objetivo de este escenario es el panel completo, que vive dentro de
    // este main. Mantener el scope evita que axe recorra la envoltura de la
    // aplicacion, sin excluir ningun nodo del panel ni ninguna regla.
    exigirSinGraves(await auditar(page, 'panel de proyectos', '.dash'),
      'panel de proyectos');
  });

  test('vista de proyecto con canciones y composicion', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Trabajo WCAG');
    await proyectoDePrueba(page, nombre);
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    await page.locator('button.project-open', {hasText: nombre}).first()
      .click({timeout: 30_000});
    await page.locator('.proj-head').waitFor({state: 'visible', timeout: 30_000});
    exigirSinGraves(await auditar(page, 'vista de proyecto'), 'vista de proyecto');
  });

  test('editor de composicion', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const nombre = unico('Editor WCAG');
    await proyectoDePrueba(page, nombre);
    await page.goto(WEB, {waitUntil: 'domcontentloaded'});
    await page.locator('button.project-open', {hasText: nombre}).first()
      .click({timeout: 30_000});
    await page.locator('button.primary', {hasText: 'Abrir editor'}).first()
      .click({timeout: 30_000});
    await page.waitForTimeout(1500);
    exigirSinGraves(await auditar(page, 'editor de composicion'),
      'editor de composicion');
  });
});
