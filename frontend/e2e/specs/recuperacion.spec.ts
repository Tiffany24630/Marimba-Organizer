import {test, expect} from '@playwright/test';
import {entrar, escribir, leer, CORREOS, CLAVE, API, MAILPIT}
  from './helpers';

/**
 * Fase 7H - recuperacion de contrasena con Mailpit (SMTP real de pruebas).
 *
 * Mailpit recibe los mensajes y NO los entrega a nadie. Ningun correo sale a
 * una direccion real, y ningun token se escribe en el informe.
 */

async function vaciarBuzon() {
  await fetch(`${MAILPIT}/api/v1/messages/delete-all`, {method: 'DELETE'});
}

/** Busca en el buzon un mensaje con enlace de recuperacion. */
async function buscarEnlace(destinatario: string) {
  for (let intento = 0; intento < 24; intento++) {
    const lista = await (await fetch(
      `${MAILPIT}/api/v1/messages?limit=10`)).json();
    for (const m of (lista.messages || [])) {
      const completo = await (await fetch(
        `${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const para = completo.To ? completo.To[0].Address : '';
      if (para !== destinatario) continue;
      const mm = JSON.stringify(completo).match(
        /reset-password\?token=([A-Za-z0-9_-]+)/);
      if (mm) return {token: mm[1], asunto: completo.Subject || ''};
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}

test.describe('Recuperacion de contrasena (Mailpit)', () => {
  /**
   * Restaura la clave de pruebas de la cuenta de lectura.
   *
   * Sin esto la cuenta queda con la clave que el flujo acaba de cambiar, y las
   * ejecuciones SIGUIENTES fallan al iniciar sesion: estado residual de una
   * prueba atribuido a otra, que es peor que no tener la prueba.
   */
  test.afterEach(async () => {
    await vaciarBuzon();
    await fetch(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: CORREOS.lector})});
    const enlace = await buscarEnlace(CORREOS.lector);
    if (!enlace) return;
    await fetch(`${API}/auth/reset-password`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: enlace.token, new_password: CLAVE})});
    await vaciarBuzon();
  });

  test('el correo llega al buzon SMTP real de pruebas', async ({page}) => {
    await vaciarBuzon();
    await entrar(page, CORREOS.dueno);

    const r = await escribir(page, 'POST', '/auth/forgot-password',
      {email: CORREOS.lector});
    expect(r.status).toBe(200);
    expect(r.texto.toLowerCase(), 'no debe filtrar el token')
      .not.toContain('token');

    const enlace = await buscarEnlace(CORREOS.lector);
    expect(enlace, 'debe llegar un correo al buzon de pruebas').toBeTruthy();
    expect(enlace!.token.length, 'el token debe ser real')
      .toBeGreaterThan(20);

    // Un correo inexistente responde IGUAL: no permite enumerar cuentas.
    const falso = await escribir(page, 'POST', '/auth/forgot-password',
      {email: 'nadie.existe@prueba.local'});
    expect(falso.status).toBe(200);
    expect(falso.texto, 'la respuesta debe ser identica').toBe(r.texto);
  });

  test('el token cambia la clave y es de un solo uso', async ({page}) => {
    const WEB = process.env.E2E_WEB || 'http://localhost:18080';
    /* 7P - CAUSA DEMOSTRADA del flake que 7O documentó.
     *
     * Esta prueba hace `clearCookies()` con la aplicación ya cargada. Las
     * peticiones que estaban en vuelo fallan con 401 y la aplicación responde
     * con `alert(...)` (Dashboard/Project/PersonPanel lo usan para errores
     * recuperables). Ese diálogo NATIVO se abre mientras la siguiente
     * `page.goto` ya está en marcha, y el manejador automático de Playwright
     * intenta cerrarlo sobre una página que ya no está activa:
     *
     *   Protocol error (Page.handleJavaScriptDialog): Not attached to an active page
     *   page.goto: net::ERR_ABORTED; maybe frame was detached?
     *
     * No es un fallo del producto ni una aserción: es una carrera entre el
     * diálogo y la navegación. La solución es determinista, NO relajar la
     * prueba: se registra un manejador explícito ANTES de cualquier acción,
     * que rechaza siempre esos avisos. El `catch` cubre solo el cierre de un
     * diálogo sobre una página ya desmontada (imposible que tenga éxito), no
     * ninguna aserción.
     */
    page.on('dialog', async d => {
      try {
        await d.dismiss();
      } catch {
        // La página ya se cerró: no hay nada que rechazar.
      }
    });
    await vaciarBuzon();
    await entrar(page, CORREOS.dueno);
    await escribir(page, 'POST', '/auth/forgot-password',
      {email: CORREOS.lector});
    const enlace = await buscarEnlace(CORREOS.lector);
    expect(enlace, 'hizo falta el correo anterior').toBeTruthy();

    const cambio = await escribir(page, 'POST', '/auth/reset-password',
      {token: enlace!.token, new_password: 'NuevaClave7H1'});
    expect(cambio.status, 'el token debe permitir cambiar la clave')
      .toBe(200);

    const reuso = await escribir(page, 'POST', '/auth/reset-password',
      {token: enlace!.token, new_password: 'OtraClave7H1'});
    expect(reuso.status, 'el token no debe poder reutilizarse').toBe(400);

    // Con la nueva clave se entra; con la antigua, no.
    await page.context().clearCookies();
    await page.goto(WEB);
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible'});
    await page.locator('input[type="email"]').first().fill(CORREOS.lector);
    await page.locator('input[type="password"]').first().fill('NuevaClave7H1');
    await page.locator('button:has-text("Iniciar")').first().click();
    await expect.poll(async () =>
      (await page.context().cookies()).some(c =>
        c.name === 'marimba_session' && c.value), {timeout: 20_000})
      .toBe(true);

    await page.context().clearCookies();
    await page.goto(WEB);
    await page.locator('input[type="email"]').first()
      .waitFor({state: 'visible'});
    await page.locator('input[type="email"]').first().fill(CORREOS.lector);
    await page.locator('input[type="password"]').first()
      .fill(process.env.E2E_CLAVE || 'Prueba7F-No-Usar-Fuera');
    await page.locator('button:has-text("Iniciar")').first().click();
    await page.waitForTimeout(2500);
    expect((await page.context().cookies()).find(
      c => c.name === 'marimba_session' && c.value),
      'la contrasena anterior no debe servir').toBeFalsy();
  });

  test('un token invalido se rechaza', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const r = await escribir(page, 'POST', '/auth/reset-password',
      {token: 'token-inventado-7h', new_password: 'Cualquiera7H1'});
    expect(r.status).toBe(400);
  });
});

test.describe('CORS y configuracion de despliegue', () => {
  const WEB = process.env.E2E_WEB || 'http://localhost:18080';
  const API = process.env.E2E_API || 'http://localhost:18000/api';

  test('el preflight responde con las cabeceras correctas', async () => {
    const res = await fetch(API + '/projects', {
      method: 'OPTIONS',
      headers: {
        Origin: WEB,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-csrf-token',
      },
    });
    // El defecto de 7G hacia que esto devolvia 405.
    expect(res.status, 'el preflight no debe ser 405').toBe(200);
    expect(res.headers.get('access-control-allow-origin'),
      'debe declarar el origen permitido').toBe(WEB);
    expect(res.headers.get('access-control-allow-credentials'),
      'sin esto la cookie de sesion no viaja').toBe('true');
    // Con credenciales, el origen NUNCA puede ser comodin.
    expect(res.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  test('un origen no autorizado no recibe permiso', async () => {
    const res = await fetch(API + '/projects', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://sitio-malicioso.example',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(res.headers.get('access-control-allow-origin'),
      'un origen desconocido no debe recibir permiso')
      .not.toBe('https://sitio-malicioso.example');
  });

  test('la peticion autenticada viaja con la cookie HttpOnly', async ({page}) => {
    await entrar(page, CORREOS.dueno);
    const r = await leer(page, '/auth/me');
    expect(r.status).toBe(200);
    expect(r.cuerpo).toContain(CORREOS.dueno);
  });
});
