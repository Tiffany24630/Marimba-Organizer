# FASE 8D — VERIFICACIÓN DE LECTOR DE PANTALLA REAL

## 1. Estado

```text
COMPLETADA — verificación real con lector NO disponible; deuda documentada
```

**No se declara el lector de pantalla como verificado.** No hubo lector real.

## 2. Entorno

| | |
| --- | --- |
| SO | Windows 11 Home, 10.0.26200 |
| Sesión | Interactiva (`SessionId` 1), `explorer.exe` activo |
| Audio | Salida presente (NVIDIA / AMD / Realtek) |
| Navegador de pruebas | Chromium (Playwright), *headed* |
| Lector | **Narrator 10.0.26100.8972 presente** · NVDA ausente · JAWS ausente |
| `UIAutomationClient` | Disponible |

## 3. Disponibilidad del lector real — Resultado B

**Narrator está instalado y el entorno es interactivo, pero una verificación real
NO es posible aquí.** Motivo concreto y verificable:

> La salida de Narrator es **exclusivamente audio sintetizado**. No existe en su
> API pública ninguna forma de leer la cadena que pronuncia, y **esta sesión no
> tiene entrada de audio por la que el agente pueda percibir lo que se dice**.

Sonar «se inició» no demostraría nada sobre lo que el usuario escucha. Por tanto:

* **No se instaló** ningún lector (NVDA, JAWS, extensiones).
* **No se fingió** la verificación.
* **No se presenta** axe, DOM, `getByRole()` ni Playwright como equivalentes.

## 4. Evidencia complementaria REAL (NO es un lector de pantalla)

Para no quedarme solo con una negativa, se midió lo que **sí** es la capa que un
lector consume: **UI Automation (UIA)**, el árbol de accesibilidad del sistema
operativo, expuesto por Chromium con `--force-renderer-accessibility`.

**Es más fuerte que el DOM y más débil que un lector real**: demuestra que
nombre, rol y estado llegan a la pila de accesibilidad; **no** demuestra que un
lector los comunique de forma útil.

Método reproducible: Chromium *headed* contra la app y enumeración del árbol UIA
de **solo** esa ventana (`System.Windows.Automation`).

### Login — medido

| UIA ControlType | Name | IsEnabled |
| --- | --- | --- |
| Document | Acomodo · Organizador de marimba | True |
| Text | Marimba Organizer | True |
| Text / **Edit** | **Correo** / **Correo** | True |
| Text / **Edit** | **Contrasena** / **Contrasena** | True |
| **Button** | **Iniciar sesion** | **False** |
| Button | Olvide mi contrasena | True |

Lecturas relevantes:

* Cada campo expone **nombre accesible y rol de edición** (`Edit`).
* El botón de acceso expone su **estado deshabilitado correctamente** (`False`)
  con los campos vacíos: el estado *sí* llega a la capa de accesibilidad.
* Los textos visibles que actúan de etiqueta también llegan (`Text` + `Edit`).

### Observación menor (preexistente, no se corrigió)

`Iniciar sesion` y `Contrasena` aparecen **sin tilde** en la capa UIA. No es una
regresión de 8A/8B/8C: es el texto real de la aplicación. Se documenta como
**redacción (severidad baja)** y **no se modificó** porque 8D no tiene evidencia
de que afecte a una tarea esencial, y cambiar textos visibles excedería el
alcance de una fase de verificación.

## 5. Matriz de verificación

| Escenario | Resultado | Observaciones |
| --- | --- | --- |
| Login | **MEDIDO en UIA** | nombres, roles y estado correctos |
| Dashboard | **NO MEDIDO** | la sonda no llegó a autenticarse |
| Selección | NO MEDIDO | — |
| Asignación | NO MEDIDO | — |
| Desasignación | NO MEDIDO | — |
| Bloqueo/desbloqueo | NO MEDIDO | — |
| Undo/redo | NO MEDIDO | — |
| Zoom | NO MEDIDO | — |
| Dimensiones | NO MEDIDO | — |
| X / Y | NO MEDIDO | — |
| Rotación / escala | NO MEDIDO | — |
| `role="status"` | NO MEDIDO en UIA | cubierto solo por DOM/E2E (7Y, 8A) |

**La matriz del editor queda sin medir**: se agotó el presupuesto tras el login.
No se afirma nada sobre ella.

## 6. Problemas encontrados

| Severidad | Ubicación | Descripción | Corrección |
| --- | --- | --- | --- |
| Baja | `AuthScreen` | Textos «Iniciar sesion» / «Contrasena» sin tilde | **No corregida** (preexistente, fuera de alcance) |

Ningún problema que impida una tarea esencial fue demostrado.

## 7. Correcciones

**Ninguna.** No se tocó producción: `Numero.tsx`, `Inspector.tsx`,
`AccessibleEditor.tsx`, `CanvasEditor.tsx`, `composition.ts` y `layout.ts` siguen
igual. No se modificó ningún contrato de fases cerradas.

## 8. Regresión

**No aplica.** 8D no modificó producción, por lo que no se repitió ninguna
ejecución. Baseline histórico inmediato dejado por **8C** (no reutilizado como
ejecución de 8D):

```text
npm test   178 passed / 0 failed
tsc        OK
build      OK
E2E        77/77 × 3 rondas, 0 failed, 0 flaky
axe        0 infracciones × 3 rondas
```

## 9. axe

**NO EJECUTADO en 8D.** Sin cambios en producción no procedía repetirlo; el valor
de 8C sigue siendo la referencia.

## 10. Deudas restantes

| Deuda | Estado |
| --- | --- |
| **Lector de pantalla real** | **NO VERIFICADO** — resultado de 8D |
| Pan libre del lienzo | Deuda consciente (7Y) |
| Selección directa Konva | Deuda consciente (7Y) |
| Backend | No ejecutado; referencia 279 passed (7T) |
| `Ctrl+Z` en INPUT → undo nativo del navegador | Documentado, no se modifica |
| Textos sin tilde en `AuthScreen` | Baja, preexistente |

## 11. Archivos modificados

Ninguno de producción. Solo se creó `FASE_8D_INTEGRATION.md`. La sonda temporal
`frontend/e2e/sonda-uia8d.cjs` se eliminó tras su uso, igual que los scripts
PowerShell de sondeo (todos fuera del repositorio).

## 12. Nota de privacidad

Una primera sonda de UIA enumeró **todas** las ventanas de nivel superior y llegó
a mostrar el título de una ventana personal de Chrome del usuario. Se detectó de
inmediato, se acortó el filtro a **solo** la ventana de la aplicación y no se
utilizó ni se reproduce aquí ningún dato personal.

## 13. Git / integridad

* Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a` — **intactos**.
* Protegidos: `optimizer.py` **+7**, `test_unified_core.py` **+216**,
  `cli.py` sin diferencias.
* Sin commit, push, merge, cambio de rama ni comandos destructivos.
* Backend, datos reales, volúmenes y producción sin tocar.

## 14. Conclusión

El lector de pantalla **sigue sin verificarse** y no se ha simulado lo contrario.
Lo que 8D sí añade, con evidencia reproducible, es que la aplicación **expone
correctamente nombre, rol y estado en la capa UI Automation** que un lector de
pantalla consume: medido en el login, con el botón de acceso correctamente
deshabilitado mientras los campos están vacíos.

Para cerrar la deuda haría falta una sesión con **entrada de audio** (o una
persona que transcriba lo que Narrator dice) recorriendo el editor. Esa sesión no
existe en este entorno.