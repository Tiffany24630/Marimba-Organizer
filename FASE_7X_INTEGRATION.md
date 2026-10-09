# FASE 7X — AUDITORÍA Y MEJORA DE LA INTERACCIÓN DEL LIENZO

> **COMPLETADA.** Auditoría basada en el código real; el alcance elegido fue
> corregir un defecto de nombres accesibles, no añadir controles nuevos.

## 1. Estado inicial de Git

* Rama: `checkpoint/fase1-motor-d1-d3-d5` — sin cambios.
* HEAD: `3253c2a` — sin cambios.
* Protegidos verificados al inicio y al final: `optimizer.py` **+7**,
  `test_unified_core.py` **+216**, `cli.py` sin diferencias.

## 2. Auditoría de interacciones

| Operación | Ratón | Teclado | Alternativa accesible | Veredicto |
| --- | --- | --- | --- | --- |
| Seleccionar marimba | `onClick` Konva | — | `MarimbaPanel` `.pp-main` (`focus`) | **Cubierta** |
| Seleccionar puesto | `onClick` Konva | — | `Inspector` | **Cubierta** |
| Seleccionar persona | `onClick` | — | `PersonPanel` `.pp-main` | **Cubierta** |
| Mover marimba | arrastre | — | `AccessibleEditor` (flechas + X/Y), `Inspector` | **Cubierta** |
| Mover persona | arrastre / soltar | — | `AccessibleEditor` | **Cubierta** |
| Asignar a un puesto | soltar en el lienzo | — | `AccessibleEditor` (`<select>` + Asignar) | **Cubierta** |
| Quitar asignación | clic en el lienzo | — | `AccessibleEditor` + `Inspector` | **Cubierta** |
| Bloquear | clic | — | `MarimbaPanel`, `Inspector`, `PersonPanel` | **Cubierta** |
| Deshacer / rehacer | Ctrl+Z / Ctrl+Y | — | `AccessibleEditor` **y** barra del editor | **Cubierta, con defecto de nombre** |
| Zoom | rueda / botones | — | `Alejar`/`Acercar`/reset/Ajustar/Centrar | **Cubierta** |
| Desplazar lienzo | arrastre sobre el lienzo | — | **Ajustar** y **Centrar** | **Parcial** (deuda) |
| Cambiar dimensiones | tirador Konva | — | `Inspector` (7R/7W) | **Cubierta** |

**Conclusión: las 11 operaciones esenciales YA tenían alternativa accesible.**
No hacía falta construir controles nuevos; hacerlo habría duplicado lógica y
contradicho el criterio de la fase.

## 3. Operaciones que ya disponían de alternativas

Todas salvo el desplazamiento libre del lienzo. `AccessibleEditor` añade además
`role="status"` con `aria-live`, que anuncia el resultado de cada operación, y
`role="note"` en modo solo lectura.

## 4. Limitaciones confirmadas

**Un defecto real y reproducible:** botones con contenido simbólico y solo
`title`. En el cálculo del nombre accesible **el contenido tiene prioridad sobre
`title`**, así que se anunciaban como "↶", "🗑" u "✎".

Se detectó porque `interfaz.spec.ts` (7O) daba por bueno un botón con `title`.
Esa comprobación era **incorrecta** y dejó pasar el defecto.

## 5. Alcance elegido

Corregir los nombres accesibles. **No** se añadieron atajos, handles ni
controles nuevos: la auditoría demostró que no faltaban.

## 6. Contrato de interacción aplicado

* Todo botón debe tener nombre accesible con **al menos una letra o dígito**.
* Precedencia real del navegador: `aria-label` > `aria-labelledby` > contenido.
* El `title` se **conserva** como tooltip; `aria-label` no altera el aspecto.
* No se tocó ninguna acción del store: los cambios son atributos HTML.

## 7. Pruebas previas a la implementación

`frontend/e2e/specs/nombres7x.spec.ts` — auditoría **en runtime** que calcula el
nombre real de cada botón y exige letra o dígito. Recorre login, dashboard, las
tres pestañas y el Inspector con una marimba seleccionada.

