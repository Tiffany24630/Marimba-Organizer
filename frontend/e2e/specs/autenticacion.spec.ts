import {test, expect} from '@playwright/test';
import {abrirComo, entrar, escribir, leer, CORREOS, crearProyecto, compartir,
        unico} from './helpers';

/**
 * Fase 7H - E2E de autenticacion, identidad y aislamiento entre usuarios.
 *
 * Cada comprobacion mide el ESTADO REAL en el backend, no si un boton existe.
 */
test.describe('Autenticacion', () => {
  test('login valido: crea sesion HttpOnly y SameSite=Lax', async ({page, browser}) => {
    await entrar(page, CORREOS.dueno);
    const cookies = await page.context().cookies();
    const sesion = cookies.find(c => c.name === 'marimba_session');
    expect(sesion, 'debe existir la cookie de sesion').toBeTruthy();
    expect(sesion!.httpOnly,
      'la cookie debe ser HttpOnly: el JS no puede leerla').toBe(true);
    expect(String(sesion!.sameSite).toLowerCase()).toBe('lax');
    expect(sesion!.value.length,
      'la cookie debe traer un valor real').toBeGreaterThan(10);

    // El token no puede estar en el almacenamiento del navegador.
    const almacen = await page.evaluate(() =>
      JSON.stringify({...localStorage, ...sessionStorage}));
    expect(almacen, 'el token no debe estar en localStorage/sessionStorage')
      .not.toContain(sesion!.value);
  });

  test('credenciales invalidas: no se crea sesion', async ({page, browser}) => {
    await page.goto(process.env.E2E_WEB || 'http://localhost:18080');
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible'});
    await page.locator('input[type="email"]').first().fill(CORREOS.dueno);
    await page.locator('input[type="password"]').first().fill('ClaveIncorrecta7F');
    await page.locator('button:has-text("Iniciar")').first().click();
    await page.waitForTimeout(2500);
    const cookies = await page.context().cookies();
    expect(cookies.find(c => c.name === 'marimba_session' && c.value),
      'una clave incorrecta no debe iniciar sesion').toBeFalsy();
    // Y debe verse un mensaje de error en pantalla.
    const err = await page.locator('.auth-err').count();
    expect(err, 'debe mostrarse un mensaje de error').toBeGreaterThan(0);
  });

  test('la sesion sobrevive a recargar y a navegar', async ({page, browser}) => {
    await entrar(page, CORREOS.dueno);
    await page.reload({waitUntil: 'domcontentloaded'});
    // Tras recargar, /auth/me debe seguir respondiendo con sesion.
    const yo = await leer(page, '/auth/me');
    expect(yo.status, 'la sesion debe seguir viva tras recargar').toBe(200);
    expect(yo.cuerpo).toContain(CORREOS.dueno);

    // Y una ruta protegida concreta tambien.
    const proyectos = await leer(page, '/projects');
    expect(proyectos.status, 'las rutas privadas siguen accesibles').toBe(200);
  });

  test('logout cierra la sesion y bloquea el acceso posterior', async ({page, browser}) => {
    await entrar(page, CORREOS.dueno);
    const salida = await escribir(page, 'POST', '/auth/logout');
    expect(salida.status).toBe(200);
    const despues = await leer(page, '/projects');
    expect([401, 403], 'tras logout las rutas privadas se rechazan')
      .toContain(despues.status);
    const cookies = await page.context().cookies();
    const viva = cookies.find(c => c.name === 'marimba_session' && c.value);
    expect(!viva, 'la cookie de sesion debe quedar vacia').toBeTruthy();
  });
});

