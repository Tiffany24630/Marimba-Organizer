# FASE 7J — CORRECCIÓN DE ACCESIBILIDAD, ALTERNATIVA AL LIENZO Y VALIDACIÓN DE IMÁGENES

> Continúa `FASE_7I_INTEGRATION.md`. Sin commits, sin push, sin cambios de rama.
> No contiene credenciales ni secretos. **Los resultados de 7I no se repiten
> aquí como resultados de 7J.**

---

## 1. Objetivos

Cerrar las tres infracciones `serious` de contraste que 7I dejó pendientes,
ofrecer una alternativa funcional de teclado al lienzo de Konva y garantizar que
las pruebas se ejecutan sobre imágenes Docker construidas desde el código actual.

## 2. Estado inicial de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a92b21d8a88919116048b92815a04b1e50` — **sin commits en la fase** |
| Modificados / sin seguimiento | 23 / 40 |

Archivos protegidos **intactos**: `optimizer.py` (+7), `test_unified_core.py`
(+216), `cli.py` sin diferencias. Verificado con `git diff --stat`.

---

## 3. Correcciones de contraste — VERIFICADO

### El error de método que casi se repite

7I corrigió colores **a ciegas**. En 7J se aprendió la lección: se amplió el
reporte de axe para que devuelva los colores **reales** que él calcula
(`fgColor`, `bgColor`, `contrastRatio`, tamaño y peso). Sin ese dato no hay forma
razonable de saber qué corregir.

### Diagnóstico exacto (colores reales, no estimados)

| Elemento | Texto → fondo | Ratio | Causa real |
| -------- | ------------- | ----: | ---------- |
| `label:nth-child(2)` (login) | `#374151` → `#1f2937` | **1.42** | La regla **global** `.field` usa un gris oscuro pensado para fondo **claro**; dentro de la tarjeta oscura es ilegible |
| `p` (recuperación) | `#5b6472` → `#1f2937` | **2.45** | `.hint` hereda el gris que **7I fijó para fondos claros** |
| `.active` (editor) | `#ffffff` → `#1f8f2b` | **4.18** | `.side-tab.active` usaba el verde **antiguo**; 7I solo había corregido `.primary` |

### Correcciones aplicadas (localizadas, sin tocar la paleta global)

| Selector | Antes | Después | Ratio nuevo |
| -------- | ----- | ------- | ----------: |
| `.auth-card .field` | `#374151` | `#e5e7eb` | **11.86:1** |
| `.auth-card .hint` | `#5b6472` | `#cbd5e1` | **9.89:1** |
| `.side-tab.active` | `#1f8f2b` | `#1a7523` | **5.81:1** |

Además se eliminó una **regla `.auth-card .field` duplicada** heredada de 7I.

### Resultado medido

Las cinco vistas auditadas en 7I pasan ahora. **Infracciones graves: 0.**

| Vista | Antes (7I) | Ahora (7J) |
| ----- | ---------: | ---------: |
| Inicio de sesión | 3 (1 grave) | 2 (0 graves) |
| Recuperación | 3 (1 grave) | 2 (0 graves) |
| Panel de proyectos | 1 | 1 |
| Vista de proyecto | 1 | 1 |
| Editor de composición | 4 (1 grave) | 3 (0 graves) |

Lo que queda son `moderate` de semántica (`landmark-one-main`, `region`,
`landmark-unique`, `page-has-heading-one`), **sin corregir**: exigirían
reestructurar la maqueta y no se tocan para no arriesgar los selectores de las
pruebas E2E.

---

## 4. Alternativa accesible al lienzo — VERIFICADA EN NAVEGADOR

Nuevo componente `frontend/src/components/AccessibleEditor.tsx`, accesible desde
un botón **«Edición sin ratón»** en la cabecera del editor, que conmuta entre el
lienzo y la vista HTML.

### Principio de diseño: no hay motor propio

Todo pasa por las **mismas acciones del store** que ya usa el lienzo
(`assign`, `unassign`, `update`, `undo`, `redo`). Por eso:

- las dos vistas están **sincronizadas por construcción** (leen el mismo estado);
- el **deshacer/rehacer** es el del store, no una copia;
- el **candado** (`elementLocked`) y el **modo de solo lectura** se respetan igual;
- **no se toca el motor de distribución** ni se duplica ninguna regla.

La rotación usa `update(m.id,{rotation})`, la misma llamada que el Inspector.

### Operaciones disponibles

