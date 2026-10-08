# FASE 11A — INVENTARIO POST-LÍNEA 10 Y PRIORIZACIÓN

## 1. Resultado

**FASE 11A — COMPLETADA**

Decisión final: **NO EXISTE UNA SIGUIENTE LÍNEA FUNCIONAL JUSTIFICADA**.

La Línea 9 y la Línea 10 permanecen cerradas. El estado recomendado es mantenimiento, observabilidad y validación puntual de las deudas identificadas, sin abrir una nueva línea de producto.

## 2. Alcance y fuente de verdad

Se inspeccionaron los documentos de cierre de las Líneas 9 y 10, especialmente:

- `FASE_9L_CIERRE_AUDITORIA_FINAL.md`.
- `FASE_10A_INVENTARIO_PRIORIZACION.md`.
- `FASE_10B_ESPECIFICACION_INTERACCION_ESPACIAL.md`.
- `FASE_10C_IMPLEMENTACION_INTERACCION_ESPACIAL.md`.
- `FASE_10D_VALIDACION_INTERACCION_TACTIL.md`.
- `FASE_10E_CIERRE_AUDITORIA_LINEA_10.md`.
- `README.md`.
- Rutas, consumidores frontend y pruebas backend/frontend relacionadas.

El código actual fue tratado como fuente de verdad para rutas, contratos y consumidores. No se modificó ningún archivo funcional durante esta fase.

## 3. Estado base

Estado registrado al inicio de la auditoría:

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- Worktree: con cambios y artefactos preexistentes de fases anteriores.
- No se limpiaron, revirtieron ni eliminaron cambios preexistentes.

El worktree preexistente contiene modificaciones en código, pruebas, Compose, documentación y artefactos de ejecución. Esas modificaciones no forman parte de 11A y se conservaron intactas.

## 4. Inventario funcional posterior a la Línea 10

| Área | Capacidad actual | Estado | Evidencia inspeccionada |
|---|---|---|---|
| Proyectos | Crear, renombrar, eliminar, abrir, persistir y buscar | Implementada | Rutas, `Dashboard`, `Project`, pruebas y documentación |
| Canciones | CRUD, orden, relación con proyecto, historial y requisitos | Implementada | Rutas, `api.ts`, paneles y pruebas |
| Personas | CRUD, participación, compatibilidad y asignaciones | Implementada | Rutas, componentes y pruebas |
| Puestos | Catálogo, normalización, compatibilidad, asignación y validación | Implementada | Rutas, tipos, layout y pruebas |
| Marimbas | Plantillas, instancias, posiciones, movimiento, resize y bloqueo | Implementada | `CanvasEditor`, paneles, store y pruebas |
| Composiciones | Crear, editar, guardar, duplicar, eliminar, notas, etiquetas, asignaciones y restore | Implementada | Store, rutas de versiones, UI y pruebas |
| Motor de distribución | Sugerencias, distribución, requisitos, compatibilidad e historial | Implementada | Servicios, rutas, paneles y pruebas |
| Importación | Preview, confirmación incremental, normalización y duplicados | Implementada | `ImportPanel`, rutas y pruebas |
| Autenticación | Login, logout, sesión, perfil, cambio y recuperación de contraseña | Implementada | `auth_routes.py`, UI y pruebas |
| Usuarios y permisos | Roles owner/editor/reader y administración | Implementada | Rutas, `AdminScreen` y pruebas |
| Colaboración | Invitaciones, roles, eliminación de acceso y auditoría | Implementada | `collab_routes.py`, `SharePanel` y pruebas |
| Accesibilidad | Nombres, foco, teclado, controles, `AccessibleEditor` y axe | Implementada; lector real pendiente de validación | 10D/10E, WCAG y pruebas de accesibilidad |
| Compartición pública | Crear, revocar, caducar, listar, estados, 404 uniforme y rate-limit | Implementada | `public_routes.py`, `PublicLinksList`, pruebas 9E–9J |
| Interacción espacial | Pan desktop, selección/drag existentes y endurecimiento táctil | Implementada según Línea 10 | 10B–10E, `CanvasEditor` y E2E |

