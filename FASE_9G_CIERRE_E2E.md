# FASE 9G-R3 — Recuperación definitiva de infraestructura E2E y cierre de 9G

## Estado general

```text
9G — COMPLETADA
```

> **9G-R4 (ejecutada):** Docker Desktop se ha recuperado. El daemon responde, `marimba7f` está levantado con 4 servicios y `localhost:18080` responde HTTP 200. **No se ejecutó ninguna suite E2E** (límite de fase, paso 12). Ver sección 16 para el detalle de 9G-R4.

> **9G-R5 (ejecutada, 06/10/2026):** verificación E2E definitiva realizada. `caducidad9g` **4/4**, `publico9e` **4/4**, suite completa **90/90** (corrida de confirmación; corrida 1: 89/90 con 1 flake no determinista de `versiones9c` reproducido como verde en aislamiento), axe **0 infracciones**. Git y datos intactos. Ver sección 17. **Histórico `90/90 E2E`: etiquetado como histórico; la ejecución actual obtuvo exactamente 90/90 por separado.**

## 1. Estado general

La funcionalidad de caducidad opcional de enlaces públicos de composiciones (fase 9G) está implementada y las pruebas unitarias de backend (334 tests) y frontend (210 tests) están verdes. La verificación E2E no puede concluirse porque el entorno Docker de pruebas (`marimba7f`) no está emprendible.

## 2. Docker

- **CLI Docker Client:** Version 29.7.2 (disponible).
- **Docker Compose:** Version v5.4.0 (disponible).
- **Docker Daemon / Server:** **NO RESPONDE**.
  - Error reiterado en todas las llamadas:
    ```text
    failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
    ```
- **Servicio Windows Docker:** `SERVICE_NOT_FOUND` (no registrado ni iniciado).
- **Procesos:** `PROC_COMDOCKER_NOT_FOUND`, `PROC_DOCKER_NOT_FOUND`.
- **Pipe:** `PIPE_NOT_FOUND` (`\\\\.\\pipe\\dockerDesktopLinuxEngine`).
- **Contexto activo:** `desktop-linux` (marcado con `*`), pero el endpoint apunta a un daemon inexistente.
- **Conclusión:** Docker Desktop no está corriendo. La causa raíz es la **indisponibilidad del daemon/escáner de sockets de Windows**, no una mala configuración del compose.

## 3. marimba7f

- El entorno `marimba7f` **No puede levantarse** porque todos los comandos `docker compose -p marimba7f ...` fallan al intentar conectar con el daemon.
- **Comandos ejecutados y resultado:**
  ```bash
  docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml config
  ```
  → Falló: `failed to connect to the docker API ...`.
  ```bash
  docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml ps
  ```
  → Falló: `failed to connect to the docker API ...`.
  ```bash
  docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml up -d --build
  ```
  → **NO se ejecutó** (se resuelve "detener la investigación funcional" para `localhost:18080`).
- No se ejecutaron comandos de reciclaje destructivos (`docker compose down -v`, `docker system prune`, `docker volume prune`). No se modificaron volúmenes, bases de datos ni datos históricos.

## 4. localhost:18080

- **No responde.**
  - Estado de Docker: `ERR_CONNECTION_REFUSED` (el contenedor frontend no está levantado, por lo que el puerto 18080 no acepta conexiones).
  - Verificación de servicio:
    ```text
    SERVICE_NOT_FOUND
    PROC_COMDOCKER_NOT_FOUND
    PROC_DOCKER_NOT_FOUND
    PIPE_NOT_FOUND:\\\\.\\pipe\\dockerDesktopLinuxEngine
    ```
- **Acción tomada:** se detuvo la investigación funcional de acuerdo con la etapa #7 del rubricario: "Si continúa apareciendo ERR_CONNECTION_REFUSED, detener la investigación funcional". No se modificó React ni Playwright para ocultar el problema.

## 5. 9G E2E

- **No se ejecutó** (`npx playwright test frontend/e2e/specs/caducidad9g.spec.ts --reporter=list`).
- El comando no pudo correr porque `localhost:18080` no respondeía, imposibilitando que el frontend E2E esté disponible.
- **Registro con rigor:** la ejecución **NO se realizó** en esta fase. No se reporta "4 passed" ni ningún otro número como resultado.