| Operación | Cómo |
| --------- | ---- |
| Consultar marimbas, puestos y personas | HTML semántico |
| Identificar asignadas y puestos vacíos | Texto explícito, no solo color |
| Seleccionar una persona | `<select>` nativo |
| Asignar a un puesto | `<select>` + botón **Asignar** |
| Mover de un puesto a otro | Asignar de nuevo (misma operación) |
| Retirar de un puesto | Botón **«Retirar a Ana del puesto…»** |
| Girar una marimba | Botón **«Girar la marimba… 90 grados»** |
| Consultar bloqueos | Sufijo «— bloqueada» en las opciones |
| Deshacer / rehacer | Botones conectados al historial del store |

**No crea marimbas ni puestos**: solo consulta y reasigna lo que ya existe.

### Teclado y lectores de pantalla

- Solo controles **nativos** (`<select>`, `<button>`): Tab, Shift+Tab, Enter y
  Espacio funcionan **sin ningún manejador global**, que es lo que evita
  interferir con campos de texto y diálogos.
- Región `role="status" aria-live="polite"` que anuncia el resultado de cada
  operación («Ana quedó asignado a Primera de Marimba tenor», «Ana salió del
  puesto… Queda sin sentar»), no solo cambios de color.
- Los botones nombran la **acción completa**, no «Asignar» a secas.
- El botón de conmutación declara su estado con `aria-pressed`.
---

## 5. Semántica y diálogos

**No corregidos.** Las cuatro reglas pendientes (`landmark-one-main`, `region`,
`landmark-unique`, `page-has-heading-one`) requieren envolver contenido en
`<main>`, unificar la barra de sesión y añadir `<h1>` al editor. Es un rediseño
de la maqueta con riesgo de romper los localizadores de las pruebas existentes, y
la fase prioriza la funcionalidad sobre la estética.

**Auditoría de diálogos: NO REALIZADA.** Escape, foco inicial y recuperación del
foco quedan pendientes.

---

## 6. Reconstrucción de imágenes Docker — VERIFICADO

El problema que 7I detectó queda resuelto y documentado.

| Servicio | Imagen | Interpretación |
| -------- | ------ | -------------- |
| backend | `sha256:410b083a…` | Cache hit correcto: el backend **no cambió** en 7J |
| frontend | `sha256:63932810…` | **Imagen nueva**: incluye los cambios de 7J |

Comprobaciones exigidas antes de dar por válida la imagen:

| Comprobación | Resultado |
| ------------ | --------- |
| `import app.core.config` desde el código actual | **OK** (`IMPORT_OK`) |
| El contenedor contiene el `config.py` corregido | **Sí**, línea 50 |
| Import dentro del contenedor | **Correcto** |

**Procedimiento reproducible:**

```bash
cd "c:\Users\Tiffa\Desktop\PROY\ORGANIZADOR DE PUESTOS\Marimba-Organizer"
docker compose -p marimba7f \
  -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml \
  up -d --build
docker exec marimba7f-backend-1 python /tmp/r7h.py   # antes de cada ronda E2E
cd frontend && npx playwright test
```

`docker inspect` devuelve `Mounts: []`: los servicios ejecutan **código
empaquetado en la imagen**, no montado del disco. Por eso reconstruir es
obligatorio y `Up` **no** significa «código actual».

---

## 7. Resultados de las pruebas

| Suite | 7I | **7J** |
| ----- | --: | -----: |
| Backend `pytest -q` | 279 | **279 passed** (99.51 s) |
| Frontend `npm test` | 67 | **67 passed**, 0 failed |
| `npx tsc --noEmit` | PASS | **PASS** |
| `npm run build` | PASS | **PASS** (192 módulos, 4.49 s) |
| E2E ronda 1 | 33 + 3 fallidas | **38 passed** (49.1 s) |
| E2E ronda 2 | — | **38 passed** (1.9 m) |

Las dos rondas son **completas y en verde**, con `r7h.py` entre ellas y sin tocar
el estado a mano.

### Nota sobre un incidente de método

Durante la fase, `npx playwright test <fichero>` devolvió varias veces
«No tests found» con un spec que **sí** existía y que `--list` sí enumeraba.
La causa fue mi gestión del terminal al lanzar procesos en segundo plano, **no**
el fichero. Comprobado con `--list` (**38 tests en 7 ficheros**) y confirmado con
dos ejecuciones completas en verde. No se ha ocultado ningún fallo.

