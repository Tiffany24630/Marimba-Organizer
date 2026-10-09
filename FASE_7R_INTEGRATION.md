# FASE 7R — `resizeMarimba`, UI Y REGRESIÓN

> **PARCIALMENTE COMPLETADA.** El store y las pruebas unitarias están hechos y
> verdes, pero la **capa E2E está en rojo** y la fase NO puede declararse
> completada. Ver §9 y §19.

## 1. Estado general

```text
PARCIALMENTE COMPLETADA
```

* `resizeMarimba` **implementado** y demostrado a nivel unitario.
* Suite 7Q **intacta y verde** (22/22), sin modificar un solo test.
* R01–R20 **verdes** (21/21).
* **E2E de resize: 5 de 5 en ROJO**, sin investigar por falta de presupuesto.
* Sin las tres rondas E2E, sin axe y sin `pytest` de esta fase.

## 2. Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` — sin cambios.
* HEAD: `3253c2a` — sin cambios.
* Sin commits, push, merge, `reset`, `clean` ni `restore`.
* Protegidos verificados **después** de la fase:
  * `backend/app/services/suggestions/optimizer.py` → **+7** (intacto)
  * `backend/tests/test_unified_core.py` → **+216** (intacto)
  * `backend/app/cli.py` → **no aparece** en `git diff --stat` (intacto)

| Archivo | Cambio en 7R |
| --- | --- |
| `frontend/src/lib/layout.ts` | **+14** — nuevo `minMarimbaWidth(n)` |
| `frontend/src/store/composition.ts` | **+43** netos — `resizeMarimba` |
| `frontend/src/components/Inspector.tsx` | **+53** netos — UI de tamaño |
| `frontend/tests/resizeMarimba7r.test.cjs` | **nuevo** (21 tests) |
| `frontend/e2e/specs/resize.spec.ts` | **nuevo** (5 tests, en rojo) |

## 3. Implementación

`resizeMarimba(id, width, height)` en `store/composition.ts`, junto a `clear`.
Valida **todo antes de mutar** y devuelve `{}` en cualquier rechazo, es decir,
no cambia absolutamente nada:

1. id inexistente o que no sea marimba → `{}`
2. `elementLocked(elements, id)` → `{}` (candado, también con persona sentada bloqueada)
3. `!Number.isFinite(width|height)` → `{}` (cubre `NaN`, `Infinity`, `-Infinity`)
4. `width <= 0 || height <= 0` → `{}` (cubre cero y negativos)
5. `width < minMarimbaWidth(positions.length)` → `{}`
6. no-op (mismo ancho y alto) → `{}`

Solo lectura **no** se duplica: la bloquea `step`, que ya es el cuello de botella
de toda mutación del lienzo (mismo criterio que usa `update`).

## 4. Geometría

```text
resizeMarimba
  → validar
  → withRepositioned(els, resized)   // persona al slotCenter de SU puesto
  → withCascade(els, id)             // tamaño de la persona acotado
  → step(...)                        // UN solo paso de historial
```

Se **reutilizan** `withRepositioned` y `withCascade`; no se copiaron ni se
reescribieron. `update` no interviene.

La fórmula del mínimo se centralizó: `minMarimbaWidth(n)` en `lib/layout.ts`, y
`addMarimba` y `addPosition` pasan a usarla (antes la repetían en línea). **El
React no recalcula nada**: el Inspector pide `minMarimbaWidth` al helper.

`height` no tiene contrato vertical propio: `slotH` y `slotY` son constantes, así
que cambiar el alto redibuja el marco y no mueve los puestos. Es el comportamiento
que 7Q ya fijó, y R02 lo mantiene.

## 5. `update`

```text
update → withCascade: SIN CAMBIOS.
```

`update` no se tocó. No se le añadió `withRepositioned`.

## 6. Tests unitarios R01–R20

`frontend/tests/resizeMarimba7r.test.cjs` — **21 pass, 0 fail**.

| ID  | Escenario | Resultado |
| --- | --- | --- |
| R01 | Ancho válido | PASS |
| R02 | Alto válido | PASS |
| R03 | Ancho mínimo exacto (360) | PASS |
| R04 | Inferior al mínimo → rechazo | PASS |
| R05 | `NaN` → rechazo | PASS |
| R06 | `Infinity` → rechazo | PASS |
| R07 | `-Infinity` → rechazo | PASS |
| R08 | Negativos → rechazo | PASS |
| R09 | Cero → rechazo | PASS |
| R10 | Lock → rechazo | PASS |
| R11 | Readonly → rechazo | PASS |
| R12 | Id inexistente → rechazo | PASS |
| R13 | No-op sin historial | PASS |
| R14 | Persona conserva IDs | PASS |
| R15 | Persona centrada en su slot | PASS |
| R16 | Otra marimba intacta | PASS |
| R17 | Undo | PASS |
| R18 | Redo | PASS |
| R19 | Un solo paso de historial | PASS |
| R20 | Serialización/deserialización | PASS |
| R20b | Composición legacy por el flujo de resize | PASS |

La atomicidad se comprueba a la vez sobre el estado completo (`firma()`), el
historial y la marca de sucio.

## 7. Suite 7Q

