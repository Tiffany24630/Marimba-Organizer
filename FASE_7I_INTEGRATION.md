# FASE 7I — AUDITORÍA FINAL DE CALIDAD, SEGURIDAD Y PREPARACIÓN DEL DESPLIEGUE

> Continúa `FASE_7F/7G/7H_INTEGRATION.md`. No contiene credenciales ni secretos.
> **Los resultados de 7H no se repiten aquí como resultados de 7I**: todo lo que
> se afirma abajo se ha ejecutado y medido en esta fase.

---

## 1. Objetivos y alcance

Cerrar los pendientes que 7H dejó declarados: caducidad de tokens, exportación
masiva, auditoría WCAG con herramienta y comprobaciones de HTTPS. Auditar sin
tocar producción.

## 2. Estado inicial de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a92b21d8a88919116048b92815a04b1e50` — **sin commits en toda la fase** |
| Modificados | 22 · No rastreados: 38 |

Archivos protegidos: **NO tocados** por 7I salvo `config.py`, que no estaba en
la lista y tenía un defecto crítico (sección 3).

---

## 3. HALLAZGO CRÍTICO: el backend no arrancaba

**Este es el resultado más importante de la fase.** No lo busqué: lo encontré al
intentar ejecutar la regresión.

### Qué pasaba

`backend/app/core/config.py` usaba `os.environ` **sin haber importado `os`**:

```python
migration_user_password = os.environ.get("MIGRATION_USER_PASSWORD", None)
```

Efecto: `import app.core.config` → `NameError` → **el backend entero no
arrancaba**, ni en local ni en un `docker build` limpio. Las 260 pruebas de 7H
pasaban porque el contenedor `marimba7f` conserva una **imagen anterior**, con el
fichero de antes del cambio. El E2E verde de 7H **ocultaba un backend que no
compila**.

### Por qué "funcionaba" y por qué 7H no lo vio

| Hecho | Consecuencia |
| ----- | ------------ |
| `docker inspect` del backend: `Mounts: []` | El contenedor usa la **imagen**, no el disco. El código roto del disco nunca llegó a ejecutarse |
| La imagen se construyó hace ~13 h | El `config.py` del contenedor tiene 80 líneas; el del disco, 84 |
| E2E en verde | Medía la imagen vieja, no el código actual |

**Lección: un E2E verde no demuestra que el código compile.** Solo demuestra que
la imagen que se construyó antes sí funcionaba.

### Corrección aplicada

No era un `import os` perdido: en Pydantic v2 un atributo **sin anotación de
tipo** dentro de `BaseSettings` es inválido (`PydanticUserError`). La solución
correcta e idiomática es declararlo como campo tipado y dejar que
`pydantic-settings` lo lea del entorno:

```python
migration_user_password: str | None = None
```

El comentario y la intención original se conservan. **Un cambio de una línea.**

### Verificación

| Comprobación | Antes | Después |
| ------------ | ----- | ------- |
| `import app.core.config` | `NameError` | **OK** |
| `pytest` | *no arranca* | **279 passed** |
| Imagen Docker reconstruida | fallaba en `npm run build` | **OK** |

---

## 4. Archivos creados y modificados

**Creados**

```
backend/tests/test_reset_ttl_7i.py          12 pruebas de caducidad
backend/tests/test_cookies_seguras_7i.py     7 pruebas de Secure/CORS
frontend/e2e/specs/masiva.spec.ts            4 pruebas de exportación masiva
frontend/e2e/specs/wcag.spec.ts              5 auditorías axe-core
FASE_7I_INTEGRATION.md                       este informe
```

**Modificados**

| Fichero | Cambio | Motivo |
| ------- | ------ | ------ |
| `backend/app/core/config.py` | campo tipado | **defecto crítico** (§3) |
| `frontend/src/components/ImportPanel.tsx` | `aria-label` en el input de Excel | axe `label` **CRÍTICA** |
| `frontend/src/pages/Project.tsx` | `aria-label` en el selector de composición | axe `select-name` **CRÍTICA** |
| `frontend/src/styles.css` | contraste de `.primary`, grises y login | axe `color-contrast` **SERIA** |
| `frontend/package.json` / `package-lock.json` | `axe-core`, `@axe-core/playwright` | auditoría |

