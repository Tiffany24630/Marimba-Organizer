# FASE 9E — Enlace público de solo lectura

> Continúa `FASE_9D_REHEARSAL_PRINT.md`. Sin commits, push, merges ni cambios de
> rama. RAMA: `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a`.

## 1. Estado general

| Aspecto | Resultado |
| --- | --- |
| Backend `pytest -q` | **318 passed** (297 de 9C/9D + 21 nuevos de 9E) |
| Frontend `npm test` | **203 passed / 0 failed** (193 + 10 nuevos de 9E) |
| `npx tsc --noEmit` | **exit 0**, sin salida |
| `npm run build` | **exit 0**, `✓ built` (200 módulos) |
| E2E spec nuevo `publico9e` | **4/4 passed** |
| E2E suite completa | 86 tests (82 de 9D + 4 nuevos) — ver §6 |
| axe en la página pública | **0 infracciones** (dentro de `publico9e`, sin desactivar reglas) |
| Lector de pantalla | **NO VERIFICADO** (no hay Lector de Pantallas en el entorno) |
| Archivos protegidos (`optimizer.py`, `test_unified_core.py`, `cli.py`) | intactos |
| Contratos cerrados (`Numero`, `Inspector`, `AccessibleEditor`, `composition.ts`, `layout.ts`) | sin tocar |

## 2. Qué es (y qué no es)

Un **enlace URL que cualquiera puede abrir sin cuenta** para CONSULTAR una
composición guardada. No es colaboración (eso es 7D: roles sobre un proyecto
con sesión); aquí no hay usuario, ni sesión, ni invitación: hay un token opaco
que quien lo tiene, lo ve.

```
https://<frontend>/public/compositions/<token>   →  página de solo lectura
```

## 3. Decisiones de seguridad

- **Solo se persiste la HUELLA** del token (`SHA-256`, convención ya usada por
  `Session` y `PasswordResetToken`). Si la tabla se filtra, no permite leer
  ninguna composicion: faltaría el token en claro, que solo existe en la
  respuesta del `POST` que lo crea.
- **Token con `secrets.token_urlsafe(32)`** (`security.new_token`), nunca
  derivado de `composition_id`. Un token adivinable convertiría la feature en
  un listado público.
- **`UNIQUE(composition_id)`**: UN enlace activo por composición. Reactivar
  genera token NUEVO, invalidando el anterior (compartido antes de revocar).
- **`revoked_at` con timestamp**: revocar no borra (se sabe cuándo) y NUNCA
  destruye la composición ni el historial de versiones de 9C.
- **Borrado en cascada**: si se borra la composición, la fila del enlace
  desaparece. El `ondelete='CASCADE'` de la FK no basta en SQLite (sin
  `PRAGMA foreign_keys` no se aplica), así que se añadió además la relación
  ORM `Composition.public_links` con `cascade='all, delete-orphan'`, el mismo
  patrón que ya usaba `versions` en 9C. Un test fallido antes de añadirla lo
  demuestra.
- **404 uniforme**: token inexistente, revocado, o de composición borrada →
  MISMA respuesta 404, sin detalles. Convención de `deps.py` (no 403, que
  confirmaría existencia).
- **Administración solo propietario** (`ACCESS_OWNER`): un `editor` puede
  editar la composición, pero NO publicarla. Se comprueba en servidor; la
  interfaz solo lo refleja.
- **`GET` público sin `require_user` ni `check_csrf`**: sirve justo para quien
  no tiene sesión, y un `GET` no muta. Los otros tres endpoints sí exigen
  sesión + cabecera anti-CSRF.
- **Respuesta blanqueada**: `name`, `width`, `height`, `data`, `song_name`,
  `project_name`. Nada de `User`, ni `id`/`project_id`/`owner_id`, ni token, ni
  el historial de versiones de 9C.
- **Auditoría** `PUBLIC_LINK_CREATED` / `PUBLIC_LINK_REVOKED` vía
  `record_audit` (best-effort, con `entity_type='composition'`; el token jamás
  entra en `details`).

## 4. Cómo está montado

### Backend
| Archivo | Cambio |
| --- | --- |
| `backend/app/models/models.py` | modelo `PublicCompositionLink` + relación `Composition.public_links` (ORM cascade) |
| `backend/app/api/public_routes.py` | **nuevo** — router aparte, deliberadamente: permisos distintos de `routes.py` |
| `backend/app/main.py` | import + `app.include_router(public_router, prefix='/api')` |
| `backend/tests/test_enlace_publico_9e.py` | **nuevo** — 21 pruebas |

