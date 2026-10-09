# FASE 9H — AUDITORÍA FINAL DE PENDIENTES Y DEFINICIÓN DEL SIGUIENTE BLOQUE

> Fase de auditoría sin implementación. Sin commits, push, merges ni cambios de
> rama. RAMA: `checkpoint/fase1-motor-d1-d3-d5`,
> HEAD `3253c2a92b21d8a88919116048b92815a04b1e50`.
> **Cero cambios de producto**: solo documentación (§14).

## 1. Estado de Git (precheck obligatorio)

```text
branch = checkpoint/fase1-motor-d1-d3-d5          ✓
HEAD   = 3253c2a92b21d8a88919116048b92815a04b1e50 ✓
git diff --stat: 27 files changed, 2731 insertions(+), 197 deletions(-)
```

- Los 27 archivos `M` son el trabajo acumulado 7C–9G **sin commitear**
  (preexistente a 9H). El incremento respecto al registro de 9F (2695
  inserciones) corresponde a la propia implementación 9G sobre ficheros
  tracked, ya documentada en su fase.
- **Archivos protegidos intactos** (diff exacto al precheck):
  - `backend/app/services/suggestions/optimizer.py` → 7 líneas (compat D5,
    preexistente).
  - `backend/tests/test_unified_core.py` → 216 líneas de diff (214+/2−,
    preexistente).
  - `backend/app/cli.py` → sin diff (fichero sin trackear, no modificado).
- Sin commits, push, merge ni cambio de rama en 9H.

## 2. Baseline actual (confirmado al cierre de 9G-R5)

```text
Backend  (pytest)   : 334 tests, baseline vigente
Frontend (npm test) : 210 tests, baseline vigente
TypeScript          : OK (npx tsc --noEmit exit 0)
Build               : OK
E2E completa        : 90/90 passed (corrida de confirmación 9G-R5)
                      run #1: 89/90 con 1 flake documentado de versiones9c
                      (triangulado: aislada 2/2 + run #2 90/90)
axe                 : 0 infracciones (5 vistas + aserción en caducidad9g)
Docker              : 29.7.2 / compose marimba7f 4/4 Up / localhost:18080 → 200
```

9H **no repitió ninguna suite** (§12 del encargo): al no existir cambios de producto, el
baseline anterior permanece vigente sin reejecutarlo.

## 3. Funcionalidades 9B–9G (revisión de documentos contra el código)

| Fase | Función | Estado | Evidencia verificada en esta auditoría |
| --- | --- | --- | --- |
| 9B | Inventario de producto y priorización | COMPLETADA | `FASE_9B_PRODUCT_INVENTORY.md`; §4–§7 contrastados con código (este documento) |
| 9C | Versiones persistidas de composición | COMPLETADA | `models.py:272-300` (`CompositionVersion`, UNIQUE, docstring), `routes.py:690-830` (rutas, `_append_version` con retry, 404 uniforme, auditoría), `VersionHistory.tsx`, `test_versiones_9c.py` (18), E2E `versiones9c` |
| 9D | Vista de ensayo / impresión | COMPLETADA | `RehearsalView.tsx`, `lib/rehearsal.ts`, `@media print`, 15 unitarias + 3 E2E; sin backend nuevo (decisión documentada) |
| 9E | Enlace público read-only | COMPLETADA | `public_routes.py` (token por huella, 404 uniforme, proyección blanqueada), `PublicComposition.tsx`, `test_enlace_publico_9e.py` (21+2 de 9F), E2E `publico9e` 4/4 |
| 9F | Auditoría de seguridad post-9E | COMPLETADA | `FASE_9F_AUDITORIA_POST_9E.md` §3–§11 contrastados con código en 9H; +2 tests de aislamiento |
| 9G | Caducidad del enlace + cierre E2E | COMPLETADA | `expires_at` (`models.py:239-241`), `_expirado`/`_parse_expires_at` (`public_routes.py:45-70`), migración idempotente (`main.py:285-292`), `PublicLinkPanel`, `test_caducidad_9g.py` (14), `caducidad9g.test.cjs` (7), E2E `caducidad9g` 4/4, cierre en `FASE_9G_CIERRE_E2E.md` (§16–§17) |

**Ninguna de 9C–9G se reabrió ni se reimplementó.** Los cinco bloques están
cubiertos, verificados y documentados.

## 4. Clasificación de pendientes reales

