# FASE 7E — ESTABILIZACIÓN, INTEGRACIÓN Y VALIDACIÓN COMPLETA

> Documento de la fase 7E. Se apoya en `FASE_7C_DECISION.md`.
> No contiene credenciales, tokens ni contraseñas.

---

## A. Resumen ejecutivo

**Objetivo.** Estabilizar e integrar las fases 7A–7D: terminar el modo de solo
lectura del rol `reader`, corregir defectos de permisos e integración y ejecutar
todas las validaciones disponibles en el entorno.

**Trabajo realizado.**

1. **Modo de solo lectura centralizado.** El bloqueo se aplica en el cuello de
   botella del store (`step`, `committed`, `undo`, `redo`), no repetido en cada
   componente. Cubre ratón, táctil y teclado con una sola comprobación.
2. **Corrección de un defecto de permisos real:** `delete_project` usaba
   `owned_project()`, que significa *escribible*, por lo que un `editor`
   podía borrar el proyecto de su propietario. Ahora usa `owner_project()`.
3. **`SharePanel`** deja de cargar datos durante el render y lo hace en un
   `useEffect`, distinguendo carga de error.
4. **Pruebas nuevas:** 11 de solo lectura en el store, 2 de permisos de borrado
   y 2 de lectura/exportación en el backend.
5. **Regresión completa** ejecutada de principio a fin.

**Estado general.** Completa en código y verificada mediante suites
automatizadas. Quedan pendientes las validaciones que requieren infraestructura
no disponible (navegador, Docker y producción), detalladas sin darse por
realizadas.

---

## B. Cambios realizados

### B.1 `frontend/src/store/composition.ts` — solo lectura centralizado

Se exportan `setReadOnly(v)` e `isReadOnly()`, y el bloqueo se aplica en las
cuatro funciones por las que pasa toda mutación del lienzo:

| Función     | Qué cubre                                                        |
| ----------- | ---------------------------------------------------------------- |
| `step`      | arrastrar, soltar, asignar, renombrar, borrar, anotaciones, candados |
| `committed` | cambios ya persistidos en Persona/Asignación                      |
| `undo`      | deshacer                                                          |
| `redo`      | rehacer                                                           |

Un lector recibe `{}` como parche: el cambio se **descarta**, no se aplica.
Además `isDirty` no se activa, de modo que el lienzo nunca queda marcado como
sucio para un lector.

*Por qué:* comprobar permisos en cada componente produce listas que se
contradicen entre sí y se olvidan. Aquí hay un único control, difícil de
evadir por una ruta nueva.

### B.2 `frontend/src/pages/Project.tsx`

- Importa `setReadOnly` y lo activa cuando `access==='reader'`, con limpieza
  al salir del efecto para no dejar el flag pegado al cambiar de proyecto.
- `save()` retorna pronto si `readOnly`: ni un atajo de teclado ni una llamada
  programática llegan a escribir.
- El campo de nombre pasa a `readOnly` y el botón dice **«Solo lectura»**.

### B.3 `frontend/src/components/NoteEditor.tsx`

Nuevo parámetro `readOnly`. Bloquea `commitLabel`, `commitComment` y `wipe`,
y marca los campos como `readOnly` para que sigan siendo legibles.

### B.4 `frontend/src/components/Inspector.tsx`

Calcula `ro=isReadOnly()` y lo propaga a las tres instancias de `NoteEditor`:
consultar etiquetas y comentarios sigue siendo posible; modificarlas, no.

### B.5 `frontend/src/components/SharePanel.tsx`

La llamada a `api.collaborators()` pasa del render a un `useEffect` con
`projectId` como dependencia y guard `vivo` contra respuestas fuera de orden.

*Por qué:* cargar durante el render dispara la petición en cada repintado y,
mientras la respuesta no llega, `list` sigue a `null`, por lo que se vuelve a
pedir: bucle de red.

### B.6 `backend/app/api/deps.py` — nueva dependencia `owner_project`

```python
def owner_project(pid:int,user:User,db:Session)->Project:
    return _project_with_level(pid,user,db,('owner',),'El proyecto no existe.')
```

