# FASE — PRUEBA CONTROLADA DE VERCEL + NEON

Fecha: 2026-10-08

## 1. Resultado

```text
ESTADO:
BLOQUEADA

VERCEL:
BLOQUEADO — ALTA REAL NO EJECUTADA

TARJETA VERCEL:
NO CONFIRMADO

HOBBY:
COMPATIBLE SOLO CON DEMO PERSONAL/NO COMERCIAL; REQUIERE CONFIRMACIÓN HUMANA

NEON:
BLOQUEADO — ALTA REAL NO EJECUTADA

TARJETA NEON:
NO CONFIRMADO

FASTAPI:
COMPATIBLE CON CAMBIOS MENORES/CONFIGURACIÓN DE ENTRYPOINT, NO PROBADO EN VERCEL

ALEMBIC:
NO EJECUTADO CONTRA NEON

HEALTH:
NO EJECUTADO EN VERCEL

FRONTEND:
BUILD LOCAL YA DISPONIBLE; DEPLOY NO EJECUTADO

PRODUCCIÓN:
NO CREADA

TENANT:
NO CREADO

ADMIN:
NO CREADO

SECRETOS PRODUCTIVOS:
NO CREADOS
```

La fase queda bloqueada porque la validación decisiva requiere que la usuaria complete directamente el alta en Vercel y Neon. No se intentó crear una cuenta, proyecto, base de datos ni recurso de prueba.

## 2. Operaciones realizadas

- Revisión estática de `backend/app/main.py`.
- Revisión estática de `backend/app/core/config.py`.
- Revisión estática de `backend/requirements.txt`.
- Revisión estática de `backend/alembic/env.py` y la migración inicial existente.
- Revisión estática de `frontend/package.json`, `frontend/vite.config.ts` y `frontend/src/lib/api.ts`.
- Consulta de documentación oficial de Vercel y Neon.
- Verificación de que el backend exporta una aplicación FastAPI en `backend/app/main.py`.
- Verificación de que el backend usa `DATABASE_URL` y `SCHEMA_MANAGED_EXTERNALLY`.
- Verificación de que el frontend usa `VITE_API_URL`.

No se hicieron altas, despliegues, migraciones externas, cambios de código ni pruebas destructivas.

## 3. Vercel

La documentación oficial de Vercel indica que:

- existe un plan Hobby gratuito;
- el plan está dirigido a proyectos personales;
- los términos limitan Hobby a uso personal/no comercial;
- Vercel soporta Python Functions;
- Vercel documenta FastAPI como framework soportado;
- las funciones Python tienen límites de bundle, duración, recursos y concurrencia;
- Git-based deployments y HTTPS forman parte de la plataforma.

Fuentes:

- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/plans
- https://vercel.com/docs/functions/runtimes/python
- https://vercel.com/docs/frameworks/backend/fastapi
- https://vercel.com/docs/functions/limitations
- https://vercel.com/legal/terms

Resultado de alta real:

```text
Alta:
NO EJECUTADA

Tarjeta:
NO CONFIRMADO

Plan:
NO CONFIRMADO EN CUENTA REAL

GitHub:
NO PROBADO EN CUENTA REAL

HTTPS:
DOCUMENTADO POR VERCEL; NO PROBADO EN UN DEPLOY REAL
```

No se solicitó ni introdujo tarjeta, contraseña, 2FA, token ni API key.

## 4. Condiciones Hobby

El uso previsto debe permanecer estrictamente dentro de:

```text
demo personal / académica / no comercial
```

No puede aprobarse el plan Hobby para uso comercial, servicio para terceros o actividad profesional sin una decisión y plan compatible.

```text
Hobby:
REQUIERE CONFIRMACIÓN HUMANA DEL USO PREVISTO
```

La documentación pública no sustituye la comprobación del flujo de alta de la cuenta concreta.

## 5. FastAPI y entrypoint

El backend actual contiene:

```text
backend/app/main.py
app = FastAPI(...)
```

También contiene:

```text
SQLAlchemy
psycopg
Alembic
DATABASE_URL
SCHEMA_MANAGED_EXTERNALLY
GET /api/health
```

La compatibilidad estimada es:

```text
FastAPI:
COMPATIBLE CON CAMBIOS MENORES

Compatibilidad:
MEDIA

Prueba real en Vercel:
NO EJECUTADA
```

La adaptación probable consiste en definir correctamente el entrypoint de Python Function y el Root Directory del proyecto backend. No se creó `api/index.py`, `vercel.json` ni un adaptador porque todavía no existe una cuenta autorizada para verificar cuál de ellos resulta necesario.

No se duplicaron rutas ni se modificó la aplicación FastAPI existente.

## 6. Monorepo

