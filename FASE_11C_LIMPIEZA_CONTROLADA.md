# FASE 11C — LIMPIEZA CONTROLADA DE ARTEFACTOS REGENERABLES

## 1. Resultado

**LIMPIEZA CONTROLADA COMPLETADA**

La limpieza se limitó a artefactos locales ignorados, no versionados y regenerables. Se conservaron código, tests, documentación, configuración, bases locales, logs, evidencia histórica y herramientas de diagnóstico.

Quedan elementos untracked y artefactos históricos identificados en 11B; no se intentó dejar el worktree limpio.

## 2. Estado inicial

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- Worktree: cambios acumulados preexistentes de las Líneas 7–10 y documentación de fases.
- Antes de limpiar: 28 archivos tracked modificados y 242 archivos untracked no ignorados según el inventario 11B.
- No había archivos tracked eliminados.

Se realizó una nueva inspección antes de eliminar. Cada candidato se comprobó por ruta absoluta dentro del workspace, estado ignored/no tracked y tipo de artefacto.

## 3. Candidatos encontrados y decisión

| Ruta | Tipo | Ignorado | Regenerable | Riesgo | Decisión |
|---|---|---:|---:|---|---|
| `frontend/node_modules/` | Dependencias instaladas | Sí | Sí, mediante instalación de dependencias | Bajo para fuentes; requiere reinstalación | ELIMINADO |
| `frontend/dist/` | Salida de build Vite | Sí | Sí, mediante build | Bajo | ELIMINADO |
| `frontend/test-results/` | Resultado generado de Playwright | Sí | Sí, mediante ejecución E2E | Bajo; no era investigación abierta | ELIMINADO |
| `frontend/tsconfig.tsbuildinfo` | Cache incremental TypeScript | Sí | Sí | Bajo | ELIMINADO |
| `backend/**/__pycache__/` | Bytecode Python | Sí | Sí | Bajo | ELIMINADO; 9 directorios y 65 archivos `.pyc` |
| `backend/.pytest_cache/` | Cache de pytest | Sí | Sí | Bajo | ELIMINADO |
| `backend/marimba.db` | Base local | Sí | No determinado | Alto | CONSERVADO; requiere decisión humana |
| `backend/test_marimba.db` | Base local de tests/desarrollo | Sí | No determinado | Alto | CONSERVADO; requiere decisión humana |
| `frontend/e2e/.diag.json`, `.diagnostico.txt`, `.dom.json`, `.resultados.json` | Diagnóstico E2E | No | Reproducible, pero puede contener evidencia histórica | Medio | CONSERVADO |
| `frontend/e2e/.descargas/**` | Descargas PNG de E2E | No | Reproducible, con posible valor de evidencia | Medio | CONSERVADO |
| Logs `9i_*`, `9j_*`, `e2e_*`, `out_*`, `_r1_*`, `_r2_*` | Evidencia/salidas históricas | No | Sí, pero valor histórico no resuelto | Medio | CONSERVADOS |
| Código, tests, documentación y configuración untracked | Trabajo funcional o histórico | No | No clasificable como cache | Muy alto | CONSERVADOS |

### Nota sobre bytecode Python

La inspección detectó caches bajo `backend/app/**/__pycache__` y `backend/tests/__pycache__` como ignorados. Se eliminaron únicamente los 9 directorios exactos verificados y sus 65 archivos `.pyc`; no se eliminaron archivos `.py`, tests ni directorios fuente.

## 4. Archivos eliminados

Se eliminaron únicamente estas cinco rutas:

1. `frontend/node_modules/` — 2.935 archivos, aproximadamente 88 MB.
2. `frontend/dist/` — 3 archivos, aproximadamente 720 KB.
3. `frontend/test-results/` — 1 resultado generado.
4. `frontend/tsconfig.tsbuildinfo` — aproximadamente 1 KB.
5. `backend/.pytest_cache/` — cache de pytest; su eliminación requirió una operación exacta con permisos ampliados porque la eliminación local inicial fue rechazada por permisos.
6. `backend/app/__pycache__/`.
7. `backend/app/api/__pycache__/`.
8. `backend/app/core/__pycache__/`.
9. `backend/app/db/__pycache__/`.
10. `backend/app/models/__pycache__/`.
11. `backend/app/schemas/__pycache__/`.
12. `backend/app/services/__pycache__/`.
13. `backend/app/services/suggestions/__pycache__/`.
14. `backend/tests/__pycache__/`.

