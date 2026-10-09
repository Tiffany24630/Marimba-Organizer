# FASE 8G — CIERRE DEL BLOQUE 7Q–8G

Documento de referencia del estado del bloque. No introduce ninguna funcionalidad.

## 1. Estado general

```text
COMPLETADA
```

## 2. Resumen ejecutivo

El bloque 7Q–8G implementó un endurecimiento medible del editor: geometría con
rechazo atómico, validación de coordenadas, edición numérica transaccional y una
vía de accesibilidad por teclado. Todo ello está cubierto por pruebas que pasan.

El límite honesto del cierre: **el lector de pantalla real nunca se ha
verificado**, por ausencia de entrada de audio en la sesión. Y el editor **no se
ha medido en UIA**, por una limitación del entorno ya documentada en 8E. Ninguna de
las dos ausencias se convierte aquí en afirmación positiva.

## 3. Matriz consolidada de funcionalidades

Estados: `VERIFICADO` · `NO MEDIDO` · `NO VERIFICADO` · `DEUDA CONSCIENTE` ·
`LIMITACIÓN DEL ENTORNO` · `NO APLICA`

| Área | Contrato | Evidencia | Estado |
| --- | --- | --- | --- |
| Geometría | `resizeMarimba` valida y es atómico | `resizeMarimba7r`, `resize.spec.ts` | VERIFICADO |
| Geometría | mínimos de width/height | `resizeMarimba7r`, `altura7w`, `geometria7q` | VERIFICADO |
| Geometría | preserva IDs y asignaciones | `resizeMarimba7r` | VERIFICADO |
| Geometría | no-op sin historial; un paso por cambio | `resizeMarimba7r`, `resize.spec.ts` | VERIFICADO |
| Geometría | rechazo de marimba bloqueada / readonly | `resizeMarimba7r`, `readonly7e`, `resize.spec.ts` | VERIFICADO |
| Coordenadas | `update` rechaza no finitos | `update8a` | VERIFICADO |
| Coordenadas | coordenadas negativas válidas aceptadas | `update8a` | VERIFICADO |
| Coordenadas | parche mixto inválido es atómico | `update8a` | VERIFICADO |
| Dimensiones | `update` rechaza width/height no finitos | `update7v` | VERIFICADO |
| Edición | `Numero` mantiene borrador | `historial7z`, `historial-numerico7z` | VERIFICADO |
| Edición | Enter y blur confirman | `historial7z`, `accessible-editor8a` | VERIFICADO |
| Edición | Enter+blur = un solo paso | `historial-numerico7z` | VERIFICADO |
| Edición | Escape cancela sin historial | `historial7z`, `accessible-editor8a` | VERIFICADO |
| Edición | vacío / no numérico / idéntico = no-op | `historial7z` | VERIFICADO |
| Edición | `Numero` compartido por `Inspector` y `AccessibleEditor` | `accessible-editor8a` | VERIFICADO |
| Historial | un paso por edición confirmada | `historial7z` | VERIFICADO |
| Undo/redo | edición confirmada reversible | E2E (`teclado7y`, `resize`) | VERIFICADO |
| Bloqueo | bloqueo/desbloqueo bloquea edición | `readonly7e`, `resize.spec.ts` | VERIFICADO |
| Accesibilidad | navegación por teclado | `teclado7y`, `menus` | VERIFICADO |
| Accesibilidad | nombres accesibles no simbólicos | `nombres7x` | VERIFICADO |
| Accesibilidad | alternativa al lienzo sin ratón | `accesible`, `accessible-editor8a` | VERIFICADO |
| Accesibilidad | `role="status"` anuncia el resultado | `accessible-editor8a` | VERIFICADO |
| Accesibilidad | reglas axe automáticas | `wcag` (8F) | VERIFICADO |
| UIA | login | 8D | VERIFICADO |
| UIA | editor | 8E | **NO MEDIDO** |
| Lector real | Narrator | 8D/8E | **NO VERIFICADO** |
| Lienzo | pan libre | decisión 7Y | DEUDA CONSCIENTE |
| Lienzo | selección directa Konva | decisión 7Y | DEUDA CONSCIENTE |

