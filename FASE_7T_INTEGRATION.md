# FASE 7T — CIERRE DEL E2E DE RESIZE Y REGRESIÓN FINAL

> **COMPLETADA.** Cerrada formalmente en la FASE 7U, tras ejecutar las rondas 2
> y 3 de forma independiente. No fue necesario ningún cambio de código adicional.

## 1. Estado general

```text
COMPLETADA
```

## 1-bis. Cierre formal (FASE 7U)

Las dos rondas pendientes se ejecutaron **de forma independiente**, una detrás de
otra, sin encadenar procesos ni mezclando salidas:

| Ronda | Resultado      | Duración | Recuperación |
| ----- | -------------- | -------- | ------------ |
| 1 (7T) | 60 passed, 0 failed, 0 flaky | 1,5 min | PASS (3,6 s) |
| 2 (7U) | 60 passed, 0 failed, 0 flaky | 1,6 min | PASS (3,7 s) |
| 3 (7U) | 60 passed, 0 failed, 0 flaky | 1,6 min | PASS (3,9 s) |

* Las **tres rondas consecutivas** fueron satisfactorias.
* `recuperacion.spec.ts:80` pasó en **las tres**.
* `wcag.spec.ts` (axe) pasó en las tres con **0 infracciones** en las cinco vistas.
* `resize.spec.ts` pasó los 5 en las tres rondas.
* **No fue necesario modificar código adicional**: 7U fue solo verificación. El
  único cambio permitido en 7U fue esta actualización del documento.

## 2. Estado inicial de Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` — verificada al inicio y al final.
* HEAD: `3253c2a` — sin cambios.
* Protegidos antes de empezar: `optimizer.py` **+7**, `test_unified_core.py`
  **+216**, `cli.py` sin diferencias.

## 3. Aserción corregida y justificación

**Opción A**, tal como se decidió en 7S. Se conserva el borrador inválido y el
mensaje de error; lo que se verifica es el **estado real** de la marimba.

Antes (fallaba):
```ts
await expect(ancho(page), 'el rechazo deja el ancho anterior').toHaveValue('1400');
```

Ahora:
```ts
await expect(ancho(page), 'el borrador invalido se conserva').toHaveValue('100');
await guardar(page);
real = await guardado(page, cid);
expect(real.width, 'el rechazo NO cambio el ancho real').toBe(1400);
expect(real.height, 'ni el alto real').toBe(640);
expect(real.positions.length, 'ni los puestos').toBe(2);
```

**Justificación**: la UI solo refleja el borrador mientras se edita, así que el
input no puede demostrar que la marimba quedó intacta. La aserción anterior
medía el input, no el resultado. La nueva mide lo que importa, y además refuerza
la cobertura: ahora también se comprueba que el alto y los puestos no sufren
modificación parcial, y que el rechazo del **cero** tampoco cambia nada.

**No se modificó el `Inspector`.**

## 4. Método para comprobar el estado real

Reutilizado de `geometria.spec.ts`: guardar con el botón «Guardar» y leer
`GET /compositions/{cid}` con el helper `escribir`. Se añadió `guardado(page,cid)`
y `guardar(page)` al propio spec. No se llama al store desde Playwright para
simular estado: la interacción sigue siendo por la interfaz real.

## 5. Dos ejecuciones independientes de `resize.spec.ts`

| Ejecución | Resultado | Duración |
| --- | --- | --- |
| 1 | **5 passed**, 0 failed | 14,9 s |
| 2 | **5 passed**, 0 failed | 15,1 s |

Procesos separados, no encadenados con `&`.

Durante este proceso se corrigieron **dos selectores más**, ambos con
diagnóstico confirmado leyendo el código:

* **Deshacer/Rehacer**: `getByRole('button',{name:'Deshacer'})` no existía.
  Leyendo `Project.tsx:575-576`, son `<button title="Deshacer (Ctrl+Z)">↶</button>`:
  el nombre accesible lo aporta el **contenido** (`↶`), con prioridad sobre
  `title`. Se usa el `title` real del DOM.
* **Undo limpia la selección**: `undo()` hace `selectedId:null`, así que tras
  deshacer el Inspector deja de mostrar la rama de marimba y sus campos
  desaparecen. El test vuelve a seleccionar para leer el valor restaurado. No es
  un defecto del resize.