Categorías: **A** bug real · **B** deuda técnica real · **C** mejora funcional ·
**D** decisión consciente · **E** deuda de verificación.

| Pendiente | Evidencia | Categoría | Riesgo | Valor | Acción |
| --- | --- | --- | --- | --- | --- |
| Ningún bug reproducible detectado | suites verdes (§2); `git grep TODO/FIXME` → 6 falsos positivos (`todo_9h.txt`), idénticos a 9F | — | — | — | **cero bugs (A vacía)** |
| `POST /api/suggestions` sin consumidor frontend | `routes.py:967`; `suggest()` declarada *legacy* en `services/suggestions/__init__.py:4,13`; consumen 2 tests (`test_suggestions.py:271,445`); 0 usos en `api.ts` | D (9F §10: "Se conserva") | bajo | bajo | **cerrar** (conservar; retirada solo en fase futura con ajuste de tests) |
| `GET /api/songs/{song_id}` sin consumidor frontend | `routes.py:882`; consumen tests (`test_collab_7d.py:253` → 200, `test_api.py:239` → 404); `api.ts` solo usa PATCH/DELETE de esa ruta | D (9F §10: "Se conserva") | bajo | bajo | **cerrar** (igual que arriba) |
| Flake de `versiones9c.spec.ts` (carrera de diálogo) | run #1 9G-R5: `Page.handleJavaScriptDialog: Not attached…` (`e2e_full_out.txt`); aislada 2/2; run #2 90/90 (`e2e_full2_out.txt`) | E (flakiness de test, no del producto) | bajo | medio | **diferir**: endurecer el manejo del diálogo solo si se repite |
| Lector de pantalla real / UIA del editor | 9F §7, 8F, 9E §1: `NO VERIFICADO` / `NO MEDIDO` por limitación del entorno | E | bajo | medio | **cerrar** (no reabrir sin entorno real) |
| Pan libre / selección directa Konva | 9B §7, 9F §9.1-2; alternativas accesibles verificadas; contratos cerrados 7Q–8C | D | alto (si se toca) | medio | **cerrar** |
| `Ctrl+Z` dentro de INPUT → undo nativo; textos sin tilde | 9B §7, 9F §9.6 | D | bajo | bajo | **cerrar** |
| Enlaces sin caducidad | **Resuelto en 9G** (`expires_at`, tests 14+7+4) | D → cerrada | — | — | **cerrar**; puntero histórico añadido en 9F (§14) |
| Sin PDF backend (impresión = `window.print()`) | 9D §3, 9F §9.5 | D | bajo | bajo | **cerrar** (reabrir solo por petición explícita) |
| Listado de enlaces activos del propietario | 9F §12 (prioridad media); hoy solo `GET /compositions/{cid}/public-link` unitario | C | bajo | **alto** | **hacer** → P1 (§9) |
| Rate-limit específico en `GET` público | 9E §14.5 y 9F §12 como mejora; hoy la defensa es la entropía (32 bytes) | C (hardening) | medio | medio | **diferir** → P2 (§9) |
| Migración de producción pendiente | `FASE_7F_INTEGRATION.md` §11 (histórico); 9H no toca producción | D (operativa, fuera de alcance) | — | — | **cerrar aquí** |
| HTTPS/TLS no verificable en el entorno | 7I: entorno sin TLS | E | bajo | bajo | **cerrar** (limitación de entorno) |
| README no documenta las rutas 9C/9E/9G | `README.md` solo lista endpoints de sugerencias/plantillas | C (documental) | bajo | bajo | **diferir** → P3 (§9) |
| Cita imprecisa en 9B (`engine_a.py:3` "legacy") | la declaración real está en `services/suggestions/__init__.py:4,13` | C (documental, histórica) | bajo | bajo | **diferir** → P3; no se edita 9B (histórico) |

**No apareció ningún elemento de tipo A.** No hay evidencia reproducible de
comportamiento incorrecto en ninguna funcionalidad de 9B–9G.

## 5. Deudas conscientemente cerradas (NO reabrir)

Tal y como fija el encargo de 9H, estas cuestiones **no se convierten en tareas
nuevas** solo por aparecer en documentos históricos:

