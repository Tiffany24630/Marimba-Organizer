# FASE — VALIDACIÓN CONTROLADA DE VERCEL HOBBY + NEON FREE

Fecha: 2026-10-08

## 1. Resultado final

```text
ESTADO: BLOQUEADA PARA APROBACIÓN FINAL

VERCEL:
TÉCNICAMENTE VIABLE, ALTA REAL NO VERIFICADA

TARJETA:
NO CONFIRMADO

HOBBY:
COMPATIBLE SOLO CON DEMO PERSONAL/NO COMERCIAL; REQUIERE CONFIRMACIÓN HUMANA

FASTAPI:
COMPATIBLE CON CAMBIOS MENORES/CONFIGURACIÓN DE ENTRYPOINT

NEON:
TÉCNICAMENTE COMPATIBLE; ALTA REAL NO EJECUTADA

TARJETA NEON:
NO CONFIRMADO EN EL FLUJO REAL

POSTGRESQL:
COMPATIBLE

ARQUITECTURA:
Vercel para frontend y FastAPI como Python Function + Neon PostgreSQL

PRODUCCIÓN:
NO CREADA

TENANT:
NO CREADO

ADMIN:
NO CREADO

MIGRACIONES PRODUCTIVAS:
NO EJECUTADAS

SECRETOS:
NO CREADOS

SIGUIENTE FASE:
Confirmar manualmente el alta de Vercel y Neon sin tarjeta, antes de preparar cualquier despliegue.
```

La fase no puede marcarse como aprobada porque el requisito decisivo —completar realmente el alta sin tarjeta— no puede demostrarse mediante el repositorio ni mediante documentación pública. No se accedió a cuentas externas ni se introdujo ningún método de pago.

## 2. Fuentes oficiales consultadas

- Vercel Hobby: https://vercel.com/docs/plans/hobby
- Vercel planes: https://vercel.com/docs/plans
- Vercel Python runtime: https://vercel.com/docs/functions/runtimes/python
- Vercel FastAPI: https://vercel.com/docs/frameworks/backend/fastapi
- Vercel límites de Functions: https://vercel.com/docs/functions/limitations
- Vercel términos, sección Hobby: https://vercel.com/legal/terms
- Neon planes: https://neon.tech/docs/introduction/plans
- Neon conexión PostgreSQL: https://api-docs.neon.tech/reference/getconnectionuri
- Neon escalado a cero: https://neon.com/blog/new-usage-based-pricing
- Render web services: https://render.com/docs/web-services
- Render variables: https://render.com/docs/configure-environment-variables

## 3. Resultado de alta

```text
Vercel:
NO EJECUTADO

Neon:
NO EJECUTADO

Método de pago:
NO INTRODUCIDO

Importación GitHub:
NO EJECUTADA
```

No existe autorización ni acceso de cuenta para completar el flujo interactivo. Por ello, la tarjeta queda **NO CONFIRMADA**, no “NO requerida”.

## 4. Condiciones de Vercel Hobby

Vercel documenta el plan Hobby como gratuito y orientado a proyectos personales. Sus términos restringen el uso del Hobby a uso personal/no comercial y permiten a Vercel modificar o retirar el servicio. La demo de Marimba Organizer solo podría encajar si se mantiene realmente como demo personal, académica o no comercial.

La documentación de planes muestra integración Git, CI/CD y HTTPS. La documentación actual de Hobby también muestra límites de Functions, invocaciones, duración, CPU, memoria y uso mensual. Superar los límites no equivale a disponer de producción ilimitada.

Conclusión contractual:

```text
Hobby:
COMPATIBLE ÚNICAMENTE CON USO PERSONAL/NO COMERCIAL

Uso comercial o servicio para terceros:
NO APROBADO EN HOBBY

Confirmación humana:
NECESARIA
```

## 5. Vercel y FastAPI

La documentación oficial de Vercel soporta Python Functions y menciona explícitamente FastAPI. La aplicación se convertiría en una Function, no en un proceso Uvicorn persistente ni en el Docker Web Service usado por Render.

