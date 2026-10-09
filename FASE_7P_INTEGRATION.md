# FASE 7P — ESTABILIZACIÓN E2E, REGRESIÓN GEOMÉTRICA E IMPLEMENTACIÓN SEGURA DE `resizeMarimba`

> Documento redactado **al terminar** las ejecuciones. Los resultados que siguen
> son los observados, no los previstos. Donde no se pudo verificar algo, se dice
> explícitamente **NO VERIFICADO**.

## 1. Estado general

**PARCIALMENTE COMPLETADA.**

Se resolvió el flake de diálogos (Objetivo A) y la regresión completa quedó verde,
pero **la regresión geométrica no se entregó** y **`resizeMarimba` no se
implementó**, porque su condición previa (Objetivo B) no se cumplió.

## 2. Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` (sin cambios).
* Sin commits, push, merges ni cambio de rama.
* No se ejecutó `reset`, `clean`, `restore` ni comandos destructivos.
* Cambios protegidos verificados como pendientes en `git status --short`:
  * `backend/app/services/suggestions/optimizer.py` → `M`
  * `backend/tests/test_unified_core.py` → `M`
  * `backend/app/cli.py` → `??` (sin Differences, sin sobrescribir)
* Único archivo modificado en esta fase:
  `frontend/e2e/specs/recuperacion.spec.ts`.

## 3. Flake de diálogos

**Síntoma (reportado en 7O)**

```
recuperacion.spec.ts:80
Protocol error (Page.handleJavaScriptDialog): Not attached to an active page
page.goto: net::ERR_ABORTED; maybe frame was detached?
```

**Causa**

Se rompió la hipótesis de 7O (que apuntaba a `window.prompt` de `Dashboard.tsx`).
La causa real está en la propia prueba: `el token cambia la clave y es de un solo
uso` ejecuta `page.context().clearCookies()` **con la aplicación ya cargada**.
Las peticiones que estaban en vuelo responden 401 y la aplicación las reporta con
`alert(...)` (patrón presente en `Dashboard`, `Project` y `PersonPanel` para
errores recuperables). Ese diálogo **nativo** se abre mientras la siguiente
`page.goto` ya está en marcha, y el manejador automático de Playwright intenta
cerrarlo sobre una página que ya no está activa.

**Solución aplicada**

Manejador explícito y determinista registrado en la prueba **antes de cualquier
acción**, que rechaza siempre esos avisos:

```ts
page.on('dialog', async d => {
  try { await d.dismiss(); } catch { /* la página ya se cerró */ }
});
```

No se relajó ninguna aserción, no se silenció ninguna excepción de negocio, no se
aumentaron timeouts y no se añadió reintento. El `catch` cubre únicamente el
cierre de un diálogo sobre una página ya desmontada (operación que no puede tener
éxito), nunca el resultado de una comprobación.

**Rondas ejecutadas**

| Ronda | Resultado | `recuperacion.spec.ts:80` |
|---|---|---|
| 1 | **55 passed / 0 failed** (2,2 min) | pasó |
| 2 | **NO VERIFICADA** — el comando de lanzamiento encadenó dos ejecuciones y el fichero de salida quedó contaminado | — |
| 3 | **NO VERIFICADA** — ídem | — |

El criterio de aceptación de 7P (tres rondas consecutivas en verde) **NO se
cumple**: solo hay **una** ronda válida. El arreglo está aplicado y pasó en la
ronda ejecutada, pero **no se puede afirmar que el flake esté cerrado**.

## 4. Auditoría de menús

Sin novedades: 7O ya verificó pestañas, `details/summary`, botones del lienzo,
listas nativas y clic derecho, y confirmó que **el supuesto menú contextual de
Konva no existe**. El código sigue sin `onContextMenu`, `role="menu"` ni
`menuitem`. La selección de figuras en el lienzo continúa siendo **solo de
ratón**, con `AccessibleEditor` como ruta alternativa.

## 5. Regresión geométrica — NO ENTREGADA

Se creó `frontend/tests/geometria7p.test.cjs` con la suite de 20 escenarios, pero
**quedó con bloques huérfanos por inserciones parciales** y era sintácticamente
inválido. Repararlo no fue fiable, y dejar un test roto habría roto `npm test`
completo, así que **el archivo se eliminó**.

**Consecuencia: los 20 escenarios NO están implementados ni verdes. No hay
resultado que reportar.**

