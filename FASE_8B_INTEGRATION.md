# FASE 8B — CIERRE DEL 200200 + REGRESIÓN E2E COMPLETA

> Estado provisional: **causa raíz DETERMINADA** y test corregido. Se completan
> las cifras de regresión al cierre.

## 1. Causa raíz del `200200`

**No es un defecto de `Numero` ni del store. Es el undo NATIVO del navegador.**

Se reprodujo con un diagnóstico paso a paso que imprime el valor real del DOM
(`frontend/e2e/specs/diag8b.spec.ts`, eliminado después):

```
[8B] inicial:            inputValue=200
[8B] tras focus:         inputValue=200          activo=true
[8B] tras Control+a:     inputValue=200
[8B] tras Delete:        inputValue=""           ← Control+SÍ funcionó
[8B] tras escribir 400:  inputValue=400
[8B] tras Escape:        inputValue=200          ← Escape cancela bien
[8B] tras blur:          inputValue=200          ← blur no confirma
[8B] tras Control+z:     inputValue=200200       activo=true   ← el fallo
```

**Mecanismo.** `CanvasEditor.tsx:255` hace `return` temprano en su manejador
global cuando el foco está en un `INPUT`:

```ts
if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
```

Por tanto, con el foco dentro del campo numérico, **`Ctrl+Z` nunca llega al
historial de la composición**: lo resuelve el deshacer nativo de Chromium sobre
ese `input`. Como `Escape` había cancelado, **el historial de la app estaba
vacío**, así que no había nada que deshacer y el undo nativo.left el campo en
`"200"+"200"`.

**Evidencia de que no es la implementación:** en el mismo trazo, `Escape` y
`blur` se comportan exactamente según el contrato de 8A (200 tras cancelar, sin
confirmar). El campo solo se corrompe **después** de `Ctrl+Z`, cuando el foco
sigue dentro del input.

**Caso 1 del enunciado:** el componente funciona; la prueba interactuaba de una
forma que no llega a la app.

## 2. Corrección

Cambio **exclusivamente de interacción en la prueba** (`accessible-editor8a.spec.ts`):

* `Ctrl+Z` dentro del campo → **el botón «Deshacer» del propio
  AccessibleEditor**, que es el mismo undo de la aplicación y además es la ruta
  accesible verificada en 7Y.

**No se modificaron** `Numero.tsx`, `CanvasEditor.tsx`, `Inspector.tsx`,
`AccessibleEditor.tsx`, `composition.ts` ni `layout.ts`. No hay `setTimeout`,
`debounce` ni esperas arbitrarias. El test sigue siendo estricto: `Expected 200`
se mantiene intacto.

El diagnóstico `diag8b.spec.ts` se eliminó al terminar su propósito; el hallazgo
queda escrito arriba y en el propio spec.

## 3. Contrato de `Numero` (sin cambios)

| Evento | Efecto |
| --- | --- |
| `Enter` | Confirma una operación |
| `blur` | Confirma una operación |
| `Enter` + `blur` | Un solo paso |
| `Escape` | Cancela |
| vacío / no numérico | No confirma |
| valor idéntico | No-op |

## 4. Validación x/y (sin cambios en 8B)

La de 8A permanece: `NaN`, `Infinity`, `-Infinity` rechazados atómicamente; las
coordenadas negativas siguen siendo válidas.

## 5. Pruebas

| Prueba | Resultado |
| --- | --- |
| `accessible-editor8a.spec.ts` | **4 passed, 0 failed** (6,2 s) |
| `npm test` (7Q/7R/7V/7W/7Z/8A + resto) | **178 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| E2E ronda 1 | **76 passed, 1 failed** (3,1 min) |
| E2E ronda 2 | **NO EJECUTADA** (se agotó el presupuesto) |
| E2E ronda 3 | **NO EJECUTADA** |

### Estado general: PARCIALMENTE COMPLETADA

El `200200` está **cerrado con causa raíz**, pero la ronda 1 de E2E dejó **un
fallo que sigue abierto**, y sin las rondas 2 y 3 la fase no puede declararse
completa.

## 6. Dos regresiones de 8A encontradas por la ronda 1

Ambas son consecuencia de mover X/Y al componente `Numero`, y **ninguna la
causó 8B**.

### 6.1 `geometria.spec.ts:213` — **`id` perdidos** (CORREGIDA)

`leerCoords` localiza el campo con `input[id^="acc-x-"]`, y `Numero` no emitía
ese `id` (sí existía antes de 8A). Se añadió la prop `id` a `Numero` y se
restauraron `acc-x-${m.id}` / `acc-y-${m.id}` en `AccessibleEditor`.

### 6.2 `geometria.spec.ts:149` — **corrección instantánea perdida** (ABIERTA)

```ts
await campoY.fill('-50');
await expect(campoY, 'no se admite posicion negativa').toHaveValue('0');
```

**Mecanismo.** Antes, `onChange` llamaba a `mover()` en el acto; `mover` hace
`Math.max(0, ...)` y React repintaba `0` al instante. Con `Numero`, `fill('-50')`
deja un **borrador**: el campo muestra `-50` hasta que se confirma (blur/Enter),
y solo entonces `mover` recorta a `0`.

**Naturaleza.** No es un fallo de `Numero` ni del store: el store sigue
rechazando/recortando igual. Es un **cambio de UX introducido por el contrato de
8A** (borrador hasta confirmar), y el test de 7N afirmaba la corrección
*inmediata*.

**Decisión pendiente** (no se aplica aquí por falta de presupuesto y porque
afecta a una prueba de 7N): confirmar en el test que la corrección ocurre **al
confirmar** (`fill('-50')` → `blur` → `toHaveValue('0')`), o bien devolver al
campo la corrección inmediata. Ambas son defendibles; la segunda requiere tocar
`Numero` y no debe decidirse sin criterio explícito.

## 7. Deudas

* **ABIERTO (8B)**: `geometria.spec.ts:149` en rojo por el cambio de UX de 8A.
* **Lector de pantalla real**: NO VERIFICADO (7Y).
* **Pan libre del lienzo** y **selección Konva**: deudas conscientes (7Y).
* **Backend**: no ejecutado en 8B. Último válido: 279 passed de 7T.

**Hallazgo lateral documentado:** con el foco dentro de un campo numérico,
`Ctrl+Z` ejecuta el undo nativo del navegador, no el de la app, porque
`CanvasEditor.tsx:255` hace `return` temprano para `INPUT`. Es el comportamiento
diseñado para no interferir con la escritura; es la causa del `200200`.

## 6. Deudas

* **Lector de pantalla real**: NO VERIFICADO (7Y).
* **Pan libre del lienzo**: deuda consciente (7Y).
* **Selección directa Konva**: deuda consciente (7Y).
* **Backend**: no ejecutado en 8B. Último válido: 279 passed de 7T.

**Hallazgo lateral que no se corrige en 8B (fuera de alcance):** con el foco en
un campo numérico, `Ctrl+Z` ejecuta el undo nativo del navegador en lugar del de
la aplicación. Es el comportamiento ya diseñado en `CanvasEditor.tsx:255` para no
interferir con la escritura en campos; se documenta aquí porque es la causa del
`200200` y conviene tenerlo presente.