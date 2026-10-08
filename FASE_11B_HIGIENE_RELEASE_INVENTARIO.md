# FASE 11B — HIGIENE DE RELEASE Y SEPARACIÓN SEGURA DE ARTEFACTOS

## 1. Resultado

**FASE 11B — COMPLETADA**

**NO SE RECOMIENDA LIMPIEZA AUTOMÁTICA.**

La inspección produjo un mapa del worktree y candidatos de limpieza, pero no existe evidencia suficiente para borrar, mover o renombrar archivos sin una decisión humana posterior. El worktree no se dejó limpio y todos los elementos preexistentes se conservaron.

## 2. Estado inicial

- Rama: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD de referencia: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- Archivos tracked modificados: 28.
- Archivos untracked no ignorados: 242.
- Archivos tracked eliminados: 0.
- Elementos ignorados detectados: aproximadamente 3.008 archivos, principalmente `node_modules`, bytecode Python, bases locales, `dist` y resultados Playwright.
- El worktree ya contenía cambios acumulados de las Líneas 7–10 y documentación de fases.

El estado de HEAD no se utilizó como criterio para descartar cambios. Se preservó la diferencia entre el baseline histórico y el worktree actual.

## 3. Clasificación general

| Categoría | Elementos identificados | Tracking | Tratamiento |
|---|---|---|---|
| A — Código fuente permanente | `backend/app/**`, `frontend/src/**` | Mezcla de tracked modificado y untracked | Conservar; requiere decisión de release/staging, no limpieza |
| B — Tests permanentes | `backend/tests/**`, `frontend/tests/**`, `frontend/e2e/specs/**`, `pruebas/**` | Mezcla de tracked modificado y untracked | Conservar; son cobertura funcional o de despliegue |
| C — Documentación permanente | `README.md`, `FASE_*.md` | README tracked modificado; fases untracked | Conservar |
| D — Configuración necesaria | `package.json`, lockfile, TypeScript, Vite, Docker, Playwright, Nginx, ejemplos de entorno | Mezcla de tracked y untracked | Conservar; no modificar Compose ni configuración en 11B |
| E — Artefactos temporales identificables | logs, salidas `.txt`, diagnósticos JSON, PNG descargados, builds, caches | Mezcla de untracked e ignored | Candidatos a limpieza posterior; no borrar ahora |
| F — Datos locales | `backend/marimba.db`, `backend/test_marimba.db`, `.env` | Ignorados | No eliminar ni leer valores; requieren decisión humana |
| G — Artefactos/documentos de fase | Documentos `FASE_7*` a `FASE_11A*` y resultados asociados | Principalmente untracked | Conservar como historial; separar outputs solo mediante decisión posterior |
| H — Desconocido | Archivos con nombres opacos o procedencia no demostrable | Untracked | Conservar y marcar como requiere decisión |

## 4. Código fuente permanente

### Backend

Los siguientes archivos untracked tienen apariencia y ubicación de código permanente y no deben tratarse como temporales:

- `backend/app/api/auth_routes.py`
- `backend/app/api/collab_routes.py`
- `backend/app/api/deps.py`
- `backend/app/api/public_routes.py`
- `backend/app/cli.py`
- `backend/app/core/rate_limit.py`
- `backend/app/core/security.py`
- `backend/app/services/mailer.py`

También son código permanente las modificaciones tracked bajo `backend/app/**`, especialmente `routes.py`, `config.py`, `main.py`, `models.py` y `optimizer.py`.

Los archivos protegidos de backend se observaron únicamente: no se modificaron en 11B.

### Frontend

Los archivos untracked bajo `frontend/src/**` corresponden a componentes y utilidades funcionales, entre ellos:

- Componentes: `AccessibleEditor.tsx`, `AdminScreen.tsx`, `AuthScreen.tsx`, `MassExport.tsx`, `NoteEditor.tsx`, `Numero.tsx`, `ProposalPreview.tsx`, `PublicLinkPanel.tsx`, `PublicLinksList.tsx`, `RehearsalView.tsx`, `SharePanel.tsx`, `VersionHistory.tsx`.
- Páginas: `frontend/src/pages/PublicComposition.tsx`.
- Utilidades: `export.ts`, `notes.ts`, `publicLink.ts`, `publicLinks.ts`, `rehearsal.ts`, `render.ts`, `search.ts`.

Las modificaciones tracked bajo `frontend/src/**` también son código permanente. Ningún archivo frontend funcional fue tocado.

## 5. Tests permanentes

### Backend

Los tests untracked bajo `backend/tests/**` incluyen cobertura de bootstrap, caducidad, colaboración, cookies, enlaces públicos, listado, migración, preview, rate-limit, seguridad y versiones. En particular se identificaron:

