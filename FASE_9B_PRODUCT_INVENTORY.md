# FASE 9B — INVENTARIO DE PRODUCTO Y PRIORIZACIÓN

## 1. Estado general

```text
COMPLETADA
```

Inventario basado en lectura del código y de la documentación existente. **No se
implementó nada, no se modificó ningún archivo y no se ejecutó ninguna suite.**

## 2. Baseline (no repetido en 9B)

```text
FRONTEND — 8F: 178 unitarias · 77/77 E2E × 2 · axe 0 · tsc OK · build OK
BACKEND  — 9A: 279/279 · health OK · 58 rutas
```

## 3. Inventario funcional

| Área | Funcionalidad | Estado | Evidencia | Pendiente real |
| --- | --- | --- | --- | --- |
| Proyecto | Crear en blanco / renombrar / borrar | IMPLEMENTADO | `Dashboard.tsx`, `api.ts:27-31` | no |
| Proyecto | Buscar y filtrar | IMPLEMENTADO | `lib/search.ts`, `Dashboard` | no |
| Importación | Excel: preview + confirmación | IMPLEMENTADO | `ImportPanel.tsx`, `/imports/*` | no |
| Importación | Incremental sobre proyecto existente | IMPLEMENTADO | `ImportPanel.tsx:24-26` | no |
| Importación | Repeticiones: aviso y descarte | IMPLEMENTADO | `README.md:20-25` | no |
| Canciones | CRUD y orden | IMPLEMENTADO | `Project.tsx:443-447`, `api.ts:80-83` | no |
| Personas | CRUD, renombrar, quitar con alcance | IMPLEMENTADO | `PersonPanel.tsx`, `api.ts:32-43` | no |
| Posiciones | Catálogo | IMPLEMENTADO | `/positions`, `api.ts:39` | no |
| Marimbas | Plantillas CRUD | IMPLEMENTADO | `MarimbaPanel`, `api.ts:39-42` | no |
| Composición | Lienzo, mover, rotar, escalar | IMPLEMENTADO | `CanvasEditor.tsx` | no |
| Composición | Añadir puestos y personas | IMPLEMENTADO | `Inspector.tsx:237-239` | no |
| Composición | Bloqueo / solo lectura | IMPLEMENTADO | `elementLocked`, `readonly7e` | no |
| Composición | Asignar / desasignar | IMPLEMENTADO | `applyAssign` | no |
| Composición | Guardar composición | IMPLEMENTADO | `Project.tsx:271-275` | no |
| Composición | Duplicar | IMPLEMENTADO | `api.ts:79` | no |
| Composición | Notas / etiquetas | IMPLEMENTADO | `NoteEditor.tsx` | no |
| Composición | Exportar PNG | IMPLEMENTADO | `lib/export.ts`, `exportacion.spec.ts` | no |
| Composición | Exportación masiva | IMPLEMENTADO | `MassExport.tsx`, `masiva.spec.ts` | no |
| Historial | Deshacer / rehacer de sesión | IMPLEMENTADO | `composition.ts:253-259` (memoria; 9C conserva además el estado previo al restaurar) | no |
| Historial | **Versiones guardadas en servidor** | IMPLEMENTADO (9C) | modelo `CompositionVersion`, rutas `/compositions/{id}/versions`, `VersionHistory.tsx` | no |
| Sugerencias | Sugerencias por plantilla | IMPLEMENTADO | `SuggestionsPanel.tsx` | no |
| Sugerencias | Distribución por canción | IMPLEMENTADO | `DistributionPanel.tsx` | no |
| Sugerencias | Requerimientos | IMPLEMENTADO | `RequirementsPanel.tsx` | no |
| Sugerencias | Preview y aplicación con confirmación | IMPLEMENTADO | `ProposalPreview.tsx` | no |
| Sugerencias | Minimización de movimientos / historial | IMPLEMENTADO | `history.py`, `movement.py` | no |
| Colaboración | Invitar, cambiar rol, quitar | IMPLEMENTADO | `SharePanel.tsx`, `api.ts:69-73` | no |
| Colaboración | Control de acceso por proyecto | IMPLEMENTADO | `/access` | no |
| Colaboración | Registro de auditoría | IMPLEMENTADO | `/audit-log` | no |
| Autenticación | Login, logout, `me`, recuperación, cambio | IMPLEMENTADO | `auth_routes.py`, `api.ts:56-61` | no |
| Autenticación | Roles owner / editor / reader | IMPLEMENTADO | `auth7c`, `collab_7d.py` | no |
| Administración | Gestión de usuarios y reset | IMPLEMENTADO | `AdminScreen.tsx`, `api.ts:62-65` | no |
| Producto | **Vista de ensayo / impresión (print)** | IMPLEMENTADO (9D) | `RehearsalView.tsx`, `lib/rehearsal.ts`, estilos `@media print` | no |
| Producto | Enlace público de solo lectura | IMPLEMENTADO (9E) | `public_routes.py`, `PublicComposition.tsx`, `PublicLinkPanel.tsx` | no |
| Canvas | Pan libre | DEUDA CONSCIENTE (7Y) | alternativa: ajustar/centrar | no |
| Canvas | Selección directa Konva | DEUDA CONSCIENTE (7Y) | alternativa: vista sin ratón | no |
## 4. Hallazgo central: el historial no sobrevive a la recarga