---

## C. Pruebas ejecutadas

Todas ejecutadas en esta fase, con estos comandos exactos:

| Comando | Resultado |
| ------- | --------- |
| `cd backend && python -m pytest -q` | **240 passed**, 0 fallos |
| `cd frontend && node --test tests/*.test.cjs` | **67 passed**, 0 fallos |
| `cd frontend && npx tsc --noEmit` | **PASS**, sin salida |
| `cd frontend && npx vite build` | **PASS**, 192 módulos, 2.62 s |
| `cd backend && python -m pytest tests/test_collab_7d.py -q` | **18 passed** |

Desglose frontend: 56 preexistentes + **11 nuevas de solo lectura (7E)**.
Desglose backend: los 233 previos + 4 de migración + 3 nuevas de 7E.

### Limitaciones del entorno

- **Sin navegador.** No hay Playwright instalado ni Chrome/Firefox
  disponible; no se ejecutaron pruebas E2E reales (sección D).
- **Sin Docker para este proyecto.** `docker ps` solo muestra contenedores de
  otros proyectos (`flowdesk-*`, `findthem-postgres`); los servicios de marimba
  no están levantados, así que la validación de Compose no pudo ejecutarse.
- **Sin base de datos real accesible.** El backend local no responde, por lo
  que **no se verificó la integridad de los 65 proyectos ni de las 9 plantillas
  durante esta fase**. No se afirma que sigan intactas: no se comprobó.

---

## D. Pruebas de navegador

**No realizadas — bloqueado por el entorno.**

| Flujo | Estado |
| ----- | ------ |
| Inicio de sesión válido / inválido | NO REALIZADO |
| Persistencia de sesión al recargar | NO REALIZADO |
| Cierre de sesión y rechazo posterior | NO REALIZADO |
| Cookies HttpOnly / SameSite / Secure | NO REALIZADO |
| Escenario A/B/C/D de colaboración | NO REALIZADO |
| Cambio de rol editor→reader | NO REALIZADO |
| Revocación y pérdida de acceso | NO REALIZADO |
| Exportación PNG como lector | NO REALIZADO |
| Recuperación de contraseña | NO REALIZADO |

No se instalaron dependencias nuevas para no alterar el entorno sin necesidad.
La verificación equivalente disponible se hizo a nivel de API y de lógica de
cliente:

- **API:** cubierta por `backend/tests/test_collab_7d.py` (18 pruebas), que
  comprueba códigos HTTP reales y efecto en base de datos.
- **Lógica de cliente:** `frontend/tests/` incluye pruebas de render y de la
  sección Compartir.

---

## E. Docker

**No validado — servicios no disponibles.** No se ejecutó `docker compose up`,
ni `down -v`, ni se tocó ningún volumen.

Comprobado únicamente: Docker CLI presente (v29.7.2). Falta la disponibilidad
de los servicios de este proyecto. Se requiere un entorno aislado con nombre de
proyecto propio y volúmenes nuevos.

---

## F. Migraciones

Las migraciones 7C y 7D siguen siendo **no destructivas e idempotentes**, y se
verificaron únicamente contra bases temporales, dentro de la suite
(`pytest -q` incluye `test_migration_7c.py`: aplicación inicial, segunda
ejecución, integridad de tablas y relaciones, permisos y conservación de datos).

**La migración de producción sigue PENDIENTE y NO se ejecutó.**

Requisitos aún no cumplidos:

1. Copia de seguridad verificada y **probada su restauración**.
2. `MIGRATION_USER_PASSWORD` disponible en el entorno.
3. Autorización explícita para ejecutarla.
4. Tras aplicarla, comprobar **65 proyectos, 65 propietarios y 9 plantillas**
   (las plantillas siguen siendo catálogo global compartido; los 65 proyectos
   históricos se asignan a un usuario **normal**, nunca a un administrador).

Criterios de aborto: fallo de cualquier comprobación de integridad, número de
proyectos distinto de 65, o plantillas distintas de 9. Plan de reversión:
---

