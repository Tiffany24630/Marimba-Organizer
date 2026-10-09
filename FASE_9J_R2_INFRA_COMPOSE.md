# FASE 9J-R2 — Recuperación de `docker-compose.e2e.yml`

## Resultado

**COMPLETADA — COMPOSE RECUPERADO.** No se encontró corrupción real en
`docker-compose.e2e.yml`, por lo que no se modificó el archivo. El arranque de
Docker quedó bloqueado por la indisponibilidad del daemon de Docker Desktop.

## Diagnóstico

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD inicial y final: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- El archivo tiene 54 líneas, 2418 bytes y termina exactamente en:

  ```yaml
          VITE_API_URL: http://localhost:18000/api
  ```

- El final usa CRLF y salto de línea final; no hay caracteres posteriores,
  llaves `}`, corchetes `]` ni cierres artificiales.
- `docker-compose.e2e.yml` aparece como archivo no rastreado por Git; no existe
  un diff histórico del archivo ni una versión rastreada que reconstruir.
- El contenido coincide semánticamente con la documentación existente de Fase
  7G/9J: Mailpit, backend SMTP de pruebas, rate-limit 10/60 y frontend en
  `http://localhost:18000/api`.

## Validación Compose

Comandos ejecutados:

```text
docker compose -f docker-compose.e2e.yml config
docker compose -f docker-compose.e2e.yml config --services
```

Ambos terminaron correctamente. El override aislado contiene `mailpit`,
`backend` y `frontend`.

También se validó la composición completa:

```text
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml config
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml config --services
```

Resultado: configuración válida, proyecto `marimba7f`, servicios `db`,
`mailpit`, `backend` y `frontend`.

La configuración renderizada conserva:

- PostgreSQL `postgres:16-alpine`.
- Backend publicado en `18000:8000`.
- Frontend publicado en `18080:80`, con `VITE_API_URL` igual a
  `http://localhost:18000/api`.
- Mailpit en `18025:8025` y `11025:1025`.
- `depends_on`, imágenes/build contexts y healthcheck originales.
- El volumen existente `marimba7f_db_data`; no se añadió ningún volumen.
- `MIGRATION_USER_PASSWORD: e2e-test-password-9j-tmp`, heredada del compose
  base y visible en el render completo actual.

No hubo error de `docker compose config` que corregir. Por tanto, no se
añadieron líneas ni se alteró la semántica del entorno.

## Arranque y endpoints

Se intentó el comando solicitado:

```text
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml up -d --build
```

Falló antes de crear o modificar servicios porque Docker no pudo conectarse a:

```text
npipe:////./pipe/dockerDesktopLinuxEngine
The system cannot find the file specified.
```

Por la misma causa fallaron `ps` y `logs`. Los endpoints tampoco pudieron
comprobarse:

- `http://localhost:18000`: no se puede conectar.
- `http://localhost:18080`: no se puede conectar.

No se pudo confirmar el estado runtime de `MIGRATION_USER_PASSWORD` ni
repetir el E2E 9J en esta ejecución. El bloqueo actual es:

**INFRAESTRUCTURA E2E — Docker Desktop/daemon no disponible.**

El mensaje histórico `MIGRATION_USER_PASSWORD no esta definida` no se atribuye
a la reparación YAML: el render completo actual sí define esa variable.

## Seguridad, datos y Git

- No se ejecutó `docker compose down -v`.
- No se eliminaron volúmenes ni bases de datos.
- No se accedió ni modificó producción.
- No se hizo commit, push, merge, checkout, switch, reset, clean ni restore.
- El archivo creado es únicamente esta documentación; el compose no fue
  modificado.
- El worktree ya contenía numerosos cambios y archivos no rastreados previos;
  se conservaron intactos.

## Pendiente

Reactivar Docker Desktop/daemon y repetir `up -d --build`, `ps`, los endpoints
18000/18080, logs del backend y posteriormente
`npx playwright test e2e/specs/rate-limit9j.spec.ts`. No se declara 9J cerrada
por E2E porque en esta ejecución no fue posible iniciar el entorno.