La estructura actual es:

```text
Marimba-Organizer/
├── backend/
└── frontend/
```

La configuración esperada, pendiente de prueba real, sería:

```text
Proyecto frontend:
Root Directory = frontend
Build = npm ci && npm run build
Output = dist

Proyecto backend:
Root Directory = backend
Runtime = Python Functions
Entrypoint = app/main.py o configuración equivalente
```

No se asumió que Vercel acepte esta configuración sin validación del dashboard.

## 7. Neon

La documentación oficial de Neon indica que ofrece PostgreSQL real, URI PostgreSQL estándar y conexiones directas o pooled para aplicaciones externas.

Fuentes:

- https://neon.tech/docs/introduction/plans
- https://api-docs.neon.tech/reference/getconnectionuri
- https://neon.com/blog/new-usage-based-pricing

Resultado de alta real:

```text
Alta:
NO EJECUTADA

Tarjeta:
NO CONFIRMADO EN EL FLUJO REAL

PostgreSQL:
DOCUMENTADO COMO SÍ

URI:
DOCUMENTADA COMO DISPONIBLE; NO OBTENIDA

Conexión externa:
DOCUMENTADA COMO SÍ; NO PROBADA
```

No se creó una base de prueba y no se obtuvo ninguna `DATABASE_URL`.

## 8. Alembic y base de prueba

El backend existente resuelve la URL de Alembic desde `DATABASE_URL` cuando está presente. La migración inicial está versionada.

Sin una base Neon creada inequívocamente como `PRUEBA`, no se ejecutó:

```text
alembic upgrade head
alembic check
```

No se ejecutaron migraciones contra producción ni contra una base externa desconocida.

## 9. Variables

### Frontend

```text
VITE_API_URL — pública, build-time
```

Ningún secreto debe aparecer en una variable `VITE_*`.

### Backend

```text
DATABASE_URL
CORS_ORIGINS
PUBLIC_BASE_URL
SECURE_COOKIES
SESSION_TTL_MINUTES
MAIL_PROVIDER
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_USE_TLS
MAIL_FROM
PUBLIC_LINK_RATE_LIMIT
PUBLIC_LINK_RATE_WINDOW_S
SCHEMA_MANAGED_EXTERNALLY
```

`DATABASE_URL`, `SMTP_USER` y `SMTP_PASSWORD` deben ser variables protegidas de plataforma. No se introdujo ningún valor real.

## 10. Validaciones funcionales

```text
/api/health en Vercel:
NO EJECUTADO

FastAPI → Neon:
NO PROBADO

Alembic → Neon:
NO EJECUTADO

Frontend desplegado:
NO

Autenticación cross-origin:
NO PROBADA

SMTP:
NO CONFIGURADO

Public links:
NO PROBADOS EN VERCEL
```

La compatibilidad conceptual de cookies HttpOnly, `Secure`, CSRF, `credentials: include` y CORS queda documentada, pero no se presenta como evidencia de funcionamiento en Vercel.

## 11. Seguridad y datos

- No se solicitó contraseña, tarjeta, 2FA, token ni API key.
- No se crearon secretos.
- No se escribieron connection strings.
- No se modificaron `backend/marimba.db` ni `backend/test_marimba.db`.
- No se creó tenant ni usuario administrador.
- No se ejecutó `python -m app.cli create-admin`.
- No se ejecutaron migraciones externas.
- No se desplegó producción.

## 12. Git

```text
Rama:
checkpoint/fase1-motor-d1-d3-d5

Upstream:
origin/checkpoint/fase1-motor-d1-d3-d5

HEAD:
e0969172c2cbcc10a078d8faf2e12f9832a09eb5

Documento:
LOCAL / SIN STAGING / SIN COMMIT / SIN PUSH
```

No se utilizó `git add .`, `git reset`, `git clean`, `git restore`, `git stash`, `git push --force` ni cambio de rama.

## 13. Decisión final

```text
Vercel + Neon:
BLOQUEADO
```

Faltan exactamente:

1. que la usuaria complete el alta de Vercel en la interfaz oficial y confirme si se exige tarjeta;
2. confirmar que el uso previsto es estrictamente personal/no comercial;
3. completar el alta de Neon y confirmar su política real de tarjeta;
4. crear, solo si se autoriza, un recurso explícito de prueba;
5. validar el entrypoint FastAPI y el monorepo en Vercel;
6. probar `FastAPI → Neon` y `/api/health` sin datos reales.

## 14. Siguiente fase

No avanzar a despliegue. La siguiente acción concreta es la validación interactiva de alta por parte de la usuaria, sin compartir credenciales ni métodos de pago por chat. Solo después de superar ese paso podrá prepararse una prueba técnica aislada.
