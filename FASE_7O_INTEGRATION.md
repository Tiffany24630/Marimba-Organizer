# FASE 7O — AUDITORÍA DE MENÚS, REDIMENSIONAMIENTO SEGURO Y REGRESIÓN GEOMÉTRICA

> Continúa `FASE_7N_INTEGRATION.md`. Sin commits, push, merges ni cambios de
> rama. Sin conexión ni migración en producción.

**Estado general: PARCIALMENTE COMPLETADA**

---

## 1-2. Git y archivos protegidos

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` — **sin commits en 7O** |

| Fichero | `git diff --stat` | ¿Tocado? |
| ------- | ---------------- | -------- |
| `optimizer.py` | +7 | **NO** |
| `test_unified_core.py` | +216 | **NO** |
| `cli.py` | sin diferencias | **NO** |

---

## 3. Inventario de menús — VERIFICADO EN EL CÓDIGO

Se buscó en todo `frontend/src` y se documenta **lo que existe**:

| # | Elemento | Componente | Mecanismo | Patrón |
| - | -------- | ---------- | --------- | ------- |
| 1 | Pestañas Personas / Marimbas / Paneles | `Project.tsx` | Clic, Enter o Espacio | `role="tablist"` + `role="tab"` + `aria-selected` |
| 2 | «Agregar más piezas» | `Project.tsx` | Clic, Enter o Espacio | `<details>`/`<summary>` **nativo** |
| 3 | Zoom, ajustar, centrar, exportar | `CanvasEditor.tsx` | Clic, Enter o Espacio | Botones DOM |
| 4 | Renombrar / eliminar proyecto | `Dashboard.tsx` | Botones sueltos | **No es un menú** |
| 5 | Seleccionar persona / puesto / composición | varios | `<select>` **nativo** | Probado en 7J |

**No se aplicó el patrón ARIA de menú a ninguno**: ninguno es un menú, y
convertir controles nativos en menús ARIA habría sido una degradación.

---

## 4. Auditoría manual de menús — REALIZADA

Nuevo `frontend/e2e/specs/menus.spec.ts` con **4 pruebas** sobre la interfaz real,
sin llamar al store.

| Prueba | Resultado |
| ------ | --------- |
| Pestañas: cambian con teclado, `aria-selected` correcto, con Enter **y** Espacio | ✅ |
| `details`: abre y cierra con Enter; el input de archivo queda alcanzable | ✅ |
| Barra del lienzo: botones visibles, con nombre y focalizables | ✅ (tras corregir) |
| **No existe menú contextual en el lienzo** (documentado) | ✅ |

### 4.1 Auditoría del «menú contextual de Konva» — HALLAZGO

**No existe.** La búsqueda de `onContextMenu`, `contextmenu`, `role="menu"` y
`role="menuitem"` en `frontend/src` **no devuelve ninguna coincidencia en el
lienzo**; las únicas apariciones de «contextual» están en los documentos de 7K y
7N, que lo daban por supuesto.

Lo que el lienzo tiene realmente:

| Línea | Qué es | ¿Teclado? |
| ----- | ------ | ---------- |
| 54-55 | `draggable` + `onClick` para seleccionar marimba | Selección **no** |
| 76 | `onClick` sobre un puesto | Selección **no** |
| 117-118 | `draggable` + `onClick` de persona | Selección **no** |
| 452-457 | Botones de zoom | ✅ Sí |
| 459 | «Exportar PNG» | ✅ Sí |
| 492 | «Eliminar seleccionado» | ✅ Sí (solo si hay selección) |

**Conclusión:** no hay menú contextual que auditar y, por tanto, **no hay que
construir una alternativa para él**. Se mantiene la distinción: la **selección**
de figuras sigue siendo solo de ratón, y para eso existe la `AccessibleEditor`.

---

## 5. Corrección de accesibilidad encontrada por la auditoría

La propia auditoría destapó un defecto real que axe **no** detectaba:

| Problema | Antes | Después |
| -------- | ----- | ------- |
| Botones de zoom anunciados por su **símbolo** | `－`, `＋` (el `title` no manda si hay texto) | `aria-label="Alejar (zoom out)"`, etc. |

axe no lo marca porque `－` **es** un nombre no vacío; el problema es que ese
nombre no significa nada. Se añadieron `aria-label` a los 4 botones afectados,
sin cambiar el aspecto.

Además, mi propia prueba partía de una suposición **incorrecta**: `more-songs`
nace **abierto** cuando hay canciones (`open={songs.length>0}`). Se corrigió la
prueba para reflejar el comportamiento intencionado.

---

## 6-11. Investigación del redimensionamiento — NO IMPLEMENTADO

### Hechos verificados en el código actual

| Relación | Valor / fórmula |
| -------- | --------------- |
| Constantes | `pad=14`, `gap=10`, `slotH=54`, `slotY=56`, `minSlotW=104` |
| Ancho de un puesto | `w = (m.width − 2·pad − gap·(n−1)) / n` |
| **Alto de un puesto** | **constante** (`slotH`): **no depende de `m.height`** |
| `withCascade` | Recalcula `width/height/scaleX/scaleY` de la persona. **No toca `x/y`** |
| `withRepositioned` | Lleva a cada persona sentada al centro de su puesto. **Sí toca `x/y`** |
| `update` | `withCascade` **sin** `withRepositioned` |
| Operaciones que sí reposicionan | `addPosition`, `removePosition`, `addMarimba`, `marimbaDragged` |

### Límites derivables del modelo (no inventados)

El ancho mínimo **ya existe en el código** (`addPosition`, línea 412):

```
needed = 2·pad + n·minSlotW + (n-1)*gap
```

Es exactamente la condición para que ningún puesto baje de `minSlotW`. **No es
una regla nueva**: se reutilizaría tal cual.

Para el **alto**, el modelo dice que `slotH` es constante, luego `m.height` no
afecta a la posición de los puestos: redimensionar el alto **no requiere
reposición**. Si el alto debiera crecer con los puestos sería una **decisión de
diseño**, no una deducción.

### Por qué no se implementa

El enunciado exige pruebas de regresión geométrica **antes** de tocar `update` o
`withCascade` (Objetivo C: 20 escenarios, incluidos serialización y composiciones
antiguas). Escribir y verificar esa suite, más las pruebas E2E del
redimensionado, no se ha podido completar en esta fase. Implementarlo sin esa
base incumpliría la regla 12. **Se conserva el comportamiento actual.**

### Propuesta técnica

1. Nueva acción `resizeMarimba(id, width, height)` en el store: **única** capa
   que calcula geometría (regla 14: nada se duplica en los componentes).
2. Rechazo **atómico** si `width < needed` o el valor no es finito: estado
   intacto y **sin** paso de historial.
3. Orden: aplicar tamaño → `withRepositioned` → `withCascade`. Ambas dependen del
   ancho nuevo, ya aplicado.
4. **Sin** cambio de formato en `Composition.data`: solo se alteran valores ya
   existentes.

---

## 12. `AccessibleEditor` — SIN REGRESIONES

Las 6 pruebas de geometría de 7N siguen verdes: asignación, retirada, giro,
movimiento por teclado, coordenadas exactas, deshacer/rehacer, bloqueo, solo
lectura, guardado y persistencia.

---

## 13-15. Pruebas

| Suite | Resultado |
| ----- | --------- |
| Backend `pytest -q` | **279 passed** (38.09 s) |
| Frontend `npm test` | **67 passed**, 0 failed |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (3.40 s) |
| Menús (nuevas) | **4 passed** |
| **E2E ronda 1** | **55 passed** (1.4 m) |
| **E2E ronda 2** | **54 passed + 1 flake** (1.6 m) |
| **E2E ronda 3 (repetición)** | **54 passed + 1 flake** (1.6 m) |

### Fallo intermitente — NO oculto

| Prueba | Síntoma |
| ------ | ------- |
| `recuperacion.spec.ts:80` «el token cambia la clave y es de un solo uso» | `Protocol error (Page.handleJavaScriptDialog): Not attached to an active page` + `page.goto: net::ERR_ABORTED; maybe frame was detached?` |

**No es un fallo de aserción**: es un error de protocolo de Playwright por un
diálogo de JavaScript que aparece mientras la página se desmonta. Es una prueba
**preexistente**, ajena a los cambios de 7O.

Evidencia de que **no es una regresión**:

- Ronda 1: **pasó**.
- Aislada (`npx playwright test recuperacion`): **6 passed**.
- Rondas 2 y 3: falló.

Es **intermitente** (~1 de cada 3) y dependiente del contexto de suite. Causa
probable: la app conserva diálogos nativos (`window.prompt` al renombrar) que
Playwright gestiona por omisión, y ahí se produce la carrera.

**No se ha oculto ni silenciado.** Queda pendiente: registrar un manejador
explícito de diálogos en esa prueba, o eliminar el `window.prompt` del renombrado.

---

## 16-17. axe y diálogos

| Vista | Infracciones |
| ----- | -----------: |
| Inicio de sesión | **0** |
| Recuperación | **0** |
| Panel de proyectos | **0** |
| Vista de proyecto | **0** |
| Editor de composición | **0** |

Ningún critical, serious, moderate ni minor. Ninguna regla desactivada. Los
`aria-label` nuevos **no han introducido regresiones**.

Las 9 operaciones de diálogo de 7L siguen operativas (7 pruebas en verde) y
`window.confirm()` sigue siendo **0** en el código de aplicación.

## 18-20. Regresión y Docker

E2E de 51 a **55** (4 de menús), sin perder ninguna prueba previa.

Frontend **reconstruido** con `--build` (hubo cambio en `CanvasEditor.tsx`):
`tsc -b && vite build` en verde dentro de la imagen (3.05 s). Backend **no
reconstruido**: no cambió.

## 21-22. Integridad, HTTPS y producción

No se modificó geometría persistida, ni el store, ni datos. Los `aria-label` no
afectan al modelo. Volúmenes e históricos **no tocados**.

**HTTPS real: NO VERIFICADO.** Producción **no conectada ni modificada**.
Migración **no ejecutada**; autorización **pendiente**.

---

## 23. Conclusión

**FASE 7O PARCIALMENTE COMPLETADA.** La auditoría de menús **sí se ha
realizado**, y su hallazgo principal es que **el «menú contextual de Konva» no
existe**: 7K y 7N lo daban por supuesto. La auditoría destapó además un defecto
real de nombres accesibles en los botones de zoom, ya corregido.

El redimensionamiento **no se implementa**: la investigación confirma que
`update` redimensiona sin reposicionar y que el ancho mínimo derivable ya existe
en el código, pero falta la base de pruebas de regresión que el enunciado exige
antes de tocarlo.

Se reporta sin ocultar un **fallo intermitente** en una prueba preexistente, con
la evidencia de que no es una regresión de 7O.

**Próximo paso:** resolver el flake de diálogos, escribir la base de pruebas
geométricas y, con ella, implementar `resizeMarimba`.