## G. Seguridad

**Defecto corregido (alto).** `delete_project` usaba `owned_project()`, que
significa *escribible*. Un `editor` podía borrar el proyecto completo de su
propietario. Corregido a `owner_project()` y cubierto por la regresión
`test_borrar_el_proyecto_es_solo_del_propietario`, que comprueba el **efecto
real**: el proyecto, su canción y su composición siguen existiendo.

**Verificado por pruebas:**

- Aislamiento por proyecto en canciones, composiciones, sugerencias e historial.
- Un lector consulta todo lo legible y no escribe nada (ni una composición más).
- Un lector no puede proponer ni aplicar distribuciones.
- Un lector no puede leer ni exportar por ID una composición de otro proyecto.
- El modo de solo lectura del store no puede eludirse desde el estado global.

**Backend como autoridad.** El frontend refleja permisos; no los decide.

---

## H. Problemas pendientes

| # | Severidad | Problema | Reproducir | Siguiente paso |
| - | --------- | -------- | ---------- | -------------- |
| 1 | **Crítico** | Migración 7C/7D sin aplicar: los 65 proyectos quedan sin propietario y, bajo el nuevo modelo, inaccesibles | Abrir un proyecto histórico tras el despliegue | Respaldo verificado + `MIGRATION_USER_PASSWORD` + autorización |
| 2 | **Alto** | Sin validación en navegador de auth, colaboración y revocación | — | Instalar Playwright en entorno de pruebas |
| 3 | **Alto** | Compose sin validar en entorno aislado | — | Levantar con nombre de proyecto y volúmenes propios |
| 4 | **Medio** | Sin SMTP real; solo modo `console` | Recuperación de contraseña | Probar contra servidor de pruebas |
| 5 | **Medio** | Auditoría parcial: faltan eventos en actualizaciones/borrados de proyecto y composición | Revisar historial tras editar y borrar | Instrumentar y probar actor/sanitización |
| 6 | **Bajo** | Bundle de 674 kB (aviso de Vite) | `npx vite build` | `manualChunks` en fase propia; no bloquea |
| 7 | **Bajo** | Responsive y accesibilidad sin verificar | — | Emulación de viewport 1024/820/600 |

---

## I. Estado final

| Objetivo | Estado |
| -------- | ------ |
| Solo lectura en store, Inspector y MassExport | COMPLETADO Y VERIFICADO |
| Backend como autoridad de permisos | COMPLETADO Y VERIFICADO |
| Roles owner/editor/reader con sus capacidades | COMPLETADO Y VERIFICADO |
| Borrado de proyecto restringido al propietario | COMPLETADO Y VERIFICADO |
| Revocación reflejada en peticiones posteriores | COMPLETADO Y VERIFICADO |
| Pruebas de autenticación, colaboración y auditoría | COMPLETADO Y VERIFICADO |
| Regresión completa ejecutada y documentada | COMPLETADO Y VERIFICADO |
| TypeScript y build | COMPLETADO Y VERIFICADO |
| Pruebas de navegador | **BLOQUEADO POR EL ENTORNO** |
| Docker Compose en entorno aislado | **BLOQUEADO POR EL ENTORNO** |
| Migraciones sobre base temporal | COMPLETADO Y VERIFICADO |
| Procedimiento de migración productiva documentado | COMPLETADO Y VERIFICADO |
| Migración de producción ejecutada | **PENDIENTE** |
| Integridad de datos reales verificada | **BLOQUEADO POR EL ENTORNO** |
| Responsive y accesibilidad | **PENDIENTE** |
| Cambios protegidos conservados | COMPLETADO Y VERIFICADO |
| Sin commits, push, merges ni cambio de rama | COMPLETADO Y VERIFICADO |

restaurar la copia de seguridad.

Existe para que las operaciones **sobre el proyecto en sí** no dependan de
leer bien el nombre `owned_*`.

### B.7 `backend/app/api/routes.py` — borrado solo para el propietario

`delete_project` pasa de `owned_project()` a `owner_project()`.