## 6. Tres rondas E2E completas

| Ronda | Resultado |
| --- | --- |
| 1 | **60 passed, 0 failed, 0 flaky (1,5 min)** |
| 2 | **60 passed, 0 failed, 0 flaky (1,6 min)** |
| 3 | **60 passed, 0 failed, 0 flaky (1,6 min)** |

La suite completa abarca **60** tests (55 previos + los 5 nuevos de resize).
Las tres rondas se ejecutaron en procesos independientes y secuenciales.

## 7. `recuperacion.spec.ts:80`

**FLAKE CERRADO.** Pasó en las **tres rondas consecutivas** (3,6 s / 3,7 s / 3,9 s),
que es el criterio fijado en 7P. El handler `page.on('dialog', …)` introducido
en 7P sigue **intacto**: no se eliminó, no se modificó y ninguna assertion se
debilitó en ningún momento.

La causa ya estaba diagnosticada en 7S: `clearCookies()` con la app cargada
provoca un 401 en peticiones en vuelo, la aplicación lo reporta con `alert(...)`
y ese diálogo nativo compite con la navegación. El manejador explícito lo resuelve
sin silenciar errores reales.

## 8. axe

Ejecutado dentro de la ronda 1 (`wcag.spec.ts`). **0 infracciones** en las cinco
vistas:

| Vista | Resultado |
| --- | --- |
| Inicio de sesión | 0 infracciones |
| Recuperación | 0 infracciones |
| Panel de proyectos | 0 infracciones |
| Vista de proyecto | 0 infracciones |
| Editor de composición | 0 infracciones |

Los controles nuevos de tamaño quedan cubiertos por la auditoría del editor y,
además, por el test E2E «accesible sin ratón», que comprueba foco por teclado,
nombre accesible, aplicación con Enter y `aria-describedby`.

## 9. 7Q y 7R

| Suite | Resultado |
| --- | --- |
| 7Q `geometria7q` | **22 passed, 0 failed** |
| 7R `resizeMarimba7r` | **21 passed, 0 failed** |

Ninguno se modificó ni se debilitó.

## 10–12. Frontend

| Comprobación | Resultado |
| --- | --- |
| `npm test` | **110 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| `npm run build` | **OK** — `built in 3.62s` |

## 13. Backend

`pytest -q` → **279 passed** en 28,73 s. Sin cambios en backend.

## 14. Docker

**Ninguna operación en 7T.** Solo se modificó `frontend/e2e/specs/resize.spec.ts`,
un fichero de pruebas que no entra en la imagen. Se siguió usando el contenedor
`marimba7f-frontend-1` que 7R dejó construido. No se tocó backend, PostgreSQL ni
volúmenes. Nunca se ejecutó `docker compose down -v`.

## 15. Integridad de datos

No se tocaron datos reales. El E2E crea proyectos con nombre único (`unico(...)`).
Sin migraciones, sin producción.

## 16. Archivos protegidos

```
backend/app/services/suggestions/optimizer.py |   7 +-   (intacto)
backend/tests/test_unified_core.py            | 216 +-   (intacto)
backend/app/cli.py                            |  (sin diferencias)
```

## 17. Producción

```text
Producción: no conectada ni modificada.
HTTPS real: no verificado.
Migraciones: no ejecutadas.
```

## 18. Limitaciones

1. `update` sigue sin validar dimensiones: la validación vive solo en
   `resizeMarimba`. Un `update('m1',{width:-5})` seguiría aceptándose. Deuda
   documentada desde 7R y **fuera del alcance** de esta fase.
2. `height` no tiene contrato vertical propio: `slotH` y `slotY` son constantes,
   así que cambiar el alto redibuja el marco y no mueve los puestos. Es el modelo
   actual, no un defecto introducido aquí.
3. El lienzo Konva continúa siendo **solo de ratón**; la ruta accesible es el
   `AccessibleEditor` y el `Inspector`. No se afirma lo contrario.
4. HTTPS real sigue sin verificar y no hay TLS local.

## 19. Siguiente paso

```text
No queda bloqueo funcional de esta fase.
```

La única deuda conocida y documentada es la validación de dimensiones en
`update` (§18.1), que requeriría su propia fase y pruebas previas.