1. **Accesibilidad**: lector de pantalla real no verificado; NVDA/JAWS no
   disponibles; UIA del editor no medida; limitaciones gráficas de Konva;
   selección directa sobre Konva cuando existen alternativas accesibles.
   La documentación distingue correctamente `DOM/Playwright ≠ axe ≠ UIA ≠
   lector real`. **No se afirma que se haya verificado un lector real.**
2. **Canvas**: pan libre y selección directa Konva — sin evidencia nueva de
   defecto funcional crítico, no se implementan.
3. **Ctrl+Z en inputs**: comportamiento documentado (undo nativo), sin
   refactorización de historial.
4. **Textos sin acentos**: convención existente, sin cambio por estilo.
5. **Backend**: no se reejecuta la suite completa solo para repetir baseline.
6. **9F §9 completa** (pan, Konva, lector/UIA, sin caducidad → ya resuelta en
   9G, sin PDF, Ctrl+Z/acentos, huérfanos conservados).
7. **9B §6/§7** y **9B Top-5 histórico** — ya ejecutados o clausulados.

## 6. Endpoints potencialmente huérfanos auditados

Método: búsqueda en `frontend/src` (`api.ts`, componentes, páginas), E2E,
tests de backend, documentación (README, FASE_9A/9B/9F), rutas duplicadas y
contratos dependientes.

| Endpoint | Uso frontend | Uso tests | Uso docs | Clasificación |
| --- | --- | --- | --- | --- |
| `POST /api/suggestions` | **ninguno** (`api.ts` no lo referencia) | **sí**: `test_suggestions.py:271` y `:445` | 9B/9F lo documentan como huérfano | **LEGACY CONSERVABLE** |
| `GET /api/songs/{song_id}` | **ninguno** (la UI consume `PATCH`/`DELETE` de esa ruta y el listado `GET /projects/{pid}/songs`) | **sí**: `test_collab_7d.py:253` (200), `test_api.py:239` (404) | 9B/9F lo documentan como huérfano | **LEGACY CONSERVABLE** |

- **No son `USADO` por el producto** (cero consumidores frontend).
- **No son `CANDIDATO A ELIMINACIÓN` en esta fase**: ambos tienen tests que
  fijan su contrato (incluido el aislamiento 7C → 404) y 9F §10 ya decidió
  **conservarlos**. Eliminarlos exige ajustar tests — fuera de 9H.
- **Rutas duplicadas**: no existen. `POST /suggestions` (legacy puro, sin BD)
  es distinto de `GET /songs/{id}/suggestions` (flujo real por plantillas).
- **Consumidores externos**: ninguno; solo los expone Swagger.
- **Recomendación documentada (no ejecutada)**: retirar ambos o documentarlos
  como API legacy de tests en una fase futura de higiene, ajustando en el mismo
  cambio los 4 call sites de test. No eliminar por parecer muertos.

## 7. Seguridad y persistencia (revisión conceptual, sin modificar código)

### Versiones (9C)

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Lectura según permisos | OK | `list_versions`/`get_version` → `readable_composition` (`routes.py:775-801`) |
| Creación restringida | OK | `create_version` → `owned_composition` + `check_csrf` (`routes.py:784-785`) |
| Restore restringido | OK | ruta restore con `owned`+`check_csrf` (`routes.py:805-807`), tests 9C |
| Inmutabilidad | OK | sin PATCH/PUT/DELETE de versiones (test 405); `_snapshot_valido` antes de restaurar |
| `version_number` monotónico | OK | `UNIQUE(composition_id, version_number)` en base + retry `_append_version` |
| Snapshot autocontenido | OK | `_snapshot_of` = `name/width/height/data` |
| Versión ajena a la URL | OK | `_version_de` filtra por composición → 404 indistinguible |
| Borrado de composición | OK | FK CASCADE + ORM `versions` `cascade='all, delete-orphan'` (`models.py:261-262`) |
| Auditoría | OK | `COMPOSITION_VERSION_CREATED` en crear/restaurar |

