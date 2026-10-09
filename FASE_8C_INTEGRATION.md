# FASE 8C — CIERRE DE REGRESIÓN GEOMÉTRICA + VERIFICACIÓN E2E

## 1. Estado

```text
COMPLETADA
```

## 2. Decisión de producto: **OPCIÓN A**

`Numero` **mantiene el borrador** mientras se escribe; la normalización de la
coordenada se verifica **después de confirmar**.

**Por qué no se restauró la corrección inmediata:** la semántica
`escribir ≠ confirmar` que introdujo 8A es deliberada y sostiene el resto del
contrato (una edición = un paso, `Escape` cancela, `Enter`/`blur` confirman).
Devolver el recorte inmediato dentro de `Numero` volvería a mezclar el borrador
con el estado confirmado, que es justo lo que 8A eliminó. No hay evidencia de que
el producto exija corrección inmediata: el escenario de 7N exigía la
representación transitoria, no el resultado.

## 3. Cambio realizado

Un único fichero de pruebas:

| Archivo | Cambio |
| --- | --- |
| `frontend/e2e/specs/geometria.spec.ts` | `geometria.spec.ts:149` confirma con `blur()` antes de comprobar el valor |

**No se modificó** ningún archivo de producción: ni `Numero.tsx`,
`Inspector.tsx`, `AccessibleEditor.tsx`, `store/composition.ts` ni `layout.ts`.
No se reintrodujo `onChange → mover()`, ni `setTimeout`, ni debounce.

El escenario conserva su intención —*una posición negativa no puede quedar
aplicada al modelo*— y ahora comprueba el **estado confirmado**, que es lo
estricto. La normalización sigue aportándola `mover()` (`Math.max(0,...)`), no
una regla nueva: **las coordenadas negativas continúan siendo válidas en el
contrato general del store**.

## 4. Regresión

| Prueba | Resultado |
| --- | --- |
| `npm test` | **178 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| `npm run build` | **OK** |
| `geometria.spec.ts` + `accessible-editor8a.spec.ts` | **10 passed, 0 failed** (23,3 s) |

## 5. E2E completo — tres rondas independientes

| Ronda | Passed | Failed | Flaky | Duración |
| --- | ---: | ---: | ---: | --- |
| 1 | **77** | 0 | 0 | 2,4 min |
| 2 | **77** | 0 | 0 | 3,2 min |
| 3 | **77** | 0 | 0 | 3,2 min |

77 tests en las tres rondas. Procesos independientes y secuenciales
(`&&`, ficheros de salida separados). Ninguna ronda necesitó reintentos.

## 6. axe

Ejecutado dentro de las tres rondas: **0 infracciones** en las cinco vistas
(inicio de sesión, recuperación, dashboard, proyecto, editor). Sin reglas
desactivadas ni selectores alterados.

## 7. Archivos modificados

* `frontend/e2e/specs/geometria.spec.ts` (único cambio de 8C)
* `FASE_8C_INTEGRATION.md` (este documento)

## 8. Deudas que NO se abren en 8C

* **Lector de pantalla real**: NO VERIFICADO (heredado de 7Y).
* **Pan libre del lienzo**: deuda consciente (7Y).
* **Selección directa Konva**: deuda consciente (7Y).
* **Backend**: no ejecutado en 8C. Referencia histórica: 279 passed (7T).

## 9. Nota persistente: el undo nativo

`Ctrl+Z` con el foco dentro de un `input` ejecuta el **undo nativo del
navegador**, no el historial de la aplicación, porque `CanvasEditor.tsx:255`
hace `return` temprano para `INPUT`. Es el comportamiento diseñado para no
interferir con la escritura y es la causa del `200200` que se cerró en 8B. **No
se corrige en 8C.**

## 10. Git / integridad

* Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a` — **intactos**.
* Sin commit, push, merge, cambio de rama, `reset`, `clean` ni `restore`.
* Protegidos: `optimizer.py` **+7**, `test_unified_core.py` **+216**,
  `cli.py` sin diferencias.
* Backend sin cambios; datos reales, volúmenes y producción intactos.