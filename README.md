# Marimba Organizer

Organizador de puestos de marimba con importación de Excel, proyectos, composiciones visuales, colaboración y enlaces públicos de solo lectura.

## Arquitectura de producción

| Parte | Servicio | Configuración |
| --- | --- | --- |
| Frontend web | Netlify | `frontend/`, Vite, proxy `/api` |
| API | Render | `backend/`, FastAPI + Docker |
| Base de datos | Neon | PostgreSQL mediante `DATABASE_URL` |
| Rate limit público | Render Key Value/Redis | `REDIS_URL` |
| Android | Expo/EAS | `mobile/`, abre el frontend publicado |
| Escritorio | Electron | `electron/`, carga el frontend HTTPS |

La aplicación usa cookies HttpOnly para la sesión y un token CSRF separado para las escrituras. El frontend productivo llama a `/api`; Netlify lo proxifica hacia Render, por lo que el navegador mantiene un origen único.

## Desarrollo local

Requisitos: Python 3.12+, Node.js 22+, npm y una base PostgreSQL o SQLite local.

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:APP_ENV="development"
$env:DATABASE_URL="sqlite:///./marimba.db"
uvicorn app.main:app --reload --port 8000
```

En otra terminal:

```powershell
cd frontend
npm ci
$env:VITE_API_URL="http://localhost:8000/api"
npm run dev
```

Web: `http://localhost:5173`. API y Swagger: `http://localhost:8000/docs`. Para ejecutar el cliente Android de prueba: `cd mobile; npm ci; npm run android`.

## Publicar la base de datos en Neon

1. Crea un proyecto en Neon y copia la cadena de conexión pooled.
2. Usa el formato `postgresql://...` o `postgresql+psycopg://...` y conserva `sslmode=require`.
3. No subas la cadena al repositorio ni la pongas en ninguna variable `VITE_*`.
4. En Render, guarda esa cadena como `DATABASE_URL`.

Las migraciones se ejecutan antes de arrancar la API con `alembic upgrade head`. Para preparar manualmente una base:

```powershell
cd backend
$env:DATABASE_URL="postgresql+psycopg://USUARIO:CONTRASENA@HOST/neondb?sslmode=require"
python -m alembic upgrade head
```

## Publicar la API en Render

1. Sube el repositorio a GitHub.
2. En Render elige **New Blueprint** y selecciona el repositorio. `render.yaml` crea la API y un almacén Key Value para el rate-limit.
3. Si creas el servicio manualmente, usa raíz `backend`, Dockerfile `backend/Dockerfile` y deja que Render inyecte `PORT`.
4. Configura las variables productivas indicadas en `render.yaml`: `APP_ENV=production`, `SCHEMA_MANAGED_EXTERNALLY=true`, `SECURE_COOKIES=true`, `DATABASE_URL`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `RATE_LIMIT_STORE=redis`, `REDIS_URL`, `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_USE_TLS=true` y `MAIL_FROM`.
5. Cambia `marimba-organizer-api.onrender.com` en `netlify.toml` y `frontend/public/_redirects` si escoges otro nombre de servicio.
6. Verifica `https://<api>.onrender.com/health` y luego `https://<api>.onrender.com/docs`.
7. Crea el primer administrador desde una consola segura de Render: `python -m app.cli create-admin --email admin@tu-dominio.com --name Administrador`.

La contraseña se solicita sin guardarla en el repositorio.

## Publicar el frontend en Netlify

1. En Netlify importa el mismo repositorio.
2. `netlify.toml` ya define base `frontend`, comando `npm ci && npm run build`, publicación `dist` y `VITE_API_URL=/api`.
3. Sustituye en `netlify.toml` y `frontend/public/_redirects` el host de Render por el real.
4. Publica y copia el dominio final de Netlify en `PUBLIC_BASE_URL` y `CORS_ORIGINS` de Render.
5. Comprueba login, creación de proyecto, importación de Excel y un enlace público. La ruta `/api/health` debe devolver `{"status":"ok"}`.

No pongas secretos en `VITE_*`: todas esas variables quedan embebidas en JavaScript público.

## Android con Expo/EAS

La app Android incluye el editor táctil y exportación PNG. Para abrir la aplicación completa publicada desde el dispositivo, define la URL del frontend:

```powershell
cd mobile
$env:EXPO_PUBLIC_WEB_URL="https://<sitio-netlify>.netlify.app"
npm ci
npx expo start
```

Para un APK/AAB con EAS: `npm install -g eas-cli`, `eas login`, `eas build:configure` y `eas build --platform android --profile production`. Configura `EXPO_PUBLIC_WEB_URL` como variable pública del perfil de EAS. No incluyas `DATABASE_URL`, SMTP, Redis ni credenciales en Expo.

## Electron para Windows

Electron carga exclusivamente la aplicación HTTPS de Netlify y no expone APIs de Node al renderer.

```powershell
cd frontend
npm ci
npm run build
cd ..\electron
npm install
$env:ELECTRON_APP_URL="https://<sitio-netlify>.netlify.app"
npm run dist:win
```

El instalador queda en `electron/dist`. Para desarrollo usa `npm start` con `ELECTRON_APP_URL` definida. La ventana solo permite navegar dentro del origen de Netlify; los enlaces externos se abren en el navegador del sistema.

## Pruebas y revisión de seguridad

```powershell
cd backend
python -m pytest tests -q
cd ..\frontend
npx tsc -b --force
npm test
npm run build
cd ..
python scripts/preflight_production.py
```

Controles incluidos: PostgreSQL obligatorio en producción, migraciones externas antes del servidor, cookies Secure/HttpOnly/SameSite, CSRF, CORS explícito, aislamiento por propietario y colaborador, tokens públicos almacenados como huella, rate-limit distribuido, headers HTTP de seguridad, CSP en Netlify, validación de URLs de producción, no exposición de secretos al bundle y Electron con `contextIsolation`, `sandbox` y `nodeIntegration=false`.

Antes de abrir al público rota cualquier credencial usada durante pruebas, activa 2FA en GitHub/Netlify/Render/Neon, limita el usuario SMTP, configura copias de seguridad de Neon y revisa los logs de Render. El resultado de una prueba local no sustituye una verificación contra los dominios desplegados.
