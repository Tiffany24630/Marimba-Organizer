# FASE — SELECCIÓN Y PREPARACIÓN DEL PROVEEDOR DE PRODUCCIÓN

## 1. Estado

**FASE: COMPLETADA — RECOMENDACIÓN PREPARADA; INFRAESTRUCTURA NO CREADA**

La fase evaluó opciones actuales y dejó una arquitectura recomendada, sin crear cuentas, proyectos, bases, dominios, secretos ni despliegues.

## 2. Git

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- Upstream: `origin/checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `e0969172c2cbcc10a078d8faf2e12f9832a09eb5`.
- `main` permanece intacto.
- El worktree ya contenía cambios funcionales, pruebas, configuración, documentos y artefactos históricos; no se limpiaron ni mezclaron.
- Este documento queda local, sin staging, commit ni push automático.

## 3. Comparación de proveedores

Los precios y límites cambian; los importes siguientes son la referencia consultada el **2026-10-08** en páginas oficiales y no constituyen una cotización.

### Frontend estático

| Opción | Coste inicial publicado | Ventajas | Limitaciones/revisión |
|---|---:|---|---|
| Vercel | Hobby $0/mes; Pro $20/mes | Integración Git, CI/CD, CDN, HTTPS y dominio personalizado en Pro | Hobby está orientado a uso personal/no comercial; para un producto profesional debe revisarse Pro y sus límites de uso |
| Netlify | Free $0; Personal $9/mes; Pro $20/mes | Deploy desde Git/API, previews, dominio personalizado con SSL y CDN | Nuevas cuentas usan créditos mensuales; hay que controlar límites, pausas y facturación por consumo |
| Render Static Site | Planes/uso según workspace | Mantiene frontend, backend y PostgreSQL en un mismo proveedor | Menos separación de responsabilidades; confirmar límites y dominio del plan elegido |

**Recomendación frontend:** Render Static Site dentro de la misma arquitectura propuesta, por simplicidad operativa. Netlify es la alternativa preferida si se desea separar explícitamente el frontend del backend. Vercel es técnicamente viable, pero no debe elegirse el plan Hobby sin confirmar que el uso cumple sus condiciones.

### Backend FastAPI/Docker

| Opción | Referencia actual | Ventajas | Limitaciones/revisión |
|---|---:|---|---|
| Render Web Service | Free con limitaciones; servicio pequeño de pago publicado desde $7/mes | Docker, Python, TLS, health checks, Git deploy y PostgreSQL en la misma plataforma | Free tiene limitaciones; confirmar suspensión, recursos, región, backups y coste final |
| Railway | Free con prueba/créditos iniciales; Hobby mínimo $5/mes; Pro mínimo $20/mes | Deploy de Docker, variables, regiones globales y PostgreSQL en el mismo proyecto | Facturación por consumo; el plan Free no debe asumirse como producción persistente |
| Fly.io | Cobro por recursos; una máquina shared pequeña parte aproximadamente de $2–$6/mes según RAM/región | Control regional, contenedores y billing por segundo | Mayor complejidad operativa; Managed Postgres y egress se facturan aparte; no usar Fly Postgres no administrado para este primer despliegue |

**Recomendación backend:** Render Web Service. Encaja directamente con el Dockerfile existente, `uvicorn`, `/api/health`, variables de entorno y PostgreSQL administrado, con menor carga operativa inicial que Fly.io.

### PostgreSQL

| Opción | Referencia actual | Ventajas | Limitaciones/revisión |
|---|---:|---|---|
| Render Postgres | PostgreSQL administrado; free/paid con limitaciones y almacenamiento/backup según plan | Cercano al backend recomendado, conexión privada y operación unificada | Confirmar retención, backups/PITR, región, conexiones y coste del plan productivo |
| Railway PostgreSQL | Servicio dentro del proyecto; mínimo de plataforma/uso según plan | Configuración sencilla y una sola factura | Confirmar persistencia, backups y límites del plan elegido |
| Supabase Postgres | Free disponible; referencia oficial de hosted Postgres publica $25/mes para una base productiva | PostgreSQL administrado, dashboard y opciones de conexión/pooling | Es más plataforma de datos que solo DB; confirmar región, backups, límites y conexión SQLAlchemy |
| Neon | Alternativa PostgreSQL serverless a evaluar | Separación de proyectos/ramas y escalado bajo demanda | No se selecciona sin confirmar precio, región, límites y política de suspensión del plan actual |

**Recomendación PostgreSQL:** Render Postgres junto al backend Render, condicionado a confirmar backups, retención, región y coste del plan antes de crear la instancia. Supabase es la alternativa si se priorizan herramientas de datos y un servicio PostgreSQL independiente.

Fuentes oficiales consultadas:

- [Vercel Pricing](https://vercel.com/pricing)
- [Netlify Pricing](https://www.netlify.com/pricing/)
- [Render Pricing](https://render.com/pricing)
- [Railway Pricing](https://railway.com/pricing)
- [Fly.io Resource Pricing](https://fly.io/docs/about/pricing/)
- [Supabase Pricing](https://supabase.com/pricing)

## 4. Recomendación concreta

```text
FRONTEND RECOMENDADO: Render Static Site
BACKEND RECOMENDADO: Render Web Service usando Dockerfile
POSTGRESQL RECOMENDADO: Render Postgres administrado
ARQUITECTURA: un proyecto Render con frontend estático, backend FastAPI y PostgreSQL separado
```

Motivos:

1. Menor número de proveedores y credenciales operativas.
2. Compatibilidad directa con el Dockerfile y Uvicorn actuales.
3. HTTPS, deploy desde Git y health check en una misma plataforma.
4. PostgreSQL real, separado de SQLite local.
5. Posibilidad de empezar pequeño y escalar sin cambiar la arquitectura.

La recomendación no autoriza crear una cuenta ni un servicio. La decisión final requiere confirmación de la usuaria y revisión de coste, región, backups y política de suspensión.

## 5. Preparación técnica existente

### Backend

- Comando actual: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- Health check: `GET /api/health` → `{"status":"ok"}`.
- `DATABASE_URL` controla SQLAlchemy/PostgreSQL.
- `SCHEMA_MANAGED_EXTERNALLY=true` debe estar activo en producción.
- Procedimiento futuro: ejecutar `alembic upgrade head` como paso previo controlado y después iniciar el backend.

### Frontend

- `npm ci` y `npm run build` funcionan con el lockfile actual.
- `VITE_API_URL` se inyecta durante el build.
- El fallback localhost se conserva únicamente para desarrollo.
- No se ha escrito ninguna URL productiva en el repositorio.

### Variables necesarias

Solo se enumeran nombres; no se guardan valores:

```text
DATABASE_URL
CORS_ORIGINS
PUBLIC_BASE_URL
SECURE_COOKIES
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
VITE_API_URL
```

## 6. Estado de decisiones de la usuaria

```text
PROVEEDOR: PENDIENTE DE CONFIRMACIÓN
REGIÓN: PENDIENTE
DOMINIO: PENDIENTE
PROVEEDOR SMTP: PENDIENTE
BASE DE DATOS: PENDIENTE
```

No se solicitan contraseñas, tokens ni connection strings por chat.

## 7. Tenant y administrador

No se creó tenant ni administrador. El flujo futuro será:

```text
PostgreSQL administrado
        ↓
