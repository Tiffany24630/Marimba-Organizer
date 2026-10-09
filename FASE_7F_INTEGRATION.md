# FASE 7F — EJECUCIÓN CONTROLADA, MIGRACIÓN Y REGRESIÓN COMPLETA

> Se apoya en `FASE_7E_INTEGRATION.md` y `FASE_7C_DECISION.md`.
> No contiene credenciales, tokens ni contraseñas.

---

## 1. Estado inicial

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` |
| Modificados | 18 |
| No rastreados | 30 |

Cambios protegidos **intactos** al terminar la fase:

| Archivo | Diff |
| ------- | ---- |
| `backend/app/services/suggestions/optimizer.py` | +7 |
| `backend/tests/test_unified_core.py` | +216 |

No se hizo commit, push, merge, reset, clean, restore ni cambio de rama.

### Migración: dónde vive

`_migrate_ownership()` en `backend/app/main.py`, ejecutada en el arranque.
Además `_migrate_collaboration()` (7D). No hay Alembic: son migraciones
escritas a mano, idempotentes y no destructivas.

**Variables de entorno implicadas** (`app/core/config.py`):

| Variable | Para qué |
| -------- | -------- |
| `MIGRATION_USER_EMAIL` | correo del usuario **normal** que hereda el histórico |
| `MIGRATION_USER_PASSWORD` | su clave. Sin ella **no se crea la cuenta** |
| `MAIL_PROVIDER`, `PUBLIC_BASE_URL` | correo y enlaces de recuperación |

---

## 2. Defecto crítico encontrado y corregido

**La migración 7C se colgaba indefinidamente en PostgreSQL.**

Dentro de `with engine.begin()` se ejecutaba `CREATE UNIQUE INDEX ... ON
users`, que toma un lock `ACCESS EXCLUSIVE` sobre `users` y lo retiene hasta el
commit. Acto seguido, la función abría **un `SessionLocal()` aparte** para
insertar el usuario de migración. Esa segunda conexión esperaba ese lock para
siempre:

```
pid 9352 | idle in transaction | SELECT id FROM users WHERE email = $1
pid 9353 | active | Lock: relation | INSERT INTO users (...)
```

Consecuencia en producción: el arranque se quedaba bloqueado y **los 65
proyectos nunca recibían dueño**. Bajo el modelo de autorización de 7D, un
proyecto sin `owner_id` es inaccesible para todos.

En SQLite **no se reproducía**, y por eso las fases anteriores lo dieron por
bueno: solo se probaba el motor de pruebas.

**Corrección:** el `INSERT` usa ahora la misma conexión y la misma transacción
que el resto de la migración, rellenando `created_at`/`updated_at`
explícitamente. Efecto secundario valioso: la creación del usuario y la
asignación de los proyectos pasan a ser **atómicas**.

Regresión en `backend/tests/test_migration_7c.py`: comprueba la causa (que no
haya apertura de sesión propia, ignorando comentarios) y no el efecto.

---

## 3. Migración

**Entorno:** PostgreSQL 16.15 real, dentro del proyecto Docker aislado
`marimba7f`, sobre una base creada al efecto (`marimba_7f_historico`).
Motivo de usar el motor real y no SQLite: el defecto anterior solo aparece en
PostgreSQL.

Histórico sembrado con **SQL directo** (no ORM), porque el ORM actual ya espera
`owner_id` y la base "histórica" aún no debe tener esa columna.

| Comprobación | Resultado |
| ------------ | --------- |
| Histórico sembrado | 65 proyectos, 9 plantillas, 65 canciones, 65 personas, 65 composiciones, 65 asignaciones |
| **A.** Migrar **sin** `MIGRATION_USER_PASSWORD` | 0 usuarios creados, 65 proyectos sin dueño (0.01 s) |
| **B.** 1ª migración real | usuario creado, rol `user`, **65 proyectos asignados** (0.02 s) |
| **C.** Idempotencia (2ª y 3ª) | 0.01 s cada una |
| Sin cambios tras migrar | 65/9/65/65/65/65 idénticos |
| Sin duplicar usuarios | 1 usuario |
| Suma de ids de composiciones | 2145, sin cambios |
| JSON de composiciones | 65 conservan `elements`; anotaciones intactas |
| Copia `_bak_projects_7c` | 65 filas |

El **fallo seguro** se verificó también en el arranque real del contenedor:

> `MIGRATION_USER_PASSWORD no esta definida: NO se crea el usuario tecnico ni
> se asignan los proyectos historicos.`

Nunca se inventa una contraseña, ni se asigna a un administrador, ni se finge
un éxito.

---

## 4. Respaldo y restauración (VERIFICADO de verdad)

`pruebas/migracion/respaldo_y_restauracion.sh` hace el ciclo completo. Un
`pg_dump` que termina bien **no** demuestra nada: el respaldo se restaura en
otra base y se comparan los recuentos.

| Paso | Resultado |
| ---- | --------- |
| `pg_dump -Fc` | 42 540 bytes, 134 objetos |
| `pg_restore --list` (legibilidad) | correcto |
| Restauración en base **nueva** | `RESTAURACION OK` |
| Comparación origen vs restaurado | **IDENTICOS** |
| Huérfanos en la base restaurada | 0 en las 5 comprobaciones |

No se sobrescribió ningún respaldo existente ni se usó `down -v`.

---

## 5. Integridad

Verificado sobre la base temporal con 65/9 (datos de prueba). **No** sobre
producción (sección 10).

| Entorno | Proyectos | Plantillas | Canciones | Personas | Composiciones | Asignaciones |
| ------- | --------: | ---------: | --------: | -------: | ------------: | -----------: |
| Temporal (histórico sembrado) | 65 | 9 | 65 | 65 | 65 | 65 |
| Tras migrar | 65 | 9 | 65 | 65 | 65 | 65 |

- **Propietario histórico:** los 65 proyectos quedan en un único usuario con
  `role='user'`. Verificado que **no** es admin (`0` usuarios `admin`).
- **Relaciones:** 0 huérfanos en canciones, composiciones, personas,
  asignaciones y proyectos→usuario.
- **JSON:** 65/65 composiciones conservan `elements`, `personId` y las
  anotaciones. No se reescribió ni normalizó ningún JSON.

---

## 6. Pruebas

| Área | Resultado | Evidencia |
| ---- | --------- | --------- |
| Backend | **245 passed**, 0 failed, 0 skipped | `cd backend && python -m pytest -q` (25.92 s) |
| Frontend | **67 passed**, 0 failed, 0 skipped | `cd frontend && npm test` (454 ms) |
| TypeScript | **PASS**, sin salida | `npx tsc --noEmit` |
| Build | **PASS**, 192 módulos, 2.90 s | `npm run build` (674.64 kB / 205.40 kB gzip) |
| Migración | **PASS**, 22 comprobaciones | `historico_y_migracion_7f.py` sobre PostgreSQL 16.15 |
| Respaldo | **PASS** | ciclo dump → verificar → restaurar → comparar |
| Auth | **PASS** | 51 comprobaciones en `pruebas_despliegue_7f.py` |
| Recuperación | **11/11** | `recuperacion_7f.py`, extremo a extremo |
| Colaboración | **PASS** | owner/editor/reader/no-acceso, API y aislamiento |
| Readonly | **PASS** | 11 pruebas del store + 2 de backend |
| Auditoría | **PASS** | 23 pruebas de 7D, 7 eventos verificados |
| Docker | **PASS** | 3 servicios, healthcheck, persistencia tras reinicio |
| Navegador | **NO REALIZADO** | sin Playwright ni navegador en el entorno |
| SMTP real | **NO VERIFICADO** | sin servidor SMTP disponible |

Desglose backend: 240 previos + 5 nuevos de 7F (4 de auditoría, 1 de
regresión de la migración).

### Despliegue (Docker) — verificado

| Flujo | Resultado |
| ----- | --------- |
| Construcción de backend y frontend | OK |
| PostgreSQL, backend, frontend | Up, `db` healthy |
| `GET /api/health` | 200 |
| Frontend sirve la app | 200, 541 bytes |
| Cookie de sesión | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=43200` |
| Cookie anti-CSRF | legible por JS (por diseño) |
| CSRF ausente | **403** |
| Credenciales inválidas | 401 |
| Sesión persiste entre peticiones | 200 |
| Cierre de sesión | 200, luego 401 |
| Ciclo proyecto→canción→composición | OK |
| Modificación guardada y releída | OK |
| **Reinicio sin borrar volúmenes** | datos, cuenta y auditoría persisten |
| Revocación tras reinicio | sigue vigente |

