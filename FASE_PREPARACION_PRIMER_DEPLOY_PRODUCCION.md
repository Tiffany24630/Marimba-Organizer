# FASE — AUDITORÍA DE PREPARACIÓN PARA PRIMER DESPLIEGUE DE PRODUCCIÓN

## 1. Estado

**FASE: COMPLETADA — PREPARACIÓN TÉCNICA VERIFICADA; PRODUCCIÓN AÚN NO CREADA**

La preparación local fue completada sin desplegar infraestructura ni modificar producción. No existe producción identificada, por lo que no se ejecutó `create-admin`.

## 1.1 Resultado de esta fase técnica

- El backend puede verificarse en un entorno temporal controlado.
- El frontend recuperó sus dependencias exactamente desde `package-lock.json`.
- Se incorporó Alembic como mecanismo formal y versionado para esquemas nuevos.
- Se añadió la revisión inicial `0001_initial_schema` para las tablas actuales.
- `SCHEMA_MANAGED_EXTERNALLY=true` permite que producción requiera migraciones previas al arranque; desarrollo/tests conservan `create_all` y sus migraciones históricas.
- La migración inicial fue aplicada y validada en SQLite temporal; `alembic check` no detectó operaciones pendientes.
- Se corrigieron únicamente declaraciones ORM que no reflejaban restricciones ya exigidas por la base: JSON obligatorio, correo único y colaboración única por proyecto/usuario.
- No se ejecutó Alembic sobre las bases SQLite del proyecto ni sobre una base externa.

## 2. Git

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- Upstream: `origin/checkpoint/fase1-motor-d1-d3-d5`.
- Commit publicado: `e0969172c2cbcc10a078d8faf2e12f9832a09eb5`.
- `main` no fue modificado.
- Este documento queda local y no se añadió, confirmó ni publicó automáticamente.

## 3. Producción actual

```text
PROVEEDOR: NO SELECCIONADO
FRONTEND: NO DESPLEGADO
BACKEND: NO DESPLEGADO
BASE: NO CREADA/NO IDENTIFICADA
TENANT: NO CREADO/NO CONFIRMADO
ADMIN: NO CREADO
```

La inspección de README, ejemplos de entorno, Docker/Compose, backend, frontend, scripts y configuración de hosting solo encontró referencias locales, E2E, SQLite, PostgreSQL de desarrollo y Mailpit. No se encontró proveedor, URL pública, despliegue CI/CD ni instancia productiva verificable.

## 4. Auditoría del backend

- Framework: FastAPI.
- Servidor ASGI: Uvicorn.
- Comando de imagen: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Health check: `GET /api/health`, público, respuesta `{"status":"ok"}`; no requiere autenticación ni expone datos internos.
- Base: SQLAlchemy; PostgreSQL es compatible mediante `DATABASE_URL`, pero el valor por defecto local es SQLite.
- CORS: se obtiene de `CORS_ORIGINS`; los valores actuales de ejemplo son locales y deben sustituirse por el origen HTTPS real.
- Sesiones: cookies HttpOnly y token anti-CSRF en cabecera para operaciones mutables.
- Recuperación de contraseña: requiere configurar correo real en producción.
- Rate-limit público: configurable mediante `PUBLIC_LINK_RATE_LIMIT` y `PUBLIC_LINK_RATE_WINDOW_S`.
- Arranque: ejecuta `Base.metadata.create_all(bind=engine)` y migraciones ad hoc internas. No se encontró Alembic ni un directorio formal de migraciones.

### Resultado de preparación backend

**PREPARADO PARA LA SIGUIENTE DECISIÓN DE DESPLIEGUE.** Alembic formaliza el esquema de instalaciones nuevas. Las bases existentes requieren un plan de adopción/revisión separado; no se marcó ninguna base local como migrada automáticamente.

## 5. Auditoría del frontend

- Stack: React/Vite/TypeScript.
- Desarrollo: `npm run dev`.
- Tests unitarios: `npm test`.
- Build: `npm run build`.
- Salida de producción: `frontend/dist`.
- Servido estático: `frontend/nginx.conf` y la imagen frontend.
- URL del backend: `VITE_API_URL`.
- Fallback actual: `http://localhost:8000/api`; no es válido para producción.

El Dockerfile frontend permite inyectar `VITE_API_URL` durante la construcción. Para producción debe establecerse explícitamente la URL HTTPS real del backend antes del build.

## 6. Variables de entorno

Solo se documentan nombres; no se registran valores.

