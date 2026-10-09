# FASE 8F — AUDITORÍA FINAL DE DEUDAS, REGRESIÓN Y ESTADO DE CIERRE

## Estado

```text
COMPLETADA
```

## Objetivo

8F es una **auditoría final de regresión e inventario de deudas**. No es una fase
de funcionalidades: no se ha añadido ninguna característica ni corregido ningún
comportamiento, porque **no se ha encontrado ninguna regresión**.

## 1. RESULTADOS REALES DE 8F

Ejecutados en esta fase, en `frontend/`:

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Unitarias | `npm test` | **178 passed / 0 failed** (839 ms) |
| Tipos | `npx tsc --noEmit` | **exit 0**, sin salida |
| Build | `npm run build` | **exit 0**, `✓ built in 3.08s` |
| E2E ronda 1 | `npm run test:e2e` | **77 passed (2.8m)**, 0 failed |
| E2E ronda 2 | `npm run test:e2e` | **77 passed (2.8m)**, 0 failed |
| axe | dentro de `wcag.spec.ts` | **0 infracciones** en las 5 vistas, ambas rondas |

Salida de axe, idéntica en las dos rondas:

```text
[axe] inicio de sesion: 0 infracciones
[axe] recuperacion: 0 infracciones
[axe] panel de proyectos: 0 infracciones
[axe] vista de proyecto: 0 infracciones
[axe] editor de composicion: 0 infracciones
```

En ninguna ronda aparecen líneas `flaky`, `retry` ni `failed`.

## 2. BASELINES HISTÓRICOS (no son resultados de 8F)

```text
8C   npm test 178/0 · tsc OK · build OK · E2E 77/77 x3 · axe 0 x3
7T   backend 279 passed   (referencia; el backend NO se ejecuto en 8F)
```

Los resultados de la §1 **coinciden** con el baseline de 8C. No se sustituye una
cosa por otra: 8F los volvió a ejecutar.

## 3. Contratos cerrados: verificados intactos

Comprobados por lectura del código, no solo por las pruebas.

**`resizeMarimba`** (`store/composition.ts:227+`, pruebas `resizeMarimba7r`):
sigue validando id existente, bloqueo, finitud, positividad y mínimos
(`minMarimbaWidth(n)`, `minMarimbaHeight()` de `lib/layout.ts:33+`), con rechazo
atómico, no-op sin historial y un único paso por redimensionado.

**`update`** (`store/composition.ts:11`, `normalizeElement`): `num()` sigue
descartando `NaN`/`±Infinity` mediante `Number.isFinite`, y las coordenadas
negativas válidas se siguen aceptando. Atomicidad cubierta por `update8a.test.cjs`
y `historial7z.test.cjs`.

**`Numero`** (`components/Numero.tsx:42-49`): borrador → confirma por `Enter`/`blur`
(línea 53-56), cancela por `Escape` (línea 57), y **no confirma** si está vacío, no
es numérico o es igual al valor real (línea 47). El `borrador===null` inicial evita
el doble paso. Semántica sin cambios.

**Accesibilidad:** las alternativas verificadas por `teclado7y.spec.ts`,
`accessible-editor8a.spec.ts`, `accesible.spec.ts` y `nombres7x.spec.ts` siguen
pasando en ambas rondas.

## 4. Accesibilidad: cuatro niveles distintos

| Nivel | Estado |
| --- | --- |
| DOM/E2E | verificado en 8F (2 rondas, 77/77) |
| axe | verificado en 8F (0 infracciones × 5 vistas × 2 rondas) |
| UIA | login **medido** (8D); editor **NO MEDIDO** (8E) |
| Lector real | **NO VERIFICADO** |

No se acerca ni se confunde un nivel con otro.

## 5. Deudas: inventario final

### No verificable en este entorno

* **Lector de pantalla real — NO VERIFICADO.** No por un defecto del software, sino
  porque no existe entrada de audio. Cierra con una sesión con audio o una
  transcripción humana.

### No medido por limitación del entorno

* **UIA del editor — NO MEDIDO.** 8E agotó el intento razonable: la ventana de
  Chromium de pruebas no aparece en `AutomationElement.RootElement`.

### Deudas conscientes (no deben reabrirse)

* **Pan libre del lienzo** (7Y).
* **Selección directa de figuras Konva** (7Y). Las alternativas accesibles ya
  verificadas cubren las tareas.

### Comportamiento documentado

* **`Ctrl+Z` con foco en INPUT → undo nativo del navegador.** No se modifica.

### Convención menor

* **Textos sin tilde** (`Iniciar sesion`, `Contrasena`). Decisión deliberada del
  proyecto (`helpers.ts:23-27`), no un defecto.

**Ninguna de estas se presenta como defecto nuevo.** No apareció evidencia que
obrigara a reabrir ninguna.

## 6. Cambios

```text
Ningún archivo de producción modificado.
```

Único archivo creado: `FASE_8F_INTEGRATION.md`. No se tocó `src/`, ni pruebas, ni
documentación previa, ni el backend.

## 7. Git e integridad

Comprobado **antes y después** de las pruebas, con resultados idénticos:

```text
branch  checkpoint/fase1-motor-d1-d3-d5
HEAD    3253c2a
optimizer.py         +7
test_unified_core.py +216
cli.py               sin diferencias
```

Sin commit, push, merge, cambio de rama, `reset`, `clean`, `restore` ni
`docker compose down -v`.

## 8. Datos

No se tocó producción, PostgreSQL real, volúmenes ni datos históricos. Los E2E
usaron únicamente el entorno aislado y el mecanismo de pruebas ya existente. El
backend no se ejecutó: no hubo ninguna prueba frontend fallida que lo justificara.

## 9. Conclusión

> ¿El bloque 7Q–8F está estable según las pruebas realmente ejecutadas?

**Sí.** Las 178 unitarias, el type-check, el build y dos rondas E2E completas
(77/77) pasan, con axe en cero en las cinco vistas y sin pruebas flaky. Los
contratos cerrados de `Numero`, `update` y `resizeMarimba` se han verificado por
lectura de código además de por las pruebas. No se ha detectado ninguna regresión
de 7Q–8E, por lo que **no había nada que corregir** y no se ha implementado nada.

**Lo que esto NO significa:** el bloque no está certificado como accesible de
forma completa. El lector de pantalla real sigue **NO VERIFICADO** y el editor
sigue **NO MEDIDO** en UIA. La estabilidad demostrada es la que las pruebas de
este entorno pueden demostrar.