test.describe('Owner / Editor / Reader', () => {
  test('OWNER: edita, comparte y los cambios persisten', async ({page, browser}) => {
    await entrar(page, CORREOS.dueno);
    const pid = await crearProyecto(page, unico('Proyecto Owner'));

    // Renombrar y comprobar que se guardó.
    const nombre = unico('Owner renombrado');
    const parche = await escribir(page, 'PATCH', `/projects/${pid}`,
      {name: nombre});
    expect(parche.status).toBe(200);
    const despues = await leer(page, `/projects/${pid}`);
    expect(despues.cuerpo, 'el nombre debe quedar guardado')
      .toContain(nombre);

    // Compartir con editor y lector.
    await compartir(page, pid, CORREOS.editor, 'editor');
    await compartir(page, pid, CORREOS.lector, 'reader');
    const lista = await leer(page, `/projects/${pid}/collaborators`);
    expect(lista.cuerpo).toContain(CORREOS.editor);
    expect(lista.cuerpo).toContain(CORREOS.lector);

    // Y consultar la auditoría, que es exclusiva del propietario.
    const audit = await leer(page, `/projects/${pid}/audit-log`);
    expect(audit.status, 'el owner debe ver la auditoria').toBe(200);
    expect(audit.cuerpo, 'debe constar la creacion')
      .toContain('PROJECT_CREATED');
  });

  test('EDITOR: escribe pero no administra ni borra', async ({page, browser}) => {
    const {ctx: duenoCtx, page: dueno} = await abrirComo(browser, CORREOS.dueno);
    const pid = await crearProyecto(dueno, unico('Proyecto Editor'));
    const uid = await compartir(dueno, pid, CORREOS.editor, 'editor');

    await entrar(page, CORREOS.editor);
    const cancion = await escribir(page, 'POST', `/projects/${pid}/songs`,
      {name: 'Cancion del editor'});
    expect(cancion.status, 'el editor debe poder crear').toBe(200);

    // El editor PUEDE VER quien tiene acceso: `list_collaborators` usa
    // `readable_project` a proposito (el docstring lo dice: "propietario y
    // editores ven QUIEN tiene acceso"). Ver no es administrar.
    const lista = await leer(page, `/projects/${pid}/collaborators`);
    expect(lista.status, 'el editor puede consultar la lista').toBe(200);

    // Lo que NO puede es ADMINISTRARLA.
    const audit = await leer(page, `/projects/${pid}/audit-log`);
    expect([403, 404], 'el editor no debe ver la auditoria')
      .toContain(audit.status);
    const baja = await escribir(page, 'DELETE',
      `/projects/${pid}/collaborators/${uid}`);
    expect([403, 404], 'el editor no debe revocar colaboradores')
      .toContain(baja.status);
    const alta = await escribir(page, 'POST', `/projects/${pid}/collaborators`,
      {email: CORREOS.intruso, role: 'reader'});
    expect([403, 404], 'el editor no debe añadir colaboradores')
      .toContain(alta.status);

    // Ni borrar el proyecto del propietario.
    const borrado = await escribir(page, 'DELETE', `/projects/${pid}`);
    expect([403, 404], 'el editor no debe borrar el proyecto')
      .toContain(borrado.status);
    await duenoCtx.close();
  });

  test('READER: consulta pero no modifica nada', async ({page, browser}) => {
    const {ctx: duenoCtx, page: dueno} = await abrirComo(browser, CORREOS.dueno);
    const pid = await crearProyecto(dueno, unico('Proyecto Reader'));
    await compartir(dueno, pid, CORREOS.lector, 'reader');

    await entrar(page, CORREOS.lector);
    expect((await leer(page, `/projects/${pid}`)).status,
      'el reader debe poder consultar').toBe(200);
    expect((await leer(page, `/projects/${pid}/songs`)).status,
      'el reader debe ver las canciones').toBe(200);

    // NO puede escribir: se comprueba el estado antes y DESPUÉS.
    const antes = (await leer(page, `/projects/${pid}`)).cuerpo;
    const escritura = await escribir(page, 'PATCH', `/projects/${pid}`,
      {name: 'Intrusion'});
    expect([403, 404], 'el reader no debe escribir')
      .toContain(escritura.status);
    const despues = (await leer(page, `/projects/${pid}`)).cuerpo;
    expect(despues, 'el recurso debe seguir EXACTAMENTE igual')
      .toBe(antes);

    const cancion = await escribir(page, 'POST', `/projects/${pid}/songs`,
      {name: 'Intrusa'});
    expect([403, 404], 'el reader no debe crear canciones')
      .toContain(cancion.status);
    const borrado = await escribir(page, 'DELETE', `/projects/${pid}`);
    expect([403, 404], 'el reader no debe borrar')
      .toContain(borrado.status);
    await duenoCtx.close();
  });

  test('REVOCACION: surte efecto sin cerrar la sesión', async ({page, browser}) => {
    const {ctx: duenoCtx, page: dueno} = await abrirComo(browser, CORREOS.dueno);
    const pid = await crearProyecto(dueno, unico('Proyecto Revocar'));
    const uid = await compartir(dueno, pid, CORREOS.lector, 'reader');

    await entrar(page, CORREOS.lector);
    expect((await leer(page, `/projects/${pid}`)).status,
      'antes de revocar debe poder leer').toBe(200);

    // El propietario revoca. La sesión del lector SIGUE abierta.
    const baja = await escribir(dueno, 'DELETE',
      `/projects/${pid}/collaborators/${uid}`);
    expect(baja.status).toBe(200);

    const despues = await leer(page, `/projects/${pid}`);
    expect(despues.status,
      'tras revocar, la siguiente petición debe fallar').not.toBe(200);
    await duenoCtx.close();
  });

  test('CAMBIO DE ROL: editor pasa a reader y pierde la escritura',
    async ({page, browser}) => {
      const {ctx: duenoCtx, page: dueno} =
        await abrirComo(browser, CORREOS.dueno);
      const pid = await crearProyecto(dueno, unico('Proyecto Rol'));
      const uid = await compartir(dueno, pid, CORREOS.editor, 'editor');

      await entrar(page, CORREOS.editor);
      expect((await escribir(page, 'POST', `/projects/${pid}/songs`,
        {name: 'Antes'})).status, 'como editor puede crear').toBe(200);

      const cambio = await escribir(dueno, 'PATCH',
        `/projects/${pid}/collaborators/${uid}`, {role: 'reader'});
      expect(cambio.status).toBe(200);

      // Sin cerrar sesión, ya no puede escribir.
      const tras = await escribir(page, 'POST', `/projects/${pid}/songs`,
        {name: 'Despues'});
      expect([403, 404], 'tras degradar a lector no puede escribir')
        .toContain(tras.status);
      await duenoCtx.close();
    });
});


