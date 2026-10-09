# FASE 9I — Listado agregado de enlaces públicos del propietario

## 1. Objetivo

El propietario puede auditar sus enlaces públicos desde una vista agregada
(panel de proyectos), sin entrar composición por composición: qué
composiciones tiene publicadas, qué enlaces están activos, cuáles expiraron
y cuáles fueron revocados. Funcionalidad de **lectura y auditoría**; reutiliza
autorización, ownership, expiración y revocación ya existentes (9E/9G).

## 2. Diseño

- Sin cambio de esquema: se reutiliza `PublicCompositionLink`.
- Estado **derivado**, no almacenado (revocado > expirado > activo).
- Sin token en el listado: el token en claro solo existe al crearlo; la lista
  guarda solo su huella. Por decisión documentada (§6) no hay «abrir / copiar»
  ni «revocar» en el listado.
- Sin paginación/filtros/búsqueda: la escala real es de un puñado de enlaces.
- Orden estable `created_at DESC, id DESC`.

## 3. Endpoint

`GET /api/public-links` (router `public_routes`, prefijo `/api`, coherente con
`GET /api/public/compositions/{token}`).

- Autenticado (`require_user` → 401 sin sesión). GET de solo lectura: sin CSRF
  (como el resto de GET de la API).
- Respuesta: lista JSON de objetos con el contrato exacto de seis campos:
  `project_name`, `composition_name`, `created_at`, `expires_at`,
  `revoked_at`, `status`.
- Fechas en ISO-8601 con zona (`_aware` → UTC). `expires_at = null` = sin
  caducidad (convención 9G).

## 4. Autorización

Aislamiento **en la consulta**: `JOIN Composition → Project` con filtro
`Project.owner_id == user.id`. Un usuario solo ve enlaces de proyectos donde es
propietario; editor/reader/ajeno no ven nada ajeno. Sin nueva jerarquía de
roles ni cambios en el ownership.

## 5. Estados

Derivados con la semántica UTC de 9G, reutilizando `_aware`/`_expirado` del
mismo módulo (cero duplicación):

- `revoked_at != null` → `revoked` (precedencia sobre expiración).
- `revoked_at == null` y `expires_at <= now` → `expired`.
- En otro caso → `active`.
- Frontend: `Activa` / `Expirada` / `Revocada`; `expires_at == null` →
  «Sin caducidad» (convención 9G existente).

## 6. Decisión sobre la URL pública

Los botones «Abrir / Copiar / Compartir» quedan **fuera**: el token solo se
almacena como huella y el claro únicamente existe en la respuesta de creación.
No se inventó reconstrucción ni segunda representación del token. La URL se
sigue mostrando solo en `PublicLinkPanel` (flujo 9E/9G, sin cambios) y el
listado lo indica con una nota de auditoría.

## 7. Frontend

- `frontend/src/lib/publicLinks.ts`: `estadoLabel`, `fechaAuditoria`,
  `esItemEnlace` (guard de contrato cerrado), tipo `ItemEnlace`.
- `frontend/src/components/PublicLinksList.tsx`: tabla semántica (`caption`,
  `scope="col"`) con columnas Proyecto / Composición / Estado / Creado /
  Caducidad; tres fases excluyentes: carga (`role="status"`), error
  (`role="alert"` + «Reintentar»), vacío («No tienes enlaces públicos.»).
- `frontend/src/lib/api.ts`: `publicLinksList: () => req('/public-links')`.
- `Dashboard.tsx`: sección «Enlaces públicos» con botón
  «Ver mis enlaces» / «Ocultar listado» (`aria-expanded`); el listado se monta
  y carga solo al abrirlo. Sin navegación nueva.
- Estilos `.pl-table` + `.visually-hidden` en `styles.css`. Al cerrar se
  corrigió además un `@media print` mal anidado que `vite build` señalaba
  como warning; sin cambio visual.

## 8. Tests

- Backend `backend/tests/test_listado_enlaces_9i.py` (14 tests): B01 propietario
  ve sus enlaces; B02 aislamiento A/B; B03 composición sin enlace no aparece;
  B04/B05 activo; B06 expirado; B07 revocado; B08 revocado+expirado → revoked;
  B09 editor/lector/ajeno no ven; 401 sin sesión; B10 contrato exacto sin
  secretos; B11 UTC naive; B12 composición borrada sin huérfanos; orden estable.