`frontend/src/store/composition.ts:257-259`:

```js
setElements:raw=>{ ... return set({elements:els, ..., history:[], future:[],
                                    isDirty:false, savedSig:...}); },
```

Al cargar una composición se **vacía `history` y `future`**, y lo que se persiste
es solo `{elements}`, sin ninguna versión anterior. Consecuencia real:

1. Deshacer/rehacer funciona **dentro de la sesión**.
2. Si guarda, recarga o cierra la pestaña, **el historial desaparece**.
3. No hay forma de volver a un estado anterior guardado: la API solo expone
   `GET/PUT/PATCH/DELETE /compositions`, sin versiones.

Un cambio de distribución aplicado por el motor, un borrado accidental o una
edición grande son **irreversibles**, aunque todo lo demás funcione bien.

## 5. TODO/FIXME

Búsqueda de `TODO`, `FIXME`, `HACK`, `XXX`, `not implemented`, `coming soon`,
`placeholder` en frontend y backend: **ningún marcador real en producción**. Las
coincidencias son `print(` de Python, `password` y ruido similar. No hay deuda
oculta por este lado.

## 6. Integración frontend/backend — endpoints huérfanos

| Endpoint | Situación | Nota |
| --- | --- | --- |
| `POST /api/suggestions` | **Huérfano** | `engine_a.py:3` lo declara *legacy*; sin consumidor en `api.ts` |
| `GET /api/songs/{song_id}` | **Huérfano** | de esa ruta solo se consumen `PATCH` y `DELETE` |
| `/api/health` | Infraestructura | lo usan Docker y las comprobaciones, no la UI |
| `/docs`, `/redoc`, `/openapi.json` | Infraestructura | Swagger |

Los 54 endpoints restantes **sí tienen consumidor**. Ninguna capacidad de frontend
exige un endpoint inexistente: **no hay desajustes de contrato**.

## 7. Deudas clasificadas

**Pendientes reales (funcionalidad):** ninguno de los tres identificados en 9B —
historial de versiones (**9C**), vista de ensayo / impresión (**9D**) y enlace
público de solo lectura (**9E**) están implementados y verificados. Revisado en
**9F**: no se ha detectado un nuevo pendiente prioritario.

**Deudas conscientes (7Y):** pan libre; selección directa Konva. Ambas con
alternativa accesible verificada. **No entran en la prioridad.**

**Limitaciones de verificación (NO son funcionalidades):** lector de pantalla
real; UIA del editor. Convertirlas en tarea de desarrollo sería inventar trabajo.