Alembic upgrade head
        ↓
tenant confirmado
        ↓
python -m app.cli create-admin
        ↓
login y verificación
```

Administrador previsto:

```text
Nombre: Tiffany24630
Correo: sal24630@uvg.edu.gt
Rol: admin
Estado: no creado
```

La contraseña se introducirá interactivamente cuando exista producción confirmada.

## 8. Vulnerabilidad npm

Se ejecutó `npm audit --omit=dev --json` sin modificar dependencias.

- Paquete: `source-map-js`.
- Tipo: dependencia transitiva, no directa.
- Severidad reportada: **HIGH**.
- Rango afectado: `>=1.0.0 <1.2.2`.
- El informe indica actualización disponible.

Clasificación de esta fase: **P2 pendiente de revisión independiente**. No se ejecutó `npm audit fix` ni `npm audit fix --force`; no se mezcló una actualización de dependencias con la selección del proveedor.

## 9. Plan del primer despliegue — no ejecutado

1. Confirmar Render y región.
2. Crear el proyecto y servicios.
3. Crear PostgreSQL administrado y verificar backups/retención.
4. Configurar secretos y variables directamente en el proveedor.
5. Ejecutar `alembic upgrade head` contra esa base confirmada.
6. Desplegar backend y verificar `/api/health`.
7. Configurar `PUBLIC_BASE_URL`, `CORS_ORIGINS`, cookies HTTPS y SMTP.
8. Construir frontend con `VITE_API_URL` real.
9. Confirmar tenant.
10. Ejecutar `create-admin` de forma interactiva.
11. Verificar login, rol, correo, recuperación y aislamiento.
12. Documentar URLs reales sin secretos.

## 10. Protecciones y resultado

- No se crearon cuentas externas, infraestructura, bases, dominios ni secretos.
- No se ejecutaron migraciones externas ni `create-admin`.
- No se modificaron bases SQLite ni datos históricos.
- No se modificó `main` ni el historial Git.
- No se activó automatización de commits.
- No se creó ningún archivo específico de proveedor.

```text
INFRAESTRUCTURA: NO CREADA
PROVEEDOR: RECOMENDADO, PENDIENTE DE CONFIRMACIÓN
POSTGRESQL: NO CREADO
FRONTEND: NO DESPLEGADO
BACKEND: NO DESPLEGADO
TENANT: NO CREADO
ADMIN: NO CREADO
AUTOMATIZACIÓN: NO ACTIVADA
DOCUMENTACIÓN: LOCAL / NO SUBIDA
```
