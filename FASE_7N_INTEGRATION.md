# FASE 7N — PRUEBAS E2E DE GEOMETRÍA, AUDITORÍA DE MENÚS Y REDIMENSIONAMIENTO SEGURO

> Continúa `FASE_7M_INTEGRATION.md`. Sin commits, push, merges ni cambios de
> rama. Sin conexión ni migración en producción. **Los resultados de fases
> anteriores no se atribuyen a 7N.**

**Estado general: PARCIALMENTE COMPLETADA**

---

## 1. Estado inicial de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` — **sin commits en 7N** |

## 2. Archivos protegidos — INTACTOS

| Fichero | `git diff --stat` | ¿Tocado en 7N? |
| ------- | ---------------- | -------------- |
| `optimizer.py` | +7 | **NO** |
| `test_unified_core.py` | +216 | **NO** |
| `cli.py` | sin diferencias | **NO** |

No se modificó ningún componente de la aplicación en 7N: la fase es de
**verificación**, no de implementación.

---

## 3. Objetivo A — Prueba E2E de colocación por teclado — CUMPLIDO

Nuevo `frontend/e2e/specs/geometria.spec.ts` con **6 pruebas**. Todas ejercitan
los **controles reales** de `AccessibleEditor`; en ningún caso se llama al store
desde la prueba.

La marimba se crea con **Ana ya sentada** en el puesto `s1`, que es lo que
permite comprobar la invariante importante.

### 3.1 Las cuatro direcciones

Se recorren derecha → izquierda → abajo → arriba, comprobando tras cada pulsación
que el campo refleja exactamente `±10`. La posición se lee del **campo de la
interfaz**, no del store.

### 3.2 Geometría de la persona asignada — el núcleo de la prueba

| Comprobación | Resultado |
| ------------ | --------- |
| La marimba guarda la posición final | ✅ |
| La persona se traslada el **mismo delta** en X y en Y | ✅ |
| La **posición relativa** persona–marimba no cambia | ✅ |
| Sigue en `marimbaId` / `marimbaPositionId` originales | ✅ |

Confirma empíricamente la afirmación de 7M sobre `marimbaDragged`.

### 3.3 Coordenadas exactas

| Escenario | Resultado |
| --------- | --------- |
| Escribir `640` en X y guardar | ✅ persiste tras **recargar y reabrir** |
| La persona conserva su posición relativa | ✅ |
| Coordenada **negativa** (`-50`) | ✅ **rechazada**, el campo muestra `0` |
| Lo guardado nunca baja de cero | ✅ |

### 3.4 Historial

| Escenario | Resultado |
| --------- | --------- |
| Dos movimientos seguidos | ✅ un paso por pulsación |
| Deshacer / Rehacer | ✅ revierte y reaplica correctamente |
| Deshacer completo + guardar | ✅ la persona vuelve **con** su marimba |

### 3.5 Alternancia de vistas

Mover, volver al lienzo y regresar: la posición **no se pierde**. Es la prueba de
que ambas vistas comparten estado y no lo duplican.

---

## 4. Objetivo B — Bloqueos y solo lectura

| Escenario | Resultado |
| --------- | --------- |
| Marimba **bloqueada**: botones de mover deshabilitados | ✅ |
| Marimba **bloqueada**: campo de coordenadas deshabilitado | ✅ |
| Tras guardar, `m.x` sigue en 200: **no se movió** | ✅ |
| Solo lectura (`reader`) | ✅ cubierto por `accesible.spec.ts` de 7J |

---

## 5. Objetivo C — Auditoría manual de menús — PENDIENTE

**No realizada.** Se documenta lo que consta del código y lo que falta:

| Elemento | Estado | Pendiente |
| -------- | ------ | --------- |
| Pestañas laterales (`role="tablist"`) | Con `aria-selected`; sin prueba propia | Probar flechas y estado |
| `details`/`summary` de importación | Nativo: expande con teclado | Probar `aria-expanded` y foco |
| Selectores de composición/personas | `<select>` nativo, probados en 7J | — |
| **Menús contextuales de Konva** | **No auditados** | Ver si se abren solo con ratón |

No se corrige nada: sin la auditoría hecha, cualquier cambio sería a ciegas.

---

## 6-7. Objetivos D/E — Redimensionamiento — NO IMPLEMENTADO

La investigación de 7M se confirma y se precisa: `update` llama a `withCascade`,
que recalcula el tamaño de las personas **pero no sus coordenadas**, mientras que
`withRepositioned` (la que sí repone) se usa en `addPosition`, `removePosition`,
`addMarimba` y `marimbaDragged`, pero **no** en `update`.