No se identificó una capacidad central incompleta cuya ausencia justifique una nueva línea funcional.

## 5. Capacidades cerradas que no deben reabrirse

La auditoría conserva como cerradas:

- Enlaces públicos, revocación y caducidad.
- Listado de enlaces públicos.
- Rate-limit de lectura pública.
- Contratos WCAG/E2E de la Línea 9.
- Pan, selección, drag, zoom y endurecimiento táctil definidos en la Línea 10.
- Alternativa accesible mediante `AccessibleEditor`.

Las limitaciones de validación con hardware físico multitáctil y con lector de pantalla/UIA real son de entorno de prueba, no evidencia de un P0/P1 funcional.

## 6. Endpoints legacy y consumidores

### `POST /api/suggestions`

- Sigue registrado y autenticado.
- Tiene adaptador de compatibilidad y pruebas backend.
- No se encontró consumidor activo en el frontend principal.
- No se eliminó porque las pruebas y contratos históricos todavía lo cubren y no existe evidencia suficiente sobre consumidores externos.

### `GET /api/songs/{song_id}`

- Sigue registrado y autenticado.
- Tiene cobertura de seguridad y API.
- No se encontró consumidor activo del GET simple en el frontend principal.
- El frontend sí consume rutas relacionadas de la canción, como `PATCH`, `DELETE`, historial, requisitos, sugerencias y distribución.
- No se eliminó por compatibilidad y ausencia de un inventario de consumidores externos.

**Clasificación:** ambos endpoints deben conservarse por ahora. La eventual retirada requiere una fase de mantenimiento separada con inventario de consumidores, política de deprecación y pruebas de compatibilidad. No es una iniciativa funcional de Línea 11.

## 7. Oportunidades y deudas priorizadas

| ID | Área | Limitación actual y evidencia | Valor | Riesgo | Complejidad | Prioridad | Recomendación |
|---|---|---|---|---|---|---|---|
| 11A-01 | API legacy | `POST /suggestions` y GET simple de canción no tienen consumidor frontend identificado, aunque sí rutas, pruebas y compatibilidad | Bajo/medio | Medio si se retiran sin inventario externo | Baja/media | P3 | Retener; preparar deprecación solo con evidencia de consumidores |
| 11A-02 | Accesibilidad ambiental | No se validó hardware físico multitáctil ni lector de pantalla/UIA real | Medio | Medio/alto por dependencia del entorno | Alta/ambiental | P3 | Validar cuando exista hardware/entorno representativo; no crear funcionalidad por defecto |
| 11A-03 | Exportación | PNG, exportación masiva, vista de ensayo e impresión están disponibles; no hay PDF/formatos estructurados dedicados | Condicional | Medio | Media | P3 | Postergar hasta una necesidad explícita de usuario |
| 11A-04 | Mantenimiento de release | El worktree acumula cambios y artefactos de fases anteriores | Medio para seguridad operativa | Medio | Media | P3 | Tratar como higiene de release/entrega, no como línea funcional |
| 11A-05 | Listado público | El listado funciona, pero no ofrece paginación, filtros o búsqueda avanzados | Bajo/medio | Bajo/medio | Baja/media | P3 | Postergar hasta que escala o evidencia de uso lo justifique |
| 11A-06 | Rendimiento de entrega | La evidencia de build mantiene una advertencia de bundle grande | Bajo | Bajo/medio | Media | P3 | Medir antes de optimizar; no priorizar sin impacto observable |

No se identificó ningún P0, P1 ni P2 funcional respaldado por una necesidad concreta, un fallo reproducible o una regresión actual.

## 8. Revisión de documentación y coherencia

`README.md` documenta la superficie pública, autenticada, enlaces públicos, rate-limit, desarrollo local/E2E y la conservación de endpoints legacy. La inspección no encontró una contradicción material que requiriera modificarlo en 11A.