Los últimos nueve directorios contenían 65 archivos `.pyc` en total.

No se ejecutó `npm install` después de eliminar `node_modules` y no se modificaron `package.json` ni `package-lock.json`.

## 5. Archivos y grupos conservados

Se verificó que siguen presentes:

- Código: `frontend/src`, `backend/app`.
- Tests: `frontend/tests`, `frontend/e2e`, `backend/tests`, `pruebas`.
- Documentación: `README.md`, `FASE_*.md`.
- Configuración: `package.json`, `package-lock.json`, TypeScript, Vite, Nginx y Compose.
- Compose: `docker-compose.yml`, `docker-compose.7f.yml`, `docker-compose.e2e.yml`.
- Bases: `backend/marimba.db`, `backend/test_marimba.db`.
- Evidencia E2E: diagnósticos y `frontend/e2e/.descargas`.
- Logs y resultados históricos de las fases 9J–10E.
- Scripts de diagnóstico: `check_proc.py`, `run9j_e2e.cjs`, `frontend/e2e/diagnostico.chromium.cjs`.

## 6. Estado Git posterior

Después de la limpieza:

- No hay archivos tracked eliminados.
- Las 28 modificaciones tracked preexistentes continúan presentes.
- Los archivos funcionales, tests y documentación untracked continúan presentes.
- Las cinco rutas limpiadas son ignoradas y no aparecen como cambios funcionales de Git.
- No se intentó corregir el worktree ni reducir los untracked históricos.

La comparación post-limpieza no muestra eliminaciones de código, tests, documentación, Compose o configuración necesaria.

## 7. Integridad estructural

Comprobación realizada:

| Elemento | Presente después de limpiar |
|---|---:|
| `frontend/package.json` | Sí |
| `frontend/package-lock.json` | Sí |
| `frontend/src` | Sí |
| `frontend/e2e` | Sí |
| `backend/app` | Sí |
| `backend/tests` | Sí |
| `README.md` | Sí |
| `docker-compose.yml` | Sí |
| `docker-compose.e2e.yml` | Sí |
| `backend/marimba.db` | Sí |
| `backend/test_marimba.db` | Sí |
| `FASE_*.md` | Sí |
| `frontend/e2e/.descargas` | Sí |

Las rutas limpiadas quedaron ausentes y son regenerables:

- `frontend/node_modules`: ausente.
- `frontend/dist`: ausente.
- `frontend/test-results`: ausente.
- `frontend/tsconfig.tsbuildinfo`: ausente.
- `backend/.pytest_cache`: ausente.

## 8. Pruebas

**No ejecutadas.**

No se ejecutaron `pytest`, `npm test`, Playwright ni build. La fase solo eliminó dependencias, caches, resultados y build regenerables; no se modificó código funcional.

Los resultados históricos de 10E y fases anteriores no se presentan como ejecuciones nuevas de 11C.

## 9. Protecciones

- No se utilizó `git clean`.
- No se utilizó `git reset`.
- No se utilizó `git restore`.
- No se utilizaron `git checkout`, `git switch`, `git merge` ni `git rebase`.
- No se hizo commit ni push.
- No se cambió de rama.
- No se tocaron `backend/marimba.db` ni `backend/test_marimba.db`.
- No se eliminaron logs, diagnósticos, screenshots, documentos de fases ni scripts.
- No se modificó `.gitignore`.
- No se modificó código funcional, tests, Compose ni configuración.
- No se accedió a producción, migraciones, volúmenes ni datos reales.
- No se ejecutó `docker compose down -v`.

## 10. Elementos que siguen requiriendo decisión humana

1. Conservación o archivo de logs y salidas históricas.
2. Conservación futura de descargas PNG y diagnósticos E2E.
3. Propósito y ciclo de vida de las bases SQLite locales.
4. Incorporación al release de código, tests y configuración untracked.
5. Posibles reglas futuras de `.gitignore` para logs y descargas E2E.

Estos elementos quedan fuera de 11C para evitar pérdida de trabajo o evidencia.

## 11. Resultado final

**FASE 11C — LIMPIEZA CONTROLADA COMPLETADA**

Se liberaron únicamente artefactos regenerables inequívocos. El worktree conserva íntegramente el contenido funcional e histórico. No se crea automáticamente una FASE 11D.
