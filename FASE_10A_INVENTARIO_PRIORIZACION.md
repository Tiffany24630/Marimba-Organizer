# FASE 10A - Inventario y priorizacion de la siguiente linea

## 1. Resultado

**FASE 10A - COMPLETADA**

La Linea 9 permanece cerrada. Esta fase solo audito, clasifico y priorizo; no
modifico comportamiento funcional, endpoints, modelos, UI, Compose ni pruebas.

Conclusiones principales:

- No hay un P0 o P1 funcional evidenciado.
- Las capacidades historicamente pendientes de 9B/9H ya estan implementadas y
  verificadas en 9C-9K.
- Los endpoints legacy se conservan; no existe evidencia suficiente para
  eliminarlos.
- La siguiente oportunidad de producto razonable es una mejora P2 del editor
  espacial, pero requiere validacion de producto antes de tocar contratos
  cerrados.

## 2. Estado base

- Rama: `checkpoint/fase1-motor-d1-d3-d5`
- HEAD: `3253c2a92b21d8a88919116048b92815a04b1e50`
- Worktree: ya contenia numerosos cambios y archivos no versionados de fases
  anteriores, incluidos archivos protegidos. No se revirtio ni se limpio nada.
- Documentos de cierre presentes: 9B, 9C, 9D, 9E, 9F, 9G, 9I, 9J-R2/R3/R4/R5,
  9K y 9L.

No se creo ninguna 9M, 9N u 9O.

## 3. Inventario funcional actual

| Area | Capacidad | Estado | Evidencia |
| --- | --- | --- | --- |
| Proyectos | Crear, renombrar, borrar, abrir y persistir | Implementado | `Dashboard.tsx`, rutas `/projects`, E2E de autenticacion |
| Proyectos | Buscar y filtrar | Implementado | `lib/search.ts`, `Dashboard.tsx` |
| Canciones | CRUD, orden y relacion con proyecto | Implementado | rutas `/projects/{pid}/songs`, `/songs/{song_id}`, `Project.tsx` |
| Canciones | Historial de personas y requisitos | Implementado | `/songs/{id}/history`, `/requirements`, `RequirementsPanel.tsx` |
| Personas | CRUD con alcance de proyecto/composicion | Implementado | `PersonPanel.tsx`, rutas `/people` |
| Personas | Comentarios propios de persona | No evidenciado como capacidad separada | No se encontro contrato o componente especifico; no se declara pendiente de producto sin requisito |
| Posiciones | Catalogo, normalizacion y compatibilidad | Implementado | `/positions`, `positions.py`, motor de sugerencias |
| Posiciones | Asignacion, validacion y puestos dinamicos | Implementado | `CanvasEditor.tsx`, `Inspector.tsx`, pruebas de geometria/asignacion |
| Marimbas | Plantillas CRUD | Implementado | `MarimbaPanel.tsx`, `/marimba-templates` |
| Marimbas | Instancias, puestos, movimiento, resize y bloqueo | Implementado | `CanvasEditor.tsx`, `MarimbaPanel.tsx`, `resize.spec.ts`, `geometria.spec.ts` |
| Composiciones | Crear, editar, guardar, duplicar y borrar | Implementado | `/compositions`, `Project.tsx`, `api.ts` |
| Composiciones | Undo/redo de sesion | Implementado | `store/composition.ts`, `historial-numerico7z.spec.ts` |
| Composiciones | Versiones persistidas y restauracion append-only | Implementado | `CompositionVersion`, `/compositions/{id}/versions`, 9C |
| Composiciones | Notas, etiquetas y asignaciones | Implementado | `NoteEditor.tsx`, `Inspector.tsx`, `apply-assignments` |
| Composiciones | PNG y exportacion masiva | Implementado | `lib/export.ts`, `MassExport.tsx`, E2E de exportacion |
| Composiciones | Vista de ensayo e impresion local | Implementado | `RehearsalView.tsx`, `lib/rehearsal.ts`, `window.print()` |
| Motor | Sugerencias por plantilla | Implementado | `SuggestionsPanel.tsx`, `/songs/{id}/suggestions` |
| Motor | Distribucion por cancion y requisitos | Implementado | `DistributionPanel.tsx`, `RequirementsPanel.tsx`, motores A-E |
| Motor | Historial, compatibilidad y minimizacion de movimientos | Implementado | `services/suggestions/history.py`, `movement.py`, pruebas backend |
| Motor | Preferencias configurables del usuario | No evidenciado como producto separado | El motor usa reglas e historial existentes; no se inventa una deuda funcional |
| Importacion | Excel: preview y confirmacion | Implementado | `ImportPanel.tsx`, `/imports/preview`, `/imports/confirm` |
| Importacion | Incremental, normalizacion y duplicados | Implementado | `ImportPanel.tsx`, `excel_parser.py`, `test_ux5_import_incremental.py` |
| Autenticacion | Login, logout, sesiones, `me` y cambio de password | Implementado | `auth_routes.py`, `AuthScreen.tsx`, E2E de autenticacion |
| Autenticacion | Recuperacion de password | Implementado | `auth_routes.py`, Mailpit E2E |
| Usuarios | Admin, propietario, editor y reader | Implementado | `AdminScreen.tsx`, `SharePanel.tsx`, `deps.py`, pruebas 7C/7D |
| Colaboracion | Invitar, cambiar rol, retirar, acceso y auditoria | Implementado | `collab_routes.py`, `SharePanel.tsx`, `audit-log` |
| Accesibilidad | Nombres, foco, teclado y axe automatizado | Implementado y verificado | 96/96 E2E; WCAG 5/5; specs de interfaz/teclado |
| Accesibilidad | Lector de pantalla real y UIA del editor | No verificado | Limitacion de entorno documentada en 9F/9L; no es bug reproducible |
| Compartir | Enlace publico read-only | Implementado | `public_routes.py`, `PublicComposition.tsx`, 9E |
| Compartir | Revocacion, caducidad, listado y rate-limit | Implementado | 9G, 9I, 9J; E2E 4/4, 4/4 y 2/2 |
| API | `POST /api/suggestions` legacy | Registrado y conservado | `routes.py`, adaptador legacy, tests backend; sin consumidor frontend |
| API | `GET /api/songs/{song_id}` legacy | Registrado y conservado | `routes.py`, tests API/seguridad; sin consumidor frontend principal |