---

## 7. Seguridad

| Control | Estado |
| ------- | ------ |
| IDOR (proyecto/canción/composición/auditoría) | 404, sin revelar existencia |
| `owner` / `editor` / `reader` | Comportamiento verificado por API |
| Editor no borra el proyecto del owner | 404 |
| Editor no consulta la auditoría | 404 |
| Lector no escribe ni sugiere | 404 |
| Revocación inmediata | 401 en la siguiente petición, **sin** cerrar sesión |
| Cookies | `HttpOnly` + `SameSite=Lax` |
| Anti-CSRF | obligatorio en POST/PUT/PATCH/DELETE |
| Recuperación | no enumera cuentas; token de un solo uso; caduca; cambia la clave y revoca sesiones |
| Auditoría | actor = sesión autenticada; sin secretos; sin eventos falsos en rechazos |
| `Secure` en cookie | **NO VALIDABLE** en este entorno (HTTP sin HTTPS) |

### Auditoría: eventos añadidos en 7F

La auditoría solo cubría creación. Ahora también:

| Evento | Ruta |
| ------ | ---- |
| `PROJECT_UPDATED` | `PATCH /projects/{pid}` (con `previous_name`) |
| `COMPOSITION_UPDATED` | `PUT /compositions/{cid}` (sin `data`: puede ser enorme) |
| `COMPOSITION_DELETED` | `DELETE /compositions/{cid}` |
| `SONG_DELETED` | `DELETE /songs/{song_id}` |
| `PROJECT_DELETED` | `DELETE /projects/{pid}` |