```text
22/22 — VERDE, sin tocar ningún test.
```

Ejecutada antes de implementar (línea base) y después de implementar.

## 8. UI

Nuevo bloque **«Tamaño»** en el `Inspector` para la marimba seleccionada:

* `Ancho (px)` y `Alto (px)`: `<input type="number">` con `<label>` visible.
* `Aplicar tamaño`: botón explícito → **un** paso de historial por aplicación.
* Pista con el mínimo real (`Ancho mínimo: 256 px para 2 puestos`) enlazada con
  `aria-describedby`.
* Errores en `<p role="alert">`: número inválido, `<= 0`, y menor que el mínimo.
  No dependen del color.
* `disabled` con candado y con solo lectura, con texto explicativo en ambos casos.
* El borrador se deriva durante el render (sin `useEffect`), así que si el store
  rechaza, los campos vuelven a mostrar el valor real.

No se añadieron handles en Konva. El lienzo sigue siendo **solo de ratón**; el
resize es accesible por el `Inspector`.

## 9. E2E

`frontend/e2e/specs/resize.spec.ts` — 5 pruebas **RED**: `5 failed`.

| Prueba | Estado |
| --- | --- |
| cambia el ancho, respeta el mínimo y avisa | FAILED |
| deshacer y rehacer | FAILED |
| guarda, recarga y reabre | FAILED |
| marimba bloqueada | FAILED |
| accesible sin ratón | FAILED |

**Causa: NO INVESTIGADA.** Se agotó el presupuesto de la fase antes de poder leer
el error concreto. Candidato probable a revisar primero: el helper `seleccionar()`
se escribió suponiendo que la selección se hace desde `.acc-editor` con un botón
«Seleccionar», y puede que ese botón no exista con ese nombre accesible, o que el
`Inspector` no se abra al seleccionar desde ahí. Los selectores de esa prueba son
lo **no verificado** de 7R.

**No se relajó ninguna aserción ni se silenció nada para tapar el rojo.**

Rondas completas 1/2/3: **NO EJECUTADAS**.

## 10. Recuperación

`recuperacion.spec.ts:80` (el flake de 7P): **NO VERIFICADO en 7R.** No hubo
tiempo para las tres rondas completas. Sigue **sin declararse cerrado**.

## 11. axe

**NO EJECUTADO en 7R.** Los controles nuevos (dos `number` con `<label>`, un
botón, un `role="alert"`) no introducen roles ni nombres nuevos, pero eso es un
razonamiento, **no una medición**.

## 12. Backend

`pytest -q`: **no ejecutado en 7R**. El último resultado válido sigue siendo el de
7Q: **279 passed**. No se tocó backend.

## 13. Frontend

`npm test` → **110 pass, 0 fail** (89 de 7Q + 21 nuevos de 7R).

## 14. TypeScript / build

* `npx tsc --noEmit` → **OK**, sin salida.
* `npm run build` → **OK**, `built in 6.78s`.

## 15. Docker

Se reconstruyó **`marimba7f-frontend`** (la imagen que usa el stack E2E), porque
cambió código de producción del frontend. El build de la imagen ejecuta
`tsc -b && vite build` y terminó bien. Se recreó solo el contenedor
`marimba7f-frontend-1`; **no** se tocó backend ni volúmenes. También se construyó
`marimba-organizer-frontend` (compose base).

## 16. Persistencia

Demostrado en R20 y R20b: tras `resizeMarimba` + `JSON.stringify` +
`setElements(JSON.parse(...))` se conservan **exactamente** dimensiones, `x`, `y`,
IDs de elementos y puestos, ocupaciones (`personId`) y la posición centrada de la
persona. El JSON resultante es **idéntico** al previo, así que **no se añadió
ningún campo**.

## 17. Datos

No se tocaron datos reales. Fixtures en memoria para las unitarias; el E2E crea
proyectos con nombre único vía `unico(...)`. No se ejecutó
`docker compose down -v` ni se eliminó ningún volumen.

## 18. Producción

```text
Producción: NO conectada ni modificada.
HTTPS real: NO verificado.
Migraciones de producción: NO ejecutadas.
```

## 19. Limitaciones

1. **E2E de resize en rojo (5/5)** y sin investigar. Es lo que impide cerrar la fase.
2. **Sin las tres rondas E2E**: el flake de `recuperacion.spec.ts:80` sigue sin
   resolverse de forma concluyente.
3. **axe no ejecutado**.
4. `pytest` no re-ejecutado en 7R.
5. `update` sigue **sin validar dimensiones**: la validación nueva vive solo en
   `resizeMarimba`. Un `update('m1',{width:-5})` seguiría aceptándose. Deuda
   documentada, no error de 7R.
6. La UI valida el mínimo para dar *feedback*, pero la autoridad es el store.
7. `height` sigue sin contrato vertical propio (decisión del modelo).

## 20. Siguiente paso concreto

Diagnosticar `resize.spec.ts`: ejecutar `npx playwright test resize.spec.ts` y leer
el primer fallo. La hipótesis prioritaria es el helper `seleccionar()`, **no** la
lógica del store, ya demostrada por R01–R20. Una vez verde el E2E: tres rondas
completas y axe.