## 4. Contratos cerrados

Los cuatro contratos siguen intactos, verificados por pruebas **y** por lectura de
código en 8F:

* **`resizeMarimba`** — `composition.ts` + mínimos en `layout.ts`.
* **`update`** — `num()` en `composition.ts:11` descarta `NaN`/`±Infinity`.
* **`Numero`** — `Numero.tsx:42-49`: confirma, cancela y descarta vacío/no
  numérico/igual sin crear paso.
* **Accesibilidad** — la vía sin ratón cubre las tareas.

## 5. Regresión más reciente

```text
ÚLTIMA REGRESIÓN REAL: FASE 8F  (no son ejecuciones de 8G)
```

No se ha ejecutado ninguna suite nueva en 8G, porque no ha habido ningún cambio
desde 8F. No se presentan estos resultados como obtenidos en 8G.

| Prueba | Comando de 8F | Resultado |
| --- | --- | --- |
| Unitarias | `npm test` | 178 passed / 0 failed (839 ms) |
| Tipos | `npx tsc --noEmit` | exit 0 |
| Build | `npm run build` | exit 0 (`✓ built in 3.08s`) |
| E2E ronda 1 | `npm run test:e2e` | 77 passed (2.8m), 0 failed |
| E2E ronda 2 | `npm run test:e2e` | 77 passed (2.8m), 0 failed |
| axe | `wcag.spec.ts` | 0 infracciones × 5 vistas × 2 rondas |

## 6. Matriz de accesibilidad

| Capacidad | DOM/E2E | axe | UIA | Lector real |
| --- | --- | --- | --- | --- |
| Login | verificado | verificado | **medido** | NO VERIFICADO |
| Dashboard | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Selección | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Asignación | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Desasignación | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Bloqueo | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Undo/redo | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Zoom | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Dimensiones | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| X/Y | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| Rotación/escala | verificado | verificado | NO MEDIDO | NO VERIFICADO |
| `role=status` | verificado | n/a | NO MEDIDO | NO VERIFICADO |

```text
DOM/E2E  ≠  axe  ≠  UIA  ≠  lector real
```

Cada columna responde a una pregunta distinta: comportamiento web, reglas
automáticas, exposición al árbol del SO, y experiencia real de una persona. El
bloque solo tiene evidencia en las tres primeras.

## 7. Evidencia UIA

| Escenario | Estado | Detalle |
| --- | --- | --- |
| Login | **VERIFICADO** (8D) | `Edit "Correo"`, `Edit "Contrasena"`, `Button "Iniciar sesion"` con `IsEnabled=False` |
| Dashboard y editor | **NO MEDIDO** | La ventana de Chromium de pruebas no aparece en `AutomationElement.RootElement` |

En 8E se llegó autenticados hasta el editor y a la vista accesible, pero la
ventana del navegador no resultó visible para la enumeración UIA de este proceso.
No se insiste: `NO MEDIDO` no es `VERIFICADO`.

## 8. Lector de pantalla real

```text
Estado: NO VERIFICADO
Motivo: la sesión no dispone de entrada de audio
Requiere: una sesión con audio o una transcripción humana de los anuncios
```

Narrator 10.0.26100.8972 está instalado. Que esté instalado **no** es evidencia de
que funcione, y no se ha simulado ninguna lectura. No es un defecto del software:
es una limitación de verificación.

## 9. Deudas conscientes

| Deuda | Origen | Estado |
| --- | --- | --- |
| Pan libre del lienzo | 7Y | DEUDA CONSCIENTE |
| Selección directa de figuras Konva | 7Y | DEUDA CONSCIENTE |

No se reabren. La vía accesible verificada cubre las tareas que estas deudas
afectan.

## 10. Limitaciones del entorno

* **UIA del editor** — ventana del navegador de pruebas invisible para la
  enumeración UIA utilizada (8E).
* **Lector real** — sin entrada de audio (8D/8E).
* **Backend** — no ejecutado en 8B–8G; los `279 passed` de 7T son referencia
  histórica, no un resultado actual.