| Grupo | Variable | Requerida en producción | Propósito | Secreta |
|---|---|---:|---|---:|
| Database | `DATABASE_URL` | Sí | Conexión PostgreSQL | Sí |
| Backend | `CORS_ORIGINS` | Sí | Orígenes permitidos | No |
| Backend | `PUBLIC_BASE_URL` | Sí | URL pública y enlaces de recuperación | No |
| Auth | `SECURE_COOKIES` | Revisar | Control explícito de cookies seguras | No |
| Auth | `SESSION_TTL_MINUTES` | Opcional | Duración de sesión | No |
| Email | `MAIL_PROVIDER` | Sí para correo real | Selección de transporte | No |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_USE_TLS`, `MAIL_FROM` | Según correo | Recuperación/notificaciones | `SMTP_PASSWORD`: sí |
| Migration | `MIGRATION_USER_EMAIL`, `MIGRATION_USER_NAME`, `MIGRATION_USER_PASSWORD` | Solo si se usa bootstrap de migración | Usuario técnico de migración | La contraseña: sí |
| Public API | `PUBLIC_LINK_RATE_LIMIT`, `PUBLIC_LINK_RATE_WINDOW_S` | Opcional | Protección de enlaces públicos | No |
| Frontend build | `VITE_API_URL` | Sí | URL del backend consumida por el navegador | No |

Los valores por defecto actuales son de desarrollo. No deben reutilizarse como configuración productiva, especialmente SQLite, localhost, correo `console` y credenciales/defaults de Compose.

## 7. Base de datos y migraciones

- PostgreSQL: soportado por el driver/configuración existente.
- SQLite: presente para desarrollo y tests; no debe considerarse producción.
- Tablas: se crean automáticamente mediante SQLAlchemy en el arranque.
- Migraciones: existen rutinas internas históricas/ad hoc, pero no se identificó Alembic ni una cadena formal versionada.
- Estado: **REQUIERE PREPARACIÓN** antes de producción.

No se ejecutaron migraciones ni se modificaron `backend/marimba.db` o `backend/test_marimba.db`.

## 8. Tenant y bootstrap del administrador

El comando oficial es:

```bash
python -m app.cli create-admin
```

La CLI usa `getpass` cuando no se proporciona un archivo de contraseña, valida la cuenta de forma idempotente y crea el rol `admin`. Si la cuenta existe como usuario normal, no la promociona sin la opción explícita `--promover`.

La CLI utiliza la `SessionLocal` configurada por `DATABASE_URL`; no selecciona por sí misma una producción ni un tenant externo. No se identificó un tenant productivo confirmado en el repositorio. Por tanto, el flujo queda pendiente:

```text
BASE DE PRODUCCIÓN → TENANT CONFIRMADO → ADMIN → LOGIN
```

Administrador previsto, aún no creado:

- Nombre: `Tiffany24630`.
- Correo: `sal24630@uvg.edu.gt`.
- Rol: `admin`.

No se solicitó ni registró contraseña.

## 9. CORS, autenticación y HTTPS

- La configuración actual usa orígenes locales.
- Antes del despliegue debe definirse el dominio HTTPS real del frontend en `CORS_ORIGINS`.
- No debe utilizarse `allow_origins=["*"]` con credenciales.
- Las sesiones viajan mediante cookie HttpOnly y las escrituras requieren CSRF.
- `PUBLIC_BASE_URL` debe ser HTTPS para que los enlaces de recuperación y cookies seguras correspondan al despliegue real.
- No se modificó la implementación de autenticación.

## 10. Almacenamiento y correo

- No se identificó dependencia de storage externo persistente. La importación Excel se lee y procesa en memoria; las exportaciones se generan para descarga del cliente.
- El correo sí es necesario para recuperación de contraseña y flujos relacionados.
- El modo `console` es de desarrollo. Producción requiere SMTP real y una `PUBLIC_BASE_URL` pública coherente.
- No se configuró ni contactó ningún proveedor de correo.

## 11. Docker

- `backend/Dockerfile` es ejecutable con Uvicorn en el puerto 8000.
- `frontend/Dockerfile` construye Vite y sirve los archivos estáticos.
- `docker-compose.yml` y los Compose E2E describen desarrollo/pruebas locales, con PostgreSQL local, puertos locales y valores de prueba.
- No existe una imagen o manifiesto de proveedor de producción identificado.
- No se modificó ningún Compose ni se ejecutó `docker compose down -v`.

## 12. Riesgos previos al despliegue

| Prioridad | Hallazgo | Acción requerida |
|---|---|---|
| P1 | No existe proveedor, URLs, DB ni tenant productivos confirmados | Elegir y documentar infraestructura real |
| P1 | No existe migración formal versionada | Definir/probar migraciones controladas antes de producción |
| P1 | Defaults locales de SQLite, localhost, correo `console` y configuración de prueba | Configurar todos los valores productivos mediante secretos/variables del proveedor |
| P1 | Frontend tiene fallback a backend localhost | Inyectar `VITE_API_URL` HTTPS durante el build |
| P1 | CORS todavía está orientado a desarrollo | Configurar únicamente el origen frontend productivo |
| P2 | No hay health check de proveedor documentado fuera de `/api/health` | Conectar `/api/health` al proveedor elegido |
| P3 | Validaciones ambientales de lector de pantalla/UIA y touch físico | Ejecutar cuando exista el entorno/hardware apropiado |

No se corrigieron estos puntos porque esta fase es de auditoría y preparación.

## 13. Proveedores y arquitectura candidata

No se seleccionó ningún proveedor. La arquitectura técnicamente mínima es:

```text
GitHub
  ├── hosting estático para frontend Vite
  └── hosting de contenedor para FastAPI/Uvicorn
          └── PostgreSQL administrado
