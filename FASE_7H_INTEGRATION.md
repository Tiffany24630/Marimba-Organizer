# FASE 7H — ESTABILIZACIÓN DE PLAYWRIGHT, E2E COMPLETO Y VALIDACIÓN FINAL

> Continúa `FASE_7F_INTEGRATION.md` y `FASE_7G_INTEGRATION.md`.
> No contiene credenciales, tokens ni secretos.

---

## 1. Estado de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` — **sin ningún commit en toda la fase** |
| Modificados | 20 al inicio → 22 al cierre |
| No rastreados | 31 al inicio → 38 al cierre |

El aumento corresponde a lo que 7H añadió (`FASE_7H_INTEGRATION.md`, `frontend/e2e/`,
`frontend/playwright.config.ts`, `pruebas/despliegue/restablecer_cuentas_7h.py`) más
los ficheros de fases anteriores que aún no se habían confirmado. **No hay ningún
cambio sin guardar perdido**: nada se descartó con `checkout`, `restore` ni `clean`.

Cambios protegidos, verificados con `git diff --stat`:

| Fichero | `git diff --stat` | ¿Tocado en 7H? |
| ------- | ---------------- | -------------- |
| `backend/app/services/suggestions/optimizer.py` | +7 | **NO** |
| `backend/tests/test_unified_core.py` | +216 | **NO** |
| `backend/app/main.py` | +206 | **NO** |
| `backend/app/api/routes.py` | +458 | **NO** |
| `backend/app/cli.py` | sin diferencias | **NO** |
| `FASE_7F_INTEGRATION.md` | sin diferencias | **NO** |
| `FASE_7G_INTEGRATION.md` | sin diferencias | **NO** |

Las cifras de `main.py` y `routes.py` son trabajo **acumulado de fases anteriores**
(7C–7G), que queda congelado. Lo que se afirma aquí es que **7H no los ha
modificado**: el diff es byte a byte el de antes de empezar.

---

## 2. Diagnóstico de la inestabilidad de Chromium

### Causa raíz: **no era Chromium**

En 7G se occasions atribuir el cierre del proceso Node a Chromium. **Era falso**;
el error era propio de las pruebas:

| Hallazgo | Detalle |
| -------- | ------- |
| **El localizador no coincidía** | El botón real dice **"Iniciar sesion"**. Las pruebas buscaban `/entrar\|acceder/i`. "Iniciar sesion" no contiene ninguna de esas dos palabras, así que el `click()` agotaba el timeout de 30 s. |
| **El timeout parecía un cuelgue** | 30 s por prueba × varias pruebas, sin salida intermedia, se Claudía como proceso colgado. |
| **Chromium es estable** | `e2e/diagnostico.chromium.cjs`: **8 contextos consecutivos** abren, usan y cierran sin problema; después 3 operaciones en un contexto y 4 pestañas. Todo estable. |

Diagnóstico conservado en `e2e/diagnostico.chromium.cjs`, que registra el último
punto alcanzado y el código de salida: justo el dato que faltaba en 7G.

### Defectos propios encontrados al migrar los tests

| Defecto | Corrección |
| ------- | ---------- |
| Dos usuarios en el mismo contexto compartían **cookies** | Cada rol usa `browser.newContext()` aislado (`abrirComo`) |
| `.toMatch(/40[34]/)` aplicado a un **número** | `expect([403,404]).toContain(status)` |
| La recuperación dejaba al lector **con otra clave**, rompiendo ejecuciones siguientes | `afterEach` restaura la clave + `pruebas/despliegue/restablecer_cuentas_7h.py` |
| El botón deshabilitado no es tabulable | La prueba recorre el flujo real de teclado (rellena y sigue) |

---

## 3. Solución aplicada

**Runner `@playwright/test`** como dependencia de desarrollo (`1.63.0`, misma
versión que `playwright`). Antes se usaba la librería a pelo con el runner de Node:
sin reporte por prueba, sin trazas y sin aislamiento de contextos.

`frontend/playwright.config.ts`:

| Ajuste | Valor | Por qué |
| ------ | ----- | ------- |
| `workers` | **1** | Las pruebas comparten backend, usuarios y un único buzón SMTP. En paralelo se pisarían. |
| `fullyParallel` | `false` | Complemento del anterior. |
| `retries` | **0** | Un reintento puede ocultar un defecto real. |
| `trace` | `retain-on-failure` | Reproducir sin repetir a mano. |
| `screenshot` | `only-on-failure` | Evidencia visual del fallo. |
| `timeout` / `actionTimeout` | 60 s / 15 s | Holgura sin esperar minutos en silencio. |
| `reporter` | `list` + `json` | Salida legible y resultado machine-readable. |

Comando: `npm run test:e2e`.

---

## 4. Configuración E2E

Entorno aislado `marimba7f` reutilizado: PostgreSQL 16, backend, frontend y
Mailpit. Puertos 18000/18080/18025/11025, sin conflicto con otros proyectos.

```
marimba7f-db-1         healthy
marimba7f-backend-1    Up
marimba7f-frontend-1   Up
marimba7f-mailpit-1    Up (healthy)
```

Credenciales de pruebas, creadas y restablecidas por script. Ningún correo sale a
una dirección real: Mailpit recibe y no entrega.

**Restablecimiento de cuentas:** `pruebas/despliegue/restablecer_cuentas_7h.py`
ejecuta `r7h.py` dentro del contenedor. Restaura las 4 cuentas de pruebas
(`despliegue7f-a/b/rec/d@prueba.local`) a una clave conocida, para que un E2E
interrumpido no contamine el siguiente. Es el límite de seguridad: **si una suite
se cae a mitad, hay que restablecer cuentas antes de relanzarla.**

---

## 4-bis. Ficheros de 7H

**Nuevos**

```
frontend/playwright.config.ts              runner, workers:1, trazas y reportes
frontend/e2e/specs/helpers.ts               login, CORREOS, BOTON_ENTRAR
frontend/e2e/specs/autenticacion.spec.ts    sesión, roles, revocación, IDOR
frontend/e2e/specs/recuperacion.spec.ts     Mailpit, token de un solo uso, CORS
frontend/e2e/specs/interfaz.spec.ts         responsive y accesibilidad
frontend/e2e/specs/exportacion.spec.ts      descarga PNG real
frontend/e2e/diagnostico.chromium.cjs       diagnóstico de estabilidad
pruebas/despliegue/restablecer_cuentas_7h.py
FASE_7H_INTEGRATION.md                      este informe
```

**Modificados:** `frontend/package.json` (scripts `test:e2e`, `test:e2e:report` y
`@playwright/test` en devDependencies) y `frontend/package-lock.json`.

**No modificados (fuera de alcance):** todo `backend/`, todo `frontend/src/` y los
datos de producción.

---

## 5. Autenticación — VERIFICADO EN NAVEGADOR

| Prueba | Resultado |
| ------ | --------- |
| Login válido: cookie `HttpOnly`, `SameSite=Lax`, valor real | ✅ |
| Token ausente de `localStorage`/`sessionStorage` | ✅ |
| Credenciales inválidas: sin sesión + mensaje de error visible | ✅ |
| Sesión sobrevive a recargar y a navegar | ✅ |
| Logout: 200 y rutas privadas rechazadas después | ✅ |

## 6. Roles — VERIFICADO EN NAVEGADOR

| Prueba | Resultado |
| ------ | --------- |
| **Owner**: renombra, persiste, comparte, ve auditoría con `PROJECT_CREATED` | ✅ |
| **Editor**: crea contenido | ✅ |
| **Editor** ve la lista de colaboradores | ✅ (por diseño: `readable_project`) |
| **Editor** NO añade, NO cambia rol, NO revoca | ✅ |
| **Editor** NO ve la auditoría, NO borra el proyecto | ✅ |
| **Reader** consulta proyecto y canciones | ✅ |
| **Reader** NO escribe; **el recurso queda idéntico antes y después** | ✅ |
| **Reader** NO crea canciones ni borra | ✅ |

## 7. IDOR y revocación — VERIFICADO EN NAVEGADOR

