# FASE 9C — HISTORIAL PERSISTENTE DE VERSIONES DE COMPOSICIÓN

## 1. Estado general

```text
COMPLETADA
```

## 2. Problema que resuelve

El historial de `composition.ts` es **de sesión**. Al cargar una composición,
`setElements` hace `history:[], future:[]` (`store/composition.ts:257-259`), y lo
que se persiste es solo `{elements}`. Guardar, recargar o cerrar la pestaña
destruye la posibilidad de volver atrás: una distribución aplicada por el motor, un
borrado accidental o una edición grande quedan **irreversibles**.

9C añade un historial **en servidor**, sin tocar ese store.

## 3. Diseño

`CompositionVersion` (`backend/app/models/models.py`):

| Campo | Papel |
| --- | --- |
| `id` | clave primaria |
| `composition_id` | FK a `compositions`, `CASCADE` |
| `version_number` | monotónico por composición (1, 2, 3…) |
| `snapshot` | JSON autocontenido: `name`, `width`, `height`, `data` |
| `created_by_user_id` | FK a `users`, `SET NULL` |
| `created_at` | timestamp UTC |

* **Snapshot autocontenido.** Guarda los mismos campos que `Composition`. Guardar
  solo `data` dejaría la restauración incompleta si el nombre o el tamaño hubieran
  cambiado. No se crea un segundo formato incompatible.
* **Inmutable.** No existe `PATCH`, `PUT` ni `DELETE` de versiones; una prueba
  comprueba que devuelven **405**.
* **Monotonía garantizada por la base.** `UNIQUE (composition_id, version_number)`.
  El código calcula `max+1`, pero dos peticiones simultáneas podrían calcular el
  mismo: solo una sobrevive al INSERT y la otra **reintenta** (`_append_version`).
* **`created_by_user_id` con `SET NULL`, no `CASCADE`.** Perder una versión
  histórica sería peor que perder el nombre de quien la creó.
* **Se distingue del undo/redo.** Ninguna ruta toca `history`/`future`.
* **Migración.** No hizo falta script: el proyecto ya usa
  `Base.metadata.create_all` (`main.py:53`), que crea tablas nuevas de forma
  idempotente en SQLite y PostgreSQL. Se siguió ese mecanismo.

## 4. API

| Método | Ruta | Propósito | Permiso |
| --- | --- | --- | --- |
| `GET` | `/api/compositions/{cid}/versions` | Listar (descendente, sin snapshot) | lectura |
| `POST` | `/api/compositions/{cid}/versions` | Crear versión del estado actual | escritura |
| `GET` | `/api/compositions/{cid}/versions/{vid}` | Obtener una versión con su snapshot | lectura |
| `POST` | `/api/compositions/{cid}/versions/{vid}/restore` | Restaurar | escritura |

Se reutilizan `readable_composition` y `owned_composition` de `deps.py`: no se
inventó un mecanismo de autorización nuevo.

## 5. Restauración — qué pasa exactamente

**Sí: restaurar crea una versión nueva.**

```
versiones 1, 2, 3 (el estado actual es el de la 3)
→ el usuario restaura la 1
→ PRIMERO se guarda el estado actual como versión 4
→ DESPUÉS se aplica el snapshot de la 1
```

Quedan `1, 2, 3` intactas más `4` con lo que se iba a perder. El historial es de
**solo-añadir**: restaurar nunca destruye nada. La respuesta lo dice con
`previous_state_saved_as`.

`_snapshot_valido()` rechaza (422) cualquier snapshot con estructura inútil.

## 6. Frontend

Nuevo componente `frontend/src/components/VersionHistory.tsx`, integrado en el
panel lateral «Paneles» de `Project.tsx`.

**El store NO se tocó.** La restauración usa la vía que ya existía:
`setElements(comp.data?.elements)`, igual que al abrir una composición.

* Crear versión es **acción explícita**. Guardar NO crea versiones: si lo hiciera,
  el historial llenaría de ruido que el usuario no decidió conservar.
* Restaurar pide confirmación con `useConfirm`, el diálogo accesible ya usado por
  el resto de la aplicación. Nunca es silencioso.
* El resultado se **anuncia** con `role="status"`, no solo cambia el color.
* Todos los botones llevan texto; ningún icono sin nombre accesible.
* En modo lector (`readOnly`) se ocultan «Guardar versión» y «Restaurar».

