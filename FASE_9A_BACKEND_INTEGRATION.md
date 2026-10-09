# FASE 9A — VERIFICACIÓN ACTUAL DEL BACKEND

## 1. Estado general

```text
COMPLETADA
```

El backend tiene **evidencia actual y favorable**. No se encontró ninguna regresión.

## 2. Entorno

| Elemento | Valor |
| --- | --- |
| Sistema | Windows 11 Home 10.0.26200 |
| Python | **3.14.6** |
| Framework | FastAPI + **pytest** |
| BD de pruebas | **SQLite** — `backend/test_marimba.db` |
| Instancia de pruebas | Docker, API en `http://localhost:18000/api` |
| PostgreSQL | **no intervino** |

Comando canónico: el repositorio no define `pytest.ini`/`setup.cfg`/`pyproject`;
la configuración vive en `tests/conftest.py`, por lo que el comando es el estándar
desde `backend/`.

## 3. Suite backend — RESULTADO REAL DE 9A

```text
cd backend
python -m pytest -q
```

| Verificación | Resultado |
| --- | --- |
| Suite backend | **279 passed** |
| Tests passed | **279** |
| Tests failed | **0** |
| Skipped | **0** |
| Xfailed | **0** |
| Errores de colección | **0** |
| Duración | **27.77 s** |
| Filtrado de warnings | **ninguno** (no se usó `--disable-warnings`) |

Salida literal:

```text
........................................................................ [ 25%]
........................................................................ [ 51%]
........................................................................ [ 77%]
...............................................................          [100%]
279 passed in 27.77s
```

Seisinstalaron servicios externos adicionales: la suite es autosuficiente.

## 4. Baseline — comparación explícita

```text
7T — HISTÓRICO:  279 passed
9A — ACTUAL:     279 passed  (27.77 s, Python 3.14.6)
```

El número **coincide exactamente**. No hay tests añadidos ni retirados, y no hay
regresión. El dato de 7T deja de ser la única evidencia y pasa a estar respaldado
por una ejecución actual.

## 5. Arranque

| Elemento | Estado | Evidencia |
| --- | --- | --- |
| Backend importa y arranca | **VERIFICADO** | `python -m pytest` instancia la app vía `TestClient` |
| Health endpoint | **VERIFICADO** | `GET /api/health` → `200 {"status":"ok"}` |
| DB de prueba accesible | **VERIFICADO** | SQLite creada y usada por toda la suite |

Observación sin carácter de fallo: al importar la app se emite
`MIGRATION_USER_PASSWORD no esta definida: NO se crea el usuario tecnico ni se
asignan los proyectos historicos.` Es una **protección deliberada**: sin esa
variable la migración no hace nada. Es el comportamiento correcto y no se modificó.

## 6. Integración: contratos disponibles

Inventario real de la aplicación (**58 rutas**). Los contratos que consume el
frontend existen todos:

| Capacidad | Rutas |
| --- | --- |
| Autenticación | `/api/auth/login`, `logout`, `me`, `forgot-password`, `reset-password`, `change-password` |
| Proyectos | CRUD `/api/projects`, `access`, `collaborators`, `audit-log` |
| Canciones | CRUD `/api/songs`, `history`, `requirements`, `suggestions`, `distribution` |
| Personas | CRUD `/api/people`, `/api/positions` |
| Composiciones | CRUD `/api/compositions`, `apply-assignments`, `duplicate` |
| Asignaciones | `POST /api/compositions/{cid}/apply-assignments` |
| Sugerencias | `/api/suggestions`, `suggestions/apply`, `propose-on-composition` |
| Otros | `/api/health`, `imports/*`, `marimba-templates`, `admin/users` |

Verificado por lectura del registro de rutas de la app. El comportamiento de
esos mismos contratos ya está probado de extremo a extremo por los E2E de 8F.

## 7. Hallazgos

```text
No se encontraron regresiones backend en las verificaciones ejecutadas.
```

Sin Categoría A (regresión), B (infraestructura), C (entorno) ni D (test
obsoleto). Ningún fallo que clasificar, ningún test modificado, ninguna
configuración tocada.

## 8. Datos

```text
producción no tocada
datos históricos no tocados
migraciones de producción no ejecutadas
```

La seguridad de esto es estructural, no una promesa: `conftest.py:7` fuerza
`DATABASE_URL=sqlite:///./test_marimba.db` y `conftest.py:18-20` borra ese
archivo en cada ejecución. **La suite no puede alcanzar PostgreSQL ni
`marimba.db`.** Los dos archivos temporales de 9A (script de inventario y su BD
descartable propia, prefijo `_9a_`) se eliminaron; no queda residuo.

## 9. Git e integridad

Comprobado antes y después:

| Elemento | Valor |
| --- | --- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` |
| `optimizer.py` | **+7** (intacto) |
| `test_unified_core.py` | **+216** (intacto) |
| `cli.py` | **sin diferencias** |

Sin commit, push, merge, cambio de rama, `reset`, `clean`, `restore`, `rebase` ni
`docker compose down -v`. No se modificó ningún archivo de producción ni de test.

## 10. Relación con 8G

```text
FASE 8G permanece cerrada.
Esta fase no reabre las deudas de accesibilidad.
La evidencia de accesibilidad continúa exactamente en el estado documentado
en FASE_8G_CIERRE.md.
```

Se mantienen sin cambios: lector real `NO VERIFICADO`, UIA del editor `NO MEDIDO`,
pan libre y selección Konva `DEUDA CONSCIENTE`, `Ctrl+Z` en INPUT documentado y
textos sin tilde como convención. **No se tocó `Numero.tsx`, `Inspector.tsx`,
`AccessibleEditor.tsx` ni `composition.ts`.**

## 11. Regresión frontend

No repetida. No hubo cambios de frontend en 9A, ni ninguna prueba de integración
reveló una regresión frontend. Se mantiene el baseline de 8F:

```text
ÚLTIMA REGRESIÓN REAL DEL FRONTEND: 8F — 77/77 x2, axe 0
```

## 12. Conclusión

El backend **no era una caja negra**: tiene una suite de 279 pruebas que pasa
completa y rápida (27.77 s) sobre una base de datos de pruebas propia y
destructible, sin depender de PostgreSQL ni de servicios externos. Los contratos
que el frontend consume están todos presentes.

Con 9A, el bloque 7Q–8G queda respaldado por evidencia actual en **ambos** lados:
frontend verificado en 8F y backend verificado en 9A. No hay regresión abierta en
ninguno de los dos.