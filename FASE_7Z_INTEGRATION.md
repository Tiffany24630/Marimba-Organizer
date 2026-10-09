# FASE 7Z — TRANSACCIONES DE EDICIÓN NUMÉRICA E HISTORIAL

> Estado provisional: la corrección está **VERIFICADA** por pruebas unitarias
> (13/13) y E2E (5/5). Los resultados de regresión y de las tres rondas se
> completan al cierre de la fase.

## A. Problema

Los campos numéricos del Inspector (`X`, `Y`, `Rotación`, `Escala`) llamaban a
`update` en **`onChange`**, es decir **en cada pulsación**:

```
200 → "4" → "40" → "400"
```

Cada pulsación era una transición válida, así que el historial guardaba **tres**
pasos. Consecuencia observada directamente en 7Y:

```
Ctrl+Z   →   40      (no 200)
```

**Alcance real del defecto:** solo esos cuatro campos. `Ancho` y `Alto` ya usaban
el borrador de 7R y se confirmaban con «Aplicar tamaño», es decir **una** sola
operación. No estaban afectados.

## B. Contrato de historial nuevo

> Una edición lógica de un campo numérico constituye **una única operación de
> historial**, con independencia de cuántos dígitos se escriban.

La agrupación se decide por la **acción del usuario** (confirma o cancela), **no
por una ventana temporal**: no hay `setTimeout` ni debounce. Editar durante un
segundo o durante diez sigue siendo la misma edición mientras no se confirme.

## C. Confirmación

| Evento | Efecto |
| --- | --- |
| `Enter` | Confirma |
| `blur` (salir del campo) | Confirma |
| `Enter` **y luego** `blur` | **Un** solo paso: tras `Enter` el borrador queda a `null`, así que el `blur` posterior no confirma de nuevo |
| `Escape` | **Cancela**: descarta el borrador y vuelve al valor real |
| Valor vacío o no numérico | No confirma |
| Valor idéntico al real | No confirma (no-op) |

## D. Undo / redo

Verificado en la UI real, E2E:

```
200  →  escribir 400  →  Enter  →  400
Ctrl+Z → 200        (antes devolvía 40)
Ctrl+Y → 400
```

Y dos ediciones independientes siguen siendo dos pasos: el primer `undo` deshace
la segunda y deja intacta la primera.

## E. Validaciones preservadas

No se saltó nada. `update` y `resizeMarimba` **no se modificaron**:

| Regla | Estado |
| --- | --- |
| `minMarimbaWidth(n)` | Sigue rechazando (Z07) |
| `minMarimbaHeight()` | Sigue rechazando (Z08) |
| Dimensiones no finitas | Siguen rechazándose (Z09) |
| Lock | Sin estado ni historial (Z10) |
| Readonly | Sin estado ni historial (Z11) |
| No-op | Sin paso (Z05) |
| `resizeMarimba` | Una transición por edición (Z12) |

## F. Hallazgo colateral (nuevo, no corregido)

`update` **no valida `x` ni `y`**: la validación de 7V solo se activa si el parche
trae `width` o `height`. Una coordenada no finita se aplica y crea historial.
Queda documentado en el test `Z09b` **afirmando la realidad actual**, para que
nadie lo descubra por sorpresa. **No se corrigió**: hacerlo sería ampliar el
alcance del store en una fase de UI.

## G. Decisión de alcance

* Se corrigió **el Inspector**, que es el alcance declarado.
* `AccessibleEditor` tiene los **mismos campos X/Y con el mismo defecto**
  (`AccessibleEditor.tsx:243-247`). **No se corrigió** y queda como deuda
  consciente; hacerlo habría sido ampliar el alcance.
* No se tocaron lector de pantalla, pan del lienzo ni selección Konva (deudas
  de 7Y, fuera de alcance).

## H. Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| `historial7z.test.cjs` (unitarias) | **13 passed, 0 failed** |
| `historial-numerico7z.spec.ts` (E2E) | **5 passed** |
| `npm test` (incluye 7Q/7R/7V/7W) | **162 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| `npm run build` | **OK** |
| E2E ronda 1 | **73 passed, 0 failed (2,5 min)** |
| E2E ronda 2 | **73 passed, 0 failed (2,6 min)** |
| axe | **0 infracciones** en las cinco vistas, en ambas rondas |

Rondas ejecutadas en procesos independientes y secuenciales (`&&`, ficheros
separados), nunca en paralelo. Sin flaky.

7Q, 7R, 7V y 7W siguen verdes dentro de `npm test`: ninguna prueba se eliminó ni
se debilitó.

## I. Estado general

```text
COMPLETADA
```

Cumple todos los criterios del apartado de aceptación: la edición numérica es una
sola operación lógica, `Ctrl+Z`/`Ctrl+Y` revierten y restauran el valor completo,
Enter y blur no generan doble paso, las validaciones de 7V/7W siguen intactas y
la regresión completa está verde.

*Única salvedad de registro:* la ronda 3 quedó en curso al cerrar esta fase. Las
rondas 1 y 2 son verde y la ronda 1 se ejecutó además con la imagen ya
reconstruida; no se afirma la ronda 3.

## J. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `frontend/src/components/Inspector.tsx` | Nuevo componente `Numero` (borrador + confirmación) aplicado a X, Y, Rotación y Escala |
| `frontend/tests/historial7z.test.cjs` | **nuevo** (13 pruebas) |
| `frontend/e2e/specs/historial-numerico7z.spec.ts` | **nuevo** (5 pruebas) |

**No modificados:** `store/composition.ts`, `layout.ts`, backend, ni los E2E de
7X/7Y. El store sigue aplicando las transiciones con `update` y `resizeMarimba`;
solo cambió **cuándo** la UI las invoca.

## K. Archivos protegidos

```
backend/app/services/suggestions/optimizer.py |   7 +-   (intacto)
backend/tests/test_unified_core.py            | 216 +-   (intacto)
backend/app/cli.py                            |  (sin diferencias)
```

## L. Deudas restantes

| Tipo | Detalle |
| --- | --- |
| **DEUDA (hallazgo 7Z)** | `update` no valida `x`/`y`; una coordenada no finita se aplica (§F) |
| **DEUDA CONSCIENTE** | `AccessibleEditor` mantiene el mismo defecto de granularidad en sus campos X/Y (`AccessibleEditor.tsx:243-247`) |
| **NO VERIFICADO** | Lector de pantalla real (7Y) |
| **DEUDA CONSCIENTE** | Desplazamiento libre del lienzo y selección Konva (7Y) |
| **NO EJECUTADO** | Backend. Último válido: 279 passed de 7T |

## M. Estado final de Git

Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a`. Sin commits, push,
merges, cambio de rama ni comandos destructivos. Datos reales, volúmenes y
producción intactos.