## 11. Datos y seguridad

* Producción, PostgreSQL real, volúmenes y datos históricos: **no tocados**.
* Migraciones: **no ejecutadas**.
* Los E2E usaron únicamente el entorno aislado y el mecanismo de pruebas existente.
* Las sondas UIA se limitaron a la ventana de la aplicación; ningún dato personal
  de otras ventanas se incorporó a los informes.

## 12. Git e integridad

| Elemento | Valor |
| --- | --- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` |
| `optimizer.py` | **+7** |
| `test_unified_core.py` | **+216** |
| `cli.py` | sin diferencias |

Sin commit, push, merge, cambio de rama, `reset`, `clean`, `restore`, `rebase` ni
`docker compose down -v` en 8B–8G.

## 13. Trazabilidad de pruebas

Nombres verificados en el repositorio.

| Prueba | Tipo | Cubre | Fase | Estado |
| --- | --- | --- | --- | --- |
| `tests/geometria7q.test.cjs` | unitario | geometría base | 7Q | pasa |
| `tests/resizeMarimba7r.test.cjs` | unitario | `resizeMarimba` completo | 7R | pasa |
| `tests/update7v.test.cjs` | unitario | dimensiones en `update` | 7V | pasa |
| `tests/altura7w.test.cjs` | unitario | altura mínima | 7W | pasa |
| `tests/historial7z.test.cjs` | unitario | granularidad e historial | 7Z | pasa |
| `tests/update8a.test.cjs` | unitario | x/y finitos y atómicos | 8A | pasa |
| `tests/readonly7e.test.cjs` | unitario | bloqueo / solo lectura | 7E | pasa |
| `e2e/specs/teclado7y.spec.ts` | E2E | flujo real de teclado | 7Y | pasa |
| `e2e/specs/nombres7x.spec.ts` | E2E | nombres accesibles | 7X | pasa |
| `e2e/specs/historial-numerico7z.spec.ts` | E2E | Enter/blur/Escape | 7Z | pasa |
| `e2e/specs/geometria.spec.ts` | E2E | colocación por teclado | 8B | pasa |
| `e2e/specs/resize.spec.ts` | E2E | resize, bloqueo, deshacer | 7R | pasa |
| `e2e/specs/accesible.spec.ts` | E2E | alternativa al lienzo | 7Y | pasa |
| `e2e/specs/accessible-editor8a.spec.ts` | E2E | X/Y y `role=status` | 8A | pasa |
| `e2e/specs/wcag.spec.ts` | E2E | axe en 5 vistas | continuo | pasa |

## 14. Archivos protegidos

```text
backend/app/services/suggestions/optimizer.py   +7      intacto
backend/tests/test_unified_core.py              +216    intacto
backend/app/cli.py                              sin diferencias
```

No modificados en 7Q–8G.

## 15. Conclusión

**¿Está estable el bloque?** Sí, según la última regresión real (8F): 178
unitarias, type-check, build y dos rondas E2E de 77/77, con axe en cero.

**¿Está completamente certificado en accesibilidad?** No.

**¿Está verificado con un lector de pantalla real?** No: `NO VERIFICADO`.

**¿Hay evidencia de una regresión actual?** No.

**¿Hay funcionalidades pendientes?** Sí, pero divididas en deudas conscientes
(pan, Konva), limitaciones de verificación (lector real, UIA del editor) y
comportamientos documentados (`Ctrl+Z` en INPUT, textos sin tilde).

**¿Hay que modificar código ahora?** No.

> El bloque 7Q–8G queda estable según la evidencia disponible, pero **no debe
> describirse como una certificación completa de accesibilidad** porque el lector
> de pantalla real continúa sin verificarse.

Revisión documental realizada en 8G sobre 7T, 8D, 8E y 8F: **no se encontró
ninguna contradicción objetiva**. Ningún informe declara verificado el lector real
ni presenta UIA como equivalente a un lector. Por eso no ha hizo falta modificar
ningún documento previo, y este archivo es el documento consolidado de referencia.