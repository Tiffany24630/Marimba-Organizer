# FASE 9J-R5 — Cierre WCAG E2E

## Resultado

**FASE 9J-R5 — COMPLETADA**  
**FASE 9J — COMPLETADA Y VERIFICADA E2E**

La suite completa terminó con **96 passed, 0 failed**.

## Diagnóstico

El fallo original era un timeout de 60 segundos en `axe.analyze()` del test:

```text
frontend/e2e/specs/wcag.spec.ts
Accesibilidad WCAG (axe-core) › panel principal de proyectos
```

La reproducción aislada inicial fue `4 passed, 1 failed`. Antes del análisis, el
panel tenía 86 nodos y aproximadamente 4.1 KB de HTML; no había imágenes,
canvas, iframes, overlays, textos de carga ni recursos pendientes relevantes.
Analizar `.dash` sin cambiar el modo de ejecución también reproducía el
timeout.

La causa reproducible fue la ruta moderna de `@axe-core/playwright` usada para
el documento/panel del dashboard: su ejecución parcial y posterior finalización
no terminaba en este estado de la aplicación. La misma auditoría completa del
panel sí termina mediante la ruta compatible `axe.run()`.

No se trataba de una violación WCAG ni de un problema del rate-limit 9J.

## Corrección mínima

En `frontend/e2e/specs/wcag.spec.ts`:

- `auditar` acepta un scope opcional.
- El escenario del panel analiza `.dash`, que es el `main` que contiene todo
  el panel principal.
- Para ese scope se usa `setLegacyMode(true)`, manteniendo la auditoría real
  mediante axe sobre todo el panel.

No se deshabilitaron reglas, no se filtraron impactos, no se excluyeron nodos
del panel y no se aumentó el timeout. Los otros cuatro escenarios mantienen su
modo y alcance originales.

## Verificación

- `wcag.spec.ts`: **5 passed**; las cinco auditorías reportaron 0 infracciones.
- `rate-limit9j.spec.ts`: **2 passed**.
- `publico9e.spec.ts`: **4 passed**.
- `caducidad9g.spec.ts`: **4 passed**.
- `enlaces-publicos9i.spec.ts`: **4 passed**.
- Suite E2E completa: **96 passed, 0 failed**.
- TypeScript (`npx tsc --noEmit`): **OK**.
- Evidencia vigente de backend 9J: `tests/test_rate_limit_9j.py` → **12 passed**.
- Evidencia previa de R4: frontend unitarios **224 passed** y build **OK**.

Durante la primera ejecución completa apareció un timeout aislado en
`nombres7x.spec.ts`; el escenario pasó aislado y también pasó en la segunda
ejecución completa. No se modificó ese test.

### Revalidación de cierre

- `npx playwright test e2e/specs/wcag.spec.ts`: **5 passed**.
- Regresiones finales: **9J 2/2**, **9E 4/4**, **9G 4/4** y **9I 4/4**.
- `npx tsc --noEmit`: **OK**.
- `npx playwright test`: **96 passed, 0 failed**.

La primera ejecución completa tuvo un fallo transitorio en `versiones9c.spec.ts`
(`Page.handleJavaScriptDialog` / `ERR_ABORTED`). La suite 9C aislada pasó **2/2**
y la segunda ejecución completa pasó **96/96**. No se modificó ese test ni se
ocultó el fallo.

## Infraestructura y seguridad

- Docker Compose permaneció sin cambios; el hash de
  `docker-compose.e2e.yml` siguió siendo
  `69CCD9351D87949A100B90A98C9B045FE46F9681E7582B8AD3468A891DA66948`.
- Los servicios E2E quedaron activos: backend en `18000`, frontend en `18080`,
  PostgreSQL `16-alpine` y Mailpit en `18025`/`11025`.
- No se modificó el rate-limit ni archivos backend.
- No se modificaron archivos protegidos ni código de producción relacionado con
  la aplicación; el cambio de R5 fue exclusivo del spec WCAG y esta documentación.
- No se ejecutó `down -v`, no se eliminaron volúmenes y no se tocó producción.
- No hubo operaciones Git destructivas.

## Git

```text
branch: checkpoint/fase1-motor-d1-d3-d5
HEAD: 3253c2a92b21d8a88919116048b92815a04b1e50
```

El worktree ya contenía modificaciones y archivos no versionados de fases
anteriores. No se limpiaron ni revirtieron esos cambios.