### Enlaces públicos (9E/9G)

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Token no derivado del ID | OK | `secrets.token_urlsafe(32)` (`new_token()` sin argumentos) |
| Solo hash almacenado | OK | `token_hash` SHA-256; en claro solo en la respuesta del POST |
| Token no en auditoría | OK | `record_audit` sin `details` con token (`public_routes.py:134,152`) |
| 404 uniforme | OK | inválido/revocado/expirado/borrado → mismo 404 `'Enlace no válido.'` (`public_routes.py:182-192`); test 9F `revocado.json()==inexistente.json()` |
| Revocación | OK | `revoked_at` con timestamp; no borra nada; solo owner + CSRF |
| Reactivación token nuevo | OK | `UNIQUE(composition_id)`; el anterior queda inválido (test 9E) |
| Aislamiento entre composiciones | OK | test 9F (mismo nombre a propósito; se distingue por `project_name`) |
| Respuesta pública mínima | OK | `name/width/height/data/song_name/project_name`; sin IDs, usuarios, versiones, auditoría ni `expires_at` |
| Expiración | OK | `_expirado` UTC aware (`_aware` corrige naive de SQLite); `expires_at` nullable → enlaces 9E intactos |
| Frontera de expiración | OK | `<= now` → 404; POST pasado/ahora → 422; tests 9G deterministas sin `sleep` |
| Sin enumeración | OK | sin `GET /api/public/…` sin token; sin listado público |
| Administración | OK | `ACCESS_OWNER`: editor/reader/ajeno → 404 |

### Persistencia

| Elemento | Estado | Nota |
| --- | --- | --- |
| Composición | OK | JSON `data`; FK `project` CASCADE, `song` SET NULL |
| Versiones | OK | UNIQUE en base; `created_by_user_id` SET NULL (conservar el dato histórico); sin borrado por API |
| Enlaces | OK | `UNIQUE(composition_id)`; CASCADE ORM + FK (en SQLite lo cubre el ORM); `revoked_at`; `expires_at` nullable + index |
| Expiración: SQLite vs PostgreSQL | OK | `DateTime(timezone=True)`; comparaciones UTC con `_aware`; migración idempotente `_migrate_public_link_expiry()` (`main.py:285-292`: solo `ALTER ADD COLUMN` si falta, ambos motores, nunca destructiva); enlaces 9E existentes quedan en `NULL` |
| Auditoría | OK | `record_audit` al crear/revocar/versionar; **jamás** en el `GET` público |
| Ownership / cascade | OK | 404 de recurso ajeno en todas las rutas nuevas (7C); cascada song→compositions→versions/links |
| Referencias huérfanas | OK | test 9E `link is None` tras borrar la composición; versiones caen con la composición |
| Producción / datos históricos | **NO TOCADOS** | sin migraciones productivas, sin `DELETE`/`DROP`/`TRUNCATE`/`down -v` |

## 8. Coherencia de la documentación 9B–9G

- **9B**: actualizado tras 9F con descriptores históricos (Top-5 y
  recomendación marcados como ejecutados) — coherente; §7 confirma los tres
  pendientes ya implementados en 9C/9D/9E.
- **9C / 9D / 9E / 9G-caducidad**: estados `COMPLETADA` coherentes con tests y
  código; los baselines citados son los de su época y están etiquetados.
- **9G-cierre**: cabecera `9G — COMPLETADA` con §16–§17 (R4/R5); el §15 refleja
  el estado de R3 → **puntero histórico añadido** (§14).
- **9F**: §9.4 listaba "enlaces sin caducidad" como decisión vigente y §13
  recomendaba la caducidad → implementada en 9G → **punteros históricos
  añadidos** (§14).
- **9G-caducidad §5**: citaba el cuerpo del 404 público como
  `{"detail":"No existe."}`; el endpoint devuelve
  `{"detail":"Enlace no válido."}` (`public_routes.py:182-192`) → **cita
  corregida** (§14). La propiedad esencial (indistinguibilidad) era y es
  correcta: los tests comparan cuerpos entre sí, no el texto.
- **Imperfecciones conocidas, no editadas** (históricas, sin contradicción
  funcional): la cita `engine_a.py:3` de 9B (la declaración *legacy* real está
  en `services/suggestions/__init__.py:4,13`); README sin catálogo de rutas
  9C/9E/9G (P3 del §9).

## 9. Ranking de prioridades

### P0 — crítico

**Ninguno.** No hay bugs reproducibles (categoría A vacía), ni deuda de
seguridad/persistencia con evidencia, ni regresiones: E2E 90/90, axe 0,
backend/frontend verdes (§2).

### P1 — alto: listado de enlaces públicos activos del propietario

- **Problema**: el propietario solo puede consultar el enlace composición a
  composición (`PublicLinkPanel`); no existe una vista agregada de "qué tengo
  publicado, caducado o revocado". Tras 9G (caducidad) el usuario puede poner
  fechas, pero no auditar la exposición total.
