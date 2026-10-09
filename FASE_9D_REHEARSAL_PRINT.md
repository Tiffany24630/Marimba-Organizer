# FASE 9D — VISTA DE ENSAYO / IMPRESIÓN

## 1. Estado general

```text
COMPLETADA
```

## 2. Objetivo

Dar al músico, al director o al responsable de ensayo una **representación legible
y no destructiva** de la composición, sin abrir el editor y sin poder modificarlo.

## 3. Decisión de diseño previa (la primera que pedía la fase)

**¿Se puede construir desde la composición ya cargada? Sí.** Se comprobó el modelo
antes de escribir nada:

* `MarimbaElement.positions[]` → cada puesto con su `type` y su `personId`
  (o `null`): de ahí salen **asignados y vacantes**.
* `PersonElement.marimbaId` → `null` significa que **no está sentada**.
* `marimbaId`, `marimbaPositionId`, `note` y `name` dan el resto.

Por tanto **no se creó ninguna ruta de backend**, ni `POST /print`, ni `/pdf`, ni
generación de PDF. La impresión ocurre en el navegador con `window.print()`.

## 4. Archivos

| Archivo | Papel |
| --- | --- |
| `src/lib/rehearsal.ts` | **nuevo** — función pura `buildRehearsal(elements)` |
| `src/components/RehearsalView.tsx` | **nuevo** — la vista |
| `src/pages/Project.tsx` | botón «Vista de ensayo» + estado `verEnsayo` |
| `src/styles.css` | estilos de pantalla y `@media print` |
| `tests/ensayo9d.test.cjs` | **nuevo** — 15 pruebas unitarias |
| `e2e/specs/ensayo9d.spec.ts` | **nuevo** — 3 pruebas E2E |

**`composition.ts`, `Numero.tsx`, `Inspector.tsx` y `AccessibleEditor.tsx` NO se
tocaron.** La vista lee `elements` del store; no lo escribe.

## 5. Flujo de usuario

```
Editor abierto → «Vista de ensayo» → capa superpuesta de consulta
   ├─ encabezado: composición, canción, resumen y fecha
   ├─ una tabla por marimba: puesto | persona
   ├─ «Personas sin asignar (n)» con las que no están sentadas
   ├─ [Imprimir]  → window.print()
   └─ [Volver al editor]
```

## 6. Impresión

`@media print` con **`@page size: A4 landscape`**: una composición tiene varias
marimbas y en vertical se partirían. Oculta barra, sidebar, inspector, lienzo y
botones. `break-inside: avoid` evita que una marimba se parta entre dos páginas.
No hay PDF en backend ni dependencias nuevas.

## 7. Accesibilidad

* HTML semántico: `table`/`caption`/`thead`/`th scope`/`tbody`. **No hay canvas.**
* Botones con texto: «Imprimir», «Volver al editor». Ningún icono sin nombre.
* El vacante se distingue por la **palabra «Vacante»**, no solo por el color.
* Verificado por **DOM/E2E y axe**. **No se afirma lector de pantalla real**:
  sigue `NO VERIFICADO`; el UIA del editor sigue `NO MEDIDO`.

## 8. Seguridad

No hay backend nuevo ni autorización nueva. Se respetan exactamente los permisos
existentes: quien puede leer la composición llega a ella por las mismas rutas, y
el botón vive dentro del editor ya protegido. Un lector ve «Imprimir»; no
obtiene ningún control de edición porque **no existe ninguno** en la vista.

## 9. Tests nuevos

**15 unitarias** (`ensayo9d.test.cjs`): una marimba; varias; orden determinista;
puestos vacantes; personas sin asignar; etiqueta del puesto frente a la de la
persona; marimba bloqueada; composición vacía; marimba sin puestos; cuadre del
resumen; la entrada no se muta; y el orden del array no altera quién aparece
sentado.

**3 E2E** (`ensayo9d.spec.ts`): contenido real (marimbas, puestos, asignada,
2 vacantes, persona suelta, resumen); **ausencia de controles de edición**; e
**impresión que invoca `window.print()` sin modificar la composición guardada**.

## 9 bis. Regresión — resultados REALES de 9D