`test_bootstrap_admin_7g.py`, `test_caducidad_9g.py`, `test_collab_7d.py`, `test_cookies_seguras_7i.py`, `test_enlace_publico_9e.py`, `test_listado_enlaces_9i.py`, `test_migration_7c.py`, `test_preview.py`, `test_rate_limit_9j.py`, `test_reset_ttl_7i.py`, `test_security_admin.py`, `test_security_auth.py` y `test_versiones_9c.py`.

No deben borrarse por ser untracked: pertenecen a contratos funcionales ya auditados.

### Frontend

Los tests untracked de `frontend/tests/**` cubren altura, autenticación, caducidad, colaboración, enlaces públicos, ensayo, exportación, geometría, historial, notas, solo lectura, resize y validación de actualización.

Los specs permanentes de `frontend/e2e/specs/**` incluyen accesibilidad, autenticación, caducidad, diálogos, enlaces públicos, ensayo, exportación, geometría, historial, interacción 10C, interfaz, operación masiva, menús, nombres, público, rate-limit, recuperación, resize, teclado, versiones y WCAG. `frontend/e2e/specs/helpers.ts` es soporte de tests.

Los scripts `frontend/e2e/auth.e2e.cjs`, `roles.e2e.cjs` y `diagnostico.chromium.cjs` requieren revisión de release individual, pero no eliminación automática.

### Pruebas operativas

`pruebas/despliegue/**` y `pruebas/migracion/**` contienen scripts operativos de creación/restablecimiento de usuarios, despliegue, migración, respaldo y restauración. Se clasifican como tests/procedimientos permanentes o históricos; requieren decisión antes de excluirlos de un release.

## 6. Configuración necesaria

Se consideran configuración necesaria, sin modificar:

