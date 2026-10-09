# FASE 8E — AUDITORÍA FINAL DE ACCESIBILIDAD UIA

## Estado

```text
COMPLETADA — auditoría cerrada; el lector de pantalla real SIGUE NO VERIFICADO
```

## Entorno

Windows 11 Home 10.0.26200 · sesión interactiva · `UIAutomationClient` disponible
· Chromium (Playwright) *headed* con `--force-renderer-accessibility` ·
**Narrator 10.0.26100.8972 instalado pero inverificable: no hay entrada de audio**
(ver 8D, sigue vigente).

## 1. Qué se intentó extender

El avance de 8E sobre 8D era **autenticar la sonda** para llegar al editor y
medirlo en UIA. Se construyó una sonda que, usando la **cuenta de pruebas
existente** (`despliegue7f-a@prueba.local`, la misma que usan los E2E), recorre el
camino real:

```text
LOGIN_OK          -> sesion iniciada por el formulario real
DATOS_OK pid=1911 -> proyecto, cancion y composicion creados (con CSRF)
EDITOR_OK         -> editor abierto por la interfaz real
ACC_OK            -> vista accesible abierta
```

**La sonda llegó al editor.** Eso confirma, por vía DOM/Playwright, que el camino
de entrada y la vista accesible son operables — evidencia que **ya existía** de 7Y
y 8A; aquí solo se comprueba que no se rompió.

## 2. Por qué el editor NO se midió en UIA

Al lanzar la enumeración UIA con el navegador de prueba abierto, la ventana **no
aparece** en `AutomationElement.RootElement` de nivel superior, aunque el proceso
existe (`chrome.exe`) y tiene `MainWindowTitle` visible.

Se ajustó el filtro dos veces (por título de la app y por `Chrome for Testing`) y
en ambos casos la enumeración no la encontró. La conclusión técnica es que **la
ventana del navegador de pruebas no es visible para la enumeración UIA de este
proceso** (probablemente por estación de ventanas o escritorio distinto).

No se insiste más: se agotó el intento razonable. **El editor queda NO MEDIDO en
UIA** y no se presenta como si lo estuviera.

## 3. Evidencia UIA consolidada

| Escenario | UIA |
| --- | --- |
| Login | **MEDIDO** (8D): `Edit "Correo"`, `Edit "Contrasena"`, `Button "Iniciar sesion" enabled=False` |
| Dashboard | **NO MEDIDO** |
| Editor (resto) | **NO MEDIDO** |

## 4. Textos sin tilde — NO se corrigen (decisión de proyecto)

8D observó «Iniciar sesion» / «Contrasena». Origen localizado: son los **textos
visibles reales** de `AuthScreen`, y `helpers.ts:23-27` lo documenta de forma
explícita:

> *"El boton de acceso dice 'Iniciar sesion' (sin tilde, por decision del
> proyecto). Este selector centraliza el texto para que un cambio de interfaz no
> rompa tests…"*

Es decir: **es una convención deliberada**, no un descuido. Cambiarlo rompería
`BOTON_ENTRAR` y los tests que lo reutilizan, sin evidencia de que afecte a una
tarea esencial. **No se modifica.** Se mantiene como deuda menor documentada.

## 5. Cambios

**CERO cambios de producción.** No se tocó `Numero.tsx`, `Inspector.tsx`,
`AccessibleEditor.tsx`, `CanvasEditor.tsx`, `composition.ts`, `layout.ts` ni ningún
otro archivo de `src/`. La sonda `frontend/e2e/sonda-uia8e.cjs` se eliminó tras su
uso.

## 6. Pruebas

**Ejecutadas en 8E:** ninguna de la suite (no hubo cambios de producción). Solo la
sonda de navegación de §1, con el comando `node e2e/sonda-uia8e.cjs` →
`LOGIN_OK, DATOS_OK, EDITOR_OK, ACC_OK`. Fichero eliminado después.

**Baseline histórico de 8C** (NO es resultado de 8E):

```text
npm test  178 passed / 0 failed
tsc       OK
build     OK
E2E       77/77 x 3 rondas, 0 failed, 0 flaky
axe       0 infracciones x 3 rondas
```

## 7. Matriz final de evidencia

Niveles **distintos y no intercambiables**:

| Escenario | DOM/E2E | axe | UIA | Lector real |
| --- | --- | --- | --- | --- |
| Login | verificado | verificado | **medido** | NO VERIFICADO |
| Dashboard | verificado | verificado | no medido | NO VERIFICADO |
| Selección | verificado | verificado | no medido | NO VERIFICADO |
| Asignación | verificado | verificado | no medido | NO VERIFICADO |
| Desasignación | verificado | verificado | no medido | NO VERIFICADO |
| Bloqueo/desbloqueo | verificado | verificado | no medido | NO VERIFICADO |
| Undo/redo | verificado | verificado | no medido | NO VERIFICADO |
| Zoom | verificado | verificado | no medido | NO VERIFICADO |
| Dimensiones | verificado | verificado | no medido | NO VERIFICADO |
| X / Y | verificado | verificado | no medido | NO VERIFICADO |
| Rotación / escala | verificado | verificado | no medido | NO VERIFICADO |
| `role="status"` | verificado | n/a | no medido | NO VERIFICADO |

## 8. Deudas

* **Lector de pantalla real — NO VERIFICADO.** Única deuda real no verificable
  aquí: falta entrada de audio.
* **Pan libre del lienzo** — deuda consciente (7Y), sin cambios.
* **Selección directa Konva** — deuda consciente (7Y), sin cambios.
* **`Ctrl+Z` dentro de INPUT → undo nativo del navegador** — documentado, no se
  modifica.
* **Textos sin tilde** — deuda menor, convención deliberada del proyecto.

## 9. Privacidad

Todas las sondas se limitaron a la ventana de la aplicación (primero por título,
luego por `Chrome for Testing`). La única vez que apareció una ventana ajena fue en
**8D**: se detectó al instante, se acotó el filtro y **no se incorporó ningún dato
personal** a este documento ni al de 8D.

## 10. Git / integridad

* Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a` — **intactos**.
* Protegidos: `optimizer.py` **+7**, `test_unified_core.py` **+216**, `cli.py` sin
  diferencias.
* Sin commit, push, merge, cambio de rama ni comandos destructivos sobre el
  repositorio.
* No se conectó producción, no hubo migraciones, no se alteraron datos reales.

## 11. Conclusión

8E **no cierra artificialmente** la deuda del lector. Lo que aporta es preciso:

1. Se consiguió llevar una sonda autenticada **hasta el editor**, confirmando que
   el camino completo sigue operativo.
2. Se intentó medir el editor en UIA y **no fue posible** por una limitación real
   del entorno (la ventana del navegador de pruebas no es visible para UIA desde
   este proceso). Queda documentado como **no medido**, no como aprobado.
3. Se localizó el origen de los textos sin tilde: son una **convención
   deliberada** (§4), por lo que no se tocan.

**UIA verificado ≠ lector de pantalla verificado.** La deuda del lector permanece
abierta y requiere una sesión con entrada de audio o transcripción humana.