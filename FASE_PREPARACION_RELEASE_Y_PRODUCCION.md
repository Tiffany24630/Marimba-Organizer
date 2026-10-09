# FASE — PREPARACIÓN DEL PRIMER LOTE GIT Y BOOTSTRAP SEGURO DE PRODUCCIÓN

## Resultado

```text
PRIMER COMMIT:
PREPARADO, PENDIENTE DE AUTORIZACIÓN

UPSTREAM:
PENDIENTE DE CONFIRMACIÓN/RECUPERACIÓN DE CONECTIVIDAD

AUTOMATIZACIÓN 30 MIN:
DISEÑADA, NO ACTIVADA

ADMIN DE PRODUCCIÓN:
MECANISMO IDENTIFICADO, NO EJECUTADO

PRODUCCIÓN:
SIN CAMBIOS
```

## 1. Estado Git

- Branch: `checkpoint/fase1-motor-d1-d3-d5`.
- HEAD: `3253c2a92b21d8a88919116048b92815a04b1e50`.
- Remote configurado: `origin` → `https://github.com/Tiffany24630/Marimba-Organizer.git`.
- Upstream de la branch actual: no configurado.
- Branches remotas visibles localmente: `origin/main` y `origin/HEAD -> origin/main`.
- `git remote show origin` no pudo completarse porque GitHub no era accesible desde el entorno.
- No se hizo `git add`, commit, push ni cambio de branch.

El worktree contiene cambios acumulados de fases anteriores: código, tests, documentación, configuración, Compose, salidas históricas y archivos de procedencia pendiente. No se asumió que todo deba entrar en el primer commit.

## 2. Clasificación del worktree

| Categoría | Elementos identificados | Tratamiento |
|---|---|---|
| A — Funcionalidad implementada | Modificaciones en `backend/app/**`, `frontend/src/**` y código untracked bajo esas áreas | No incluir automáticamente; requiere selección funcional por separado |
| B — Tests | `backend/tests/**`, `frontend/tests/**`, `frontend/e2e/**`, `pruebas/**` | Conservar; incluir solo junto con su unidad funcional correspondiente |
| C — Documentación | `README.md`, documentos `FASE_*.md` y cierre del roadmap | Candidatos si son documentación permanente y coherente |
| D — Configuración necesaria | `package.json`, lockfile, Docker, Compose, Vite, Playwright, Nginx y ejemplos de entorno | Conservar; no incluir sin revisar la unidad que los necesita |
| E — Evidencia histórica | Logs, salidas `out_*`, `9i_*`, `9j_*`, `e2e_*`, `_r1_*`, `_r2_*`, diagnósticos y descargas E2E | Excluir del primer commit |
| F — Artefactos regenerables | Dependencias, builds y caches eliminados en 11C | Excluir; actualmente ausentes |
| G — Datos locales | `.env`, `backend/marimba.db`, `backend/test_marimba.db` | Excluir siempre |
| H — Desconocido | Scripts auxiliares y archivos de salida cuya pertenencia a release no está demostrada | Conservar y excluir hasta decisión humana |

## 3. Primer lote propuesto

### ARCHIVOS PROPUESTOS PARA COMMIT 1

1. `FASE_11A_INVENTARIO_POST_LINEA_10.md`
2. `FASE_11B_HIGIENE_RELEASE_INVENTARIO.md`
3. `FASE_11C_LIMPIEZA_CONTROLADA.md`
4. `FASE_11D_AUDITORIA_FINAL_MANTENIMIENTO.md`
5. `CIERRE_ROADMAP_MARIMBA_ORGANIZER.md`

**Motivo de agrupación:** los cinco archivos forman una unidad documental continua: inventario post-Línea 10, higiene del worktree, limpieza controlada, auditoría final y cierre global del roadmap. No mezclan código, datos, artefactos ni secretos y no se seleccionaron únicamente por orden alfabético.

**Tipo:** `docs`.

La propuesta queda sin staging y pendiente de autorización explícita. No se modificó ningún archivo para alcanzar cinco elementos.

### Revisión del lote

Los cinco archivos son nuevos, de extensión Markdown, y fueron revisados como documentos de cierre. Sus contenidos describen estado, evidencia histórica, protecciones y deudas; no contienen contraseñas, tokens, claves privadas, URLs de secretos ni datos de producción.

La revisión equivalente a `git diff --no-index /dev/null <archivo>` confirma que se trata de archivos nuevos completos, no de modificaciones parciales a código existente. No se detectó razón para incluir en este lote `README.md`, Compose, tests o código funcional.

## 4. Exclusiones del primer commit

Quedan fuera, sin eliminarlos:

- `backend/marimba.db` y `backend/test_marimba.db`.
- `.env` y cualquier archivo de credenciales.
- Logs, screenshots, diagnósticos, descargas E2E y salidas de comandos.
- Caches, builds y dependencias regenerables.
- Código y tests funcionales acumulados que no tienen una unidad de commit aprobada.
- Compose y configuración cuya relación con el primer lote no está demostrada.
- Documentos históricos de fases 7–10, para no inflar el primer commit.
- Archivos con procedencia desconocida.

No se usó `git add .` ni `git commit -am`.

## 5. Convención de commits observada