La compatibilidad estimada es:

```text
COMPATIBILIDAD: MEDIA
CAMBIO: MENOR/CONFIGURACIÓN, NO REESCRITURA DE FRAMEWORK
```

Razones:

- El backend actual exporta `app = FastAPI(...)` en `backend/app/main.py`.
- `backend/requirements.txt` contiene FastAPI, SQLAlchemy, Alembic y `psycopg`.
- Vercel reconoce aplicaciones FastAPI mediante un entrypoint Python y `app` ASGI.
- El repositorio es monorepo (`backend/` y `frontend/`), por lo que la configuración tendría que tratar las raíces como proyectos separados o definir un entrypoint explícito.
- El `Dockerfile` actual no sería el mecanismo principal del backend en Vercel Python Functions.
- No se creó `api/index.py`, `vercel.json` ni ningún adaptador.

No puede afirmarse que el backend sea desplegable sin cambios hasta realizar una prueba aislada de build/deploy en una cuenta autorizada. La adaptación prevista no parece arquitectónica, pero debe validarse con el entrypoint real.

## 6. Riesgos del modelo Function

### Base de datos

El uso de PostgreSQL es conceptualmente compatible mediante `DATABASE_URL`, pero un runtime serverless exige revisar el tamaño del pool, conexiones reutilizadas y concurrencia. La aplicación no fue modificada para esa optimización en esta fase.

### Autenticación

El frontend usa cookies con `credentials: 'include'` y cabecera CSRF para operaciones mutantes. Esto puede funcionar detrás de HTTPS, pero requiere comprobar dominios, `SameSite`, `Secure`, CORS y cookies cross-origin durante una prueba real.

### CORS

Debe configurarse `CORS_ORIGINS` con el origen HTTPS real del frontend. No se propone usar `*`.

### SMTP

La aplicación usa `MAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_USE_TLS` y `MAIL_FROM`. No se configuró proveedor ni se enviaron correos.

### Public links

`PUBLIC_BASE_URL`, `PUBLIC_LINK_RATE_LIMIT` y `PUBLIC_LINK_RATE_WINDOW_S` deben recibir valores del entorno real. No se creó URL pública ni se generaron enlaces.

## 7. Monorepo y configuración prevista

La configuración más conservadora sería usar dos proyectos Vercel:

```text
Proyecto frontend:
Root Directory: frontend
Build: npm ci && npm run build
Output: dist
Variable pública de build: VITE_API_URL

Proyecto backend:
Root Directory: backend
Runtime: Python Functions
Entrypoint: app/main.py o configuración explícita equivalente
Variables runtime: DATABASE_URL, CORS_ORIGINS, PUBLIC_BASE_URL, etc.
```

Esta es una propuesta de preparación, no una configuración creada. `VITE_API_URL` no debe contener secretos.

## 8. Variables clasificadas

### Frontend — build-time y públicas

```text
VITE_API_URL
```

Todo valor `VITE_*` puede terminar en el bundle del navegador. No debe contener contraseñas, tokens ni connection strings.

### Backend — runtime

```text
DATABASE_URL                 secreta
CORS_ORIGINS                 no secreta, pero sensible a configuración
PUBLIC_BASE_URL              no secreta
SECURE_COOKIES               no secreta
SESSION_TTL_MINUTES          no secreta
MAIL_PROVIDER                no secreta
SMTP_HOST                    sensible de infraestructura
SMTP_PORT                    no secreta
SMTP_USER                    sensible
SMTP_PASSWORD                secreta
SMTP_USE_TLS                 no secreta
MAIL_FROM                    no secreta
PUBLIC_LINK_RATE_LIMIT       no secreta
PUBLIC_LINK_RATE_WINDOW_S    no secreta
SCHEMA_MANAGED_EXTERNALLY    no secreta
```

El repositorio conserva valores de desarrollo como `localhost` y `console` por defecto. No deben copiarse a producción sin revisión.