- Frontend `frontend/tests/enlaces9i.test.cjs` (14 tests 9I-01…9I-14): rótulos,
  fechas, guard de contrato, y análisis de fuente (estilo 7D/9G) para api.ts,
  fases carga/error/vacío, tabla accesible, ausencia de mutaciones y montaje en
  Dashboard.
- E2E `frontend/e2e/specs/enlaces-publicos9i.spec.ts` (4 tests): activa /
  expirada / revocada + «Sin caducidad»; axe=0 en test propio acotado a la
  sección (`.include`, patrón de `dialogos.spec.ts`); aislamiento del editor;
  estado vacío explícito (no «cargando»). Nombres únicos por ejecución
  (`unico`), porque el listado agregado conserva filas de ejecuciones previas.

## 9. E2E

Spec específico 9I (convención existente), solo entorno `marimba7f`
(`http://localhost:18080`). Datos creados por API en cada test (nombres únicos),
sin depender de producción. Incluye espera de expiración real (2 s, patrón 9G) y
`expect.poll` sobre el endpoint individual.

## 10. Axe

`axe = 0` violaciones sobre la vista (Dashboard con listado abierto) dentro del
propio spec 9I. Tabla con `caption` y `scope="col"`, botón con `aria-expanded`,
mensajes con `role="status"`/`role="alert"`. No equivale a lector real (deuda
histórica cerrada, no reabierta).

## 11. Seguridad

- Sin token ni huella ni ids/secretos en la respuesta (test B10 + guard
  `esItemEnlace` de contrato cerrado).
- GET autenticado de solo lectura; el filtro por propiedad no revela existencia
  ajena. Sin CSRF en GET (convención existente); sin rutas nuevas mutables.
- Revocación NO duplicada: sigue en `PublicLinkPanel` + `DELETE
  /compositions/{id}/public-link` (9E/9G, con CSRF + ownership + auditoría).

## 12. Compatibilidad con 9E/9F/9G

Sin cambios en contratos 9E/9G: creación, consulta pública, expiración y
revocación intactos. El listado reutiliza `_aware`/`_expirado` sin duplicarlos.
Regresión E2E 9E/9G incluida en la verificación final.

## 13. Cambios

- `backend/app/api/public_routes.py`: `GET /public-links` (+ import `User`).
- `frontend/src/lib/api.ts`: `publicLinksList`.
- `frontend/src/lib/publicLinks.ts` (nuevo),
  `frontend/src/components/PublicLinksList.tsx` (nuevo).
- `frontend/src/pages/Dashboard.tsx`: sección «Enlaces públicos».
- `frontend/src/styles.css`: `.pl-table`, `.visually-hidden`, corrección de
  `@media print` mal anidado (warning de build, sin cambio visual).
- `backend/tests/test_listado_enlaces_9i.py` (nuevo, 14 tests).
- `frontend/tests/enlaces9i.test.cjs` (nuevo, 14 tests).
- `frontend/e2e/specs/enlaces-publicos9i.spec.ts` (nuevo, 4 tests).

## 14. Baseline

- Backend: suite completa `pytest` (incluye 14 nuevos 9I).
- Frontend: `npm test` 224 pass; `tsc --noEmit` OK; `vite build` OK.
- E2E 9I: 4/4 + axe 0; regresión 9E/9G 8/8 sin cambios.
- Docker `marimba7f` 4/4 Up; frontend E2E `localhost:18080` HTTP 200.

## 15. Git

Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a` conservado. Sin
`commit/push/merge/checkout/reset/clean/restore`. Archivos protegidos no
tocados por 9I (`store/composition.ts`, `Numero.tsx`, `Inspector.tsx`,
`AccessibleEditor.tsx`, `lib/layout.ts`, `services/suggestions/optimizer.py`,
`tests/test_unified_core.py`, `cli.py`).

## 16. Limitaciones y siguiente recomendación

- El listado no permite abrir/copiar/revocar (imposible sin el token en claro;
  por diseño, no deuda técnica).
- Sin paginación/filtros (suficiente a la escala actual).
- Recomendación (P2, solo si reaparece necesidad): rate-limit del GET público;
  el flake de `versiones9c.spec.ts` se registra por separado si reaparece, sin
  modificación preventiva. No iniciar 9J automáticamente.
