# FASE 7W — CONTRATO GEOMÉTRICO VERTICAL DE LAS MARIMBAS

> **COMPLETADA.** Diagnóstico con evidencia, contrato explícito e implementación
> mínima derivada del modelo real.

## 1. Estado inicial de Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` — sin cambios.
* HEAD: `3253c2a` — sin cambios.
* Protegidos verificados al inicio y al final: `optimizer.py` **+7**,
  `test_unified_core.py` **+216**, `cli.py` sin diferencias.

## 2. Diagnóstico del modelo vertical

Todo lo siguiente está **verificado en el código**, no supuesto:

| Pregunta | Respuesta con evidencia |
| --- | --- |
| ¿Qué representa `height`? | **El alto del marco.** `CanvasEditor.tsx:62` `<Rect width={m.width} height={m.height}>`; `render.ts:33` igual; `export.ts:64` `h=e.height*scaleY` para el encuadre del PNG |
| ¿Qué depende de él visualmente? | Solo el fondo y el encuadre de la imagen exportada |
| ¿Qué fija la posición vertical de un puesto? | `slotRect` devuelve **siempre** `y: slotY` y `height: slotH`, constantes que **no miran `m.height`** |
| ¿Relación `height`/`slotH`/`slotY`? | La banda de puestos es **fija**: `[slotY, slotY+slotH]` = **[56, 110]** |
| ¿Se usa `height` para posicionar personas? | **No.** La persona sentada va a `slotCenter(...)`, que sale de `slotRect`; `withCascade` nunca toca `y` |
| ¿Puede la altura dejar elementos fuera del marco? | **Sí: es el defecto encontrado.** Con `height < 110` los puestos se dibujan **debajo** del fondo. Antes solo se exigía `height >= 1` |
| ¿Convención histórica? | `MARIMBA_DEFAULT.height = 150`: 40 px de margen bajo la banda. Toda marimba creada por la app cumple el mínimo |
| ¿Misma geometría en lienzo, inspector y PNG? | **Sí.** `render.ts` lo declara en su cabecera y los tres usan `slotRect`/`seatScale` |
| ¿Existe función de espacio vertical disponible? | **No existía.** Se creó `minMarimbaHeight()` |
| ¿Restricciones por plantillas o número de puestos? | Afectan **solo al ancho** (`minMarimbaWidth(n)`), nunca a la altura |

**Diagnóstico confirmado:** `height` es puramente visual, y precisamente por eso
no estaba protegido: nadie validaba que el marco fuera bastante alto para la
banda fija de puestos. Ese estado roto era **alcanzable desde la UI**.

## 3. Funciones y componentes analizados

`layout.ts` (`slotRect`, `slotCenter`, `seatScale`, `elementBBox`),
`store/composition.ts` (`update`, `resizeMarimba`, `withCascade`,
`withRepositioned`, `normalizeElement`, `addMarimba`, `addPosition`),
`CanvasEditor.tsx:62-79`, `render.ts:32-67`, `export.ts:62-80`,
`Inspector.tsx` (bloque Tamaño), y las suites 7Q, 7R y 7V.

## 4. Comportamiento original de `height`

`height` no redistribuía nada: cambiaba el marco y nada más. El mínimo válido
era `1`, por lo que una marimba con `height = 20` dibujaba sus puestos fuera de
su propio fondo. **Defecto real, reproducible y observable.**

## 5. Alternativas evaluadas

| | Compatibilidad | Efecto en render | Personas | Historial | Riesgo |
| --- | --- | --- | --- | --- | --- |
| **A. Solo visual** | Total | Ninguno | Ninguno | Ninguno | **No arregla el defecto**: el marco corto sigue roto |
| **B. Altura proporcional** | **Rompe**: cambia render y `slotRect` | Redistribución en todas partes | Reposición obligatoria | Cambia | **Alto**: tocaría 7Q/7R y la exportación PNG |
| **C. Altura con mínimo** | **Total**: solo impide un estado inválido | Ninguno | Ninguno | Ninguno | **Bajo** |

Se eligió **A + el mínimo de C**.

## 6. Contrato vertical adoptado

1. `height` es **el alto del marco**, y nada más.
2. Los puestos mantienen una **banda vertical fija** `[slotY, slotY+slotH]`;
   cambiar la altura **no** los redistribuye.
3. `height` debe ser **finito** y **`>= minMarimbaHeight()` = `slotY+slotH` = 110**,
   para que la banda quepa dentro del marco.
4. No hay máximo.
5. Aumentar o reducir la altura **no mueve puestos ni personas**.
6. IDs, asignaciones y personas no cambian jamás por un cambio de altura.
7. Bloqueo y solo lectura se respetan; un rechazo es **atómico** y no deja paso
   de historial.