Efecto colateral documentado: como la restauración usa `setElements`, **el
historial de deshacer de la sesión se reinicia** tras restaurar. Es el
comportamiento natural de la vía existente y no se ha tocado.

## 7. Seguridad

| Caso | Resultado |
| --- | --- |
| Dueño | crea, lista y restaura |
| Editor | crea y restaura |
| **Reader** | lista y consulta, **pero crear/restaurar dan 404** |
| Usuario sin acceso | **404 en las cuatro rutas** |
| Versión de otra composición | **404**, aunque tenga acceso a la otra |
| Versión inexistente | 404 |

Se devuelve **404 y no 403**, siguiendo la regla ya establecida en `deps.py`: no se
revela siquiera que el recurso existe.

## 8. Tests nuevos

**18 backend** (`tests/test_versiones_9c.py`): forma del snapshot; números monotónicos;
listado sin snapshot; inmutabilidad (405); owner/editor/reader/sin acceso; mismatch
composición-versión; restauración correcta; restaurar no borra; el estado previo se
guarda; seguir editando después; composiciones antiguas; cascada al borrar.

**2 E2E** (`e2e/specs/versiones9c.spec.ts`): persistencia real **con recarga** del
navegador, y el flujo de interfaz con anuncio por `role="status"`.

## 9. Regresión — resultados reales de 9C

| Suite | Baseline | Resultado 9C |
| --- | --- | --- |
| Backend `pytest -q` | 279 (9A) | **297 passed**, 0 failed (40.01 s) |
| Frontend `npm test` | 178 (8F) | **178 passed / 0 failed** |
| `npx tsc --noEmit` | OK | **exit 0** |
| `npm run build` | OK | **exit 0** (`✓ built in 5.80s`) |
| E2E completa ronda 1 | 77 (8F) | **79 passed / 0 failed** |
| E2E completa ronda 2 | — | **79 passed / 0 failed**, axe 0 en las 5 vistas |
| axe | 0 (8F) | **0 infracciones** en las 5 vistas |

Ningún test existente se eliminó, debilitó ni marcó como skip.

## 10. Incidencias reales encontradas

**a) El E2E servía código viejo.** El primer intento dio 404 en las rutas nuevas y
`.version-history` no aparecía: el entorno E2E usa **imágenes construidas**, sin
volúmenes montados. Resuelto reconstruyendo:

```text
docker compose -p marimba7f -f docker-compose.yml \
  -f docker-compose.7f.yml -f docker-compose.e2e.yml up -d --build
```

**Sin `down -v`**: el contenedor de base de datos siguió `Running` y sus volúmenes
intactos.

**b) Un `page.goto` agotó 30 s** en `recuperacion.spec.ts:80` durante la ronda
completa, con la máquina saturada. **No es una regresión**: es un timeout de
navegación, no un fallo de aserción, y la zona (recuperación de contraseña) no la
toca esta fase. Reejecutado aislado: **6/6 pasan**. Se declara como *flake por
carga*, sin tocar el test.

## 11. Compatibilidad con lo anterior

Las composiciones creadas antes de 9C **funcionan igual**: su historial empieza
vacío y se puede versionar desde el primer momento. **No se fabrica historia
retroactiva**: las versiones nacen con la funcionalidad. Decisión documentada.

Los contratos cerrados de 7Q–8G (`Numero`, `update`, `resizeMarimba`,
`composition.ts`, `layout.ts`) **no se han tocado**.

## 12. Datos

Producción no tocada · PostgreSQL real no conectado · migraciones de producción no
ejecutadas · datos históricos no alterados · sin `down -v`.

## 13. Git

Rama `checkpoint/fase1-motor-d1-d3-d5` · HEAD `3253c2a` · `optimizer.py` **+7** ·
`test_unified_core.py` **+216** · `cli.py` sin diferencias. Sin commit, push, merge
ni cambio de rama.

## 14. Accesibilidad

Verificado por **DOM/E2E y axe**: botones con nombre, confirmación accesible, anuncio
por `role="status"`. **No se afirma verificación con lector de pantalla real**: sigue
`NO VERIFICADO` como dejó 8G, y el UIA del editor sigue `NO MEDIDO`. Axe no es
equivalente a un lector.

## 15. Conclusión

El bloque 7Q–8G recupera ahora lo que 9B demostró que faltaba: **el historial
sobrevive a cerrar la pestaña**, y hacerlo nunca destruye una versión anterior.

Siguiente candidato de 9B: **vista de ensayo / impresión**. No aparece evidencia
nueva que lo desplace.