- **Evidencia**: 9F §12 lo lista como candidato ("prioridad media: listado de
  enlaces activos del propietario"); en el catálogo actual solo existe
  `GET /compositions/{cid}/public-link` (unitario, por composición).
- **Beneficio**: cierra la historia de seguridad de 9C–9G (crear, caducar,
  revocar existían; **auditar** no). Alto valor, aditivo.
- **Riesgo de implementación**: bajo — endpoint de solo lectura nuevo +
  tabla/panel nuevo; no toca contratos cerrados (`composition.ts`, `Numero`,
  `Inspector`, `AccessibleEditor`, `layout.ts`) ni archivos protegidos.
- **Dependencias**: ninguna (usa modelos y permisos ya existentes).
- **Impacto en datos**: cero escrituras; solo lectura.
- **Tests necesarios**: backend (owner ve los suyos, ajeno → 404/vacío,
  estados activo/expirado/revocado), frontend unitario de la vista, E2E nuevo
  + aserción axe si hay UI nueva.

### P2 — medio

**a) Rate-limit específico en el `GET` público**
- *Problema*: no hay límite de intentos contra tokens; la defensa actual es la
  entropía (32 bytes url-safe). *Evidencia*: 9E §14.5 y 9F §12 lo dejan como
  mejora; código actual sin limiter. *Beneficio*: hardening frente a fuerza
  bruta y ruido de logs. *Riesgo*: medio — un límite agresivo podría afectar
  E2E o visitantes legítimos tras reintentos. *Dependencias*: decidir política
  (por IP/ventana). *Datos*: cero. *Tests*: unit del limiter + E2E sin falsos
  positivos.

**b) Endurecer el manejo de diálogos en `versiones9c.spec.ts`**
- *Problema*: flake no determinista de carrera con `handleJavaScriptDialog`
  (run #1 de 9G-R5). *Evidencia*: `e2e_full_out.txt`; triangulado con aislada
  2/2 y run #2 90/90. *Beneficio*: suite determinista. *Riesgo*: solo test
  (producto intacto). *Dependencias*: solo si se repite. *Datos*: cero.
  *Tests*: repetir la suite completa tras el ajuste.

### P3 — bajo / opcional

- **Higiene de endpoints huérfanos** (retirar o documentar
  `POST /api/suggestions` y `GET /api/songs/{song_id}`): 9B Top-5 #4 (valor 1,
  riesgo 1); *beneficio* marginal; *riesgo* bajo pero exige ajustar 4 tests;
  *datos* cero; *acción*: fase documental futura, no eliminar ya (§6).
- **Catálogo de API en README** (rutas 9C/9E/9G ausentes): *beneficio*
  documental; *riesgo* cero; *tests* no aplican.
- **PDF backend y vista por canción** (9F §12 mejoras): *beneficio* solo si el
  producto los pide; decisión actual `window.print()` vigente; no reabrir por
  defecto.
- **Cita `engine_a.py:3` en 9B**: corrección menor, opcional (histórico).

## 10. Recomendación — siguiente bloque

```text
SIGUIENTE FASE RECOMENDADA:
Auditoría de enlaces públicos activos (listado para el propietario)

Motivo:
Es el único candidato con valor funcional claro y documentado en el repositorio
(9F §12) que 9C–9G NO implementaron. Completa el arco de seguridad del enlace
público (crear/caducar/revocar ✓ — auditar qué está expuesto ✗), es aditivo,
de solo lectura, sin tocar contratos cerrados, archivos protegidos ni datos.

Alcance sugerido:
- Backend: un GET de solo lectura (owner) que liste los enlaces de las
  composiciones de proyectos propiedad del usuario, con proyecto, composición,
  creada, caducidad y estado (activa/expirada/revocada).
- Frontend: vista o sección accesible (label + axe 0) para consultar y
  revocar desde ahí; sin tocar composition.ts, Numero, Inspector,
  AccessibleEditor ni layout.ts.
- Tests: backend (permisos, aislamiento, estados), frontend unit, E2E nuevo
  con aserción axe; documentación de fase y actualización de 9F §12 como
  histórico.

No incluir:
- eliminación de endpoints huérfanos; rate-limit público (P2, aparte);
  pan/selección Konva; PDF backend; multi-enlace; refactor de store;
  modificación de archivos protegidos; reabertura de deudas de accesibilidad;
  commits, push ni migraciones de producción.
```