### Capacidades cerradas de la Linea 9

Historial persistido, ensayo/impresion, enlaces publicos, caducidad, listado,
rate-limit, WCAG y API hygiene no son pendientes de 10A. Son infraestructura
existente que una linea futura puede reutilizar.

## 4. Capacidades pendientes y clasificacion

No se encontro ningun P0 o P1 real. Las siguientes son las unicas oportunidades
respaldadas por evidencia documental o por una limitacion explicita:

| Capacidad | Prioridad | Estado actual | Evidencia | Valor | Dependencias | Riesgo |
| --- | --- | --- | --- | --- | --- | --- |
| Pan libre y seleccion directa del canvas | P2 | Deuda consciente; existen alternativas por panel, teclado y vista accesible | 9B/9F/9L; alternativas E2E verdes | Medio | Contratos de geometria, Konva y layout | Alto |
| Validacion con lector de pantalla real / UIA | Deuda de verificacion | No medida en el entorno disponible | 9F/9L lo declaran explicitamente | Medio | Entorno real de accesibilidad, no una nueva funcionalidad inferida | Medio |
| Retiro o consolidacion de endpoints legacy | P3 / deuda tecnica | Registrados, autenticados y cubiertos por tests | `POST /api/suggestions`, `GET /api/songs/{song_id}` | Bajo | Decision de compatibilidad y ajuste de tests | Bajo/medio |
| PDF backend o formatos adicionales | P3 / opcional | No implementado; impresion local es la decision vigente | 9D/9F/9L | Bajo/medio | Requisito explicito del producto | Medio |

No se clasifican como pendientes: historial, impresion, enlaces, caducidad,
listado, rate-limit, WCAG automatizado ni documentacion API, porque ya estan
cerrados y verificados.

## 5. Deudas tecnicas separadas

- El worktree acumula cambios sin commit de fases anteriores. Es deuda de
  integracion/release, no una funcionalidad faltante de producto.
- Los endpoints legacy no tienen consumidor frontend principal, pero tienen
  cobertura de tests y adaptadores de compatibilidad. Se conservan hasta que
  exista una decision de ciclo de vida.
- La verificacion con lector real/UIA requiere un entorno especializado. No se
  convierte en implementacion por ausencia de evidencia.
- El warning de chunks grandes observado en el build de 9L es una optimizacion
  opcional, no un bloqueo funcional.

## 6. Linea recomendada

### Linea 10 - Editor espacial avanzado y accesible

**Objetivo:** reducir la friccion de organizar composiciones grandes mediante
interaccion espacial directa, manteniendo las alternativas de teclado y panel.

**Problema que resuelve:** el canvas no ofrece actualmente pan libre ni una
seleccion directa Konva completa; el usuario depende de controles laterales,
centrado y alternativas accesibles.

**Valor:** medio. Afecta el flujo central de edicion, pero el producto actual
sigue siendo funcional y tiene rutas alternativas verificadas.

**Dependencias existentes:** `CanvasEditor.tsx`, geometria, zoom, seleccion,
`layout.ts`, `composition.ts`, `AccessibleEditor.tsx`, pruebas de teclado y
geometria. Los archivos protegidos no deben tocarse durante el primer estudio.