Resultado **antes** de corregir: 5 defectos en el editor (deshacer, rehacer,
asignar, quitar de la composición, quitar del proyecto). Al extender el barrido
al dashboard aparecieron 4 más (renombrar/eliminar proyecto, editar/eliminar
plantilla). Se aplicó el mismo criterio, verificable estáticamente, al candado
del panel, a «Ajustar» y a los botones de puesto del Inspector.

## 8. Cambios realizados

Solo atributos `aria-label`. Sin cambios visuales ni de comportamiento.

| Archivo | Cambio |
| --- | --- |
| `pages/Project.tsx` | Deshacer / Rehacer |
| `pages/Dashboard.tsx` | renombrar/eliminar proyecto; editar/eliminar plantilla |
| `components/PersonPanel.tsx` | asignar; quitar de la composición; quitar del proyecto |
| `components/MarimbaPanel.tsx` | candado |
| `components/CanvasEditor.tsx` | «Ajustar» (consistencia con sus hermanos) |
| `components/Inspector.tsx` | subir/bajar puesto, quitar ocupante, eliminar puesto |
| `e2e/specs/interfaz.spec.ts` | **corregida**: ya no acepta `title` como nombre |
| `e2e/specs/nombres7x.spec.ts` | **nuevo** (3 pruebas) |
| `e2e/specs/resize.spec.ts` | selector de candado acotado al Inspector |

**Dos regresiones causadas por mis propios cambios, y su corrección:**

1. `getByRole('button',{name:/Bloquear/})` pasó a resolver a **3 elementos**
   (strict mode) porque el candado del panel ahora también dice "Bloquear…". Se
   acotó el selector al `.inspector`. El nombre accesible es correcto; el
   selector era ambiguo.
2. La prueba de deshacer/rehacer intentaba **pulsar** botones deshabilitados
   (sin historial) y expiraba. Ahora comprueba nombre y existencia, sin pulsar.

## 9. Compatibilidad con el store

**Intacta.** No se modificó `store/composition.ts` ni ninguna acción. Los
cambios son atributos HTML presentacionales.

## 10. Resultados de accesibilidad

* axe: **0 infracciones** en las cinco vistas (login, recuperación, dashboard,
  proyecto, editor).
* Auditoría propia de nombres incluida en los **63/63** E2E verdes.
* `interfaz.spec.ts` endurecido: **verde**. Es estrictamente más fuerte que antes.
* **Verificación manual:** las 12 operaciones se repasaron sobre el código. Lo que
  axe no puede evaluar —orden de foco real, anuncio en un lector de pantalla—
  **NO se ha verificado con un lector de pantalla real** y queda como
  limitación.

## 11. Resultados de las pruebas

| Suite | Resultado |
| --- | --- |
| `npm test` (incluye 7Q/7R/7V) | **149 passed, 0 failed** |
| `npx tsc --noEmit` | **OK** |
| E2E (suite completa) | **63 passed, 0 failed (2,5 min)** |

## 12. Regresión ejecutada

Backend **no ejecutado** (fuera de alcance, sin cambios). Último valor válido:
279 passed de 7T. Se reconstruyó `marimba7f-frontend` por cambio de producción
y se recreó solo ese contenedor.

## 13. Archivos modificados

Los ocho de la tabla de §8. Ningún test unitario ni archivo de backend.

## 14. Archivos protegidos

```
backend/app/services/suggestions/optimizer.py |   7 +-   (intacto)
backend/tests/test_unified_core.py            | 216 +-   (intacto)
backend/app/cli.py                            |  (sin diferencias)
```

## 15. Limitaciones restantes

1. **Desplazar el lienzo** (arrastrar el fondo) no tiene equivalente exacto; sí
   existen «Ajustar» y «Centrar». Deuda consciente, no rediseñada.
2. **No verificado con lector de pantalla real** ni más allá de la prueba
   existente de foco visible.
3. Solo **una** ronda E2E completa, no las tres de 7U.
4. La selección directa de figuras **sigue siendo solo de ratón** en Konva.
5. Backend no ejecutado (fuera de alcance). HTTPS real no verificado;
   producción no conectada.

## 16. Estado final de Git

Rama `checkpoint/fase1-motor-d1-d3-d5`, HEAD `3253c2a`. Sin commits, push,
merges, cambio de rama ni comandos destructivos. Datos reales, volúmenes y
producción intactos.