## 9. Neon Free

La documentación de Neon describe un PostgreSQL real con URI estándar y opciones de conexión directa o pooled. Es compatible conceptualmente con SQLAlchemy, Alembic y `DATABASE_URL`.

Características relevantes documentadas:

- plan gratuito con límites de proyectos, cómputo, almacenamiento y egress;
- escalado a cero después de inactividad;
- URI PostgreSQL estándar;
- conexión externa desde un backend;
- límites de uso que deben monitorizarse;
- no se creó ningún proyecto ni se verificó el alta interactiva.

Conclusión:

```text
PostgreSQL real: SÍ
DATABASE_URL: SÍ
Conexión externa: SÍ
Compatibilidad Alembic: CONCEPTUALMENTE SÍ
Base de prueba: NO CREADA
Base productiva: NO CREADA
Tarjeta en alta real: NO CONFIRMADO
```

Neon Free puede ser adecuado para una demo, pero no se debe interpretar como una política de backup productiva. No se ejecutó `alembic upgrade head` contra Neon.

## 10. Alembic

La configuración local existente usa `DATABASE_URL` en `backend/alembic/env.py` y contiene la migración inicial versionada.

El flujo previsto sería:

```text
Neon PostgreSQL aislado
        ↓
DATABASE_URL
        ↓
alembic upgrade head
        ↓
SCHEMA_MANAGED_EXTERNALLY=true
        ↓
backend
```

No se ejecutó ese flujo contra una base externa. `SCHEMA_MANAGED_EXTERNALLY=true` sigue siendo la configuración productiva prevista.

## 11. Comparación con Render

| Característica | Render | Vercel + Neon |
|---|---|---|
| `$0` | Depende del servicio/condiciones actuales | Posible para demo personal, sujeto a límites |
| Sin tarjeta | No confirmado para el flujo disponible | No confirmado sin alta real |
| FastAPI | Web Service Docker directo | Python Function |
| Docker | Sí | No es el modelo principal de backend |
| PostgreSQL | Servicio administrado Render | Neon externo |
| GitHub | Sí | Sí |
| HTTPS | Sí | Sí |
| Secrets | Sí | Sí |
| Persistencia | Web Service + DB administrada | Function efímera + DB externa |
| Cold start | Posible en servicios gratuitos | Posible en Functions |
| Complejidad | Menor para el Docker actual | Mayor por entrypoint, Function y monorepo |
| Compatibilidad actual | Alta | Media, pendiente de validación real |
| Migración futura | Mantiene el modelo de contenedor | Puede volver a contenedor conservando FastAPI |

Render sigue siendo técnicamente más directo para el backend actual. Vercel + Neon solo resulta atractivo si la condición sin tarjeta se confirma y el uso permanece dentro del Hobby personal/no comercial.

## 12. Seguridad respetada

- No se introdujo tarjeta.
- No se solicitaron contraseñas.
- No se crearon tokens ni API keys.
- No se crearon bases ni cuentas.
- No se ejecutaron migraciones externas.
- No se ejecutó `create-admin`.
- No se modificaron SQLite ni datos históricos.
- No se modificó código funcional.
- No se hizo staging, commit ni push del documento.

## 13. Conclusión

```text
Vercel + Neon:
TÉCNICAMENTE PLAUSIBLE PARA DEMO PERSONAL,
PERO NO APROBADO TODAVÍA.
```

El bloqueo restante no puede resolverse de forma segura desde el repositorio:

1. completar el alta real de Vercel sin tarjeta;
2. confirmar que el plan Hobby es aceptable para el uso previsto;
3. completar el alta real de Neon sin tarjeta;
4. realizar después una prueba controlada del monorepo y del entrypoint FastAPI.

Hasta entonces:

```text
Vercel + Neon:
REQUIERE CONFIRMACIÓN HUMANA

PRODUCCIÓN:
NO CREADA

TENANT:
NO CREADO

ADMIN:
NO CREADO
```