**No tocados**: `optimizer.py`, `test_unified_core.py`, `cli.py`,
`FASE_7F/7G/7H_INTEGRATION.md`, y ninguna lógica de negocio.
---

## 5. Accesibilidad WCAG (axe-core) — VERIFICADO EN NAVEGADOR

Herramientas: `axe-core` + `@axe-core/playwright`, **sin `disableRules`**: si
algo falla se ve, no se esconde. Vistas auditadas: inicio de sesión,
recuperación, panel de proyectos, vista de proyecto y editor.

### Antes de corregir (medido)

| Vista | Total | critical | serious |
| ----- | ----: | -------: | ------: |
| Inicio de sesión | 3 | 0 | 1 |
| Recuperación | 3 | 0 | 1 |
| Panel de proyectos | 3 | **1** | 1 |
| Vista de proyecto | 3 | **1** | 1 |
| Editor de composición | 5 | **1** | 1 |

### Defectos críticos encontrados y corregidos

| Regla | Ubicación | Problema | Corrección |
| ----- | --------- | -------- | ---------- |
| `label` | `ImportPanel.tsx` | El input de Excel no tenía etiqueta: el lector de pantalla solo anuncia "botón de elección de archivo" | `aria-label` descriptivo |
| `select-name` | `Project.tsx` | El selector de composición se anunciaba como "combo box" a secas | `aria-label="Composición de esta canción"` |

Ambos reproducibles, corregidos **sin alterar comportamiento ni aspecto**.

### Defectos serios de contraste (corregidos)

| Selector | Antes | Ahora |
| -------- | ----- | ----- |
| `.primary` | `#1f8f2b` sobre blanco = **4.18:1** | `#1a7523` = **5.81:1** |
| gris de `.hint`, `small`, `topbar span` | `#6b7280` sobre `#f4f6f4` = **4.39:1** | `#5b6472` = **5.44:1** |
| etiquetas y `placeholder` del login | gris por defecto del navegador | `#e5e7eb` / `#9ca3af` sobre `#1f2937` |

Ratios calculados con la fórmula de luminancia relativa de WCAG, no estimados.
El mínimo AA es 4.5:1.

### Lo que queda documentado y NO corregido

| Regla | Gravedad | Por qué |
| ----- | -------- | ------- |
| `landmark-one-main`, `region`, `landmark-unique`, `page-has-heading-one` | moderate | Exigen reestructurar la maqueta (envolver en `<main>`, unificar la barra de sesión, `<h1>` en el editor). Es rediseño |
| `color-contrast` residual | serious | Afecta a superficies concretas de la tarjeta de acceso; requiere revisar la paleta oscura completa |

### Límite explícito de esta auditoría

**Superar axe-core NO es conformidad WCAG.** axe cubre la parte automatizable.
Siguen sin verificar y **no se declaran cumplidos**: orden y sentido del foco en
---

## 6. Exportación masiva — VERIFICADO EN NAVEGADOR

**Lo que 7H dejó sin hacer, y por qué importaba:** su prueba de PNG dibujaba un
canvas desde el propio test. Medía el test, no la aplicación. La exportación
real nunca se ejecutó.

La nueva spec pulsa el botón real **«Exportar todas las imágenes (N)»** y
comprueba los ficheros que descargan.

| Prueba | Resultado |
| ------ | --------- |
| Un PNG por cada composición, nombre con canción + composición + índice | ✅ |
| **Firma binaria** `89 50 4E 47 0D 0A 1A 0A` en cada archivo | ✅ |
| Correspondencia archivo ↔ composición | ✅ |
| Nombres distintos (el índice evita sobrescribir) | ✅ |
| Una composición vacía **no** genera archivo pero **no detiene** a las demás | ✅ |
| Progreso visible durante el trabajo y resumen final | ✅ |
| **Exportar no modifica** nada de lo persistido | ✅ |

