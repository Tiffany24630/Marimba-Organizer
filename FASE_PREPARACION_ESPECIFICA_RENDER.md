# FASE — PREPARACIÓN ESPECÍFICA PARA RENDER SIN DESPLIEGUE

## 1. Estado

**FASE: COMPLETADA — RENDER PREPARADO CONCEPTUALMENTE; INFRAESTRUCTURA NO CREADA**

No se creó cuenta, workspace, proyecto, base PostgreSQL, Web Service, Static Site, dominio, DNS, webhook, secreto, tenant, administrador ni deployment.

## 2. Git

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- Upstream: `origin/checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `e0969172c2cbcc10a078d8faf2e12f9832a09eb5`.
- `main`: intacto.
- No se cambió de rama, no se hizo merge/rebase/reset/clean/restore y no se hizo push.
- Este documento permanece local y sin staging.

## 3. Documentación oficial de Render revisada

- [Web Services](https://render.com/docs/web-services): Docker, GitHub, `0.0.0.0`, `PORT`, TLS, dominios y health checks.
- [Docker en Render](https://render.com/docs/docker): construcción desde Dockerfile.
- [Health Checks](https://render.com/docs/health-checks): health check HTTP y respuestas 2xx/3xx.
- [Variables y secretos](https://render.com/docs/configure-environment-variables): variables, grupos y secretos fuera de Git.
- [Regiones](https://render.com/docs/regions): regiones disponibles y requisito de misma región para red privada.
- [Render Postgres](https://render.com/docs/postgresql): PostgreSQL administrado.
- [Backups de Render Postgres](https://render.com/docs/postgresql-backups): PITR y backups lógicos según plan.
- [TLS administrado](https://render.com/docs/tls): certificados y redirección HTTPS.
- [Blueprint specification](https://render.com/docs/blueprint-spec): referencias seguras de variables, revisada pero no implementada.

Render documenta que los Web Services deben escuchar en `0.0.0.0`; el puerto por defecto esperado es `10000` y puede configurarse mediante `PORT`. Los Static Sites se sirven mediante CDN global y no requieren región de servicio. Los servicios y la base deben colocarse en la misma región si se quiere utilizar la red privada. Render también documenta TLS administrado y health checks HTTP.

## 4. Arquitectura preparada

```text
GitHub
  ├── Render Static Site (frontend/dist)
  └── Render Web Service (backend/Dockerfile)
          └── Render PostgreSQL administrado
```

### Servicios pendientes

```text
CUENTA RENDER: NO CREADA
WORKSPACE: NO CREADO
STATIC SITE: NO CREADO
WEB SERVICE: NO CREADO
POSTGRESQL: NO CREADO
REGIÓN: PENDIENTE
DOMINIO: PENDIENTE
```

## 5. Backend y Docker

El backend usa FastAPI/Uvicorn y expone:

```text
GET /api/health → {"status":"ok"}
```

Cambios realizados:

1. `backend/Dockerfile` ahora usa `PORT` cuando Render lo proporciona y conserva `8000` como fallback local:

   ```text
   uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
   ```

2. `frontend/Dockerfile` usa `npm ci` en lugar de `npm install`, respetando el lockfile.

No se modificó Compose ni se creó un archivo específico de Render.

### Variables del Web Service

Solo nombres, sin valores:

```text
DATABASE_URL
CORS_ORIGINS
PUBLIC_BASE_URL
SECURE_COOKIES=true
MAIL_PROVIDER=smtp
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_USE_TLS
MAIL_FROM
PUBLIC_LINK_RATE_LIMIT
PUBLIC_LINK_RATE_WINDOW_S
SCHEMA_MANAGED_EXTERNALLY=true
```

`DATABASE_URL`, `SMTP_PASSWORD` y cualquier secreto deben introducirse exclusivamente en Render. SQLite local no es una base productiva.

## 6. Alembic y esquema

El flujo productivo preparado es:

```text
PostgreSQL Render
        ↓
DATABASE_URL
        ↓
SCHEMA_MANAGED_EXTERNALLY=true
        ↓
alembic upgrade head
        ↓
