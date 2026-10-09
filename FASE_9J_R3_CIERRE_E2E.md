# FASE 9J-R3 — Recuperación de Docker Desktop y cierre E2E

## Resultado

**PARCIALMENTE COMPLETADA — RATE-LIMIT HTTP VERIFICADO; UI E2E 9J PENDIENTE.**

Docker Desktop fue recuperado y el entorno `marimba7f` quedó operativo. La
implementación backend responde correctamente al límite y conserva sus 12
pruebas específicas verdes, pero el spec 9J completo no alcanzó 2/2.

## Infraestructura Docker

Estado inicial:

- `docker version` mostraba solo Client.
- El contexto inicial era `default`.
- El daemon fallaba con `npipe:////./pipe/docker_engine` y
  `dockerDesktopLinuxEngine`.
- No había proceso Docker Desktop activo.

Se inició Docker Desktop con el comando oficial `docker desktop start`.
Después de la recuperación:

- Docker Desktop: `4.88.1`.
- Engine: `29.7.2`, servidor Linux disponible.
- Contexto activo: `desktop-linux`.
- Docker informa 16 CPU, 15.23 GiB y sistema Docker Desktop sobre WSL2.

## Compose

Se validaron nuevamente ambos comandos `config`:

```text
docker compose -f docker-compose.e2e.yml config
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml config
```

Ambos pasaron. La composición completa conserva `db`, `mailpit`, `backend` y
`frontend`, PostgreSQL 16, los puertos 18000/18080/18025/11025 y el argumento
`VITE_API_URL` ya validado en R2.

`docker-compose.e2e.yml` no fue modificado. Su SHA-256 final continúa siendo:

```text
69CCD9351D87949A100B90A98C9B045FE46F9681E7582B8AD3468A891DA66948
```

No se añadieron volúmenes y no se ejecutó `docker compose down -v`. El volumen
E2E existente se conservó.

## Runtime

Se ejecutó:

```text
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml up -d --build
```

Estado final: 4/4 servicios `Up`.

- `db`: `postgres:16-alpine`, `healthy`.
- `backend`: `18000 -> 8000`, `Up`.
- `frontend`: `18080 -> 80`, `Up`.
- `mailpit`: `healthy`, `18025 -> 8025` y `11025 -> 1025`.

Endpoints:

- `http://localhost:18000/api/health` → HTTP 200.
- `http://localhost:18080/` → HTTP 200.

Los logs del backend muestran arranque normal y no muestran nuevamente el
mensaje `MIGRATION_USER_PASSWORD no esta definida`. La variable está presente
en la configuración renderizada; no se documenta aquí su valor.

## Autenticación

La autenticación E2E funcionó: los escenarios que usan `entrar` completaron el
login y la cookie `marimba_session` estuvo disponible. No se modificó
`helpers.ts` ni se aumentaron timeouts.

## Resultados E2E

Resultados obtenidos realmente en R3:

| Ejecución | Resultado |
|---|---:|
| `rate-limit9j.spec.ts` | 1 passed, 1 failed |
| `publico9e.spec.ts` aislado, con backend recién reiniciado | 4 passed |
| `caducidad9g.spec.ts` aislado | 2 passed, 2 failed |
| `enlaces-publicos9i.spec.ts` aislado | 4 passed |
| Full E2E | 94 passed, 2 failed de 96 |
| `tests/test_rate_limit_9j.py` | 12 passed |

El primer test 9J pasó y verificó 200, 429 y `Retry-After`. El segundo llegó a
la vista `Demasiadas solicitudes`, pero falló porque el spec exige primero que
sea visible `Solo lectura`; la vista 429 actual retorna únicamente el mensaje
accesible de demasiadas solicitudes. No se modificó `PublicComposition.tsx` ni
el spec para acomodar el resultado.

En 9G, los fallos aislados recibieron 429 al comprobar respuestas esperadas
404, porque el límite E2E de 10 solicitudes por 60 segundos también cubre esas
consultas públicas. El full E2E tuvo los mismos dos efectos como los únicos
fallos: una comprobación 9G recibió la vista distinta de la esperada y el
segundo escenario 9J falló por la ausencia de `Solo lectura` en la vista 429.

La suite completa actual contiene 96 tests; la referencia histórica 90/90 no
se utilizó como resultado de esta ejecución.

## Seguridad y cambios

- No se accedió ni modificó producción.
- No se eliminaron volúmenes, bases de datos ni contenedores fuera de
  `marimba7f`.
- No se ejecutó `down -v`.
- No se modificó `docker-compose.e2e.yml`.
- No se modificaron `rate_limit.py`, `public_routes.py`, el frontend ni los
  archivos protegidos de la fase.
- No se hizo commit, push, merge, reset, clean, restore, checkout ni switch.
- Solo se reinició el contenedor `backend` E2E para limpiar el contador de
  rate-limit en memoria entre ejecuciones; no se tocó el volumen de PostgreSQL.

## Git

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- El worktree ya tenía numerosos cambios y archivos no rastreados antes de
  R3; se conservaron. R3 añade únicamente esta documentación entre los
  cambios intencionales del agente.

## Bloqueo restante

**9J — UI E2E del estado 429:** el contrato actual del spec exige `Solo lectura`
antes de validar el aviso `Demasiadas solicitudes`, pero la vista de rate-limit
retorna solo el estado de error. Además, el límite E2E de 10/60 interfiere con
algunas regresiones 9G que esperan 404 después de varias consultas públicas.

R3 no declara `9J — COMPLETADA Y VERIFICADA E2E` porque la condición obligatoria
`rate-limit9j.spec.ts → 2 passed` no se cumplió.