**No es seguro hoy.** Hacerlo exigiría: (1) cambiar `update` para componer
`withCascade(withRepositioned(...))`, alterando una acción usada por el
Inspector; o (2) crear una acción geométrica nueva con su historial. Ambas
necesitan las pruebas de regresión geométrica previas, que no he podido escribir
y verificar en esta fase.

**Decisión: no implementado. No se declara la funcionalidad.**

### Propuesta técnica

- Nueva acción `resizeMarimba(id, width, height)` en el store, **única** capa que
  calcula geometría; `AccessibleEditor`, `Inspector` y el lienzo la llamarían.
- Regla: `withRepositioned` y después `withCascade`, en ese orden, para que las
  personas acompañen el nuevo encuadre.
- Límites: `minSlotW` (104 px) implica un mínimo de
  `2*pad + n*minSlotW + (n-1)*gap`; el alto depende de si `slotH` debe crecer con
  los puestos, decisión que hoy el modelo no toma.
- Pruebas de regresión primero, para fijar el comportamiento actual.

---

## 8. Pruebas de regresión geométrica

Las 6 pruebas nuevas **son** la regresión geométrica de la colocación: fijan
delta, geometría relativa, persistencia, historial, bloqueo y estado compartido.
**No se afirma haber validado el redimensionado**, porque no existe.

## 9. axe (7N)

| Vista | Infracciones |
| ----- | -----------: |
| Inicio de sesión | **0** |
| Recuperación | **0** |
| Panel de proyectos | **0** |
| Vista de proyecto | **0** |
| Editor de composición | **0** |

`heading-order` sigue corregido. Ninguna regla desactivada.

## 10. Diálogos (7N)

Las 9 operaciones migradas en 7L siguen operativas: sus 7 pruebas E2E continúan en
verde. `window.confirm()` sigue siendo **0** en el código.

---

## 11. Resultados de las pruebas (7N)

| Suite | Resultado |
| ----- | --------- |
| Backend `pytest -q` | **279 passed** (32.09 s) |
| Frontend `npm test` | **67 passed**, 0 failed |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (2.86 s) |
| Geometría (nuevas) | **6 passed** (13.9 s) |
| **E2E ronda 1** | **51 passed** (1.1 m) |
| **E2E ronda 2** | **51 passed** (1.1 m) |

De 45 a 51: exactamente las 6 pruebas nuevas, sin perder ninguna anterior.

## 12. Docker

El frontend **no se modificó** en 7N, así que **no se reconstruyó**: reutilizar
la imagen de 7M es correcto, porque el código de `src` es idéntico. Las pruebas
se ejecutaron contra esa imagen, que contiene el código vigente.

## 13. Integridad de datos

No se modificó geometría persistida ni acciones del store. Cada prueba crea su
propio proyecto con nombre único. Volúmenes, datos históricos y producción
**no tocados**.

## 14. HTTPS y producción

**HTTPS real: NO VERIFICADO.** Producción **no conectada ni modificada**.
Migración **no ejecutada**; autorización **pendiente**.

---

## 15. Riesgos y limitaciones

1. **Auditoría de menús sin hacer** (Objetivo C), en especial el menú contextual
   de Konva, que podría abrirse solo con ratón.
2. **Redimensionado sin implementar**, con propuesta técnica entregada.
3. Konva sigue sin ser accesible por teclado y **no se declara accesible**.
4. No se comprobó el píxel del lienzo: se validan el estado compartido y los
   datos persistidos, que es lo verificable sin exponer Konva.

---

## 16. Conclusión

**FASE 7N PARCIALMENTE COMPLETADA.** El objetivo principal —pruebas E2E de la
colocación por teclado— está **cumplido**: 6 pruebas que comprueban las cuatro
direcciones, la geometría de la persona asignada, las coordenadas exactas, el
rechazo de negativos, el historial y el estado compartido entre vistas, con
persistencia verificada tras recargar. La regresión sube de 45 a **51 E2E** en
dos rondas completas, sin perder ninguna prueba previa.

No se completan la auditoría de menús ni el redimensionado; ambos quedan
documentados con su análisis técnico en lugar de implementados a ciegas.

**Próximo paso:** la auditoría de menús (empezando por el menú contextual de
Konva) y, en paralelo, la fase de redimensionado con la regla de reposición y sus
pruebas de regresión.