test.describe('Aislamiento (IDOR)', () => {
  test('sin acceso: 404 y no aparece en el listado', async ({browser}) => {
    const {ctx: duenoCtx, page: dueno} =
      await abrirComo(browser, CORREOS.dueno);
    const pid = await crearProyecto(dueno, unico('Proyecto IDOR'));
    await duenoCtx.close();

    const {ctx: intrusoCtx, page: intruso} =
      await abrirComo(browser, CORREOS.intruso);
    // 404 y no 403: no se revela ni siquiera que el proyecto existe.
    expect((await leer(intruso, `/projects/${pid}`)).status,
      'un proyecto ajeno responde 404, no 403').toBe(404);
    const lista = await leer(intruso, '/projects');
    expect(lista.cuerpo, 'no debe aparecer en su listado')
      .not.toContain('Proyecto IDOR');
    await intrusoCtx.close();
  });

  test('sin acceso: tampoco canciones, sugerencias ni auditoría',
    async ({browser}) => {
      const {ctx: duenoCtx, page: dueno} =
        await abrirComo(browser, CORREOS.dueno);
      const pid = await crearProyecto(dueno, unico('Proyecto IDOR Songs'));
      const cancion = await escribir(dueno, 'POST', `/projects/${pid}/songs`,
        {name: 'Cancion E2E'});
      expect(cancion.status).toBe(200);
      const sid = (cancion.cuerpo as {id: number}).id;
      await duenoCtx.close();

      const {ctx: intrusoCtx, page: intruso} =
        await abrirComo(browser, CORREOS.intruso);
      for (const [nombre, ruta] of [
        ['canciones', `/projects/${pid}/songs`],
        ['auditoria', `/projects/${pid}/audit-log`],
        ['sugerencias', `/songs/${sid}/suggestions`],
      ] as const) {
        // Puede ser 404 (recurso oculto) o 403 (visible pero no permitido).
        // Lo que NO puede ser es 200 devolviendo datos ajenos.
        expect((await leer(intruso, ruta)).status,
          `${nombre} de otro proyecto no puede devolver 200`).not.toBe(200);
      }
      await intrusoCtx.close();
    });

  test('sin acceso: no puede escribir ni borrar del proyecto ajeno',
    async ({browser}) => {
      const {ctx: duenoCtx, page: dueno} =
        await abrirComo(browser, CORREOS.dueno);
      const pid = await crearProyecto(dueno, unico('Proyecto IDOR Escritura'));
      await duenoCtx.close();

      const {ctx: intrusoCtx, page: intruso} =
        await abrirComo(browser, CORREOS.intruso);
      const parche = await escribir(intruso, 'PATCH', `/projects/${pid}`,
        {name: 'Intrusion'});
      expect(parche.status, 'no debe poder renombrar').not.toBe(200);
      const borrado = await escribir(intruso, 'DELETE', `/projects/${pid}`);
      expect(borrado.status, 'no debe poder borrar').not.toBe(200);
      await intrusoCtx.close();
    });
});