`PROJECT_DELETED` se guarda con `project_id=None` **a propósito**: la fila de
auditoría tiene `ON DELETE CASCADE` sobre el proyecto, así que colgando de él
desaparecería justo al borrarlo. Se conservan `entity_id`, nombre y recuentos.

Todos los eventos se escriben **después** del `commit`: un rechazo nunca deja
constancia de un éxito que no ocurrió (probado).

---

## 8. SMTP

| Variable | Valor en pruebas | Comprobado |
| -------- | ---------------- | ---------- |
| `MAIL_PROVIDER` | `console` | Imprime el enlace y marca `delivered=False` |
---

## 9. Limitaciones

### VERIFICADO

Migración completa e idempotente sobre PostgreSQL 16.15; ciclo de respaldo y
restauración con comparación de recuentos; fallo seguro sin
`MIGRATION_USER_PASSWORD`; despliegue Docker aislado con persistencia tras
reinicio; autenticación, colaboración, solo lectura, auditoría y recuperación
de contraseña por API real.

### NO VERIFICADO

| Qué | Por qué |
| --- | ------- |
| **Integridad de producción (65/9 reales)** | No se accedió a la base productiva. **No se afirma que los datos estén intactos: no se comprobó** |
| `Secure` de la cookie | Requiere HTTPS; el entorno es HTTP |
| SMTP real | No hay servidor SMTP disponible |
| Navegador / Playwright | No hay navegador ni Playwright instalado |
| Responsive y accesibilidad | Sin navegador que emule viewports |
| Descarga real de PNG | Requiere navegador |

### PENDIENTE

Ejecutar la migración en producción (sección 11) y la validación visual.

---

## 10. Datos reales

**No verificados.** Las cifras de 65 proyectos y 9 plantillas se comprobaron
únicamente contra una base temporal con datos de prueba sembrados por el
propio script. La base de producción no se tocó ni se leyó en esta fase.

---

## 11. Procedimiento de migración productiva

> **MIGRACIÓN PRODUCTIVA = NO AUTORIZADA / PENDIENTE**

| # | Requisito | Estado |
| - | --------- | ------ |
| 1 | Base de datos identificada con certeza | ☐ |
| 2 | Respaldo creado | ☐ |
| 3 | Respaldo **restaurado** y recuentos comparados (sección 4) | ☐ |
| 4 | 65 proyectos presentes | ☐ |
| 5 | 9 plantillas presentes | ☐ |
| 6 | `MIGRATION_USER_EMAIL` y `MIGRATION_USER_PASSWORD` disponibles | ☐ |
| 7 | Usuario histórico con rol `user` (nunca admin) | ☐ |
| 8 | Migración temporal exitosa e idempotente | ✅ |
| 9 | Suite de regresión sin fallos bloqueantes | ✅ (245) |
| 10 | Referencias huérfanas: ninguna | ✅ |
| 11 | Plan de rollback | abajo |
| 12 | **Autorización explícita** | ☐ |