---

## 8. Integridad de los datos

| Comprobación | Resultado |
| ------------ | --------- |
| La asignación persiste tras recargar | ✅ verificado en el backend, no solo en la interfaz |
| No se duplican asignaciones al reasignar | ✅ `applyAssign` del store es la única ruta |
| No se crean puestos ni marimbas extra | ✅ la vista no los crea |
| Deshacer/rehacer coherente | ✅ usa el historial del store |
| Solo lectura no modifica datos | ✅ controles deshabilitados y `step()` bloquea en el store |
| Proyectos ajenos intactos | ✅ cada prueba crea proyecto con nombre único |
| Cuentas de pruebas | ✅ restablecidas con `r7h.py` antes de cada ronda |
| Producción / volúmenes | ❌ **NO** tocados |

No se ejecutó la migración temporal en 7J ni se alteró la base histórica.

---

## 9. Estado de HTTPS

**Sin cambios y sin verificar.** El entorno no tiene TLS: `Secure` real,
certificado y proxy siguen **NO VERIFICADOS**. Lo verificado en 7I (la lógica de
`public_base_url` → `secure_cookies` y CORS) sigue vigente.

---

## 10. Estado de la migración productiva

```
MIGRACIÓN PRODUCTIVA EJECUTADA:    NO
ADMINISTRADOR EN PRODUCCIÓN:       NO
PRODUCCIÓN CONECTADA O MODIFICADA: NO
AUTORIZACIÓN:                      PENDIENTE
```

Procedimiento sin cambios respecto a 7I (sección 15 de `FASE_7I_INTEGRATION.md`).

---

## 11. Pendientes y riesgos

### Verificado
- 3 infracciones graves de contraste corregidas con evidencia medida.
- Alternativa accesible al lienzo funcionando de extremo a extremo.
- Imágenes Docker construidas desde el código actual.
- Regresión completa verde, E2E dos rondas.

### No verificado / pendiente
- Infracciones `moderate` de semántica (4 reglas).
- Auditoría de diálogos y menús.
- Conformidad WCAG completa: axe cubre la parte automatizable.
- HTTPS real y `Secure` en producción.

### Riesgos abiertos
- **El lienzo Konva sigue sin ser accesible por teclado.** Ahora existe una
  alternativa equivalente para asignar, mover, retirar y girar, pero **el editor
  completo no se declara accesible**: operaciones puramente gráficas (redimensionar
  una marimba arrastrando, colocar una persona en un punto exacto) siguen
  siendo solo de ratón.
- La vista alternativa no cubre crear marimbas ni añadir o quitar puestos: son
  operaciones de panel, fuera del alcance de «editar la composición».
- Si se edita un spec con `Set-Content` de PowerShell, la codificación se rompe
  y Playwright deja de descubrirlo. Usar el editor del IDE.

---

## 12. Conclusión

**FASE 7J COMPLETADA** en sus dos objetivos principales: las tres infracciones
graves de contraste están corregidas y medidas, y la alternativa accesible al
lienzo existe, comparte estado y persistencia con el editor, respeta el modo de
solo lectura y está verificada con pruebas E2E reales que incluyen persistencia
tras recarga.

Lo que queda —semántica `moderate`, auditoría de diálogos, HTTPS real y
accesibilidad del propio `canvas`— está documentado como pendiente y **no se
declara conforme a WCAG**.

**Próximo paso recomendado:** una fase de semántica y diálogos (las reglas
`moderate` y el ciclo de foco), antes de considerar la migración productiva.

### Solo lectura

El `fieldset` entero queda `disabled`, y también los botones de girar, deshacer y
rehacer. Se puede consultar todo; no se modifica nada que el backend rechazaría.

### Pruebas E2E (`accesible.spec.ts`, 2 pruebas, en verde)

1. **Asignar solo con teclado y que persista**: se enfoca el desplegable, se
   elige persona y puesto, se pulsa **Enter** sobre «Asignar», se comprueba el
   anuncio en la región `role="status"`, se guarda, se **recarga la página** y se
   verifica en la composición guardada que la persona sigue asignada **y que un
   puesto de la marimba la contiene** (es decir, el lienzo la refleja).
2. **Retirar y deshacer**: el botón nombra a quién retira, se comprueba el
   anuncio «sin sentar», se deshace y la asignación vuelve. Además se ejecuta
   axe sobre `.acc-editor` exigiendo **cero infracciones graves**.