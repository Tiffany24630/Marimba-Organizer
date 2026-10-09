# FASE 7G — CIERRE DE DESPLIEGUE, PRIMER ADMINISTRADOR Y PREPARACIÓN PRODUCTIVA

> Continúa `FASE_7F_INTEGRATION.md`. No contiene credenciales ni secretos.

---

## 1. Estado inicial

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` (sin cambios) |
| Modificados | 19 · No rastreados: 30 |

Cambios protegidos **intactos**: `optimizer.py` (+7), `test_unified_core.py` (+216).

---

## 2. Defecto crítico encontrado y corregido: CORS

**`CORSMiddleware` se importaba pero nunca se registraba en la aplicación.**

```python
from fastapi.middleware.cors import CORSMiddleware   # importado...
# ...y en ningún sitio: app.add_middleware(CORSMiddleware, ...)
```

Consecuencia: **ningún navegador podía llamar al backend**. El preflight
`OPTIONS` devolvía 405 y el login terminaba en `ERR_FAILED`. La aplicación era
inutilizable desde el navegador en cualquier despliegue.

Por qué nadie lo detectó: las 245 pruebas de API usan `TestClient`, que va al
mismo proceso y **no aplica CORS**. El fallo solo aparece con un navegador real.

**Corrección:** middleware registrado con `allow_credentials=True`
(obligatorio: la sesión viaja en cookie HttpOnly) y `allow_origins` tomado de
`settings.cors_origins`.

Regresión en `test_bootstrap_admin_7g.py`: comprueba que el middleware está
registrado y que el preflight responde 200 con las cabeceras correctas.

---

## 3. Primer administrador

### Mecanismo elegido: CLI (`python -m app.cli create-admin`)

| Alternativa descartada | Por qué no |
| ---------------------- | ---------- |
| Endpoint HTTP `/register-admin` | La API de administración crea **siempre** `role='user'` e ignora el `role` del cuerpo, aunque lo pida el admin. Añadir una ruta pública destruiría esa garantía. |
| Variables de entorno en el arranque | Crearía el admin en **cada** arranque, o exigiría marcarla como "ya hecha" dentro del entorno del proceso. |

La CLI se ejecuta cuando alguien lo decide, con el servidor parado si hace
falta, y no deja nada activo después.

### Garantías

| Garantía | Cómo |
| -------- | ---- |
| Clave hasheada | Reutiliza `password_problem` y `hash_password` |
| Contraseña nunca impresa | `getpass` o `--password-file`; el mensaje no la contiene (probado) |
| Idempotente | Repetir sobre un admin existente no crea otro |
| No promueve en silencio | Una cuenta normal **no** pasa a admin sin `--promover` |
| Atomicidad | Un solo `commit`: existe entero o no existe |
| Sin vía HTTP | No existe ninguna ruta; un usuario normal no puede invocarlo |

**Resultado: 15/15 pruebas** (creación, hash, login, `/auth/me`,
`/admin/users`, idempotencia, no promoción accidental, password-file, sin
secretos, CORS).

---

## 4. E2E de navegador

Playwright **ya era dependencia** (`playwright@1.63.0`); solo faltaba el
navegador. Se descargó Chromium (headless shell 153.0.8010.12). **No se añadió
`@playwright/test`**: se usa el runner nativo de Node.

### Verificado en navegador real (4/4) — `frontend/e2e/auth.e2e.cjs`

| Prueba | Resultado |
| ------ | --------- |
| Login válido: sesión creada | **OK** |
| Cookie de sesión `HttpOnly` | **OK** (`httpOnly=true`) |
| `SameSite=Lax` | **OK** |
| Token ausente de localStorage/sessionStorage | **OK** |
| Credenciales inválidas: sin sesión | **OK** |
| Sesión sobrevive a recargar | **OK** |
| Cierre de sesión bloquea el acceso posterior | **OK** (401) |

Estos tests **encontraron el defecto de CORS**: fallaban con `ERR_FAILED` hasta
corregirlo.

### Implementado pero NO verificado

`frontend/e2e/roles.e2e.cjs` cubre IDOR, lector, editor, revocación, SMTP y
responsive. **No se pudo ejecutar**: en este entorno el proceso Node muere sin
excepción (fallo nativo) al encadenar varios contextos de Chromium. Se deja
constancia explícita en lugar de declarar un resultado que no ocurrió.

---

## 5. SMTP de prueba

Se levantó **Mailpit** (`docker-compose.e2e.yml`): SMTP de pruebas que recibe
correos y **no los entrega a nadie**.

| Comprobación | Estado |
| ------------ | ------ |
| SMTP configurado y alcanzable | **IMPLEMENTADO** |
| Envío a una dirección real | **NUNCA** (Mailpit no entrega) |
| Recuperación con SMTP real | **NO VERIFICADO** (runner inestable) |
| `SMTP_HOST` vacío → error, no envío fingido | **VERIFICADO** |
| Recuperación en modo consola | **VERIFICADO en 7F (11/11)** |

---

## 6. Configuración

### `PUBLIC_BASE_URL`

Estaba **implícitamente** en `localhost:5173` (Vite en desarrollo). Un despliegue
en producción habría generado enlaces de recuperación **inservibles** y cookies
sin `Secure`.

Ahora `docker-compose.yml` lo declara con variable de entorno, y `config.py`
**avisa al arrancar** ante incoherencias:

| Situación | Aviso |
| --------- | ----- |
| URL que no es http(s) | ERROR |
| `https` con `SECURE_COOKIES=false` | WARNING |
| `MAIL_PROVIDER=smtp` sin `SMTP_HOST` | ERROR |
| `smtp` con `PUBLIC_BASE_URL` en localhost | ERROR |

No se hardcodea ninguna URL pública desconocida. `.env.example` documenta todo.

### Cookies / HTTPS

Comportamiento **probado**, sin cambios en la lógica:

| Escenario | `Secure` |
| --------- | -------- |
| `http://localhost` | `false` (desarrollo funciona) |
| `https://...` | `true` (producción) |
| Forzado por variable | se respeta |