## 7. Justificación de la decisión

El mínimo **no es un número inventado**: es exactamente el espacio que ocupa la
geometría real de los puestos, leída de `slotRect`. Se eligió el suelo en lugar
de la redistribución porque el modelo actual tiene **una sola fila** de puestos:
no hay nada que redistribuir, y hacerlo exigiría tocar `slotRect`, con riesgo
para el PNG exportado y para las suites 7Q/7R.

**No hace falta migración:** el valor por defecto (150) y todas las marimbas de
las pruebas ya cumplen 110 (verificado en W16 y en la regresión completa).

## 8. Pruebas previas a la implementación

`frontend/tests/altura7w.test.cjs` — 18 pruebas escritas **antes** de tocar el
código.

**Baseline contra la implementación original: 15 pass / 4 fail** (W02, W04, W12,
W14): exactamente las que exigen el suelo vertical.

Durante la redacción se detectó y corrigió un **error mío**: W07 había quedado
duplicado por la sustitución del sentinel. Se eliminó la copia; el resto no se
tocó.

## 9. Implementación realizada

* `layout.ts`: nueva **`minMarimbaHeight()`**, centralizada y derivada de `slotY+slotH`.
* `composition.ts`: una línea en `update` y otra en `resizeMarimba`:
  `if(height<minMarimbaHeight())return {};`
* `Inspector.tsx`: el `min` del campo de alto y el texto de la pista pasan a
  pedir el helper; el mensaje de error nombra el mínimo real.
  Se eliminó la comprobación `w<=0||h<=0` del UI porque **queda subsumida**: un 0
  es menor que el mínimo (246 en ancho, 110 en alto), y el mensaje es más útil.

No se tocó `slotRect`, ni `withCascade`, ni `withRepositioned`, ni el optimizador.

## 10. Compatibilidad con `update` y `resizeMarimba`

`resizeMarimba` conserva su contrato (valida, reposiciona y hace un paso) y
añade el suelo vertical. `update` mantiene sus responsabilidades y solo suma la
validación. 7V y 7R siguen verdes tras el cambio.

## 11. Resultados de las pruebas

| Suite | Baseline | Final |
| --- | --- | --- |
| `altura7w` (nueva) | 15 pass / **4 fail** | **18 pass / 0 fail** |
| `geometria7q` | — | **22 pass / 0 fail** |
| `resizeMarimba7r` | — | **21 pass / 0 fail** |
| `update7v` | — | **21 pass / 0 fail** |

## 12. Regresión ejecutada

| Comprobación | Resultado |
| --- | --- |
| `npm test` | **149 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| `npm run build` | **OK** |
| E2E `resize.spec.ts` | **5 passed** |
| E2E suite completa | **60 passed, 0 failed (1,6 min)** |

axe: **0 infracciones** en las cinco vistas. Se reconstruyó `marimba7f-frontend`
(cambió producción) y se recreó solo ese contenedor.

**Un fallo E2E real y su causa:** mi primera versión del caso vertical falló
porque el campo de ancho seguía mostrando el `0` del paso rechazado anterior (el
borrador se conserva a propósito) y el ancho se valida antes que el alto. El
comportamiento de la aplicación era correcto; **la secuencia de la prueba era
errónea**. Se corrigió la prueba, no el código.

## 13. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `frontend/src/lib/layout.ts` | +17: `minMarimbaHeight()` |
| `frontend/src/store/composition.ts` | +5: suelo vertical en `update` y `resizeMarimba` |
| `frontend/src/components/Inspector.tsx` | mínimo vertical en UI |
| `frontend/tests/altura7w.test.cjs` | **nuevo** (18 pruebas) |
| `frontend/e2e/specs/resize.spec.ts` | caso vertical nuevo + secuencia corregida |

## 14. Archivos protegidos

```
backend/app/services/suggestions/optimizer.py |   7 +-   (intacto)
backend/tests/test_unified_core.py            | 216 +-   (intacto)
backend/app/cli.py                            |  (sin diferencias)
```

## 15. Limitaciones restantes

1. **La banda vertical sigue siendo fija**: aumentar la altura deja espacio vacío
   bajo los puestos. Es el modelo actual; un modelo proporcional (Alternativa B)
   queda **explorado y descartado** por riesgo, no por desconocimiento.
2. **No se ejecutaron pruebas de backend** (fuera de alcance por §7). Último
   valor válido: 279 passed de 7T.
3. Solo **una** ronda E2E completa, no las tres de 7U.
4. El lienzo Konva sigue siendo solo de ratón.
5. HTTPS real no verificado; producción no conectada.

## 16. Estado final de Git

Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a`. Sin commits, push,
merges, cambio de rama ni comandos destructivos. Datos reales, volúmenes y
producción intactos.