**Comportamiento documentado:** `Ctrl+Z` dentro de INPUT; textos sin tilde.
## 8. Top 5 de candidatos

> **Histórico de 9B.** Los puestos #1, #2 y #3 ya están implementados en 9C, 9D
> y 9E respectivamente (actualizado en 9F). Se conservan sin reordenar porque
> esta sección documenta la decisión de aquella fase.

Valor 1-4 · Impacto 1-4 · Estado 1-4 · **Riesgo 1-4 (penaliza)**

| # | Funcionalidad | Valor | Impacto | Estado | Riesgo | Razón |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | **Historial de versiones de composición** | 4 | 4 | 1 | 2 | Protege el flujo central (editar y guardar) frente a pérdida irrecuperable |
| 2 | Vista de ensayo / impresión | 3 | 3 | 1 | 2 | Uso real en ensayo/concierto; solo hay PNG del lienzo |
| 3 | Enlace público de solo lectura | 3 | 2 | 2 | 3 | El rol `reader` ya existe; falta la vía sin sesión |
| 4 | Retirar o documentar el endpoint legacy | 1 | 1 | 3 | 1 | Higiene: `POST /api/suggestions` está muerto |
| 5 | Pan libre del lienzo | 2 | 2 | 1 | 3 | Deuda consciente; tocaría geometría y contratos cerrados |

El #1 destaca porque es el único que **protege trabajo ya guardado** frente a un
error del usuario. El #2 y #3 son aditivos. El #4 es higiene. El #5 roza los
contratos cerrados de 7Q–8C y su alternativa accesible ya funciona.

## 9. Recomendación

> **Histórico de 9B:** esta recomendación ya se ejecutó (9C). La recomendación
> vigente tras la auditoría 9F está en `FASE_9F_AUDITORIA_POST_9E.md`.

> **SIGUIENTE FASE RECOMENDADA: historial de versiones de composición, persistido
> en servidor**

**Por qué.** Es lo único pendiente que afecta a la **integridad del trabajo ya
guardado**, no a su alcance. Hoy se puede perder para siempre una composición tras
un guardado erróneo, y el producto no ofrece ninguna salida.

**Qué existe.** La composición se persiste completa (`PUT /compositions/{id}`) y
hay deshacer/rehacer en memoria (`composition.ts:253`). Solo falta conservarlo.

**Qué falta.** Modelo de versiones, rutas de listado y restauración, y una vista
de historial. En el backend **no hay nada que reutilizar**: el modelo no existe.

**Archivos probables.** Backend: `app/models/models.py`, `app/api/routes.py` y
migraciones. Frontend: `lib/api.ts` y un **componente nuevo** de historial junto a
`Project.tsx`. Deliberadamente **fuera**: `Numero.tsx`, `Inspector.tsx`,
`AccessibleEditor.tsx` y `composition.ts` — el store puede seguir igual si la
restauración se apoya en la vía `setElements` que ya existe.

**Backend disponible.** Sí, y verificado en 9A: 279 pruebas, SQLite de pruebas
autogenerada, health correcto.

**Pruebas reutilizables.** `test_api.py` y `test_security_*` para autorización;
`exportacion.spec.ts` para comprobar que una versión restaurada exporta igual;
`wcag.spec.ts` si la vista es nueva.

**Riesgo.** Medio (2). El principal es **no tocar el store cerrado**: la tentación
de meter el historial persistente dentro de `composition.ts` es real y debe
evitarse. Secundario: la migración de esquema.

**Resultado de usuario.** Poder volver a un estado anterior guardado de una
composición, con fecha y autor, sin depender de no haber recargado la página.

## 10. Fuera de alcance en 9B

```text
Ningún archivo de producción modificado.
Ningún endpoint, modelo o test modificado.
Ninguna base de datos ni dato histórico tocado.
Ninguna suite ejecutada.
No se modificó Numero.tsx, Inspector.tsx, AccessibleEditor.tsx ni composition.ts.
No se ha creado una fase 9C.
```