**Criterios de aborto** (detenerse, no reparar automáticamente): falta de
respaldo · respaldo no restaurable · base no identificable · ≠65 proyectos ·
≠9 plantillas · falta `MIGRATION_USER_PASSWORD` · fallo de migración ·
inconsistencias detectadas · sin autorización.

**Reversión.** La migración **no es reversible con un comando**: no hay
`down`. El mecanismo previsto es **restaurar el respaldo completo**, lo que
implica perder todo lo escrito desde el respaldo. Antes de ejecutar:

```sql
SELECT * FROM _bak_projects_7c;   -- la propia migración deja esta copia
```

Distinción: revertir *código* = desplegar la versión anterior (la migración
solo añade una columna, que la versión anterior ignora); revertir la
*migración* = restaurar el respaldo.

---

## 12. Problemas pendientes

| # | Severidad | Problema | Siguiente paso |
| - | --------- | -------- | -------------- |
| 1 | **Crítico** | Migración productiva sin ejecutar: los 65 proyectos quedarían inaccesibles | Respaldo verificado + autorización + ejecutar |
| 2 | **Alto** | Sin validación en navegador de auth, colaboración y revocación | Instalar Playwright en entorno de pruebas |
| 3 | **Alto** | Sin verificación de datos de producción | Acceso de lectura autorizado |
| 4 | **Medio** | No hay forma de crear el **primer administrador**: no hay registro público, `/admin/users` exige admin y la migración crea un usuario `user` | Decidir el mecanismo (CLI o variable de entorno) |
| 5 | **Medio** | Sin SMTP real | Servidor de pruebas autorizado |
| 6 | **Bajo** | `docker-compose.yml` sin `PUBLIC_BASE_URL`: los enlaces de recuperación apuntarían a `localhost:5173` | Fijarlo en el despliegue |
| 7 | **Bajo** | Bundle de 674 kB | `manualChunks` en fase propia |
| 8 | **Bajo** | Responsive y accesibilidad sin verificar | Emulación de viewports |

---

## 13. Estado final

| Objetivo | Estado |
| -------- | ------ |
| Auditoría inicial documentada | COMPLETADO |
| Migración ejecutada en entorno seguro | **COMPLETADO Y VERIFICADO EN POSTGRESQL** |
| Idempotencia (2ª y 3ª ejecución) | COMPLETADO Y VERIFICADO |
| Integridad 65/9 comprobada | COMPLETADO (base temporal) |
| Respaldo y restauración verificados | **COMPLETADO Y VERIFICADO** |
| Defecto de bloqueo de la migración corregido | **COMPLETADO Y VERIFICADO** |
| Cobertura de auditoría completada | COMPLETADO Y VERIFICADO |
| Regresión backend | COMPLETADO (245) |
| Regresión frontend | COMPLETADO (67) |
| TypeScript y build | COMPLETADO |
| Docker en entorno aislado | **VERIFICADO EN DOCKER** |
| Recuperación de contraseña | **VERIFICADO** (11/11) |
| Navegador | **BLOQUEADO POR EL ENTORNO** |
| SMTP real | **BLOQUEADO POR EL ENTORNO** |
| Datos reales de producción | **NO VERIFICADO** |
| Migración productiva | **PENDIENTE DE AUTORIZACIÓN** |

| `PUBLIC_BASE_URL` | `http://localhost:18080` | El enlace usa la URL correcta |
| `SMTP_HOST` / `SMTP_PORT` | sin definir | **SMTP real NO VERIFICADO** |
| `SMTP_USER` / `SMTP_PASSWORD` | sin definir | — |
| `MAIL_FROM` | `no-reply@marimba.local` | — |

El modo consola **no finge**: registra
`Proveedor sin entrega real (…). Enlace en modo consola.` Se comprobó además
que sin `SMTP_HOST` la ruta lanza `MailError` en vez de fingir un envío.