La diferencia entre evidencias históricas de la Línea 9 (`96/96`) y la evidencia posterior de la Línea 10 (`97/97`) se interpreta como evolución del inventario E2E, no como una regresión ni como una razón para reabrir la Línea 9.

## 9. Riesgos actuales

- Retirar un endpoint legacy sin conocer consumidores externos podría romper integraciones.
- Declarar validación completa de accesibilidad física sin hardware o lector de pantalla real produciría una conclusión no sustentada.
- Convertir exportación PDF, filtros avanzados o optimización de bundle en una línea sin demanda confirmada aumentaría alcance sin resolver un problema prioritario.
- Mezclar higiene del worktree con una nueva iniciativa funcional dificultaría atribuir cambios y verificar regresiones.

## 10. Decisión sobre una siguiente línea

### NO EXISTE UNA SIGUIENTE LÍNEA FUNCIONAL JUSTIFICADA

La decisión se basa en que:

1. Las capacidades comprometidas de las Líneas 9 y 10 están cerradas.
2. No hay P0 ni P1 pendientes.
3. Las oportunidades encontradas son P3, condicionales o ambientales.
4. Los endpoints legacy requieren prudencia de compatibilidad, no eliminación inmediata.
5. No existe evidencia de un problema de usuario que justifique abrir una nueva línea de producto.

El siguiente trabajo razonable es mantenimiento puntual y observabilidad, ejecutado únicamente cuando exista evidencia o una necesidad explícita. No se crea una FASE 11B.

## 11. Alcance recomendado para mantenimiento futuro

### IN

- Inventario de consumidores externos antes de cualquier deprecación legacy.
- Validación manual con lector de pantalla/UIA y hardware multitáctil cuando el entorno esté disponible.
- Medición de necesidades reales de exportación y escala del listado público.
- Higiene de release y separación de artefactos de ejecución cuando corresponda.

### OUT

- Nuevos endpoints o cambios de API.
- Cambios de autenticación, autorización, tokens, caducidad o rate-limit.
- Cambios de modelo, migraciones o persistencia.
- Reapertura de la Línea 9 o Línea 10.
- Eliminación automática de endpoints legacy.
- Nuevos gestos, colaboración avanzada, edición masiva o nuevos formatos sin requisito confirmado.

## 12. Verificación

### Ejecutado en esta fase

- Inspección estática de documentación, rutas, consumidores, componentes y pruebas.
- Revisión de `git status`, rama, HEAD y diff existente.
- No se ejecutaron suites porque 11A no modificó código ejecutable.

### Evidencia previa conservada

- E2E Línea 10: `97/97 passed`.
- WCAG: `5/5 passed`.
- 9E: `4/4 passed`.
- 9G: `4/4 passed`.
- 9I: `4/4 passed`.
- 9J: `2/2 passed`.
- Frontend unitario: `224/224 passed`.
- TypeScript: OK.
- Build frontend: OK.

Estos resultados son evidencia heredada de las fases anteriores; no se presentan como ejecuciones nuevas de 11A.

## 13. Protecciones confirmadas

- No se accedió ni modificó producción.
- No se ejecutaron migraciones.
- No se modificó Docker Compose.
- No se modificaron archivos protegidos.
- No se modificaron endpoints, modelos, frontend funcional ni tests.
- No se eliminaron datos, volúmenes ni PostgreSQL.
- No se ejecutaron operaciones Git destructivas.
- No se creó commit, push, merge ni cambio de rama.

## 14. Pendientes reales

Permanecen como deudas P3 o condicionadas, no como bloqueos de cierre:

1. Plan de ciclo de vida para los dos endpoints legacy cuando exista inventario de consumidores externos.
2. Validación manual con tecnologías de asistencia y hardware táctil representativo.
3. Evaluación basada en demanda de PDF/formatos estructurados, filtros avanzados del listado público y optimización del bundle.

**Conclusión:** la Línea 10 queda cerrada y no se justifica abrir una nueva línea funcional en este momento.