**`Secure` en un despliegue HTTPS real: NO VERIFICADO** (no hay HTTPS aquí).

### `VITE_API_URL`

El bundle se compilaba siempre contra `http://localhost:8000/api`; en un
despliegue el navegador apuntaría al localhost del visitante. Ahora
`frontend/Dockerfile` acepta `ARG VITE_API_URL`.

---

## 7. Checklist

| Requisito | Estado |
| --------- | ------ |
| Primer admin | **COMPLETADO Y VERIFICADO** (15/15) |
| Playwright | **INSTALADO** (ya lo era; falta el navegador, descargado) |
| Login E2E | **VERIFICADO EN NAVEGADOR REAL** |
| Logout E2E | **VERIFICADO EN NAVEGADOR REAL** |
| Recuperación E2E (SMTP real) | **NO VERIFICADO** |
| Owner / Editor / Reader E2E | **NO VERIFICADO** |
| IDOR / Readonly E2E | **NO VERIFICADO** |
| Export PNG / masivo real | **NO VERIFICADO** |
| Responsive | **NO VERIFICADO** |
| Accesibilidad | **NO VERIFICADO** |
| SMTP de test | **IMPLEMENTADO** (Mailpit levantado) |
| HTTPS / `Secure` cookie | **NO VERIFICADO** (sin HTTPS) |
| `PUBLIC_BASE_URL` | **COMPLETADO Y VERIFICADO** |
| CORS (defecto crítico) | **CORREGIDO Y VERIFICADO** |
| Backup productivo | **NO EJECUTAR** |
| Migración productiva | **NO EJECUTAR** |
| Datos productivos | **NO MODIFICAR** |

---

## 8. Migración productiva: **NO EJECUTADA**

No se conectó a producción ni se ejecutó migración alguna. El procedimiento de
`FASE_7F_INTEGRATION.md` §11 sigue vigente, con una **novedad de 7G**: ahora
existe una forma segura de crear el primer administrador tras aplicarla
(`python -m app.cli create-admin`), que antes no existía.

Orden recomendado tras la migración: definir `MIGRATION_USER_PASSWORD` →
arrancar (crea el usuario normal y asigna los 65 proyectos) →
`python -m app.cli create-admin --email ...` → verificar 65/9.

---

## 9. Regresión

| Suite | Resultado |
| ----- | --------- |
| Backend (`python -m pytest -q`) | **260 passed**, 0 failed, 0 skipped |
| Frontend (`npm test`) | **67 passed**, 0 failed, 0 skipped |
| TypeScript (`npx tsc --noEmit`) | **PASS** |
| Build (`npm run build`) | **PASS**, 192 módulos, 2.64 s |

+15 pruebas backend respecto a 7F (245 → 260). Durante la fase se detectó y
corrigió **contaminación entre pruebas**: los admins creados por los tests de 7G
rompían `test_no_se_puede_dejar_sin_administradores_activos`. Se resolvió con un
fixture `autouse` que limpia el dominio `@prueba.local` tras cada prueba.

---

## 10. Producción

```
PRODUCCIÓN MODIFICADA:              NO
MIGRACIÓN PRODUCTIVA EJECUTADA:     NO
DATOS PRODUCTIVOS MODIFICADOS:      NO
USUARIOS CREADOS EN PRODUCCIÓN:     NO
```

Todo se ejecutó contra el proyecto Docker aislado `marimba7f` y su volumen
`marimba7f_db_data`. No se ejecutó `down -v` ni se tocaron volúmenes ajenos.

Los **65 proyectos y 9 plantillas de producción no se comprobaron**: no se
accedió a esa base.

---

## 11. Pendientes

### VERIFICADO
Corrección de CORS, primer administrador, `PUBLIC_BASE_URL`, coherencia de
configuración, cookies `Secure` (lógica), SMTP sin host, E2E de autenticación.

### NO VERIFICADO (implementado, sin ejecutar)
E2E de roles/IDOR/reader/editor/revocación, E2E de SMTP real, responsive,
accesibilidad, exportación PNG, HTTPS.

### BLOQUEADO
Pruebas E2E que abren varios contextos de Chromium: el proceso Node muere sin
excepción en este entorno.

### PENDIENTE DE AUTORIZACIÓN
Migración productiva (respaldo verificado + 65/9 + autorización).
