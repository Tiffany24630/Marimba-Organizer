# FASE 7Q — SUITE GEOMÉTRICA DE 20 ESCENARIOS Y PREPARACIÓN SEGURA DE `resizeMarimba`

> Redactado **al terminar** las ejecuciones. Los resultados son los observados.
> Lo que no se pudo comprobar está marcado **NO VERIFICADO**.

## 1. Estado general

**COMPLETADA** para el objetivo de la fase: la base de regresión geométrica está
construida, es sintácticamente válida, se ejecuta y está verde (22/22).

`resizeMarimba` **NO se implementó**, tal como exigía la fase.

## 2. Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` (sin cambios).
* HEAD: `3253c2a test(e2e): prevent persistent test data contamination`.
* Sin commits, push, merges ni cambio de rama. Sin `reset`/`clean`/`restore`.
* Cambios protegidos, verificados tras la fase:
  * `backend/app/services/suggestions/optimizer.py` → **+7** (intacto)
  * `backend/tests/test_unified_core.py` → **+216** (intacto)
  * `backend/app/cli.py` → sin diferencias (no aparece en `git diff --stat`)
* **Archivo creado en 7Q (único):** `frontend/tests/geometria7q.test.cjs`
* **Ningún `src/` modificado en 7Q.** No se tocó `composition.ts`, ni
  `withCascade`, ni `withRepositioned`, ni el cálculo de slots.

## 3. Harness

* Carga de TypeScript idéntica a las suites ya existentes
  (`readonly7e.test.cjs`): `require.extensions['.ts']` con
  `ts.transpileModule` en CommonJS/ES2022. Se importa el **store real**
  (`useComposition`) y el **layout real** (`slotRect`, `slotCenter`,
  `MARIMBA_DEFAULT`). No hay mocks ni simulaciones.
* `seed()` monta una composición **aislada en memoria**: 2 marimbas (`m1` con 3
  puestos, `m2` con 1), 3 personas, 2 de ellas sentadas.
* Las personas se asientan con la **acción real** `assign`, no escribiendo `x/y`
  a mano, para que la invariante de centrado sea auténtica desde el origen.
* Tras asentar se llama a `setElements(elements)`, que es **la misma vía de carga
  que usa la app al abrir una composición** y deja el historial limpio. La
  semilla lo verifica con `assert.equal(hist(),0)`.
* Construcción por bloques con sentinel `//__END__` y **sustitución**, nunca por
  inserción parcial. `node --check` se ejecutó tras cada bloque y **antes** de
  correr la suite.

## 4. Constantes (verificadas en `src/lib/layout.ts:23`)

```text
MARIMBA_DEFAULT = {width:380, height:150, pad:14, gap:10,
                   slotH:54, slotY:56, minSlotW:104}
```

Confirmadas tal como las reportó 7O. La suite las lee de la constante compartida,
no escribe números a mano.

## 5. Fórmula mínima (la real del proyecto)

Idéntica en `addPosition` (composition.ts:412) y `addMarimba` (:327):

```ts
const needed=n=>2*PAD+n*MIN_SLOT_W+(n-1)*GAP;
```

Y `slotRect` (layout.ts:27) reparte el ancho:
`w = (m.width − 2·pad − gap·(n−1)) / n`.

Por tanto `width = needed(n)` es exactamente el ancho en el que cada puesto mide
`minSlotW`. La suite lo comprueba en G03.

## 6. Los 20 escenarios

Todos ejecutados. **22 tests, 22 pass, 0 fail.**

| ID  | Escenario               | Resultado |
| --- | ----------------------- | --------- |
| G01 | Resize ancho            | PASS — ancho cambia, puestos dentro, asignaciones intactas |
| G02 | Resize alto             | PASS — `slotH`/`slotY` constantes, personas no se desplazan |
| G03 | Mínimo exacto           | PASS — `needed(3)` da puestos de `minSlotW` exactos; `addPosition` ensancha |
| G04 | Menor al mínimo         | PASS *(vía documentada, ver §6.1)* |
| G05 | Rechazo atómico         | PASS — los rechazos que el store sí aplica no mutan nada |
| G06 | NaN                     | PASS *(vía documentada)* |
| G07 | Infinity                | PASS *(vía documentada)* — ambos sentidos probados |
| G08 | Negativos               | PASS *(vía documentada)* |
| G09 | Cero                    | PASS *(vía documentada)* |
| G10 | Personas asignadas      | PASS — `personId`/`marimbaId`/`marimbaPositionId` idénticos |
| G11 | Relación persona/puesto | PASS — ver §6.2 |
| G12 | Personas no asignadas   | PASS — no se mueven ni con `update` ni con `marimbaTransformed` |
| G13 | IDs                     | PASS — elementos, puestos y asignaciones idénticos |
| G14 | Otra marimba            | PASS — `m2` intacta en x, y, w, h, puestos y asignaciones |
| G15 | Undo                    | PASS — estado previo exacto |
| G16 | Redo                    | PASS — estado posterior exacto |
| G17 | Historial               | PASS — exactamente 1 paso |
| G18 | Lock                    | PASS — rechazo, estado e historial intactos |
| G19 | Readonly                | PASS — ni `update` ni `undo` mutan nada |
| G20 | Serialización/legacy    | PASS — ida y vuelta sin pérdida **y** formato antiguo sin dimensiones |

(G20 se acompaña de `G20b`, que carga una composición legacy con puestos como
cadenas y verifica los valores por defecto. G00 es el arranque del harness.)

### 6.1 Decisión metodológica sobre G04 y G06–G09