**Complejidad aproximada:** media-alta.

**Riesgos:** regresiones de coordenadas, foco, zoom, undo/redo, touch y
accesibilidad; posible necesidad de reabrir contratos cerrados de geometria.

**Por que se prioriza:** es la unica oportunidad de producto con impacto
directo sobre el flujo de edicion que sigue respaldada por documentos de cierre.
Se prioriza como propuesta P2 condicionada, no como defecto urgente.

## 7. Alternativas

### Alternativa 1 - No crear funcionalidad nueva aun

Mantener la base estable y esperar evidencia de usuarios que confirme que pan o
seleccion directa aportan mas valor que las alternativas actuales. Es la opcion
de menor riesgo y es razonable porque no hay P0/P1.

### Alternativa 2 - Ciclo de vida de API legacy

Realizar una fase tecnica para medir consumidores externos, documentar/deprecar
y eventualmente retirar `POST /api/suggestions` y `GET /api/songs/{song_id}`.
Queda detras porque su valor de producto es bajo y la retirada exige una
decision de compatibilidad, no una necesidad funcional inmediata.

No se proponen mas alternativas.

## 8. Primera fase propuesta para la linea recomendada

### Nombre

**Especificacion y validacion de interaccion espacial del editor**

### Objetivo

Definir una interaccion de pan y seleccion directa que pueda implementarse sin
romper geometria, teclado, accesibilidad, persistencia ni undo/redo.

### Alcance

- Medir escenarios reales de lienzos pequenos y grandes.
- Definir gestos de pan para mouse, touch y teclado si proceden.
- Definir seleccion, foco, deseleccion y conflicto con drag/drop.
- Definir limites de zoom, viewport y coordenadas persistidas.
- Definir como se conserva la alternativa `AccessibleEditor`.
- Preparar una matriz de pruebas de regresion antes de implementar.

### Fuera de alcance

- No implementar pan, seleccion ni cambios de UI en esta fase.
- No modificar `composition.ts`, `layout.ts`, `Numero.tsx`, `Inspector.tsx` ni
  `AccessibleEditor.tsx`.
- No cambiar el modelo de datos, API, autenticacion, colaboracion o Compose.
- No agregar PDF, nuevos formatos, nuevos endpoints ni nuevas reglas de
  sugerencias.

### Archivos potencialmente involucrados en una fase futura

Solo despues de aprobar la especificacion: `CanvasEditor.tsx`, estilos y specs
de geometria/interfaz. Los archivos protegidos quedan fuera por defecto; si la
implementacion futura demostrara que son imprescindibles, requeriria una
decision explicita antes de tocarlos.

### Pruebas necesarias en la futura implementacion

- unitarias de transformacion y viewport;
- E2E de pan, seleccion, drag/drop, zoom y touch;
- persistencia de coordenadas;
- undo/redo y bloqueo;
- navegacion por teclado y axe;
- full E2E y regresiones de la Linea 9.

### Criterios de aceptacion propuestos

- Pan y seleccion directa funcionan en desktop y touch sin perder coordenadas.
- No se rompe la alternativa por teclado ni `AccessibleEditor`.
- Drag/drop, zoom, bloqueo y undo/redo conservan sus contratos.
- No aparecen regresiones en geometria, accesibilidad ni full E2E.
- La implementacion no requiere cambiar los contratos publicos cerrados.

### Riesgo

Alto para una mejora P2. Si la especificacion demuestra que requiere tocar
archivos protegidos o cambiar contratos cerrados, debe posponerse y no forzarse.

## 9. Evidencia historica conservada

La Linea 9 quedo cerrada antes de 10A. Estos valores no son ejecuciones nuevas
de 10A:

```text
Backend      360 passed
TypeScript   PASS
Build        PASS
E2E          96/96
WCAG         5/5
9E           4/4
9G           4/4
9I           4/4
9J           2/2
```

10A no ejecuta suites porque no modifica codigo funcional.

## 10. Protecciones y cierre

- No se modifico codigo funcional.
- No se modificaron modelos, migraciones, endpoints, UI ni Compose.
- No se accedio ni modifico produccion.
- No se modificaron archivos protegidos.
- No se eliminaron datos, volumenes ni contenedores.
- No se ejecutaron operaciones Git destructivas.
- No hubo commit, push, merge, rebase, checkout ni cambio de rama.

**FASE 10A - INVENTARIO ACTUALIZADO Y PRIORIDAD SELECCIONADA**

La Linea 9 permanece cerrada. Esta ejecucion se detiene aqui; no implementa la
primera fase propuesta ni crea una FASE 10B.
