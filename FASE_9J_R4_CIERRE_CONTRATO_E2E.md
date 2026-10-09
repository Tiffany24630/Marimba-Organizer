# FASE 9J-R4 — Alineación del contrato 429 y aislamiento E2E

## Resultado

**PARCIALMENTE COMPLETADA — 9J Y REGRESIONES PÚBLICAS VERDES; FULL E2E BLOQUEADA POR WCAG.**

El contrato 429 quedó alineado con el comportamiento real de la aplicación y el
estado del limiter quedó aislado entre escenarios E2E sin desactivar el límite.
La verificación específica de 9J y las regresiones 9E/9G/9I pasan. La suite
completa terminó con 95/96 porque el análisis axe del panel principal excedió
60 segundos, tanto en la suite como en repetición aislada.

## 1. Auditoría del contrato 429

La vista pública tiene tres estados distintos:

- Composición cargada: muestra la composición y el banner `Solo lectura`.
- Error 404: muestra `Este enlace no funciona` sin datos de la composición.
- Error 429: muestra `Demasiadas solicitudes` y el mensaje de reintento.

`Solo lectura` se genera únicamente dentro de la rama que recibe `datos` de una
composición válida. La rama 429 retorna antes de que exista una composición
cargada, por lo que no forma parte del contrato obligatorio del error 429.

El fallo R3 del test era una expectativa incorrecta: exigía `Solo lectura`
antes de comprobar condicionalmente el aviso 429. No se añadió texto artificial
al frontend ni se modificó `PublicComposition.tsx`.

El test 9J ahora:

- crea su propio enlace;
- consume explícitamente las 10 respuestas permitidas;
- verifica la navegación al estado 429;
- verifica `Demasiadas solicitudes` y el mensaje de reintento;
- verifica que no se muestra el nombre de la composición;
- ejecuta axe sobre `.pub-error`.

El primer escenario conserva la comprobación de `Retry-After` y del límite
real.

## 2. Aislamiento del limiter E2E

El backend mantiene el limiter existente: ventana deslizante en memoria,
10 solicitudes por 60 segundos en E2E y clave por IP. No se desactivó, no se
subió el límite y no se añadió ningún bypass HTTP.

Se añadió `aislarRateLimitE2E()` en el helper de Playwright. Los specs 9E, 9G,
9I y 9J lo registran como `afterEach`: al terminar cada escenario ejecuta
únicamente:

```text
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml restart backend
```

Después espera `/api/health`. Esto limpia exclusivamente el estado efímero del
proceso backend entre escenarios, mantiene la base de datos y los volúmenes,
y conserva la posibilidad de probar 10 solicitudes → siguiente solicitud →
429 dentro de cada escenario.

No se creó endpoint público de reset, no se modificó la arquitectura Docker y
no se utilizan esperas de 60 segundos.

## 3. Cambios realizados

Solo se modificaron los specs/helper E2E necesarios:

- `frontend/e2e/specs/helpers.ts`
- `frontend/e2e/specs/publico9e.spec.ts`
- `frontend/e2e/specs/caducidad9g.spec.ts`
- `frontend/e2e/specs/enlaces-publicos9i.spec.ts`
- `frontend/e2e/specs/rate-limit9j.spec.ts`

No se modificaron `docker-compose.e2e.yml`, `docker-compose.yml`,
`docker-compose.7f.yml`, `PublicComposition.tsx`, el backend del limiter ni las
funcionalidades de producción.

## 4. Resultados

| Verificación | Resultado |
|---|---:|
| `tests/test_rate_limit_9j.py` | **12 passed** |
| `npm test` | **224 passed** |
| `npx tsc --noEmit` | **OK** |
| `npm run build` | **OK** |
| `rate-limit9j.spec.ts` | **2 passed** |
| `publico9e.spec.ts` | **4 passed** |
| `caducidad9g.spec.ts` | **4 passed** |
| `enlaces-publicos9i.spec.ts` | **4 passed** |
| Full E2E | **95 passed, 1 failed de 96** |

9J y las regresiones públicas alcanzaron los objetivos. El fallo restante de
full E2E fue:

```text
wcag.spec.ts — panel principal de proyectos
axe.analyze() — timeout de 60 s
```

Se repitió `npx playwright test e2e/specs/wcag.spec.ts` de forma aislada y
reprodujo el mismo resultado: 4 passed, 1 fallo en el panel principal. Las
otras vistas axe del spec reportaron 0 infracciones. Este fallo no toca el
contrato 429 ni el aislamiento del limiter y no se modificó WCAG para ocultarlo.

El axe específico del estado 429 pasó sin violaciones.

## 5. Infraestructura y seguridad

- El entorno `marimba7f` permaneció operativo con db, backend, frontend y
  Mailpit.
- No se modificó ningún compose.
- No se eliminaron volúmenes ni bases de datos.
- No se ejecutó `down -v`, `docker system prune` ni `docker volume prune`.
- Solo se reinició el backend E2E entre escenarios; no se tocó el volumen de
  PostgreSQL.
- Producción permaneció intacta.
- No se registraron tokens ni secretos.
- No se modificaron archivos protegidos.

## 6. Git

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- No hubo commit, push, merge, checkout, switch, reset, clean ni restore.
- El worktree ya contenía numerosos cambios y archivos no rastreados; se
  conservaron. R4 añade esta documentación y los cambios E2E indicados arriba.

## Bloqueo restante

La única condición no satisfecha para declarar el cierre definitivo según los
criterios de R4 es:

```text
Full E2E → 96/96
```

El bloqueo concreto es el timeout reproducible de `axe.analyze()` en el panel
principal de `wcag.spec.ts`, independiente de 9J. Por ello no se declara aún
`FASE 9J — COMPLETADA Y VERIFICADA E2E` a nivel de suite completa, aunque 9J,
9E, 9G y 9I sí quedaron verdes en sus ejecuciones específicas.
