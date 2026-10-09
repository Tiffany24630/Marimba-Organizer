# FASE 9F — AUDITORÍA INTEGRAL POST-9E

> Continúa `FASE_9E_PUBLIC_LINK.md`. Sin commits, push, merges ni cambios de
> rama. RAMA: `checkpoint/fase1-motor-d1-d3-d5`,
> HEAD `3253c2a92b21d8a88919116048b92815a04b1e50`.

## 1. Estado general

```text
COMPLETADA
```

> **¿Existe alguna corrección obligatoria antes de continuar?**
> **NO — producto estable; puede comenzar el siguiente bloque.**

| Aspecto | Resultado |
| --- | --- |
| Backend `pytest -q` | **320 passed** (318 de 9E + 2 nuevos de auditoría 9F) |
| Frontend `npm test` | **203 passed / 0 failed** |
| `npx tsc --noEmit` | **exit 0**, sin salida |
| `npm run build` | **exit 0**, `✓ built` (200 módulos, 3.05 s) |
| E2E ronda 1 | **86/86 passed**, 0 failed (~6 min) |
| axe (página pública + editor) | **0 infracciones**, sin reglas desactivadas |
| Protegidos (`optimizer.py`, `test_unified_core.py`, `cli.py`) | intactos |
| Contratos cerrados (`composition.ts`, `Numero`, `Inspector`, `AccessibleEditor`, `layout.ts`) | **sin tocar** |
| Producción / PostgreSQL real / datos históricos | **NO TOCADOS** |

## 2. Estado Git

- Rama: `checkpoint/fase1-motor-d1-d3-d5`. HEAD: `3253c2a…4b1e50` (idéntico).
- Sin commits, push, merge ni cambio de rama en toda la fase.
- `git diff --stat` inicial: 27 archivos, 2695 inserciones / 197 borrados
  (trabajo acumulado 7C–9E sin commitear; preexistente a 9F).
- Diffs protegidos idénticos al inicio y al final:
  - `optimizer.py`: solo el compat D5 (`same_position` en `cost_fn`).
  - `test_unified_core.py`: solo aislamiento de plantillas + regresión D-compat.
  - `cli.py`: **sin diff** (vacío).
- 9F no modificó ningún archivo de producción. Añadió 2 tests de auditoría a
  `backend/tests/test_enlace_publico_9e.py` (aislamiento A/B;
  indistinguibilidad de 404) + este documento.

## 3. Auditoría de seguridad pública

| Caso | Resultado | Evidencia |
| --- | --- | --- |
| Token criptográfico (`secrets.token_urlsafe(32)`) | OK | `security.new_token()`; test longitud ≥ 32 |
| Token NO derivado de `composition_id` | OK | `new_token()` sin argumentos; `test_el_id_no_sirve_de_token` |
| Solo se almacena hash SHA-256 | OK | `token_fingerprint`; hash ≠ token, 64 hex |
| Token en claro no aparece en base | OK | solo `token_hash` en el modelo |
| Token no aparece en logs/auditoría | OK | `'token' not in details`; `public_routes.py` nunca lo loguea |
| Token incorrecto → 404 | OK | tests 9E de token inexistente |
| Token revocado → 404 | OK | `test_al_revocar_el_enlace_muere_de_inmediato` |
| Revocado indistinguible de inexistente | OK | **nuevo test 9F**: `revocado.json()==inexistente.json()` |
| Sin ruta de listado/enumeración | OK | ningún `GET /api/public/…` sin token |
| Reactivar genera token nuevo, anterior muere | OK | `test_revocar_y_reactivar_entrega_un_token_nuevo` |
| Borrar composición → 404 + sin fila huérfana | OK | `test_si_se_borra_la_composicion…` (`link is None` en base) |
| `UNIQUE(composition_id)` respetado | OK | modelo + `IntegrityError → 409` |

## 4. Auditoría de autorización

| Actor | Crear | Revocar | Consultar público |
| --- | --- | --- | --- |
| owner | Sí | Sí | Sí, con URL |
| editor | No (404) | No (404) | Sí, con URL |
| reader | No (404) | No (404) | Sí, con URL |
| usuario sin acceso | No (404) | No (404) | No |
| sin sesión | No | No | Sí, solo con token |

Evidencia: `test_el_propietario_crea_el_enlace`, `test_el_editor_no_puede_publicar`,
`test_el_lector_no_puede_publicar`, `test_un_ajeno_no_puede_administrar_lo_de_otro`,
tests públicos con `logout(client)`. La administración exige `check_csrf` +
`ACCESS_OWNER` en servidor; la UI solo lo refleja. Los 404 son deliberados
(convención `deps.py`: no revelar existencia ajena).

## 5. Auditoría de aislamiento