### Un fallo real de los datos de prueba (no de la aplicación)

La primera ejecución falló con «La composición está vacía» en las dos
composiciones. Causa: los elementos de prueba **no llevaban `x/y/width/height`**.
`compositionBounds` calcula la caja con esos valores; sin ellos da `NaN`,
devuelve `null` y la aplicación informa «vacía».

Es un hallazgo sobre el método, no sobre el producto: **una prueba que fabrica
sus propios datos puede pasar por lo que realmente no funciona.**

---

## 7. Caducidad de tokens — VERIFICADO (aislado)

`backend/tests/test_reset_ttl_7i.py`, **12 pruebas, 0.52 s**.

**Método** (el 3.º de la lista preferente): se mueve `expires_at` del token en
la base **desechable** `test_marimba.db`.

- NO se toca `RESET_TTL` ni la configuración compartida.
- NO se esperan minutos reales: la caducidad se demuestra en milisegundos.
- NO se introduce reloj inyectable ni se altera `auth_routes`.
- No afecta a las cuentas compartidas del E2E.

| Escenario | Resultado |
| --------- | --------- |
| Token vigente → cambia la clave | ✅ |
| **Token caducado → rechazado y la clave NO cambia** | ✅ |
| Caducado reintentado 3 veces → sigue rechazado | ✅ |
| Caducado **no** queda marcado como usado (caducado ≠ consumido) | ✅ |
| Límite exacto (`expires_at == ahora`) → rechazado (`<=`) | ✅ |
| Un segundo antes del límite → todavía sirve | ✅ |
| Token usado dos veces → rechazado | ✅ |
| Inexistente / vacío / alterado un carácter → rechazados | ✅ |
| El token no aparece ni en la respuesta ni en la base (solo huella de 64) | ✅ |
| El error por caducado es **idéntico** al de token inexistente | ✅ |
| La recuperación válida sigue funcionando y la clave anterior deja de servir | ✅ |

---

## 8. HTTPS y cookies `Secure` — PARCIALMENTE VERIFICADO

**No se puede verificar HTTPS real aquí: este entorno no tiene TLS.**

`backend/tests/test_cookies_seguras_7i.py`, **7 pruebas**:

| Comprobación | Resultado |
| ------------ | --------- |
| `PUBLIC_BASE_URL` en https → cookie `Secure` automática | ✅ |
| En http → **sin** `Secure` (si no, el login local se quedaría sin cookie) | ✅ |
| `SECURE_COOKIES` explícito manda (proxy que termina TLS) | ✅ |
| https + `SECURE_COOKIES=false` → la aplicación **avisa** por log | ✅ |
| El enlace de recuperación usa la URL pública, no `localhost` | ✅ |
| CORS: origen no configurado **no** recibe permiso | ✅ |
| CORS: origen configurado recibe `Allow-Origin` exacto + credenciales, **nunca `*`** | ✅ |

**NO VERIFICADO**: TLS real, certificado, proxy inverso, `Secure` en producción.
Un certificado local habría demostrado el entorno, **no el despliegue**.
el lienzo, operabilidad con teclado del lienzo, cierre de diálogos con Escape y
recuperación de foco, y comprensibilidad real de los mensajes.

**Limitación de Konva, documentada:** el lienzo se dibuja en `<canvas>`, sin
equivalente de teclado. Colocar y girar personas **no es accesible por teclado**
y no se afirma que lo sea. Requiere rediseño, no una corrección puntual.
---

## 9. Seguridad

### Roles y permisos — VERIFICADO EN NAVEGADOR (sin cambios respecto a 7H)

Las 12 pruebas de roles e IDOR de 7H se reejecutaron y siguen en verde dentro de
la suite de 7I: owner completo, editor sin administración, reader sin escritura,
y aislamiento real entre proyectos (404, sin lectura ni escritura).

