import {defineConfig, devices} from '@playwright/test';

/**
 * Fase 7H - configuracion del runner E2E.
 *
 * Ajuste importante: `workers: 1` y `fullyParallel: false`.
 *
 * El diagnostico (`e2e/diagnostico.chromium.cjs`) demostro que Chromium NO es
 * inestable: ocho contextos consecutivos abren, usan y cierran sin problema. El
 * fallo que se atribuyo a Chromium en la fase 7G era un localizador erroneo
 * ("Iniciar sesion" no matcheaba `/entrar|acceder/i`) cuyo timeout de 30 s
 * parecia un cuelgue.
 *
 * Aun asi se serializa por una razon distinta y real: estas pruebas comparten
 * estado (mismo backend, mismos usuarios y un unico buzon SMTP de pruebas).
 * En paralelo, dos pruebas que limpian el buzon o que degradan el mismo rol se
 * pisarian. La ejecucion serial hace el resultado reproducible, que es lo que
 * importa en pruebas de integracion.
 */
const WEB = process.env.E2E_WEB || 'http://localhost:18080';

export default defineConfig({
  testDir: './e2e/specs',
  // Una sola prueba a la vez: comparten backend, usuarios y buzon SMTP.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: {timeout: 10_000},
  reporter: [
    ['list'],
    ['json', {outputFile: 'e2e/.resultados.json'}],
  ],
  use: {
    baseURL: WEB,
    // Evidencia cuando algo falla: es lo que permite diagnosticar sin
    // reproducir a mano.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // La sesion vive en cookie HttpOnly: no se toca nada mas.
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],
});