```

Las alternativas a evaluar posteriormente son un hosting estático equivalente a Vercel/Netlify, un hosting de contenedor equivalente a Render/Railway/Fly.io y PostgreSQL administrado equivalente a Neon/Supabase/Railway. La elección debe hacerse con cuentas, costos, región, backups, límites y soporte realmente confirmados; no se crearon cuentas ni despliegues en esta fase.

## 14. Plan futuro de primer deploy — no ejecutado

1. Elegir proveedor y región.
2. Crear proyecto de hosting y PostgreSQL.
3. Configurar secretos y variables sin versionarlos.
4. Preparar migraciones formales y ejecutarlas de forma controlada.
5. Desplegar backend y verificar `/api/health`.
6. Confirmar CORS, HTTPS, cookies y correo.
7. Confirmar tenant y aislamiento.
8. Construir/desplegar frontend con `VITE_API_URL` real.
9. Ejecutar `create-admin` en el entorno confirmado usando entrada interactiva segura.
10. Verificar login, rol, recuperación y flujos críticos.
11. Documentar URLs y procedimiento operativo sin secretos.

## 15. Verificación local ejecutada

### Backend

```text
python -m pytest -q --basetemp .pytest-tmp-preprod -p no:cacheprovider
360 passed in 38.91s
```

El fallo anterior era ambiental: permisos del directorio temporal predeterminado de pytest. La variante con directorio temporal controlado lo evita sin cambiar tests ni fixtures.

### Frontend

```text
npm ci
npm test
224 passed, 0 failed
```

Las dependencias se restauraron desde el lockfile; no se ejecutó `npm update`. `npm ci` reportó una vulnerabilidad de severidad alta en el árbol instalado; no se aplicó `npm audit fix` porque cambiaría dependencias fuera del alcance.

```text
npm run build
TypeScript PASS
Vite build PASS
202 modules transformed; dist generado correctamente
```

El primer intento quedó bloqueado por permisos de esbuild en el sandbox; la repetición autorizada fuera de esa restricción terminó correctamente.

### Migraciones

```text
python -m alembic upgrade head
python -m alembic check
No new upgrade operations detected.
```

Ambos comandos se ejecutaron contra SQLite temporal aislada. El flujo de modo productivo también se comprobó con `SCHEMA_MANAGED_EXTERNALLY=true` sobre una base temporal ya migrada y el endpoint `/api/health` continuó registrado.

No se ejecutaron E2E completos, migraciones, Docker E2E, despliegues ni `create-admin`.

## 16. Automatización y protecciones

- Automatización de commits: diseñada, no activada.
- No se modificó código, configuración, Compose, `.gitignore`, bases ni datos.
- No se accedió a producción ni se creó infraestructura.
- No se ejecutaron migraciones ni `create-admin`.
- No se usaron operaciones Git destructivas, ni se creó commit adicional.
- No se registraron contraseñas, tokens, claves, URLs sensibles ni valores de entorno.

## 17. Bloqueos para el primer deploy

Antes de desplegar faltan, como mínimo:

1. proveedor y región;
2. URL pública frontend y backend;
3. PostgreSQL administrado y estrategia de backups;
4. proceso formal de migraciones;
5. variables/secretos configurados en el proveedor;
6. tenant productivo confirmado;
7. verificación de correo SMTP;
8. reinstalación controlada de dependencias para repetir tests/build;
9. autorización separada para crear el administrador.

## 18. Archivos funcionales modificados

- `backend/requirements.txt`: dependencia versionada de Alembic.
- `backend/app/core/config.py`: bandera `SCHEMA_MANAGED_EXTERNALLY`.
- `backend/app/main.py`: separación entre esquema gestionado externamente y compatibilidad local.
- `backend/app/models/models.py`: restricciones ORM alineadas con el esquema.
- `backend/alembic.ini`, `backend/alembic/env.py` y `backend/alembic/versions/0001_initial_schema.py`: configuración y migración inicial.

Todos fueron revisados mediante pruebas backend, validación Alembic y build frontend. Este documento de fase permanece sin staging.

## 19. Pendientes clasificados

- **P0:** ninguno identificado en esta fase.
- **P1:** seleccionar proveedor y preparar PostgreSQL productivo; revisar/adoptar migraciones sobre cualquier esquema existente; configurar secretos, CORS HTTPS, `VITE_API_URL` y SMTP.
- **P2:** resolver la vulnerabilidad reportada por `npm ci` mediante una revisión independiente de dependencias; no ejecutar `npm audit fix` automáticamente.
- **P3:** validaciones ambientales de lector de pantalla/UIA y hardware táctil.

## 20. Resultado final

```text
PROYECTO PREPARADO PARA PLANIFICAR EL DEPLOY,
PERO REQUIERE CAMBIOS Y DECISIONES ANTES DEL PRIMER DESPLIEGUE.

PRODUCCIÓN: NO CREADA
ADMIN: NO CREADO
AUTOMATIZACIÓN: NO ACTIVADA
DOCUMENTACIÓN DE FASE: LOCAL / NO SUBIDA
```