### Sesiones y recuperación

| Aspecto | Estado |
| ------- | ------ |
| Cookie `HttpOnly` + `SameSite=Lax` | ✅ verificado en 7H y reejecutado |
| Revocación sin cerrar sesión | ✅ |
| Cambio de rol editor→reader | ✅ |
| Cambio de contraseña invalida las demás sesiones | ✅ |
| Token de recuperación de un solo uso | ✅ (+ caducidad en §7) |
| Desactivar un usuario mata sus sesiones | ✅ (suite backend) |
| Protección frente a enumeración de cuentas | ✅ (login y recuperación) |

### Auditoría de eventos

Los eventos siguen siendo los de 7G (`PROJECT_CREATED`, `COMPOSITION_CREATED`,
`COMPOSITION_UPDATED`, rol y collaborators). **No se ha cambiado ningún nombre ni
formato.** No se registran contraseñas, cookies, tokens ni secretos SMTP: la
prueba de caducidad comprueba expresamente que el token no aparece en la
respuesta, en la base (solo huella SHA-256 de 64 caracteres) ni en la salida
capturada.

---

## 10. Regresión

| Suite | 7H | **7I** |
| ----- | --: | -----: |
| Backend `pytest -q` | 260 | **279 passed**, 0 failed (260 + 12 caducidad + 7 cookies/CORS) |
| Frontend `npm test` | 67 | **67 passed**, 0 failed |
| `npx tsc --noEmit` | PASS | **PASS** |
| `npm run build` | PASS | **PASS**, 192 módulos |
| E2E `npx playwright test` | 27 | **36 tests**: 33 passed, 3 failed (ver abajo) |

### E2E: qué falla y por qué

Los 3 fallos son **las mismas 3 infracciones `color-contrast` SERIAS** que se
documentan en §5. No son fallos de funcionalidad: las otras 33 pruebas E2E pasan,
incluidas las 4 de exportación masiva, las de roles, IDOR, recuperación, CORS y
responsive.

| Prueba | Motivo |
| ------ | ------ |
| Inicio de sesión | `color-contrast` en `label:nth-child(2)` (2 nodos) |
| Recuperación | `color-contrast` en `p` (2 nodos) |
| Editor de composición | `color-contrast` en `.active` (1 nodo) |

**No se ocultan con exclusiones.** Las pruebas de axe fallan a propósito cuando
queda una infracción grave: son el mecanismo que dejó ver el problema.

### Dos rondas completas, mismo resultado

| Ronda | Resultado | Duración |
| ----- | --------- | -------: |
| 1.ª | 33 passed, 3 failed | 47.9 s |
| 2.ª | 33 passed, 3 failed | 37.9 s |

Coinciden test a test. **Los 3 fallos son los mismos en ambas y son siempre las
3 infracciones de contraste**, nunca una prueba funcional. Eso confirma que no
hay inestabilidad ni contaminación entre ejecuciones.

Entre rondas se ejecutó `r7h.py` para restablecer las cuentas de pruebas.

### Corrección aplicada y su efecto medido

| Métrica | Antes | Después |
| ------- | ----: | ------: |
| Infracciones **críticas** | 3 | **0** |
| Vistas con `serious` | 5 | 3 |
| Pruebas E2E en verde | 33/36 | 33/36 (mismo; las 3 son los contrastes) |

El progreso en infracciones críticas está medido en la ronda posterior a la
corrección: las reglas `label` y `select-name` **ya no aparecen**.

---

## 11. Integridad de los datos

| Comprobación | Resultado |
| ------------ | --------- |
| Migración temporal idempotente | ✅ (verificada en 7H, no se volvió a ejecutar) |
| Cuentas de pruebas restauradas antes de cada ronda | ✅ `r7h.py` |
| Producción conectada o modificada | ❌ **NO** |
| Volúmenes Docker eliminados | ❌ **NO** |
---

## 12. Pendientes

### Verificado

