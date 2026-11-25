# Marimba Organizer

Aplicación de organización de puestos de marimba.

## Arquitectura

- Web: Vercel, proyecto `frontend/`, Vite.
- API: Render, `backend/`, FastAPI en Docker.
- Base de datos: Neon PostgreSQL mediante `DATABASE_URL` en Render.
- Rate limit: Render Key Value/Redis mediante `REDIS_URL`.
- Android: Expo/EAS en `mobile/`; editor táctil y acceso a la web Vercel.
- Escritorio: Electron en `electron/`; carga la web Vercel por HTTPS.

Vercel proxifica `/api/*` hacia Render con `frontend/vercel.json`, conservando un origen único para las cookies HttpOnly. No pongas secretos en variables `VITE_*` o Expo.

## Neon

1. Pulsa **Create project**.
2. En **Connect**, selecciona **Pooled connection**.
3. Copia la cadena completa, conservando `sslmode=require`. Será `DATABASE_URL` en Render y nunca debe subirse a GitHub.

## Render: API como Web Service

Este proyecto se publica manualmente como **Web Service**, no como Blueprint. El archivo `render.yaml` ya no es necesario.

Primero crea el servicio **Key Value** y después el Web Service de la API. Para evitar errores de contexto, usa esta combinación exacta: **Root Directory** vacío; **Dockerfile Path** `backend/Dockerfile`; **Docker Context Directory** `backend`. No pongas `backend` también en Root Directory. Completa además **Name** `marimba-organizer-api`; **Runtime** `Docker`; **Build Command** vacío; **Start Command** vacío; **Health Check Path** `/health`; **Plan** el que necesites.

En **Environment Variables** coloca:

| Key | Value |
| --- | --- |
| `APP_ENV` | `production` |
| `SCHEMA_MANAGED_EXTERNALLY` | `true` |
| `SECURE_COOKIES` | `true` |
| `DATABASE_URL` | cadena pooled de Neon |
| `PUBLIC_BASE_URL` | URL final de Vercel |
| `CORS_ORIGINS` | URL final de Vercel, sin `/` final |
| `RATE_LIMIT_STORE` | `redis` |
| `REDIS_URL` | URL interna del Key Value de Render |
| `MAIL_PROVIDER` | `smtp` |
| `SMTP_HOST` | host SMTP |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | usuario SMTP |
| `SMTP_PASSWORD` | contraseña SMTP |
| `SMTP_USE_TLS` | `true` |
| `MAIL_FROM` | remitente verificado |

No uses comillas. Verifica `https://<api>.onrender.com/health`. En un Shell seguro de Render crea el primer administrador:

```powershell
python -m app.cli create-admin --email admin@tu-dominio.com --name Administrador
```

En producción `/docs` está deshabilitado.

## Vercel: web

En **Add New > Project**, importa el repositorio y rellena: **Root Directory** `frontend`; **Framework Preset** `Vite`; **Build Command** `npm run build`; **Output Directory** `dist`; **Install Command** `npm ci`.

En variables de **Production** y **Preview** añade `VITE_API_URL=/api` y `VITE_DEPLOY_ENV=production`. Si el dominio Render no es `marimba-organizer-api.onrender.com`, cambia el `destination` de `frontend/vercel.json` antes de desplegar. Después copia el dominio Vercel en `PUBLIC_BASE_URL` y `CORS_ORIGINS` de Render y reinicia Render.

Prueba `https://<vercel>/api/health`, login, creación de proyecto, Excel y enlace público.

## Android

```powershell
cd mobile
npm ci
npm install -g eas-cli
eas login
eas build:configure
```

En `mobile/eas.json`, reemplaza `https://marimba-organizer.vercel.app` por el dominio Vercel real y ejecuta `eas build --platform android --profile production`. Prueba localmente con `$env:EXPO_PUBLIC_WEB_URL="https://<tu-proyecto>.vercel.app"; npx expo start`. No agregues `DATABASE_URL`, SMTP, Redis ni contraseñas a Expo.

## Electron

```powershell
cd frontend
npm ci
npm run build
cd ..\electron
npm ci
$env:ELECTRON_APP_URL="https://<tu-proyecto>.vercel.app"
npm run dist:win
```

El instalador queda en `electron/dist`. Electron usa sandbox, aislamiento de contexto, `nodeIntegration=false`, navegación restringida y CSP sin scripts inline.

## Validación y seguridad

```powershell
cd backend; python -m pytest tests -q
cd ..\frontend; npx tsc -b --force; npm test; npm run build
cd ..; python scripts/preflight_production.py
```

La API exige PostgreSQL, migraciones Alembic, HTTPS, cookies HttpOnly, CSRF, CORS explícito, aislamiento por proyecto, hashes de tokens públicos, rate limit distribuido y headers de seguridad en producción. Activa 2FA en GitHub/Vercel/Render/Neon, rota credenciales de prueba y configura backups de Neon.