| Prueba | Resultado |
| ------ | --------- |
| Sin acceso: 404 y ausente del listado | ✅ |
| Sin acceso: canciones, sugerencias y auditoría no devuelven 200 | ✅ |
| Sin acceso: no puede escribir ni borrar del proyecto ajeno | ✅ |
| Revocación surte efecto **sin cerrar la sesión** | ✅ |
| Cambio de rol editor→reader pierde la escritura sin cerrar sesión | ✅ |

## 8. Recuperación con Mailpit — VERIFICADO EN NAVEGADOR

| Comprobación | Resultado |
| ------------ | --------- |
| El correo **llega al buzón SMTP real de pruebas** | ✅ |
| El mensaje no filtra el token | ✅ |
| Correo inexistente responde **idéntico** (no enumera cuentas) | ✅ |
| El token cambia la contraseña | ✅ |
| El token es **de un solo uso** | ✅ |
| Se entra con la nueva; la anterior deja de servir | ✅ |
| Token inventado rechazado | ✅ |

**Caducidad del token: NO VERIFICADO.** El entorno no permite acortar `RESET_TTL`
de forma segura sin tocar configuración compartida.

## 9. Exportación PNG — VERIFICADO EN NAVEGADOR

| Comprobación | Resultado |
| ------------ | --------- |
| Descarga **real** (evento `download`), no una llamada | ✅ |
| Archivo existe en disco y no está vacío | ✅ |
| Extensión `.png` y nombre con la composición | ✅ |
| **Firma binaria** `89 50 4E 47 0D 0A 1A 0A` | ✅ |
| Exportar **no altera** la composición persistida | ✅ |

**Exportación masiva: NO VERIFICADA** (requiere varias composiciones abiertas en
el editor; la individual sí queda probada de extremo a extremo).

## 10. Responsive — VERIFICADO EN NAVEGADOR

| Viewport | Resultado |
| -------- | --------- |
| Desktop 1280×800 | ✅ sin desbordamiento horizontal |
| Tablet 820×1180 | ✅ sin desbordamiento horizontal |
| Móvil 390×844 | ✅ sin desbordamiento horizontal |
| Teclado: botón de acceso alcanzable | ✅ |

## 11. Accesibilidad — VERIFICADO EN NAVEGADOR (parcial)

| Comprobación | Resultado |
| ------------ | --------- |
| Todos los botones tienen nombre accesible | ✅ |
| Los campos tienen etiqueta asociada | ✅ |
| El foco es visible al navegar con teclado | ✅ |
| El botón es alcanzable con el teclado | ✅ |

**Limitación declarada:** **no es una auditoría WCAG**. No se instaló `axe-core`;
se comprobaron de forma dirigida los puntos críticos. Contraste, modales y
estados de error de formularios quedan pendientes.

**Observación de diseño (no es un defecto):** con los campos vacíos, el botón
"Iniciar sesion" está `disabled` y un `<button disabled>` no recibe el foco. Es
comportamiento estándar de HTML y no impide operar: al rellenar, sí es alcanzable.

## 12. CORS y configuración — VERIFICADO EN NAVEGADOR

| Comprobación | Resultado |
| ------------ | --------- |
| Preflight responde 200 (**no 405**, defecto de 7G) | ✅ |
| `Access-Control-Allow-Origin` correcto | ✅ |
| `Access-Control-Allow-Credentials: true` | ✅ |
| El origen **nunca** es `*` con credenciales | ✅ |
| Origen no autorizado no recibe permiso | ✅ |
| Petición autenticada con cookie HttpOnly | ✅ |

`PUBLIC_BASE_URL`, `VITE_API_URL`, `SECURE_COOKIES` y `MAIL_PROVIDER` conservan
las correcciones de 7G. **HTTPS real y `Secure` en producción: NO VERIFICADO**
(no hay HTTPS en este entorno).

---

## 13. Regresión

| Suite | Comando | Resultado |
| ----- | ------- | --------- |
| Backend | `python -m pytest -q` | **260 passed**, 0 failed, 0 skipped (28.50 s) |
| Frontend | `npm test` | **67 passed**, 0 failed, 0 skipped |
| TypeScript | `npx tsc --noEmit` | **PASS** (incluye los `.ts` de E2E) |
| Build | `npm run build` | **PASS**, 192 módulos (3.01 s) |
| **E2E** | `npm run test:e2e` | **27 passed**, 0 failed, 0 skipped |

