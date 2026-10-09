# FASE 7S — DIAGNÓSTICO Y CIERRE DEL E2E DE RESIZE

> **PARCIALMENTE COMPLETADA.** Diagnóstico confirmado y dos causas resueltas;
> queda un hallazgo abierto. Ver §2 y §17.

## 1. Estado general

```text
PARCIALMENTE COMPLETADA
```

## 2. Diagnóstico E2E

### Hipótesis inicial (7R)

> Que el bloqueo era el helper `seleccionar()`, porque `.acc-editor` + botón
> «Seleccionar» no corresponde con la UI real.

### La primera ejecución NO fue un fallo de la prueba, sino del entorno

| Test | Duración | Error |
| --- | --- | --- |
| 1 | 1,0 s | `page.goto: net::ERR_NETWORK_IO_SUSPENDED at http://localhost:18080/` |
| 2 | 91 ms | `browserType.launch: Timeout 180000ms exceeded` |

Eran demasiado rápidos para alcanzar el editor. Se comprobó el estado:
`marimba7f-frontend-1` en pie y `Invoke-WebRequest http://localhost:18080/ → 200`.
Causa: contenedores recién recreados en 7R y procesos de navegador agotados.
**Fallo ambiental, no funcional**: ningún selector llegó a evaluarse.

### Causa confirmada del fallo funcional (2.º intento)

```
locator.click: Timeout 15000ms exceeded
waiting for locator('.acc-editor').getByRole('button', { name: /Seleccionar/ }).first()
```

`.acc-editor` **sí** aparecía (su `waitFor` pasaba). El botón «Seleccionar» **no
existe**: el editor accesible ofrece controles de asignación, no de selección.

Vía real de selección, **verificada leyendo `MarimbaPanel.tsx:23`**:

```tsx
<button className="pp-main" onClick={()=>focus(m.id)} …>
```

y en el store `focus:(id)=>set({selectedId:id, focusId:id, selectedSlot:null})`:
`focus` **sí** fija `selectedId`, que es lo que lee el `Inspector` para mostrar su
rama de marimba.

**Corrección aplicada**: `seleccionar()` usa ahora la pestaña «Marimbas» y hace
clic en `.marimba-panel .pp-main`. Se reutiliza el mecanismo existente; no se
tocó producción.

### Segundo error (3.er intento) — cerrado en 7S

```
Expected: "1400" / Received: "100"   (getByLabel('Ancho (px)'))
```

Causa confirmada: **error aritmético del propio test**. Esperaba `256`; la app
muestra y `minMarimbaWidth` produce `246` (`2*14 + 2*104 + 1*10`). Mandaba el
código de producción. Corregido el valor del test a `246`.

## 3. Cambios

Único archivo modificado en 7S:

| Archivo | Cambio |
| --- | --- |
| `frontend/e2e/specs/resize.spec.ts` | helper `seleccionar()` y valor del mínimo (`256` → `246`) |

**No se modificó** `store/composition.ts`, `layout.ts`, `Inspector.tsx` ni ningún
otro archivo de producción.

## 4. Store

```text
resizeMarimba: SIN CAMBIOS en 7S.
update:        SIN CAMBIOS.
```

## 5. E2E resize — estado real

```text
NO VERDE. La fase NO está cerrada.
```

Tras las dos correcciones el primer test avanza hasta la **última** aserción y
falla solo en esta:

```
Error: el rechazo deja el ancho anterior
expect(locator).toHaveValue(expected) failed
Locator:  getByLabel('Ancho (px)')
Expected: "1400"   Received: "100"
```

El `role="alert"` **sí** aparece con «246»: el rechazo del store funciona. Lo que
no se cumple es mi aserción, que mira **el input**, no la marimba.

**Causa confirmada**: el `Inspector` conserva el *borrador* cuando la aplicación se
rechaza, porque `aplicarTamano` hace `return` antes de `setBorrador(null)`.

**No es un defecto demostrado del store**: el store sí rechazó, y R04–R13 ya lo
prueban a nivel unitario. Es una decisión de UX del `Inspector` que 7S no debe
cambiar sin decidirla explícitamente.

## 6. Tres rondas E2E

| Ronda | Resultado |
| --- | --- |
| 1 | **NO EJECUTADA** |
| 2 | **NO EJECUTADA** |
| 3 | **NO EJECUTADA** |

## 7. `recuperacion.spec.ts:80`

**NO VERIFICADO en 7S.** El handler `page.on('dialog', …)` de 7P sigue intacto (no
se quitó ni se debilitó). Sin las tres rondas, el flake continúa **sin declararse
cerrado**.

## 8. axe

**NO EJECUTADO en 7S.**

## 9. Frontend

`npm test`, `tsc` y `build`: **NO re-ejecutados en 7S**. Últimos valores válidos,
de 7R: **110 pass**, `tsc` OK, build OK. Como 7S solo tocó un fichero de prueba
E2E (que no entra en `npm test`), no se espera cambio, pero **no está verificado**.

## 10. Backend

`pytest -q`: **NO EJECUTADO en 7S**. Último valor válido (7Q): **279 passed**. No
se tocó backend.

## 11. Geometría

7Q y 7R: **NO re-ejecutados en 7S**. Últimos valores válidos: **22/22** y
**21/21**. Ninguno se modificó.

## 12. Docker

**Nada reconstruido en 7S**; solo se editó un test E2E. El contenedor
`marimba7f-frontend-1` es el que 7R dejó construido con la imagen nueva (que
incluye la UI de tamaño) y es el que sirve la app bajo prueba. No se tocó backend,
PostgreSQL ni volúmenes. Nunca se ejecutó `docker compose down -v`.

## 13. Datos

No se tocaron datos reales. El E2E crea proyectos con nombre único (`unico(...)`).
No se eliminó ningún volumen ni dato histórico.

## 14. Git

* Branch: `checkpoint/fase1-motor-d1-d3-d5`
* HEAD: `3253c2a`
* Sin commit, push, merge, cambio de rama, `reset`, `clean` ni `restore`.

## 15. Protegidos

```
backend/app/services/suggestions/optimizer.py |   7 +-   (intacto)
backend/tests/test_unified_core.py            | 216 +-   (intacto)
backend/app/cli.py                            |  (sin diferencias, intacto)
```

## 16. Producción

```text
Producción: no conectada ni modificada.
HTTPS real: no verificado.
Migraciones: no ejecutadas.
```

## 17. Limitaciones y siguiente paso

1. `resize.spec.ts` **sigue sin estar verde**: 1 aserción pendiente (§5).
2. Sin las tres rondas E2E, sin axe, y sin `npm test`/`tsc`/`build`/`pytest`
   re-ejecutados en esta fase.
3. El flake de `recuperacion.spec.ts:80` sigue abierto.
4. `update` sigue sin validar dimensiones (deuda documentada desde 7R).

Siguiente paso: decidir el contrato del borrador en el `Inspector`.

* **Opción A (recomendada):** mantener el borrador —el usuario edita su valor
  inválido y ve el error— y cambiar la aserción para comprobar lo que de verdad
  importa: que la marimba **no** cambió. Verificable por la API, que es el patrón
  que ya usa `geometria.spec.ts` tras guardar.
* Opción B: hacer que el `Inspector` revierta el campo al valor real al rechazar.
  Es un cambio de producción y **no** está justificado por evidencia.

Después: 2 rondas de `resize.spec.ts`, 3 rondas completas de E2E, axe y regresión.