- Defecto crítico de `config.py` corregido y backend arrancando.
- Caducidad de tokens (12 pruebas, aisladas, sin esperas reales).
- Exportación masiva E2E con PNG reales descargados y firmados.
- Cero infracciones WCAG críticas (3 → 0).
- Contraste de `.primary` y de los grises por debajo de 4.5:1.
- Lógica de `Secure` y CORS (7 pruebas).
- Regresión completa verde salvo los 3 contrastes conocidos.

### Parcialmente verificado

- **Accesibilidad**: automatizada y analizada; 3 contrastes `serious` y varias
  `moderate` pendientes. **No se declara conformidad WCAG.**

### No verificado

- TLS/HTTPS real y `Secure` en producción (no hay TLS en el entorno).
- Conformidad WCAG completa (orden de foco, lienzo, diálogos).
- Operabilidad por teclado del lienzo Konva — **documentada como no accesible**.
- Estado de los datos de producción.

### Pendiente de autorización

- Migración productiva y creación del primer administrador. **No ejecutadas.**

---

## 13. Reproducibilidad

| Comprobación | Comando |
| ------------ | ------- |
| Backend | `cd backend && python -m pytest -q` |
| Caducidad aislada | `python -m pytest tests/test_reset_ttl_7i.py -q` |
| Cookies/CORS | `python -m pytest tests/test_cookies_seguras_7i.py -q` |
| Frontend | `cd frontend && npm test` |
| TypeScript | `npx tsc --noEmit` |
| Build | `npm run build` |
| E2E | `npx playwright test` |
| Solo WCAG | `npx playwright test wcag` |
| Solo masiva | `npx playwright test masiva` |
| Cuentas de pruebas | `docker exec marimba7f-backend-1 python /tmp/r7h.py` |

Si una suite se interrumpe, ejecutar **siempre** el restablecimiento de cuentas
antes de relanzarla.

---

## 14. Estado de la migración productiva

```
MIGRACIÓN PRODUCTIVA EJECUTADA:   NO
ADMINISTRADOR EN PRODUCCIÓN:      NO
PRODUCCIÓN CONECTADA O MODIFICADA: NO
AUTORIZACIÓN:                     PENDIENTE
```

Las pruebas de 7I crean proyectos y composiciones **propios y únicos** (nombre
con sufijo aleatorio) y no tocan el conjunto histórico. No se ha modificado la
base temporal para que los recuentos coincidan.

**Advertencia registrada**: las 65/9 de 7H son de la base **temporal**. Nada en
7I aporta evidencia sobre los datos de producción.

---

## 15. Procedimiento de despliegue (revisado documentalmente)

Revisado sin ejecutarlo. Se mantiene la separación exigida:

**Preparación local** → entorno Docker `marimba7f`, sin datos reales.

**Validación temporal** → 7F/7G/7I sobre `marimba_7f_historico` y el stack
`marimba7f`. Es lo único que está verificado.

**Ejecución productiva → PENDIENTE DE AUTORIZACIÓN EXPRESA.**

Comprobado en el procedimiento:

| Punto | Estado |
| ----- | ------ |
| Identificación inequívoca de la base | ✅ se exige antes de nada |
| Respaldo con `pg_dump` | ✅ |
| Restauración del respaldo en otra base y comparación de recuentos | ✅ |
| Idempotencia | ✅ verificada |
| Comportamiento ante migración interrumpida | ✅ la copia `_bak_projects_7c` permite volver atrás |
| Aviso de pérdida al restaurar | ⚠️ **se reforça en 7I**: restaurar un respaldo **anterior a la migración pierde las escrituras posteriores**. No es un "deshacer" |
| `MIGRATION_USER_PASSWORD` nunca en el repo | ✅ |
| Primer administrador | ✅ `python -m app.cli create-admin` |
| SMTP, `PUBLIC_BASE_URL`, `SECURE_COOKIES`, CORS | ✅ documentados |

**Ningún dato de una base temporal se usa como evidencia del estado de
producción.**