**Estabilidad comprobada con dos ejecuciones completas seguidas**, ambas en verde,
sobre el mismo entorno y sin tocar nada entre medias:

| Ronda | Resultado | Duración |
| ----- | --------- | -------: |
| 1.ª | 27 passed | 24.5 s |
| 2.ª | 27 passed | 28.7 s |

La segunda ronda importa: confirma que la 1.ª **no dejó estado residual**. Es
justo el defecto que en 7G hacía que un fallo de una prueba apareciera después en
otra distinta.

Las 260 de backend son las mismas de 7G: esta fase no toca código de aplicación,
solo infraestructura de pruebas.

## 14. Integridad de la base temporal

Sobre `marimba_7f_historico` (PostgreSQL 16.15 real):

| Entidad | Antes | Después | Huérfanos |
| ------- | ----: | ------: | --------- |
| Proyectos | 65 | 65 | 0 |
| Plantillas | 9 | 9 | — |
| Canciones | 65 | 65 | 0 |
| Personas | 65 | 65 | 0 |
| Composiciones | 65 | 65 | 0 |
| Asignaciones | 65 | 65 | 0 |

- Usuario histórico: `role='user'`, **0 administradores** creados.
- Idempotencia: 2ª y 3ª ejecución correctas, sin duplicados.
- JSON: 65/65 composiciones conservan `elements` y anotaciones.
- `_bak_projects_7c`: 65 filas.

**Estas cifras son TEMPORALES (datos de prueba sembrados). Las cifras de
PRODUCCIÓN (65 proyectos / 9 plantillas) NO se han verificado en esta fase.**

## 15. Producción

```
PRODUCCIÓN MODIFICADA:              NO
MIGRACIÓN PRODUCTIVA EJECUTADA:     NO
DATOS PRODUCTIVOS MODIFICADOS:      NO
USUARIOS CREADOS EN PRODUCCIÓN:     NO
```

No se conectó a producción. Todo sobre el proyecto Docker `marimba7f` y su
volumen `marimba7f_db_data`. No se ejecutó `down -v` ni se tocaron volúmenes
ajenos.

## 16. Limitaciones del entorno

| Limitación | Detalle |
| ---------- | ------- |
| HTTPS real | No hay TLS: `Secure` en producción no se puede validar |
| Auditoría WCAG | Sin `axe-core`; comprobación dirigida, no completa |
| Caducidad del token | El entorno no permite acortar `RESET_TTL` con seguridad |
| Exportación masiva | Requiere varias composiciones abiertas en el editor |
| Datos de producción | No accesibles para comprobación |

## 17. Pendientes

### Verificado
E2E completo (27/27) en navegador real, estable y con trazas.

### No verificado
Auditoría WCAG completa, HTTPS/`Secure` real, caducidad de token, exportación
masiva.

### PENDIENTE DE AUTORIZACIÓN
Migración productiva. Procedimiento sin cambios respecto a 7F/7G, con la
novedad de que ya existe CLI para el primer administrador:

1. Identificar inequívocamente la base de datos.
2. Comprobar los datos actuales (esperado: 65 proyectos, 9 plantillas).
3. Crear respaldo con `pg_dump`.
4. **Restaurarlo en otra base y comparar recuentos** (script de 7F).
5. Configurar `MIGRATION_USER_EMAIL` y `MIGRATION_USER_PASSWORD`.
6. Confirmar `PUBLIC_BASE_URL` real.
7. Obtener autorización explícita.
8. Aplicar la migración.
9. Verificar 65 proyectos, 65 propietarios y 9 plantillas.
10. Crear el primer administrador: `python -m app.cli create-admin`.
11. Ejecutar comprobaciones de seguridad y funcionamiento.

Rollback: la migración **no tiene `down`**; se restaura el respaldo completo,
con la pérdida de las escrituras posteriores al respaldo.