## 6. 9E E2E

- **No se ejecutó** (`npx playwright test frontend/e2e/specs/publico9e.spec.ts --reporter=list`).
- Idéntica causa: `localhost:18080` inalcanzable.
- **Registro con rigor:** la ejecución **NO se realizó** en esta fase.

## 8. axe

- **No se pudo comprobar** porque los escenarios de axe solo se evalúan sobre páginas visibles en un navegador que apunta a `localhost:18080`, y ese puerto no responde.
- La deuda de lector de pantalla real permanece documentada y **no se reabrió** en esta fase.

## 9. Backend / Frontend / TypeScript / Build

- Estos no se repetieron. Solo se ejecutaron si fuera necesario (se hizo en la fase anterior y están verdes). **No hubo modificaciones de código**, por lo que no era necesario correr `python -m pytest -q`, `npm test`, `tsc` ni `build` de nuevo.
- El baseline actual es: backend 334 tests, frontend 210 tests, TS OK, build OK.

## 10. Git / HEAD

- **Branch:** `checkpoint/fase1-motor-d1-d3-d5`
- **HEAD:** `3253c2a92b21d8a88919116048b92815a04b1e50`
- **Commits:** 0 (no se hizo `git commit`, `push`, `merge`, `reset`, `clean` ni `restore`).
- **Cambios locales:** existen modificaciones en múltiples archivos (backend, frontend, compose). Lista parcial:
  - `backend/app/api/routes.py`, `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/models/models.py`
  - `backend/app/services/suggestions/optimizer.py`
  - `backend/tests/conftest.py`, `backend/tests/test_distribution.py`, `backend/tests/test_suggestions.py`, `backend/tests/test_unified_core.py`
  - `docker-compose.yml`, `frontend/Dockerfile`, `frontend/package-lock.json`, `frontend/package.json`
  - `frontend/src/App.tsx`, `frontend/src/components/*.tsx`, `frontend/src/lib/api.ts`, `frontend/src/pages/*.tsx`, etc.
  - Nuevos: `.env.example`, `docker-compose.7f.yml`, `docker-compose.e2e.yml`, `fasce/` y archivos de pruebas E2E.
- **Archivos protegidos:**
  - `backend/app/services/suggestions/optimizer.py`: **TIENE cambios locales** (revertido y aplicado de nuevo). Se mantiene intacto tras la verificación de este informe (diferencia registrada).
  - `backend/tests/test_unified_core.py`: **TIENE cambios locales** (diferencia registrada).
  - `backend/app/cli.py`: **SIN cambios locales** (diferencia vacía).

## 11. Archivos modificados

Listado parcial del estado `git status --short` (los archivos protegidos no se modificaron en este informe; sus cambios locales previos se conservan intactos).