Artefacto sobrevivido del trabajo, no ejecutado:

```ts
const needed=(n)=>2*MARIMBA_DEFAULT.pad+n*MARIMBA_DEFAULT.minSlotW+(n-1)*MARIMBA_DEFAULT.gap;
```

Confirma que la fórmula de 7O es la misma que ya usa `addPosition` al ensanchar,
no una regla nueva.

## 6. Contrato de `resizeMarimba` — NO IMPLEMENTADO

No se implementó. La regla final de 7P es explícita: *la seguridad geométrica tiene
prioridad sobre completar la funcionalidad*, y sin la regresión previa no hay
base para garantizar las invariantes.

**`update` NO fue modificado.** Sigue siendo `update → withCascade`. No se
sustituyó por `withRepositioned + withCascade` a ciegas, tal como exigía el
Objetivo D.

## 7. Persistencia, 8. IDs y asignaciones, 9. Undo/redo

**NO VERIFICADOS** en esta fase: dependen de la suite geométrica no entregada y
del E2E de resize, que no existen.

## 10. E2E

* Ronda 1: **55 passed, 0 failed, 0 flaky**.
* Rondas 2 y 3: **no válidas** (ver §3).

Efecto colateral detectado: el fichero de salida contaminado contenía una
ejecución suelta de `node --test` en la que
`tests/export7b3.test.cjs:97 › 7B.3 el encuadre contiene todos los elementos`
**falló en aislamiento** (`135.5 !== -52`), aunque pasa dentro de `npm test`.
**NO VERIFICADO**: no se investigó si es contaminación de estado entre pruebas.
No se modificó ese archivo.

## 11. axe

**NO VERIFICADO en esta fase.** No se auditó. Los cinco tests de diálogo
accesible y los de `menus.spec.ts` pasaron en la ronda 1, pero eso no equivale a
una auditoría axe.

## 12. Backend

`pytest -q` → **279 passed** en 39,46 s.

## 13. Frontend

`npm test` → **67 passed, 0 failed**.

## 14. TypeScript / build

* `npx tsc --noEmit` → OK.
* `npm run build` → OK (3,53 s).

## 15. Docker

**No se reconstruyó ninguna imagen.** Solo se modificó un fichero de prueba E2E,
que no forma parte de la imagen de producción del frontend. No hubo construcción
de backend ni de frontend.

## 16. Datos

No se ejecutaron pruebas que crearan, modificaran o borraran datos. No se
tocaron volúmenes ni se ejecutó `docker compose down -v`. Los correos de prueba
fueron los habituales de Mailpit y las cuentas se restauran por el mecanismo
existente de la suite.

## 17. Producción

```text
Producción: NO conectada ni modificada.
HTTPS real: NO verificado.
Migraciones de producción: NO ejecutadas.
```

## 18. Limitaciones

1. La regresión geométrica **no se entregó**; el objetivo central de 7P queda sin cumplir.
2. `resizeMarimba` **no existe**: sin la regresión previa habría sido una
   implementación especulativa.
3. Solo **una** ronda E2E válida; el flake no puede declararse cerrado.
4. `axe` **no se re-auditó**.
5. Posible contaminación de estado en `export7b3.test.cjs` sin investigar.
6. El canvas Konva sigue sin ser accesible por teclado; la selección de figuras
   permanece **solo de ratón**.
7. `window.prompt` (`Dashboard.tsx`, renombrar proyecto) sigue sin migrar: es un
   diálogo nativo y un candidato natural a un flake futuro.

## 19. Próximos pasos

1. Reejecutar las rondas E2E 2 y 3 **de forma secuencial**, con un solo
   `npx playwright test` por proceso y sin encadenar con `&`.
2. Entregar la suite de 20 escenarios geométricos desde cero, verificando con
   `node --check` antes de cada corrida.
3. Solo entonces implementar `resizeMarimba`.
4. Re-auditar axe sobre las cinco vistas.

Efecto colateral detectado: el fichero de salida contaminado contenía una
ejecución suelta de `node --test` en la que
`tests/export7b3.test.cjs:97 › 7B.3 el encuadre contiene todos los elementos`
**falló en aislamiento** (`135.5 !== -52`), aunque pasa dentro de `npm test`.
**NO VERIFICADO**: no se investigó si es contaminación de estado entre pruebas.
No se modificó ese archivo.