Rutas: `POST/DELETE/GET /api/compositions/{cid}/public-link` (propietario) y
`GET /api/public/compositions/{token}` (público).

### Frontend
| Archivo | Cambio |
| --- | --- |
| `src/lib/publicLink.ts` | **nuevo** — `parsePublicPath` / `publicUrl` (puras) |
| `src/lib/api.ts` | 4 métodos (1 público + 3 de administración) |
| `src/components/PublicLinkPanel.tsx` | **nuevo** — crear / copiar / revocar |
| `src/pages/PublicComposition.tsx` | **nuevo** — la página pública |
| `src/App.tsx` | la ruta pública se decide ANTES de comprobar la sesión |
| `src/pages/Project.tsx` | panel montado en «Paneles», solo `owner` |
| `src/components/RehearsalView.tsx` | `onClose` y `kicker` ahora opcionales (9D intacto) |
| `src/styles.css` | estilos `.pub-*` y `.link-*` |
| `frontend/nginx.conf` + `Dockerfile` | **nuevo** — `try_files … /index.html` (SPA fallback) |

Ubicación de la UI: **panel lateral** (sección «Paneles»), jamás en la barra
del editor — allí cualquier botón nuevo rompe la confirmación por `blur` de
`Numero` (regresión documentada en 9C/9D).

La página pública reutiliza la **proyección de la vista de ensayo (9D)**:
HTML semántico, sin store editable, imprimible. El lienzo Konva NO se
reutiliza porque arrastra el store de edición.

## 5. Cómo probar

```bash
# Backend (SQLite local)
cd backend && python -m pytest -q                     # 318
python -m pytest tests/test_enlace_publico_9e.py -q    # 21

# Frontend
cd frontend
npm test                                               # 203
npx tsc --noEmit && npm run build                      # 0 / 0

# E2E (entorno aislado reconstruido con el código nuevo)
docker compose -p marimba7f -f docker-compose.yml -f docker-compose.7f.yml \
  -f docker-compose.e2e.yml up -d --build
npx playwright test publico9e --reporter=list          # 4
npx playwright test --reporter=list                    # 86
```

## 6. Resultados de verificación

| Comando | Resultado |
| --- | --- |
| `pytest -q` (backend completo) | **318 passed** en 35 s |
| `pytest test_enlace_publico_9e.py` | **21 passed** |
| `npm test` | **203 passed / 0 failed** |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **exit 0** |
| Smoke entorno: API pública / nginx SPA / raíz / `auth/me` | **404 / 200 / 200 / 401** |
| `playwright test publico9e` | **4 passed** (incluye axe 0 y los negados) |
| Ronda E2E 1 (86 tests) | **86 passed** (3.6 min), 0 failed |
| Ronda E2E 2 (86 tests) | **86 passed** (3.8 min), 0 failed |
| Ronda E2E 3 (86 tests) | **86 passed** (3.8 min), 0 failed |

## 7. Limitaciones honestas

1. **Sin caducidad del enlace**: no se pidió; añadirla sería decisión de
   producto. Mientras nadie lo revoque, el enlace vale para siempre.
2. **Un solo enlace activo por composición** (por `UNIQUE`). Para rotar la URL
   hay que revocar y crear otro; no conviven dos tokens.
3. **La URL solo se muestra AL CREARLA**: en base solo vive su huella. Si se
   pierde, la interfaz lo dice y ofrece revocar+crear (el anterior muere).
   No existe ninguna ruta que "vuelva a mostrar" el enlace.
4. **No hay listado de enlaces activos** en el producto: no existe un
   `GET` que liste todos (a propósito: menos superficie para enumerar).
5. **Sin límite de intentos específico** en el `GET` público: la defensa es la
   entropía del token (32 bytes). No hay rate-limit global en el proyecto.
6. **No exporta PDF**: la impresión es `window.print()` del navegador (mismo
   camino que 9D).
7. **La vista pública no es el lienzo espacial**, sino la proyección de la
   ensayo (quién dónde, vacantes, sueltas). Ver §4.
8. **Lector de pantalla: NO VERIFICADO** — se mantiene la salvedad de todas
   las fases. axe automatiza parte, no sustituye.

## 8. Cierre

- [x] Rondas E2E 1, 2 y 3 completas: **86/86 en las tres** (3.6 / 3.8 / 3.8 min).
- [x] `pytest` (318), `npm test` (203/0), `tsc` (0), `build` (0), verificados de
      nuevo tras todos los cambios.
- [x] git: sin commits, rama sin cambiar, HEAD `3253c2a`.