- Tracked: `.gitignore`, `backend/Dockerfile`, `backend/requirements.txt`, `docker-compose.yml`, `frontend/Dockerfile`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/tsconfig.json` y `frontend/vite.config.ts`.
- Untracked: `docker-compose.7f.yml`, `docker-compose.e2e.yml`, `frontend/nginx.conf`, `frontend/playwright.config.ts` y `.env.example`.
- Ejemplo de entorno tracked: `env.example`.

Los Compose untracked pueden ser necesarios para las fases E2E/despliegue. No se modificaron y no deben eliminarse por su estado untracked.

No se inspeccionaron valores de `.env`; se dejó protegido por `.gitignore` y no se copiaron secretos a este documento.

## 7. Documentación de fases

Los documentos `FASE_*.md` son documentación histórica del proyecto y se conservan. El inventario encontrado incluye fases desde 7C hasta 11A, además de cierres, auditorías, implementaciones, especificaciones e integración.

Clasificación documental:

| Grupo | Ejemplos | Tipo | Acción |
|---|---|---|---|
| Línea 7 | `FASE_7C_DECISION.md` y `FASE_7E`–`FASE_7Z` | Integración, despliegue y cierre histórico | CONSERVAR |
| Línea 8 | `FASE_8A`–`FASE_8G_CIERRE.md` | Implementación e integración histórica | CONSERVAR |
| Línea 9 | `FASE_9A`–`FASE_9L` | Inventarios, auditorías, E2E y cierres | CONSERVAR |
| Línea 10 | `FASE_10A`–`FASE_10E` | Inventario, especificación, implementación y cierre | CONSERVAR |
| Línea 11 | `FASE_11A_INVENTARIO_POST_LINEA_10.md` | Inventario/priorización inmediatamente anterior | CONSERVAR |
| Documento actual | `FASE_11B_HIGIENE_RELEASE_INVENTARIO.md` | Auditoría del worktree | CONSERVAR |

No se detectó un duplicado evidente que pudiera eliminarse con seguridad. No se reorganizaron ni renombraron documentos.

## 8. Artefactos E2E y resultados

### E2E permanente

`frontend/e2e/specs/**`, los helpers y los scripts de autenticación/roles se clasifican como tests o soporte permanente.

### Diagnósticos y resultados untracked

Los siguientes archivos tienen apariencia de salidas reproducibles de diagnóstico y no de código de producto:

- `frontend/e2e/.diag.json`
- `frontend/e2e/.diagnostico.txt`
- `frontend/e2e/.dom.json`
- `frontend/e2e/.resultados.json`
- `frontend/e2e/.descargas/*.png`
- `frontend/e2e_*.log`
- `frontend/dir_rate_limit_9j.log`
- `9j_e2e_run.log`, `dir9j.log`
- `backend/pytest9j.log`, `backend/pytest9j_result.log`

Clasificación: **E — candidato a limpieza posterior**, con posible valor histórico como evidencia. No se eliminó ninguno.

No se encontró un directorio versionado `playwright-report` ni traces/videos identificables. `frontend/test-results` existe como directorio ignorado y contiene un resultado generado; se conserva.

## 9. Logs y salidas de comandos

Los archivos raíz con nombres como `9i_*`, `9j_*`, `e2e_*`, `out_*`, `cfg*`, `gs_*`, `gits.txt`, `git_status_9gr5.txt`, `_r1_*`, `_r2_*`, `docker_info_out.txt`, `up_out.txt`, `install_out.txt`, `start_out.txt` y similares son salidas de inspección o ejecución de fases.

No son necesarios para ejecutar el producto según su ubicación y extensión, pero podrían contener evidencia histórica. Se clasifican como:

**E — artefacto temporal reproducible, con decisión pendiente sobre conservación histórica.**

Los scripts `check_proc.py` y `run9j_e2e.cjs` no se clasifican como simples logs: pueden ser herramientas de diagnóstico reproducibles y requieren revisión humana antes de excluirlos.

## 10. Builds y caches

| Elemento | Tracking | Tamaño observado | Clasificación | Acción |
|---|---:|---:|---|---|
| `frontend/node_modules/` | Ignorado | aprox. 2.935 archivos / 88 MB | E — dependencia regenerable | CANDIDATO A LIMPIEZA, solo en actividad separada |
| `frontend/dist/` | Ignorado | 3 archivos / aprox. 720 KB | E — build regenerable | CANDIDATO A LIMPIEZA |
| `frontend/test-results/` | Ignorado | 1 archivo | E — resultado Playwright | CANDIDATO A LIMPIEZA |
| `frontend/tsconfig.tsbuildinfo` | Ignorado | aprox. 1 KB | E — cache TypeScript | CANDIDATO A LIMPIEZA |
| `backend/app/**/__pycache__/` | Ignorado | bytecode regenerable | E — cache Python | CANDIDATO A LIMPIEZA |
| `backend/tests/__pycache__/` | Ignorado | bytecode regenerable | E — cache Python | CANDIDATO A LIMPIEZA |
| `backend/.pytest_cache/` | Ignorado | existe; inspección parcialmente limitada por permisos | E — cache pytest | CANDIDATO A LIMPIEZA |

No se modificó `.gitignore` ni se ejecutó una limpieza.

## 11. Bases de datos locales

| Archivo | Tracking | Tamaño observado | Interpretación segura |
|---|---|---:|---|
| `backend/marimba.db` | Ignorado por `*.db` | 196.608 bytes | Probable base local de desarrollo; su contenido/valor histórico no se determinó |
| `backend/test_marimba.db` | Ignorado por `*.db` | 475.136 bytes | Probable base generada o usada por tests; su contenido/valor histórico no se determinó |

Ambas bases se conservaron. No se ejecutó `del`, `rm`, `unlink`, migración ni script de limpieza. La decisión sobre conservarlas o regenerarlas queda expresamente pendiente.

## 12. Revisión de `.gitignore`

Existe un `.gitignore` raíz con reglas para:

- Dependencias: `node_modules/`.
- Configuración local: `.env`.
- Bases SQLite: `*.db`, `*.sqlite`, `*.sqlite3`.
- Python: `__pycache__/`, `*.py[cod]`, `.pytest_cache/`, entornos virtuales.
- Frontend: `dist/`, `*.tsbuildinfo`, `frontend/test-results/`, `playwright-report/`.
- Editor y sistema.

No existen `frontend/.gitignore` ni `backend/.gitignore` en el worktree inspeccionado.

Hallazgos documentales, no aplicados:

1. `frontend/e2e/.descargas/` no aparece cubierto por una regla específica y contiene PNG generados por E2E.
2. Los logs raíz y logs bajo `frontend/`/`backend/` tampoco tienen una regla general.
3. Los artefactos de fase `.txt` no deben ignorarse automáticamente porque algunos conservan evidencia histórica.

Estos hallazgos son candidatos para una futura decisión sobre `.gitignore`; 11B no modifica esa configuración.

## 13. Candidatos de limpieza

| Candidato | Motivo | Riesgo | Evidencia | Acción recomendada |
|---|---|---|---|---|
| `frontend/node_modules/` | Dependencias regenerables | Bajo para el código; requiere reinstalación | Ignorado por `node_modules/` | POSIBLEMENTE ELIMINAR en actividad separada |
| `frontend/dist/` | Build regenerable | Bajo; requiere rebuild | Ignorado por `dist/` | POSIBLEMENTE ELIMINAR |
| `frontend/test-results/` | Resultado Playwright regenerable | Bajo, salvo valor de diagnóstico | Ignorado por `frontend/test-results/` | REVISAR y luego posiblemente eliminar |
| `__pycache__`, `.pytest_cache`, `*.tsbuildinfo` | Caches regenerables | Bajo | Reglas de ignore y nombres | POSIBLEMENTE ELIMINAR |
| `frontend/e2e/.descargas/*.png` | Descargas de exportación E2E | Medio si se conservan como evidencia | No ignorado; nombres de descargas | REVISAR |
| `frontend/e2e/.diag*`, `.resultados.json`, `.dom.json` | Diagnóstico E2E | Medio si respalda una investigación histórica | Ubicación y nombres | REVISAR |
| Logs y salidas `9i_*`, `9j_*`, `e2e_*`, `out_*`, `_r1_*`, `_r2_*` | Salidas reproducibles | Medio por posible evidencia de cierre | Nombres y contenido de ejecución | ARCHIVAR o POSIBLEMENTE ELIMINAR tras decisión |
| `backend/marimba.db`, `backend/test_marimba.db` | Datos locales | Alto: pueden contener trabajo o fixtures | Ignorados por `*.db`; propósito no confirmado | REQUIERE DECISIÓN; no eliminar |
| Código/test/config untracked | Puede ser trabajo funcional de fases | Muy alto | Ubicación bajo `backend/app`, `backend/tests`, `frontend/src`, `frontend/e2e`, Compose | CONSERVAR; no limpiar |

## 14. Archivos que no deben tocarse

Durante esta fase quedaron explícitamente protegidos:

- `backend/app/services/suggestions/optimizer.py`
- `backend/tests/test_unified_core.py`
- `backend/app/cli.py`
- `frontend/src/store/composition.ts`
- `frontend/src/components/Numero.tsx`
- `frontend/src/components/Inspector.tsx`
- `frontend/src/components/AccessibleEditor.tsx`
- `frontend/src/lib/layout.ts`
- `frontend/src/components/CanvasEditor.tsx`
- `backend/app/api/public_routes.py`
- `backend/app/core/rate_limit.py`
- `docker-compose.yml`
- `docker-compose.7f.yml`
- `docker-compose.e2e.yml`
- Todas las bases locales, logs, screenshots, resultados E2E y documentos de fases preexistentes.

## 15. Elementos que requieren decisión humana

1. Si `backend/marimba.db` y `backend/test_marimba.db` contienen datos de desarrollo que deben conservarse.
2. Qué archivos de salida de fases deben permanecer como evidencia histórica y cuáles pueden archivarse.
3. Si los scripts de diagnóstico (`check_proc.py`, `run9j_e2e.cjs`, `diagnostico.chromium.cjs`) pasan a herramientas permanentes o a archivo histórico.
4. Si el contenido de `frontend/e2e/.descargas/` se conserva como evidencia de exportación.
5. Qué archivos untracked de código, tests y configuración deben incorporarse al release o a una rama de trabajo posterior.
6. Si se desean reglas de `.gitignore` para descargas E2E y logs; no deben agregarse sin revisar su impacto en evidencia.

## 16. Verificación realizada

### Ejecutado en esta fase

- `git status --short` y `git status --porcelain=v1 --ignored`.
- `git diff --stat` y `git diff --name-only`.
- `git ls-files`.
- Enumeración no destructiva de archivos y directorios.
- Revisión de `.gitignore` y reglas efectivas mediante `git check-ignore`.
- Conteo y clasificación de tracked, untracked, ignored y eliminados.
- Inspección de nombres, tamaños y ubicación de artefactos E2E, builds, caches y bases locales.

### No ejecutado

- No se ejecutaron pruebas unitarias, backend, frontend ni E2E.
- No se ejecutaron builds.
- No se modificó código ni configuración.
- No se accedió a producción ni a datos reales.

## 17. Protecciones confirmadas

- No se borró ningún archivo.
- No se ejecutaron `git clean`, `git reset`, `git restore`, `git checkout`, `git switch`, `git merge`, `git rebase`, `git commit` ni `git push`.
- No se cambiaron rama ni HEAD.
- No se tocaron bases de datos locales.
- No se ejecutó `docker compose down -v`.
- No se modificó Compose.
- No se modificaron archivos funcionales ni protegidos.
- No se imprimieron valores de `.env` ni secretos.
- No se tocó producción, PostgreSQL real, migraciones ni volúmenes.

## 18. Recomendación final

La siguiente actividad, si se autoriza, debe ser una **limpieza controlada con prompt específico**, separando como mínimo:

1. caches y dependencias regenerables;
2. resultados E2E y logs con valor histórico;
3. bases locales;
4. código, tests, documentación y configuración untracked.

No se recomienda ejecutar una limpieza general del worktree. El riesgo de perder código funcional, pruebas, Compose o evidencia de fases supera el beneficio de eliminar artefactos en este estado.

**Estado final de 11B: mapa del worktree generado, artefactos clasificados, candidatos identificados y ningún archivo eliminado.**