backend
```

Se validó contra SQLite temporal aislada:

```text
python -m alembic upgrade head
python -m alembic check
No new upgrade operations detected.
```

No se ejecutó Alembic contra una base externa ni contra `backend/marimba.db` o `backend/test_marimba.db`.

## 7. Frontend

- Build: `npm ci && npm run build`.
- Variable de compilación: `VITE_API_URL`.
- Fallback localhost: conservado únicamente para desarrollo.
- URL productiva: no definida porque el servicio todavía no existe.
- Static Site futuro: build command `npm ci && npm run build`; publish directory `frontend/dist`; root directory/repository settings quedan pendientes de la creación del servicio.

## 8. CORS, cookies y URLs

Cuando existan las URLs reales:

```text
CORS_ORIGINS=<origen HTTPS real del frontend>
PUBLIC_BASE_URL=<origen público usado por los enlaces de recuperación>
VITE_API_URL=<URL HTTPS real del backend>/api
SECURE_COOKIES=true
```

No se añadió ningún dominio ficticio. La sesión usa cookies HttpOnly/Secure/SameSite y las escrituras requieren CSRF. No se debe usar `*` con credenciales.

## 9. PostgreSQL

Requisitos futuros:

- PostgreSQL administrado.
- `DATABASE_URL` configurada como secreto/variable en Render.
- Web Service y base en la misma región.
- Backups/PITR y retención confirmados según el plan elegido.
- Migración con Alembic antes del arranque productivo.
- No importar automáticamente las SQLite locales.

No se creó ni modificó ninguna base.

## 10. SMTP

La recuperación de contraseña usa:

```text
MAIL_PROVIDER
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_USE_TLS
MAIL_FROM
PUBLIC_BASE_URL
```

El modo `console` permanece para desarrollo. No se eligió proveedor SMTP, no se creó cuenta y no se enviaron correos.

## 11. Rate limit público

Variables identificadas:

```text
PUBLIC_LINK_RATE_LIMIT
PUBLIC_LINK_RATE_WINDOW_S
```

El comportamiento actual se conserva. Los valores definitivos de producción deben revisarse después de conocer tráfico esperado; no se cambió el algoritmo ni se fijaron valores productivos nuevos.

## 12. Dependencia `source-map-js`

La vulnerabilidad transitiva provenía de `vite → postcss → source-map-js`.

Cambio aplicado:

```text
source-map-js 1.2.1 → 1.2.2
```

Se actualizó únicamente `frontend/package-lock.json`; no se hizo `npm audit fix --force`, no se actualizaron React/Vite/TypeScript y no se modificó `package.json` para añadir una dependencia directa.

Resultado:

```text
npm ci
found 0 vulnerabilities
```

## 13. Validación ejecutada

```text
Backend:
360 passed

Frontend:
224 passed

TypeScript/Vite build:
PASS

Alembic temporal:
upgrade head PASS
alembic check PASS

npm audit:
0 vulnerabilities
```

El build frontend requirió ejecución fuera del sandbox por una restricción de acceso de esbuild y terminó correctamente. El daemon Docker local no estaba accesible por permisos sobre la API (`docker_engine`), por lo que no se ejecutó `docker build`; queda como validación ambiental pendiente, no como un fallo de configuración demostrado.

## 14. Tenant y administrador

```text
TENANT: NO CREADO
ADMIN: NO CREADO
```

Administrador previsto:

```text
Nombre: Tiffany24630
Correo: sal24630@uvg.edu.gt
Rol: admin
```

No se ejecutó `python -m app.cli create-admin` y no se solicitó ni almacenó contraseña.

## 15. `render.yaml`

No se creó `render.yaml`. La creación de un Blueprint no es necesaria para validar el Dockerfile y añadirlo ahora exigiría decidir nombres, región, plan y referencias de servicios todavía inexistentes. Cuando la usuaria confirme la infraestructura, podrá elegirse Dashboard o Blueprint con variables secretas `sync: false`/referencias seguras, sin escribir secretos en Git.

## 16. Bloqueadores para crear infraestructura

1. Confirmar que Render es el proveedor final.
2. Elegir región para Web Service y PostgreSQL.
3. Confirmar plan y presupuesto, incluidos backups/PITR y límites.
4. Confirmar dominio o aceptar subdominios `onrender.com` inicialmente.
5. Crear la cuenta/workspace de Render y autorizar GitHub.
6. Crear PostgreSQL y obtener `DATABASE_URL` directamente desde Render.
7. Definir valores productivos de CORS, URL pública, SMTP y rate limit dentro de Render.
8. Ejecutar Alembic contra la base recién creada.
9. Confirmar tenant y autorizar el bootstrap del admin.
10. Validar el contenedor con Docker local o aceptar la limitación del daemon antes del primer deploy.

## 17. Protecciones

- No se creó infraestructura ni cuenta externa.
- No se accedió a producción.
- No se crearon tenant/admin/SMTP/dominio/DNS.
- No se ejecutaron migraciones externas.
- No se solicitaron contraseñas, tokens ni connection strings.
- No se modificaron bases SQLite ni datos históricos.
- No se modificaron Compose.
- Automatización de commits: no activada.
- Documento: local y no subido.

## 18. Estado final

```text
FASE: COMPLETADA
PROVEEDOR: RENDER PREPARADO CONCEPTUALMENTE
CUENTA: NO CREADA
FRONTEND: NO DESPLEGADO
BACKEND: NO DESPLEGADO
POSTGRESQL: NO CREADO
DOMINIO: NO CONFIGURADO
DNS: NO MODIFICADO
SMTP: NO CONFIGURADO
TENANT: NO CREADO
ADMIN: NO CREADO
SECRETOS: NINGUNO ALMACENADO
AUTOMATIZACIÓN: NO ACTIVADA
CÓDIGO MODIFICADO: backend/Dockerfile, frontend/Dockerfile, frontend/package-lock.json
CÓDIGO PROBADO: backend 360/360; frontend 224/224; build PASS; Alembic PASS
DOCUMENTACIÓN: LOCAL / NO SUBIDA
PRÓXIMO PASO: confirmar proveedor, región y configuración productiva antes de crear infraestructura
```