| Suite | Baseline 9C | Resultado 9D |
| --- | --- | --- |
| Backend `pytest -q` | 297 | **NO EJECUTADO** (sin cambios de backend) |
| Frontend `npm test` | 178 | **193 passed / 0 failed** (178 + 15) |
| `npx tsc --noEmit` | exit 0 | **exit 0** |
| `npm run build` | exit 0 | **exit 0** (`✓ built in 3.08s`) |
| E2E ronda 1 (con la regresión) | 79 | 81 passed / **1 failed** → **ver §10.a** |
| E2E ronda final | — | **82 passed / 0 failed** |
| axe | 0 | **0 infracciones** en las 5 vistas |

Ningún test existente eliminado, debilitado, marcado `skip` ni `todo`.

## 10. Incidencias reales y su resolución

**a) Regresión REAL que introdujo 9D, y su causa.** La ronda completa falló en
`geometria.spec.ts:122` («las coordenadas exactas se aplican y persisten al
recargar», recibía `200` en vez de `640`). No se dio por buena como flake: se
reejecutó aislada y **reprodujo**, y se comprobó que en 9C pasaba. Causa: el botón
«Vista de ensayo» se había colocado en la **barra del editor**, junto a
«Guardar»; ese botón extra alteraba el orden de foco y rompía la confirmación
por `blur` de los campos numéricos de `Numero`. **Solución**: el botón se movió al
**panel lateral «Paneles»**, lejos de los controles de guardado, y se añadió el
motivo en un comentario junto al código para que no se repita. Verificado:
`geometria.spec.ts` **6/6** y `ensayo9d.spec.ts` **3/3`, juntos, 9/9.

**b) Defecto propio de la vista, encontrado por un test.** El botón «Imprimir» se
encontraba en el DOM pero el clic expiraba: la vista se renderizaba dentro de la
barra y **quedaba tapada por el lienzo**. Se corrigió `.rehearsal` para que sea una
**capa superpuesta** (`position:fixed; z-index:40`) con su propio desplazamiento, y
vuelve a flujo normal al imprimir. No se forzó el clic ni se relajó el test.

**c) Detección de «sentada» demasiado optimista.** Mi primera implementación
consideraba asignada a cualquier persona con `marimbaId`. Una prueba falló y
tenía razón: una persona cuyo puesto **ya no existe** no está sentada, y en un
ensayo eso hay que verlo. Se corrigió para comprobar contra los **puestos
reales**, y se añadió la prueba 9D-15 que fija que el orden del array no altera la
detección.

**d) Errores míos de test**, corregidos sin tocar producción: llamar a `escribir()`
antes de `entrar()` (`document.cookie` en `about:blank`); no recargar el dashboard
tras crear el proyecto; y un selector «Vacante» que también contaba el texto
«2 vacantes» del resumen.

**e) Entorno E2E.** Reconstrucción con `up -d --build`, **sin `down -v`**; base de
datos y volúmenes intactos.

## 11. Limitaciones

* La vista muestra lo que el modelo ya contiene. No inventa una marimba, un
  puesto o una persona que no exista.
* No hay vista «por canción» sin abrir su composición.
* No se prueba el papel físico: se verifica el DOM y `window.print()`, no la salida
  en una impresora real.

## 12. Datos

Producción **NO TOCADA** · PostgreSQL real **NO CONECTADO** · migraciones de
producción no ejecutadas · datos históricos intactos · sin `down -v`.

## 13. Git

Branch `checkpoint/fase1-motor-d1-d3-d5` · HEAD `3253c2a` · `optimizer.py` **+7** ·
`test_unified_core.py` **+216** · `cli.py` sin diferencias. Sin commit, push, merge
ni cambio de rama.

`composition.ts`, `Numero.tsx`, `Inspector.tsx` y `AccessibleEditor.tsx` **sin
modificar**: conservan exactamente sus diferencias previas.

## 14. Deudas conscientes que permanecen

Pan libre del lienzo · selección directa Konva · `Ctrl+Z` en INPUT · textos sin
tilde. Ninguna se ha tocado. El lector de pantalla real sigue `NO VERIFICADO` y el
UIA del editor `NO MEDIDO`.

## 15. Recomendación del siguiente paso

Queda un pendiente real de 9B: **enlace público de solo lectura** (el rol `reader`
ya existe; falta la vía sin sesión).

La ronda E2E completa de 9D terminó en **82/82 con axe 0**, así que el bloque está
confirmado en verde con el conjunto.

Aviso honesto para quien siga: la regresión del §10.a la encontró **la suite**, no
la inspección. Merece la pena extremar el cuidado al añadir elementos a la barra
del editor: affects al orden de foco y, con él, a la confirmación por `blur` de
`Numero`, que es un contrato cerrado desde 7Z/8A.