**Alternativa explícita** (declarada por exigencia del encargo): si el
producto no considera prioridad esta función, la alternativa honesta es
`NO CREAR NUEVA FUNCIONALIDAD TODAVÍA` y realizar una fase específica de
planificación/producto — porque **no existe ningún bug o deuda P0/P1 que exija
código**. No se inventan requisitos para justificar una fase.

## 11. Tests ejecutados en 9H

**Ninguna suite reejecutada** (§12 del encargo): 9H no modificó producto, solo
documentación, así que el baseline de §2 permanece vigente sin repetirse.

Única comprobación nueva: `git grep -E "TODO|FIXME|HACK|XXX|not implemented|coming soon"
-- backend/app frontend/src` → **6 coincidencias, todas falsos positivos**
(palabras "TODO/TODOS" en comentarios en español; `todo_9h.txt`), idénticas a
las registradas en 9F §9. **Cero deuda de marcadores nueva.**

Si apareciera un bug real (no ocurrió): reproducir → demostrar → corregir
mínimamente → regresiones → documentar.

## 12. Protección de datos y de entorno

```text
Producción:            NO ACCEDIDA
PostgreSQL real:       NO CONECTADO
Migraciones productivas: NO EJECUTADAS
Datos históricos:      NO TOCADOS (sin DELETE/DROP/TRUNCATE/reseed)
Volúmenes Docker:      INTACTOS (sin down -v, prune ni reset)
Entorno E2E:           marimba7f sin tocar (no hizo falta levantar nada)
Comandos prohibidos:   NO USADOS (git reset/clean/restore, docker prune, etc.)
```

## 13. Criterios de aceptación

- [x] Branch y HEAD confirmados (`checkpoint/fase1-motor-d1-d3-d5` / `3253c2a…`).
- [x] Integridad de archivos protegidos confirmada (`optimizer.py` 7 líneas,
      `test_unified_core.py` 216, `cli.py` sin diff).
- [x] Inventario 9B revisado (documento completo, incluidos §6–§8).
- [x] 9C–9G revisados (documentos + código + tests; §3).
- [x] Pendientes reales clasificados con categorías A–E (§4).
- [x] Bugs distinguidos de mejoras y decisiones conscientes (A vacía).
- [x] Endpoints potencialmente huérfanos auditados y clasificados (§6).
- [x] Seguridad y persistencia de 9C–9G revisadas sin modificar (§7).
- [x] Deudas históricas no reabiertas sin evidencia (§5).
- [x] Sin cambios funcionales innecesarios (cero cambios de producto).
- [x] `FASE_9H_AUDITORIA_FINAL.md` creado (este documento).
- [x] Ranking P0/P1/P2/P3 presente (§9).
- [x] Recomendación concreta para el siguiente bloque (§10).
- [x] Git en el mismo branch/HEAD al finalizar (§14).
- [x] Sin operaciones destructivas (§12).

## 14. Cambios realizados en 9H

1. **Creado** `FASE_9H_AUDITORIA_FINAL.md` (este documento).
2. **Cuatro ediciones mínimas de coherencia documental** (nada de producto):
   - `FASE_9F_AUDITORIA_POST_9E.md` §9.4 → puntero histórico: la caducidad se
     implementó en 9G.
   - `FASE_9F_AUDITORIA_POST_9E.md` §13 → puntero histórico: recomendación
     ejecutada en 9G.
   - `FASE_9G_CIERRE_E2E.md` §15 → puntero histórico: superado por 9G-R4/R5
     (§16–§17).
   - `FASE_9G_PUBLIC_LINK_EXPIRATION.md` §5 → cita del cuerpo del 404 público
     corregida a `{"detail":"Enlace no válido."}` (coincide con
     `public_routes.py:182-192`).
3. **Evidencias temporales** (sin trackear, al estilo de fases anteriores):
   `todo_9h.txt`, `9b_mid.txt`, `9f_mid.txt` (extractos de lectura).
4. **Sin** commits, push, merge, cambio de rama, cambios de producto, tests
   reejecutados ni operaciones destructivas.

## 15. Estado final

```text
FASE 9H → COMPLETADA
SIGUIENTE BLOQUE → Auditoría de enlaces públicos activos (P1, §10)
                   — pendiente de aprobación explícita; NO se continúa
                   automáticamente.
```





