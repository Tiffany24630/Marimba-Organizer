# FASE 7V — VALIDACIÓN GEOMÉTRICA CENTRALIZADA DE `update`

> **COMPLETADA.** Cierra la deuda §18.1 de `FASE_7T_INTEGRATION.md`.

## 1. Estado inicial de Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` — sin cambios.
* HEAD: `3253c2a` — sin cambios.
* Protegidos verificados al inicio y al final:
  `optimizer.py` **+7**, `test_unified_core.py` **+216**, `cli.py` sin diferencias.

## 2. Diagnóstico del contrato original de `update`

Leyendo `store/composition.ts:340-358` **antes** de cambiar nada:

| Aspecto | Comportamiento ORIGINAL (verificado) |
| --- | --- |
| ID inexistente | Rechaza, `{}` — ya correcto |
| Marimba bloqueada | Rechaza vía `elementLocked` — ya correcto |
| Persona: dimensiones | Regla propia, `min 60×28` + `clampPersonScale` |
| No-op | `Object.entries(safe).every(...)` → `{}`, sin historial |
| Historial | Un único `step` por cambio real |
| **`width`/`height` de marimba** | **SIN VALIDACIÓN: se aceptaba cualquier número** |
| `NaN` / `±Infinity` | **Aceptados** |
| Negativo / cero | **Aceptados**, producían anchos de puesto negativos |
| Por debajo del mínimo | **Aceptado**, los puestos quedaban bajo `minSlotW` |

**Diagnóstico confirmado:** la validación existía solo en `resizeMarimba`, creada
en 7R. `update` seguía aceptando dimensiones arbitrarias: exactamente la deuda
documentada en 7T §18.1.

Callers revisados: el `Inspector` usa `update` para `name`, `x`, `y`, `rotation`
y `scaleX/scaleY` de marimba, y para dimensiones de **persona**; el ancho/alto de
marimba ya pasa por `resizeMarimba` desde 7R. **Ningún caller de producción pasa
dimensiones de marimba a `update`**, así que la validación no rompe la UI.

## 3. Diferencias entre `update` y `resizeMarimba`

No se igualaron. `update` tiene responsabilidades más amplias y las conserva:

| | `update` | `resizeMarimba` |
| --- | --- | --- |
| Campos | cualesquiera (`name`, `x`, `y`, `rotation`, `scale`, y dimensiones de persona) | solo `width`/`height` |
| Reposiciona | **No** (solo `withCascade`) | Sí (`withRepositioned` + `withCascade`) |
| Validación de dimensiones | **Ausente → añadida en 7V** | Ya existía (7R) |
| Retorno | `void` (contrato intacto) | `void` |

## 4. Contrato geométrico adoptado

Solo para **marimbas** y solo cuando el parche trae `width` o `height`:

1. id inexistente → rechazar (preexistente)
2. bloqueada → rechazar (preexistente)
3. `!Number.isFinite(w) || !Number.isFinite(h)` → rechazar
4. `w <= 0 || h <= 0` → rechazar
5. `w < minMarimbaWidth(positions.length)` → rechazar
6. si no, aplicar con el comportamiento ya existente

**Fuente única:** reutiliza `minMarimbaWidth(n)` de `lib/layout.ts`, la misma
función que usan `addMarimba`, `addPosition` y `resizeMarimba`. **No se duplicó
la fórmula.**

**Retorno:** `update` sigue devolviendo `void`. No se cambió su interfaz pública;
el rechazo se comunica con el mismo mecanismo ya usado (`return {}`), que es lo
que hacen el resto de acciones del store.

## 5. Pruebas creadas ANTES de implementar

`frontend/tests/update7v.test.cjs` — 21 pruebas, escritas primero.

**Baseline contra la implementación original: 11 pass / 10 fail.** Los 9 fallos
reales fueron U01–U07, U12 y U15 (negativo, cero, bajo mínimo, `NaN`, infinitos,
mixta atómica e historial). El décimo era **un error mío**: U14 incluía
`update('p1',{name:'Cambiada'})`, una actualización *válida* de persona que sí
cambia el estado; se corrigió la prueba, no el código.

Ninguna expectativa se ajustó para forzar verde.

## 6. Implementación realizada

Un único bloque en `update`, antes de cualquier mutación:

```ts
if(el.type==='marimba'&&(patch.width!==undefined||patch.height!==undefined)){
 const w=patch.width??el.width,h=patch.height??el.height;
 if(!Number.isFinite(w)||!Number.isFinite(h))return {};
 if(w<=0||h<=0)return {};
 if(w<minMarimbaWidth(el.positions.length))return {};
}
```

**`resizeMarimba` NO se modificó** (U19 lo verifica).

## 7. Garantías de atomicidad

Como la validación ocurre **antes** de construir `next`, un parche mixto se
rechaza entero: `update('m1',{name:'Renombrada',width:-10,x:999})` no cambia ni
el nombre, ni la posición, ni las dimensiones (U12). Sin cambio parcial posible:
no hay "aplicar y luego revertir".

## 8. Comportamiento del historial

* Rechazos → `{}` → sin paso y sin marcar sucio (U15, G04, G06–G09).
* No-op → sin paso (U16).
* Cambio válido → exactamente un paso (U08, U10).
* `undo`/`redo` exactos (U17).

## 9. Compatibilidad con `resizeMarimba`

`resizeMarimba` intacto: valida lo mismo y además reposiciona. **7R sigue
21/21** y U19 lo comprueba de nuevo.

## 10. Resultados de las pruebas específicas

| Suite | Antes de implementar | Después |
| --- | --- | --- |
| `update7v` (nueva) | 11 pass / **10 fail** | **21 pass / 0 fail** |
| `geometria7q` (7Q) | 22 pass / 0 fail | 22 pass / 0 fail (tras actualizar G04, G06–G09) |
| `resizeMarimba7r` (7R) | 21 pass / 0 fail | **21 pass / 0 fail** |

**Cambio en 7Q, justificado:** G04 y G06–G09 afirmaban que `update` *aceptaba*
dimensiones inválidas, es decir documentaban la brecha que 7V cierra. Se
reescribieron para afirmar el contrato nuevo: rechazo, atomicidad y ausencia de
paso de historial, manteniendo la justificación geométrica original. **No se
eliminó ningún escenario ni se relajó ninguna aserción**: ahora son más estrictos
(antes aceptaban el valor; ahora exigen que nada cambie).

## 11. Regresión del frontend

| Comprobación | Resultado |
| --- | --- |
| `npm test` | **131 passed, 0 failed** (110 + 21 nuevos) |
| `npx tsc --noEmit` | **OK** |
| `npm run build` | **OK** — `built in 2.79s` |

## 12. Resultados E2E

Se reconstruyó `marimba7f-frontend` porque cambió código de producción (el
store), y se recreó únicamente ese contenedor. No se tocó backend ni PostgreSQL
ni volúmenes.

| Ronda | Resultado |
| --- | --- |
| 1 (tras el cambio) | **60 passed, 0 failed, 0 flaky (1,8 min)** |

axe: **0 infracciones** en las cinco vistas. Sin regresión E2E. No se repitieron
las tres rondas de 7U porque el cambio es exclusivamente del store y no altera
la UI; sí se ejecutó una ronda completa para comprobarlo.

## 13. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `frontend/src/store/composition.ts` | +13 líneas: validación en `update` |
| `frontend/tests/update7v.test.cjs` | **nuevo** (21 pruebas) |
| `frontend/tests/geometria7q.test.cjs` | G04 y G06–G09 actualizados al contrato cerrado |

**No modificados:** `Inspector.tsx`, `layout.ts`, `resizeMarimba`, los tests de
7R, los E2E, ni nada de backend.

## 14. Archivos protegidos

```
backend/app/services/suggestions/optimizer.py |   7 +-   (intacto)
backend/tests/test_unified_core.py            | 216 +-   (intacto)
backend/app/cli.py                            |  (sin diferencias)
```

## 15. Limitaciones y deuda restante

1. **`height` sigue sin contrato vertical propio**: `slotH` y `slotY` son
   constantes. 7V solo valida que sea finito y positivo; U09 lo deja constancia.
   Deuda independiente, **no introducida aquí**.
2. **No se ejecutaron las pruebas de backend**, por indicación explícita de la
   fase (7V es exclusivamente frontend/store). El último valor válido sigue
   siendo 279 passed de 7T.
3. Solo **una** ronda E2E, no las tres de 7U. Justificado por §7 de la fase.
4. El lienzo Konva sigue siendo solo de ratón.
5. HTTPS real no verificado; producción no conectada.

## 16. Estado final de Git

Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a`. Sin commits, push,
merges, cambio de rama, `reset`, `clean` ni `restore`. No se modificaron datos
reales ni volúmenes.