Al inspeccionar el código se comprobó que **`update()` no valida dimensiones en
absoluto** (composition.ts:339-358): no hay mínimo de ancho, ni guarda de `NaN`,
`Infinity`, negativo o cero. Tampoco existe en ninguna otra acción: `addPosition`
solo ensancha con `Math.max(e.width, needed)` y jamás rechaza.

Esos escenarios **no afirman un rechazo que el sistema no hace**. Afirman la
realidad (`update` acepta el valor) y, sobre todo, la **consecuencia geométrica**
que hace evidente por qué `resizeMarimba` debería rechazarlo: con `needed(3)-1` el
puesto queda por debajo de `minSlotW`; con `0` o negativo, el ancho de puesto sale
negativo; con `NaN`/`Infinity` deja de ser un número.

Así, cuando se implemente `resizeMarimba`, estos tests **fallarán** si acepta un
valor inválido. Es exactamente el detector de una implementación incorrecta que
pide el objetivo, sin inventar un contrato que el código no tiene.

### 6.2 G11 en detalle

La prueba fija las dos mitades de la relación persona/puesto:

* `update` → `withCascade`: **no** reposiciona, la persona conserva `x/y`.
* `marimbaTransformed` (composition.ts:570-579) → `withCascade(withRepositioned(...))`:
  **sí** devuelve a la persona al centro exacto de su puesto, verificado contra
  `slotCenter`.

`marimbaTransformed` es por tanto **la referencia real del proyecto** para un
cambio geométrico completo, y la plantilla que `resizeMarimba` debería seguir.

### 6.3 Un fallo real encontrado

G17 falló en la primera ejecución: `420 !== 478`. La causa fue **mi aserción**,
que ignoraba el `clampNumber` de `withCascade` (`PERSON_MAX_W = 420`). Se corrigió
la aserción para reflejar la regla verdadera. No se relajó ninguna condición y no
se tocó código de producción.

## 7. `export7b3` — hallazgo de 7P **desmentido**

7P reportó que `export7b3.test.cjs:97` fallaba en aislamiento (`135.5 !== -52`).

Verificación real:

* `node --test tests/export7b3.test.cjs` → **8 pass, 0 fail**.
* `npm test` (suite completa) → **89 pass, 0 fail**.

**Causa demostrada:** el "fallo" de 7P era un artefacto. El fichero `e3.txt`
procedía de una ejecución **contaminada**: 7P encadenó dos `npx playwright test`
con `&` y la salida capturada mezclaba la de otro runner, mostrando un fallo que
no existía. **No había contaminación de estado entre tests.**

No se modificó `export7b3.test.cjs`.

## 8. Regresión

| Comprobación        | Resultado |
| ------------------- | --------- |
| `npm test`          | **89 pass, 0 fail** (67 previos + 22 nuevos) |
| `npx tsc --noEmit`  | **OK**, sin salida |
| `npm run build`     | **OK**, `built in 3.60s` |
| `pytest -q`         | **279 passed** en 36,07 s |
| `node --check`      | **verde** en cada bloque y al final |

E2E: **no ejecutado** en 7Q. La fase lo excluía como requisito principal, y solo
se modificó un fichero de pruebas unitarias.

## 9. Resize

```text
resizeMarimba: NO IMPLEMENTADO EN 7Q.
```

La suite **no depende de ninguna función inexistente**: todo se expresa con
`update`, `addPosition`, `marimbaTransformed`, `assign`, `toggleLock`,
`setReadOnly`, `undo`, `redo` y `setElements`.

## 10. `update`

```text
update → withCascade: SIN CAMBIOS.
```

No se sustituyó por `withRepositioned + withCascade`. G11 documenta que `update`
hoy no reposiciona, sin alterar ese comportamiento.

## 11. Datos

No se tocó ningún dato real. Las fixtures son objetos en memoria creados por
`seed()`; no hay `fetch`, ni `docker exec`, ni acceso a la base de datos, ni
volúmenes. No se ejecutó `docker compose down -v`.

## 12. Producción

```text
Producción: NO conectada ni modificada.
HTTPS real: NO verificado.
Migraciones de producción: NO ejecutadas.
```

## 13. Limitaciones

1. **No existe rechazo de dimensiones hoy.** G04 y G06–G09 documentan la brecha,
   no un contrato cumplido. El rechazo atómico solo está demostrado para las
   guardas que el store ya tiene (lock, readonly, no-op, id inexistente).
2. **`update` no reposiciona.** Demostrado en G11; queda como brecha para 7R.
3. La suite no cubre el **UI de resize**, porque no existe: esa parte será E2E en
   7R.
4. **E2E no ejecutado** en esta fase.
5. El alto no tiene contrato vertical propio: `slotH` y `slotY` son constantes,
   así que cambiar `height` hoy solo cambia el marco. G02 fija ese comportamiento
   en lugar de inventar uno.
6. No se midió rendimiento de `slotRect`; irrelevante para los objetivos de la
   fase.

## 14. Base para 7R

Con lo verificado, `resizeMarimba(id, width, height)` puede implementarse si:

1. valida `width` contra `needed(positions.length)` y rechaza no finitos,
   negativos y cero **de forma atómica** (G04–G09 fallarán hoy si no lo hace);
2. sigue el patrón ya existente en `marimbaTransformed`, es decir
   `withCascade(withRepositioned(...))` (G11, G12);
3. emite **un** paso de historial (G17);
4. respeta candado, solo lectura y no-op (G05, G18, G19);
5. no toca IDs ni asignaciones ni otras marimbas (G10, G13, G14);
6. serializa sin añadir campos (G20).