El historial utiliza principalmente mensajes tipo Conventional Commits:

- `feat:` y variantes como `feat(frontend):` o `feat(backend):`.
- `fix:` y variantes como `fix(frontend):` o `fix(api):`.
- `test:` y `test(e2e):`.
- `chore:`.
- También existen mensajes históricos sin prefijo y checkpoints descriptivos.

Para el lote propuesto corresponde `docs:`, siempre que esa forma sea aceptada al autorizar el commit. No se usarán mensajes genéricos como `update`, `misc`, `backup` o `auto commit`.

## 6. Upstream y conectividad

Estado actual:

```text
origin:
https://github.com/Tiffany24630/Marimba-Organizer.git

branch:
checkpoint/fase1-motor-d1-d3-d5

upstream:
no confirmado / no configurado

conectividad:
GitHub no accesible desde el entorno durante la inspección
```

No se ejecutará `git push -u` hasta confirmar el destino y recuperar conectividad. No se inventará `origin/checkpoint/fase1-d1-d3-d5` ni otra branch remota. Tampoco se cambiará el upstream automáticamente.

## 7. Diseño futuro de automatización de 30 minutos

La automatización queda diseñada, pero no activada ni instalada.

```text
cada 30 minutos
        ↓
git status
        ↓
clasificación por allowlist/manifest aprobado
        ↓
detección de secretos y conflictos
        ↓
selección de unidad coherente
        ↓
staging explícito de rutas aprobadas
        ↓
revisión del staged diff
        ↓
commit con mensaje histórico coherente
        ↓
push normal solo si existe upstream confirmado
```

Reglas del diseño:

- No usar `git add .`.
- No usar `git commit -am`.
- No crear commits vacíos.
- No incluir `.env`, bases, credenciales, tokens, logs, caches ni artefactos.
- Preferir 4–5 archivos solo cuando la unidad funcional lo permita.
- Permitir 1–3 o más de 5 cuando separar rompa la coherencia.
- Detenerse ante conflicto, secreto, branch sin upstream o rechazo remoto.
- Nunca usar `--force`, `--force-with-lease`, reset, clean, stash automático o rebase automático.
- Si el push no está disponible, dejar los cambios pendientes sin destruirlos.

No se configuró tarea programada, watcher, servicio persistente ni proceso de 30 minutos.

## 8. Bootstrap de producción

### Mecanismo oficial identificado

El mecanismo oficial es:

```bash
python -m app.cli create-admin
```

La CLI:

- recibe `--email` obligatorio;
- puede recibir `--nombre`;
- solicita la contraseña mediante `getpass` si no se proporciona un fichero;
- valida la contraseña con la misma política de la aplicación;
- crea un usuario con rol `admin`, activo y con cambio de contraseña inicial;
- es idempotente si la cuenta ya es administradora;
- requiere `--promover` explícito si la cuenta existente es un usuario normal;
- no imprime la contraseña.

La API normal de administración crea usuarios normales y no es el mecanismo para crear el primer administrador.

### Producción identificada

**NO.** La inspección del repositorio no identifica inequívocamente una URL de producción, backend de producción, base de producción, tenant inicial o mecanismo de despliegue activo. `localhost`, SQLite local, Docker de desarrollo y Docker E2E no se consideran producción.

### Datos del administrador

```text
admin identificado: NO
tenant identificado: NO
nombre: pendiente
correo: pendiente
contraseña: no solicitada ni almacenada
```

La creación queda bloqueada hasta disponer del entorno y de nombre, correo y tenant reales. La contraseña deberá introducirse interactivamente en el entorno confirmado, nunca en Git, documentación, logs o argumentos visibles.

### Ejecución

```text
NO REALIZADA
```

No se accedió a producción, no se ejecutó `create-admin` y no se modificaron bases ni datos.

## 9. Verificación y protecciones

Realizado en esta fase:

- Inspección de estado Git, branch, branches remotas, remoto e historial.
- Clasificación del worktree por tipo y riesgo.
- Selección razonada de un único lote documental de cinco archivos.
- Revisión de posibles secretos en el lote propuesto.
- Inspección estática de `backend/app/cli.py` y de las rutas administrativas.
- Revisión de referencias de configuración sin imprimir valores secretos.

No realizado:

- `git add`, commit o push.
- Configuración del upstream.
- Automatización o tarea programada.
- Ejecución de `create-admin`.
- Creación de usuarios.
- Pruebas, builds, migraciones o comandos de producción.

## 10. Estado final de la preparación

```text
PRIMER COMMIT:
PREPARADO, PENDIENTE DE AUTORIZACIÓN

UPSTREAM:
PENDIENTE DE CONFIRMACIÓN/RECUPERACIÓN DE CONECTIVIDAD

AUTOMATIZACIÓN 30 MIN:
DISEÑADA, NO ACTIVADA

ADMIN DE PRODUCCIÓN:
MECANISMO IDENTIFICADO, NO EJECUTADO

PRODUCCIÓN:
SIN CAMBIOS
```

La siguiente operación, si se autoriza expresamente, debe aprobar por separado el lote, confirmar el upstream y la conectividad, y aportar los datos reales del entorno de producción. No se avanza automáticamente a commit, push ni bootstrap.