| Caso | Resultado | Evidencia |
| --- | --- | --- |
| A no administra el enlace de B | OK | test de ajeno → 404 en crear/revocar/estado |
| Enlace de A nunca devuelve B | OK | **nuevo test 9F** (mismo nombre de composición a propósito; se distingue por `project_name`) |
| `version_id` nunca expuesto | OK | respuesta construida campo a campo; sin `version` |
| Sin `id`/`composition_id`/`project_id`/`owner_id`/`user`/`created_by` | OK | `test_lo_publico_es_solo_lo_justo` (ausencia uno a uno) |
| Sin usuarios internos | OK | `ver_publico` nunca toca `User` |
| Sin historial de versiones | OK | `CompositionVersion` ni importado en `public_routes.py` |
| Sin auditoría/admin | OK | `record_audit` solo en crear/revocar (privadas), jamás en el `GET` público |

## 6. Regresión

| Comando | Resultado real | Interpretación |
| --- | --- | --- |
| `cd backend && python -m pytest -q` | **320 passed in 39.95 s** | Verde. 318 de 9E + 2 nuevos de 9F. Ningún test degradado. |
| `cd frontend && npm test` | **203 passed / 0 failed** | Verde, idéntico a 9E. |
| `cd frontend && npx tsc --noEmit` | **exit 0**, sin salida | Verde. |
| `cd frontend && npm run build` | **exit 0**, `✓ built in 3.05 s`, 200 módulos | Verde. Aviso preexistente de chunk > 500 kB (informativo). |
| E2E ronda 1 `npx playwright test` | **86 passed**, 0 failed (~6 min) | Verde. Sin flakies: no hizo falta ronda 2/3 (el criterio exigía repetir solo ante comportamiento sospechoso). |
| axe | **0 infracciones** | En `publico9e` (página pública) y resto de specs con chequeo. Sin reglas desactivadas ni skips. |

- E2E contra el entorno aislado `marimba7f` existente. **Nunca `down -v`**,
  volúmenes intactos.
- Nota de proceso: la terminal interactiva de Windows no devolvía salida
  directa; todo se verificó por volcado a `%TEMP%` + lectura (`9f_pytest.txt`,
  `9f_npm.txt`, `9f_e2e.txt`, `9f_build2.txt`, `9f_tsc2.txt`). Un intento de
  `npm run build` falló por sintaxis `;` de bash en `cmd.exe`
  (`Could not resolve entry module ";/index.html"`), no por el código;
  reejecutado con sintaxis Windows pasó en 3.05 s.

## 7. Accesibilidad

- axe automatizado: **0 violaciones** (página pública incluida).
- DOM/E2E: cubierto (`accesible`, `dialogos`, `geometria`, `teclado`, `publico9e`).
- UIA del editor: **NO MEDIDO** (se mantiene la salvedad).
- Lector de pantalla real: **NO VERIFICADO** (no hay lector en el entorno;
  axe/DOM/Playwright no equivalen a uno real). Se mantiene explícitamente.

## 8. Inventario actualizado (base 9B + código/tests/docs)

| Área | Estado | Evidencia |
| --- | --- | --- |
| Importación Excel | IMPLEMENTADO | `ImportPanel.tsx`, `/imports/*` |
| Canciones / Personas / Puestos / Plantillas | IMPLEMENTADO | `Project.tsx`, `PersonPanel.tsx`, `/positions`, `MarimbaPanel` |
| Editor / Asignación / Undo-redo sesión | IMPLEMENTADO | `CanvasEditor.tsx`, `applyAssign`, `composition.ts` (memoria) |
| Historial persistente | IMPLEMENTADO (9C) | `CompositionVersion`, `/versions`, `VersionHistory.tsx` |
| Sugerencias / Distribución / Requisitos | IMPLEMENTADO | `SuggestionsPanel`, `DistributionPanel`, `RequirementsPanel` |
| Colaboración / Roles / Admin / Recuperación | IMPLEMENTADO | `SharePanel`, `require_*`, `AdminScreen`, `auth_routes.py` |
| Vista de ensayo / Impresión | IMPLEMENTADO (9D) | `RehearsalView.tsx`, `window.print()` + `@media print` |
| Enlace público | IMPLEMENTADO (9E, auditado 9F) | `public_routes.py`, `PublicComposition.tsx`, este informe |
| Exportación PNG | IMPLEMENTADO | `lib/export.ts` |
| Accesibilidad | PARCIAL (axe 0; lector real no verificado) | §7 |
| Pan libre / Selección Konva directa | DEUDA CONSCIENTE | alternativas funcionales; tocan contratos cerrados |

## 9. Deudas conscientes (solo justificadas)

1. **Pan libre** y 2. **Selección directa Konva** — no implementar sin rediseño
   de `layout.ts` / `composition.ts` (contratos cerrados).
