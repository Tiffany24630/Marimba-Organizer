# FASE 7Y — VERIFICACIÓN REAL DE ACCESIBILIDAD Y CONTRATO DE NAVEGACIÓN

> **PARCIALMENTE COMPLETADA.** Verificación de teclado hecha y en verde, con
> **tres rondas E2E consecutivas satisfactoryias**. El lector de pantalla real
> **no** se pudo ejecutar. Ver §C y §F.

## A. Estado inicial

* Rama: `checkpoint/fase1-motor-d1-d3-d5`
* HEAD: `3253c2a`
* Protegidos: `optimizer.py` +7 · `test_unified_core.py` +216 · `cli.py` sin diferencias
* `store/composition.ts` **sin cambios en 7Y** (147/7 = las diferencias son
  acumuladas de fases anteriores; esta fase no lo tocó).

## B. Verificación de teclado

Nueva prueba `frontend/e2e/specs/teclado7y.spec.ts`: **5/5 PASS**. Usa `Tab`,
`Enter`, `Espacio`, selectores nativos y atajos reales. Ninguna prueba llama al store.

| Flujo | Teclado | Resultado |
| --- | --- | --- |
| Selección de marimba | Tab hasta `.pp-main` + `Enter` | **PASS** — abre el Inspector |
| Asignación | `#acc-persona` / `#acc-puesto` nativos + `Enter` | **PASS** |
| Anuncio del resultado | `role="status"` | **PASS** — anuncia, no solo colorea |
| Desasignación | botón «Deshacer» + `Enter` | **PASS** — anuncia «deshizo» |
| Bloqueo/desbloqueo | Tab + `Enter` | **PASS** — el `aria-label` alterna Bloquear/Desbloquear |
| Zoom | Tab + `Enter` | **PASS** — el valor cambia y se lee en texto |
| Dimensiones | Tab, `Ctrl+A`, escribir, `Enter` | **PASS** |
| Atajo `Ctrl+Z` | atajo de teclado | **PASS** |

**Orden de foco:** la prueba registra el recorrido real de `Tab` hasta el control
y falla con el recorrido completo si no lo alcanza. No se añadieron `tabindex`
artificiales.

### Hallazgo (preexistente, no corregido)

Los campos numéricos del Inspector llaman `update` en **cada pulsación**: escribir
"400" deja varios pasos en el historial y **un solo `Ctrl+Z` solo revierte el
último** (se observó el valor "40"). Es comportamiento anterior a 7Y y se
documenta como deuda; no se cambió el producto en una fase de verificación.

## C. Lector de pantalla

```text
Lector de pantalla real: NO VERIFICADO.
```

Comprobación del entorno (evidencia, no suposición):
`NARRADOR=True` (existe `C:\Windows\System32\Narrator.exe`), `NVDA=False`.

**No se ejecutó ningún lector de pantalla.** El binario existe, pero automatizar
su salida de voz y sincronizarla con el navegador no es viable en este entorno,
y la fase prohíbe instalarlo o alterar el sistema. Se documenta explícitamente;
**no se presenta la comprobación por DOM/Playwright como equivalente a una
prueba real con lector**.

Lo verificado por DOM/Playwright (distinto de un lector real): foco real,
nombres accesibles, roles, `role="status"`, `aria-live`, `disabled` y orden de Tab.

## D. Desplazamiento del lienzo — investigación y decisión

**Comportamiento actual** (`CanvasEditor.tsx`):
* `stagePos` es `useState` local (**línea 190**): **no forma parte de la composición** y no se guarda.
* Se cambia por arrastre del fondo (`panStart`, línea 192), por `handleFit`
  («Ajustar», líneas 226-241), por el zoom, y **por el efecto de `focusId`
  (líneas 215-224)**: al seleccionar un elemento desde un panel lateral, el
  lienzo **se centra solo** en ese elemento.

**Decisión: mantenerlo como deuda consciente (opción D).** Fundamento técnico:

1. **Equivalencia funcional:** seleccionar cualquier elemento ya lo centra
   automáticamente; «Ajustar» muestra toda la composición; «Centrar» la centra.
   No hay tarea que exija desplazarse a un punto arbitrario.
2. **Riesgo de confundir** (descritivo en la fase): un control de pan junto a los
   botones de mover marimba invita a confundir viewport con objeto.
3. **Complejidad:** A, B y C exigirían estado y UI nuevos en un componente que ya
   tiene cinco controles de vista.

**No se implementó ningún control de pan.** Se priorizó verificar.

## E. Selección de figuras Konva

La pregunta correcta es si alguna tarea **no** puede completarse por las
alternativas existentes. Con la verificación de teclado de §B, se comprobó que
seleccionar y manipular marimba, puesto y persona se hace desde `MarimbaPanel`,
`PersonPanel`, `Inspector` y `AccessibleEditor`, **sin tocar el lienzo**.

**Decisión: limitación de interacción gráfica, no defecto funcional.** No se
implementó alternativa adicional ni wrapper de Konva.

## F. Regresión

| Comprobación | Resultado |
| --- | --- |
| `npm test` (incluye 7Q/7R/7V) | **149 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| `teclado7y.spec.ts` | **5 passed** |
| E2E ronda 1 | **68 passed, 0 failed (2,4 min)** |
| E2E ronda 2 | **68 passed, 0 failed (2,1 min)** |
| E2E ronda 3 | **68 passed, 0 failed (2,6 min)** |
| axe | **0 infracciones** en las 5 vistas, en las tres rondas |

Las tres rondas se ejecutaron en **procesos independientes y secuenciales**
(`&&`, ficheros de salida separados), nunca en paralelo. Ninguna tuvo flaky, y
`recuperacion.spec.ts:80` pasó en las tres.

## G. Limitaciones restantes

| Tipo | Detalle |
| --- | --- |
| **NO VERIFICADO** | Lector de pantalla real (§C) |
| **DEUDA CONSCIENTE** | Desplazamiento libre del lienzo sin equivalente exacto (§D) |
| **DEUDA CONSCIENTE** | Selección directa de figuras Konva solo de ratón (§E) |
| **DEUDA (nueva, hallazgo)** | Un `Ctrl+Z` por pulsación en campos numéricos (§B) |
| **NO EJECUTADO** | Backend (fuera de alcance). Último válido: 279 passed de 7T |
| **NO VERIFICADO** | HTTPS real; producción no conectada |

Lo único que impide declarar la fase COMPLETADA es §C: **no se pudo probar con un
lector de pantalla real**, y la fase prohíbe presentar la comprobación por DOM
como equivalente.

## H. Cambios realizados

**Ninguno en producción.** 7Y no modificó `src/`: no hay control de pan, ni
alternativa Konva, ni cambios en el store. Se añadió **un** fichero de pruebas,
`frontend/e2e/specs/teclado7y.spec.ts`.

Se corrigieron **tres errores de las pruebas** (no del producto): `selectOption`
con etiqueta no string, `getByLabel('X')` ambiguo por subcadena (`Ancho (px)`),
y la aserción de granularidad de `Ctrl+Z` descrita en §B.

## I. Estado final de Git

Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a`. Sin commits, push,
merges, cambio de rama ni comandos destructivos. Datos reales, volúmenes y
producción intactos.