- `backend/app/api/routes.py`
- `backend/app/core/config.py`
- `backend/app/main.py`
- `backend/app/models/models.py`
- `backend/app/services/suggestions/optimizer.py`
- `backend/tests/conftest.py`
- `backend/tests/test_distribution.py`
- `backend/tests/test_suggestions.py`
- `backend/tests/test_unified_core.py`
- `docker-compose.yml`
- `frontend/Dockerfile`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/src/App.tsx`
- `frontend/src/components/CanvasEditor.tsx`
- `frontend/src/components/ConfirmModal.tsx`
- `frontend/src/components/ImportPanel.tsx`
- `frontend/src/components/Inspector.tsx`
- `frontend/src/components/MarimbaPanel.tsx`
- `frontend/src/components/PersonPanel.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/layout.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Project.tsx`
- `frontend/src/store/composition.ts`
- `frontend/src/styles.css`
- `frontend/src/types/index.ts`
- Nuevos: `.env.example`, `FASE_7C_DECISION.md`, `FASE_7E_INTEGRATION.md`, …`FASE_7Z_INTEGRATION.md`, `FASE_8A_INTEGRATION.md`, …`FASE_8G_CIERRE.md`, `FASE_9A_BACKEND_INTEGRATION.md`, `FASE_9B_PRODUCT_INVENTORY.md`, `FASE_9C_VERSION_HISTORY.md`, `FASE_9D_REHEARSAL_PRINT.md`, `FASE_9E_PUBLIC_LINK.md`, `FASE_9F_AUDITORIA_POST_9E.md`, `FASE_9G_CIERRE_E2E.md`, `FASE_9G_PUBLIC_LINK_EXPIRATION.md`
- Nuevos: `backend/app/api/auth_routes.py`, `backend/app/api/collab_routes.py`, `backend/app/api/deps.py`, `backend/app/api/public_routes.py`, `backend/app/cli.py`, `backend/app/core/security.py`, `backend/app/services/mailer.py`, `backend/tests/*.py`
- Nuevos: `docker-compose.7f.yml`, `docker-compose.e2e.yml`, `frontend/e2e/`, `frontend/nginx.conf`, `frontend/playwright.config.ts`, `frontend/src/components/*.tsx`, `frontend/src/lib/*.ts`, `frontend/src/pages/*.tsx`, `frontend/src/components/*.tsx`, `frontend/tests/*.test.cjs`, `pruebas/`

## 12. Datos y protecciones

- **Volúmenes:** no eliminados.
- **Bases de datos:** no borradas.
- **Datos históricos reales:** no tocados.
- **Migraciones sobre producción:** no ejecutadas.
- **Acceso a producción:** no realizado.
- **Archivos protegidos:** `optimizer.py` y `test_unified_core.py` mantienen sus cambios locales (se registraron; no se aplicaron cambios en esta fase); `cli.py` no tiene cambios locales.
- **Modificaciones evitadas según protocolo:** `git reset`, `git clean`, `git restore`, `docker compose down -v`, `docker system prune`, `docker volume prune` → **no ejecutados**.
## 13. Diferencia entre resultados históricos y resultados ejecutados ahora

```text
Histórico:
90/90 E2E
```

(este resultado corresponde a una ejecución anterior, fuera de esta fase; no se está presentando como actual).

```text
Ejecución actual (9G-R3):
0/0 — NO SE EJECUTÓ
```



## 15. Recomendación de la siguiente fase

> **Histórico 9H:** párrafo redactado en el estado 9G-R3; superado por
> 9G-R4/R5 (§16–§17): la infraestructura se recuperó y la fase cerró en
> `COMPLETADA`.

Hasta que no se resuelva el bloqueo de la infraestructura (punto 1 de "Pendientes reales"), la siguiente fase **no puede autorizarse**. La fase inmediata es de recuperación/infraestructura E2E. Solo cuando `localhost:18080` responda y las pruebas `caducidad9g` y `publico9e` pasen, esta fase podrá cerrarse en `COMPLETADA` y poder a proponer la siguiente fase funcional, basada en el inventario 9B con las fases 9C–9G ya cerradas.

---

## Historial

```text
90/90 E2E
```

(corresponde a una ejecución histórica previa, fuera de esta fase). No se presentan como resultado actual de esta fase.

## Ejecución de 9G-R3

```text
0/0 — NO SE EJECUTÓ
```

La verificación E2E de 9G no se pudo ejecutar porque el daemon de Docker no responde. El entorno `marimba7f` permanece bloqueado. Se mantiene `9G — PENDIENTE DE INFRAESTRUCTURA E2E`.

## 14. Pendientes reales

> **Actualización 9G-R4:** los puntos **1–4** de esta lista se completaron en la fase 9G-R4 (Docker Desktop recuperado, contexto `desktop-linux` confirmado, `marimba7f` levantado, `localhost:18080` responde HTTP 200). Los puntos **5–8** (ejecución de las suites E2E) **siguen pendientes** y no se ejecutaron en 9G-R4 por respeto al límite de fase.

1. **Reiniciar Docker Desktop / Docker daemon** para que el socket `npipe:////./pipe/dockerDesktopLinuxEngine` exista y responda.
2. **Confirmar** que el contexto `desktop-linux` apunta al daemon corriendo y que `docker context use desktop-linux` sigue siendo el activo.
3. **Subir el entorno `marimba7f`** con:
   ```bash
   docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml up -d --build
   ```
4. **Verificar** `curl http://localhost:18080/` responde (CONTENT, no `ERR_CONNECTION_REFUSED`).
5. **Ejecutar** `npx playwright test frontend/e2e/specs/caducidad9g.spec.ts --reporter=list` (esperado `4 passed`).
6. **Ejecutar** `npx playwright test frontend/e2e/specs/publico9e.spec.ts --reporter=list`.
7. **Ejecutar** `npx playwright test --reporter=list` (suite completa; registrar total, passed, failed, skipped, retries, duración, errores).
8. **Confirmar** axe mantenido en 0 en las vistas comprobadas.


## 16. Ejecución de 9G-R4 — Recuperación de Docker Desktop

**Fecha:** 06/10/2026. **Objetivo:** recuperar el daemon de Docker Desktop sin tocar código de producto.

### Diagnóstico inicial

| Verificación | Resultado |
|---|---|
| Docker Desktop instalado (`C:\Program Files\Docker\Docker\Docker Desktop.exe`) | **SÍ** (`Test-Path` → `True`) |
| Proceso `Docker Desktop` | NO ejecutándose |
| Proceso `com.docker.backend` | NO ejecutándose |
| Servicio `com.docker.service` | Instalado pero **Stopped** |
| Pipe `\\.\pipe\dockerDesktopLinuxEngine` | **NO existe** (`False`) |
| `docker version` Server | **NO RESPONDE** (`PIPE_NOT_FOUND`) |
| Contexto | `desktop-linux` (correcto, pero apuntaba a daemon caído) |
| `docker compose ... config` | RC 0 (válido: proyecto `marimba7f`) |

### Acciones ejecutadas (no destructivas)

1. **Inicio normal de Docker Desktop** vía `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` (acción permitida por el paso 5 del protocolo).
2. Espera de inicialización; verificación post-inicio.

### Resultado post-inicio

| Verificación | Resultado |
|---|---|
| Proceso `Docker Desktop` | **SÍ** (PID 13576) |
| Proceso `com.docker.backend` | **SÍ** (PID 22588) |
| Pipe `dockerDesktopLinuxEngine` | **SÍ** (`True`) |
| `docker version` Client | 29.7.2 (OK) |
| `docker version` Server | **29.7.2 / Docker Desktop 4.88.1 (OK)** |
| `docker info` | `Context: desktop-linux`, `Server Version: 29.7.2` (sin errores) |
| `docker context show` | `desktop-linux` |

### Levantamiento de `marimba7f`

- `docker compose ... config` → RC 0, `name: marimba7f` (válido, sin errores).
- `docker compose ... up -d --build` → imágenes `marimba7f-frontend` y `marimba7f-backend` construidas (capas CACHED donde fue posible).
- `docker compose ... up -d` → los 4 contenedores en ejecución:

| Servicio | Estado | Puertos |
|---|---|---|
| `backend` | Up | `18000→8000` |
| `db` (postgres:16) | Up (healthy) | `5432` |
| `frontend` (nginx) | Up | **`18080→80`** |
| `mailpit` | Up (healthy) | `18025`, `11025` |

### Verificación de `localhost:18080`

```text
HTTP/1.1 200 OK
Server: nginx/1.31.6
Content-Type: text/html
Content-Length: 543
```

→ **Responde con HTTP 200.** Ya no hay `ERR_CONNECTION_REFUSED`.

### Criterio de éxito

```text
INFRAESTRUCTURA E2E RECUPERADA
```

- Docker Server → **OK**
- `marimba7f` → **levantado** (4 servicios)
- `localhost:18080` → **responde** (HTTP 200)

### Límite respetado (paso 12)

**Se detuvo aquí.** No se ejecutó ninguna suite E2E (`caducidad9g`, `publico9e`, ni la suite completa). No se reporta ningún número de tests como resultado actual. El `90/90 E2E` sigue siendo **histórico**.

### Verificación Git final

- **Rama:** `checkpoint/fase1-motor-d1-d3-d5` (sin cambios).
- **HEAD:** `3253c2a92b21d8a88919116048b92815a04b1e50` (sin commits nuevos).
- **Archivos protegidos:** `test_unified_core.py` y `cli.py` sin cambios locales; `optimizer.py` conserva su modificación local preexistente (7 líneas, anterior a esta fase). **No se modificó ningún archivo de producto en 9G-R4.**
- **Comandos destructivos:** `git reset/clean/restore`, `docker compose down -v`, `docker system prune`, `docker volume prune` → **no ejecutados.**


## 17. Ejecución de 9G-R5 — Verificación E2E definitiva

**Fecha:** 06/10/2026. **Objetivo:** verificar en el entorno recuperado en 9G-R4 los E2E de 9G, 9E y la suite completa, más los checks de axe, sin modificar código de producto.

### 17.1 Comprobación previa de infraestructura

| Verificación | Resultado |
|---|---|
| `docker version` Client | **29.7.2**, contexto `desktop-linux` |
| `docker version` Server | **29.7.2 / Docker Desktop 4.88.1 (237512)** |
| `docker info` | `Context: desktop-linux`, `Server Version: 29.7.2` (sin errores) |
| `docker compose -p marimba7f ... ps` | **4/4 Up:** `backend` (18000→8000), `db` postgres:16 (healthy), `frontend` (18080→80), `mailpit` (healthy, 18025/11025) |
| `curl -I http://localhost:18080/` | **HTTP/1.1 200 OK** |

Sin reinicios ni reconstrucciones: el entorno seguía funcionando desde 9G-R4.

### 17.2 Ejecución de `caducidad9g.spec.ts` (§4)

Comando (desde `frontend/`, convención de 9E): `npx playwright test caducidad9g --reporter=list`

```text
Running 4 tests using 1 worker
✓ sin expiracion: la pagina publica funciona (9E intacto) (1.3s)
✓ expiracion futura: la pagina publica funciona (1.8s)      [incluye aserción axe = 0]
✓ expiracion alcanzada: 404 sin contenido (3.6s)
✓ revocacion sigue funcionando con caducidad de por medio (1.5s)

4 passed (8.9s)
```

- Tests encontrados: **4** · passed: **4** · failed: **0** · skipped: **0** · retries: **0** (config `retries: 0`) · flaky: **0** · duración: **8.9 s** · errores: **ninguno**.
- Los 4 escenarios verifican el contrato de 9G: enlace sin caducidad, caducidad futura, expiración efectiva (404 + página «Este enlace no funciona») y revocación con creación de enlace nuevo.
- **Tests no modificados.**

### 17.3 Ejecución de `publico9e.spec.ts` (§5)

`npx playwright test publico9e --reporter=list`

```text
Running 4 tests using 1 worker
✓ el propietario crea el enlace y alguien sin sesion lo consulta (2.8s)
✓ un token inexistente responde con el mismo mensaje uniforme (208ms)
✓ revocar deja la URL antigua inutil y permite crear otra nueva (2.6s)
✓ editor y lector no ven el panel y el backend les devuelve 404 (3.1s)

4 passed (9.4s)
```

- passed: **4** · failed: **0** · skipped: **0** · flaky: **0** · duración: **9.4 s** · errores: **ninguno**.

### 17.4 Suite completa (§6)

`npx playwright test --reporter=list` (desde `frontend/`).

**Corrida 1 (completa):**

```text
Total: 90 · passed: 89 · failed: 1 · skipped: 0 · retries: 0 · flaky: 1
Duración: 3.3 min
Fallo: versiones9c.spec.ts:82 «la interfaz muestra el historial y anuncia el resultado» (11.2s)
Error: Protocol error (Page.handleJavaScriptDialog): Not attached to an active page
       page.goto: net::ERR_ABORTED; maybe frame was detached? (helpers.ts:33, en `entrar`)
```

*(Nota de rigor: existió además un intento previo abortado por el operador al consultar el progreso — se interrumpió en el test 11 y **no se cuenta como resultado**.)*

**Clasificación del fallo (§9/§10):** el error es de **página/diálogo desconectado** (contexto de navegador), no de lógica de negocio ni de infraestructura Docker/HTTP (stack verificado sano). Spec de 9C, sin relación funcional con 9G, y **esta fase no modificó código**. Se repitió **solo** el spec afectado:

```text
npx playwright test versiones9c --reporter=list
2 passed (5.0s)   ← incluye el test que falló (2.3s)
```

→ **Flake no determinista confirmado.** No es regresión.

**Corrida 2 (de confirmación):**

```text
Running 90 tests using 1 worker
...
90 passed (3.8m)
```

- Total: **90** · passed: **90** · failed: **0** · skipped: **0** · retries: **0** · flaky: **0** · duración: **3.8 min** · errores: **ninguno**.

```text
Histórico: 90/90
Ejecución actual: 90/90 (corrida de confirmación)
  — corrida 1: 89/90 con 1 flake no determinista (versiones9c), verde en re-ejecución aislada
```

### 17.5 axe (§7)

Dentro de la suite corrida 2 (con aserción axe también en `caducidad9g` escenario 2):

```text
[axe] inicio de sesion: 0 infracciones
[axe] recuperacion: 0 infracciones
[axe] panel de proyectos: 0 infracciones
[axe] vista de proyecto: 0 infracciones
[axe] editor de composicion: 0 infracciones
```

**axe actual: 0 infracciones** (5 vistas de `wcag.spec.ts` + aserción en `caducidad9g`). Categorías separadas: Playwright/E2E ✅ · axe ✅ · UIA (no aplica en esta fase) · lector de pantalla real (deuda histórica, **no reabierta**).

### 17.6 Unitarios (§11)

**No se modificó ningún archivo de producto**, por lo que no se repitieron `pytest`/`npm test`/`tsc`/build. Baseline vigente:

```text
Backend: 334 · Frontend: 210 · TypeScript: OK · Build: OK
```

### 17.7 Git y datos (§12/§13)

- **Rama:** `checkpoint/fase1-motor-d1-d3-d5` (sin cambios).
- **HEAD:** `3253c2a92b21d8a88919116048b92815a04b1e50` (sin commits nuevos).
- **`git status --short`:** idéntico al snapshot previo (`gs_final.txt`) salvo temporales de evidencia de esta fase (`e2e_9g_out.txt`, `e2e_9e_out.txt`, `e2e_9c_out.txt`, `e2e_full_out.txt`, `e2e_full2_out.txt`, `git_status_9gr5.txt`). **Ningún archivo de producto alterado.**
- **Protegidos:** `optimizer.py` conserva su diff preexistente (7 líneas, cambio D5 con `same_position`); `test_unified_core.py` conserva su diff preexistente (214+/2−, presente en el snapshot previo); `cli.py` intacto (sin tocar).
- **Datos:** solo entorno E2E `marimba7f`; no se ejecutó `down -v`, `volume prune` ni `system prune`; `db_data` no eliminado; sin datos de producción.
- **Comandos destructivos:** `git reset/clean/restore`, commits, push, merge, cambio de rama → **no ejecutados.**

### 17.8 Criterio de cierre (§15)

| Criterio | Estado |
|---|---|
| Infraestructura E2E recuperada | ✅ (9G-R4) |
| `caducidad9g.spec.ts` pasa | ✅ 4/4 |
| `publico9e.spec.ts` pasa | ✅ 4/4 |
| Suite E2E completa pasa | ✅ 90/90 (corrida de confirmación) |
| axe en 0 | ✅ 0 infracciones |
| Sin regresiones | ✅ (1 flake no determinista, no reproducido) |
| Git intacto | ✅ |
| Datos intactos | ✅ |

```text
9G-R1 → cerrada
9G-R2 → cerrada
9G-R3 → cerrada como pendiente de infraestructura
9G-R4 → cerrada como infraestructura recuperada
9G-R5 → COMPLETADA
9G → COMPLETADA
```

**No se avanzó a ninguna nueva funcionalidad (§18).** La siguiente fase prioritaria se determinará a partir del inventario de 9B y de las fases 9C–9G tras confirmar este cierre.