3. **Lector de pantalla real / UIA** — limitación de verificación, no tarea inferible.
4. **Enlaces sin caducidad / multi-enlace / listado / rate-limit específico** —
   decisiones de producto, no bugs. Defensa actual: entropía (32 bytes). *(Histórico 9H: la caducidad se implementó en 9G — `FASE_9G_PUBLIC_LINK_EXPIRATION.md`; multi-enlace, listado y rate-limit siguen como mejoras pendientes.)*
5. **Sin PDF backend** — impresión es `window.print()` (decisión 9D/9E).
6. **Documentado**: `Ctrl+Z` dentro de INPUT; textos sin tilde por convención.
7. **Huérfanos 9B** (`POST /api/suggestions`, `GET /api/songs/{song_id}`):
   siguen sin consumidor frontend (§10). Se conservan.

`git grep TODO|FIXME|HACK|XXX|DEPRECATED` en `backend/app` + `frontend/src`:
6 resultados, todos **falsos positivos** (palabra TODO dentro de comentarios en
español: "con TODO el historial", "TODOS los usuarios", "de TODO el backend",
"validar TODO primero", "se oculta TODO lo que no es la vista").
**Cero deuda real nueva** de 9C/9D/9E. Coincide con 9B.

## 10. Revisión de API (actualiza auditoría 9B de 58 rutas)

- Rutas 9C (`POST/GET /compositions/{id}/versions`,
  `POST /compositions/{id}/versions/{vid}/restore`): **consumidas por
  frontend** (`api.compositionVersions/create/restore` + `VersionHistory.tsx`)
  y por E2E (`versiones9c.spec.ts`). Activas y verificadas.
- Rutas 9E (`POST/DELETE/GET /compositions/{cid}/public-link`,
  `GET /public/compositions/{token}`): **consumidas por frontend**
  (`PublicLinkPanel.tsx`, `PublicComposition.tsx`) y por E2E
  (`publico9e.spec.ts`, 4 tests). Activas y auditadas (§3–§5).
- `GET /api/songs/{song_id}`: **sigue huérfano** (frontend solo usa
  PATCH/DELETE de esa ruta). Se conserva.
- `POST /api/suggestions`: **sigue huérfano** (el flujo real usa
  `propose-on-composition` + `apply-assignments` / `distribution/apply`).
  Se conserva.
- Resto del catálogo 9B: sin cambios. **No se elimina ningún endpoint en 9F.**

## 11. Concurrencia y persistencia (estática + tests)

- Versiones: `version_number` monotónico por composición (UNIQUE de base, no
  solo código); snapshot autocontenido e inmutable (sin ruta de
  modificación/borrado); restaurar crea versión nueva con el estado previo.
  Evidencia: `models.py`, `routes.py`, `test_versiones_9c.py`.
- Enlaces: `UNIQUE(composition_id)` en base + `409` ante carrera;
  revocar+crear genera token nuevo (anterior inválido); borrado en cascada
  ORM + FK (`public_links` en `Composition`); sin enumeración (sin listado;
  token de 32 bytes url-safe).
  Evidencia: `models.py:191-237`, `public_routes.py:53-80`, tests 9E + 2 de 9F.

## 12. Candidatos siguientes (sin implementar)

- **Prioridad alta**: caducidad opcional de enlaces públicos (TTL + UI +
  migración; el esquema actual documenta que no existe).
- **Prioridad media**: listado de enlaces activos del propietario;
  documentación/retirada de huérfanos (`POST /api/suggestions`,
  `GET /api/songs/{song_id}`).
- **Mejoras**: rate-limit específico en `GET` público; PDF backend;
  vista por canción.
- **Deudas conscientes (no tocar sin rediseño)**: pan libre, selección Konva
  directa, lector de pantalla real.

## 13. Recomendación — un único siguiente bloque

> **Histórico 9H:** recomendación ejecutada en 9G (caducidad implementada y
> verificada; ver `FASE_9G_PUBLIC_LINK_EXPIRATION.md` y `FASE_9G_CIERRE_E2E.md`).
>
> **Caducidad opcional de enlaces públicos.**

**Por qué.** Es la única limitación honesta de 9E que afecta a la **seguridad
operativa en el tiempo** (un enlace vale para siempre hasta revocación
manual). Todo lo demás está verificado y estable (§6), y las alternativas
(pan/selección Konva) rozan contratos cerrados con riesgo alto y valor medio.
La caducidad es aditiva, localizada en `public_routes.py` +
`PublicCompositionLink` + `PublicLinkPanel`, y no toca ningún archivo
protegido ni contrato cerrado. **No implementada en 9F.**

## 14. Datos

```text
Producción: NO TOCADA
PostgreSQL real: NO CONECTADO
Datos históricos: NO TOCADOS
Migraciones de producción: NO EJECUTADAS
Volúmenes históricos: INTACTOS
```

Tests contra SQLite local (backend) y entorno aislado `marimba7f` (E2E).

