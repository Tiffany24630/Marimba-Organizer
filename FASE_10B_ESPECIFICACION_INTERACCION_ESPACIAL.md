# FASE 10B — Especificación y validación de interacción espacial

## 1. Resultado

```text
FASE 10B — COMPLETADA
```

Esta fase fue exclusivamente de inspección, medición y diseño. No se implementó
pan, selección, zoom, cambios de modelo, cambios de API ni cambios de
accesibilidad.

La inspección revela que el editor ya dispone parcialmente de pan sobre el área
vacía, zoom con rueda y pinch, selección directa y arrastre. La futura
implementación debe completar y validar un contrato explícito, no duplicar esas
capacidades.

## 2. Estado actual inspeccionado

### Archivos revisados

- `frontend/src/components/CanvasEditor.tsx`
- `frontend/src/store/composition.ts` (solo lectura)
- `frontend/src/lib/layout.ts` (solo lectura)
- `frontend/src/types/index.ts`
- `frontend/src/components/AccessibleEditor.tsx` (solo lectura)
- `frontend/src/components/Inspector.tsx` (solo lectura)
- `frontend/src/pages/Project.tsx`
- `frontend/src/styles.css`
- Especificaciones E2E de geometría, historial, accesibilidad e interfaz.

### Viewport, pan y zoom actuales

- El editor usa un `Stage` de Konva dentro de un contenedor redimensionable.
- El tamaño visual se calcula a partir del contenedor; no es una dimensión
  persistida de la composición.
- El viewport se representa con `stagePos = {x, y}` y `zoom` en estado local de
  `CanvasEditor`.
- El `Stage` recibe `x={stagePos.x}`, `y={stagePos.y}` y `scaleX/scaleY={zoom}`.
- El pan actual comienza al arrastrar el área vacía con el mouse. El movimiento
  actualiza la posición del `Stage`, no las coordenadas de los elementos.
- En touch, un dedo sobre el área vacía inicia pan y dos dedos iniciados sobre el
  Stage activan pinch-to-zoom.
- La rueda aplica zoom alrededor del punto bajo el puntero, conservando ese
  punto en pantalla.
- Los límites actuales son `0.3 <= zoom <= 3`.
- Los botones aplican el mismo rango: factor `1.2` para acercar/alejar,
  restablecimiento a `zoom=1` y comandos separados para ajustar o centrar.
- `syncViewport` publica el transform visual únicamente para convertir el drag
  HTML desde los paneles laterales a coordenadas de composición.

### Selección actual

- Una marimba se selecciona con click/tap sobre su grupo.
- Una persona se selecciona con click/tap sobre su grupo.
- Un puesto se selecciona con click/tap sobre su rectángulo y se representa como
  `selectedSlot`; no es la misma selección que un elemento.
- Click/tap en el área vacía limpia la selección de elemento; `Escape` limpia
  tanto la selección de elemento como la del puesto.
- La selección visual es única. No existe Ctrl/Cmd-click, Shift-click,
  marquee ni selección múltiple en el contrato actual.
- La selección se sincroniza con Zustand mediante `select` y `selectSlot`.
- El `Inspector` ofrece la alternativa de inspección y edición por controles.

### Drag y transformación actuales

- Las marimbas se pueden arrastrar si no están bloqueadas. Durante el drag se
  actualizan sus coordenadas y también se desplazan las personas asignadas,
  conservando su relación espacial.
- El drag de una marimba crea una instantánea al comenzar y la cierra al
  finalizar; un movimiento real es un único paso lógico de historial.
- Las marimbas también tienen transformación Konva. La transformación persiste
  posición, rotación y escalas; el store reajusta las personas asociadas.
- Las personas libres se pueden arrastrar. Al finalizar se hace hit-test en
  coordenadas del mundo: pueden quedar libres o asignarse a un puesto.
- Una asignación puede requerir confirmación si el puesto está ocupado o si la
  persona cambia de puesto. La operación efectiva es un único paso de historial.
- Una persona sentada se dibuja con la geometría derivada de su puesto; su
  posición visual puede representar el centro del puesto, mientras que una
  persona libre conserva sus coordenadas de elemento.
- El drag y el hit-test usan la inversa de la transformación absoluta del Stage,
  por lo que el zoom no debe cambiar el resultado de las coordenadas del modelo.

### Coordenadas y geometría actuales

- El modelo usa coordenadas de composición en píxeles lógicos, con origen en la
  esquina superior izquierda del espacio del Stage sin transformar.
- Marimbas y personas guardan `x`, `y`, `width`, `height`, `rotation`, `scaleX`
  y `scaleY`.
- Para una marimba, `x/y` son su posición de grupo; sus puestos se derivan de
  `width`, número de puestos, padding, separación y rotación.
- Para una persona libre, `x/y` son su posición de grupo. Para una persona
  asignada, la representación y el tamaño visual se derivan del puesto y de la
  marimba.
- La rotación y escala se aplican mediante la geometría local del elemento; las
  funciones `localToWorld` y `worldToLocal` convierten entre el sistema local de
  una marimba y el mundo de la composición.
- Las coordenadas negativas son válidas; el store rechaza valores no finitos,
  pero no inventa un límite de origen.
- La persistencia contiene las coordenadas y geometría de los elementos dentro
  de `CompositionData`. No persiste `stagePos`, `zoom`, cursor ni selección.

## 3. Contrato propuesto de interacción

La primera implementación debe conservar el comportamiento que ya existe y
hacer explícitas sus prioridades.

### Pan desktop

1. Arrastrar con el botón primario sobre espacio vacío mueve el viewport.
2. Mantener `Space` y arrastrar permite pan explícito cuando el usuario necesita
   distinguirlo de otras acciones; mientras `Space` esté activo no se debe
   seleccionar ni mover un elemento.
3. Arrastrar un elemento comienza movimiento del elemento, no pan.
4. No usar botón derecho para pan ni introducir menú contextual en el Stage.
5. Soltar fuera del Stage termina el gesto sin crear un paso adicional.

La regla principal de compatibilidad es que el pan solo cambia `stagePos`.

### Selección directa

- Click en una marimba: selecciona la marimba.
- Click en una persona: selecciona la persona.
- Click en un puesto: selecciona el puesto.
- Click en espacio vacío: limpia selección de elemento y puesto.
- `Escape`: limpia selección.
- La primera implementación mantiene selección única. La selección múltiple,
  Shift, Ctrl/Cmd y marquee quedan fuera hasta que exista una necesidad de
  producto y un contrato de historial específico.
- Un elemento bloqueado puede seguir seleccionándose. El bloqueo impide mover,
  transformar, borrar o editar, pero no debe ocultar al usuario qué elemento ha
  seleccionado ni eliminar la explicación del Inspector.

### Drag de elementos

- El drag conserva el tipo de operación actual: marimba, persona libre y
  persona asignada tienen reglas distintas.
- El inicio de un drag debe distinguirse del click sin exigir un umbral nuevo
  que cambie accidentalmente la selección actual.
- El cálculo debe seguir usando coordenadas de mundo después de invertir el
  transform del Stage.
- El drag de marimba conserva el desplazamiento de las personas sentadas.
- El drag de persona conserva las confirmaciones, reglas de ocupación, bloqueo y
  asignación ya existentes.

### Zoom y viewport

- Mantener `0.3` y `3` como límites.
- La rueda y pinch conservan el punto de referencia bajo el puntero o centro del
  gesto.
- Zoom y pan son transformaciones del viewport; no alteran `x`, `y`, rotación,
  escala ni asignaciones.
- Después de zoom o pan, seleccionar debe devolver la misma identidad del nodo.
- Después de zoom o pan, arrastrar debe producir el mismo delta lógico que sin
  zoom, sujeto a la precisión normal de píxel.

### Touch

- Tap sobre un elemento: selección, sin pan.
- Drag de un dedo iniciado sobre un elemento desbloqueado: drag del elemento.
- Drag de un dedo iniciado sobre espacio vacío: pan del viewport.
- Dos dedos: pinch-to-zoom y desplazamiento del viewport como un único gesto;
  no debe mover elementos ni cambiar asignaciones.
- Si el gesto pasa de un dedo a dos, se cancela el drag/pan de un dedo y se
  continúa como gesto de viewport, sin escribir una posición intermedia.
- El área del canvas conserva `touch-action: none`; los controles laterales
  siguen teniendo su interacción táctil normal.

### Teclado y foco

- La interacción espacial del canvas no sustituye a `AccessibleEditor`.
- El teclado debe conservar `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`,
  `Escape` y `Delete/Backspace` según las reglas actuales y el estado de bloqueo.
- No se debe convertir el canvas en la única ruta de edición por teclado.
- La alternativa accesible debe seguir permitiendo selección de persona/puesto,
  asignación, movimiento de marimba y undo/redo mediante controles HTML nativos.
- Cambiar de vista no debe perder la composición ni crear un history step.
- Una futura mejora de foco debe devolver el foco al control que abrió la
  alternativa o diálogo; no debe depender de que un canvas reciba foco nativo.

## 4. Matriz de conflictos

| Interacción | Acción esperada |
|---|---|
| Click en marimba | Seleccionar marimba |
| Click en persona | Seleccionar persona |
| Click en puesto | Seleccionar puesto |
| Click en vacío | Deseleccionar |
| Drag en marimba desbloqueada | Mover marimba y personas asignadas |
| Drag en persona libre | Mover o asignar al finalizar |
| Drag en persona asignada | Intentar mover/asignar; confirmar cuando corresponda |
| Drag en vacío | Pan |
| Space + drag | Pan explícito; no seleccionar ni mover elemento |
| Elemento bloqueado + click | Permitir selección/inspección |
| Elemento bloqueado + drag | No mover; no crear history step |
| Zoom + selección | Mantener la identidad seleccionada |
| Zoom + drag | Convertir a coordenadas de mundo y mantener el resultado lógico |
| Click/tap sin movimiento | Selección, no pan ni history |
| Escape | Limpiar selección/puesto y cancelar estado transitorio |
| Undo después de pan | No revertir pan; revertir solo la última mutación de composición |
| Undo después de selección | No crear ni consumir history |
| Undo después de drag | Revertir el movimiento/asignación como una operación |
| Redo después de undo | Reaplicar la operación revertida |
| AccessibleEditor | Mantener alternativa completa y sin canvas obligatorio |
| Teclado en input/select | No interceptar shortcuts de texto nativo |
| Touch de un dedo en vacío | Pan |
| Touch de un dedo en elemento | Selección o drag del elemento |
| Touch de dos dedos | Pinch/pan del viewport; nunca mutar la composición |

## 5. Contrato de coordenadas

La transformación debe mantenerse así:

```text
cliente / viewport
    ↓ resta del origen del contenedor y del stagePos; división por zoom
canvas / mundo de composición
    ↓ hit-test, worldToLocal/localToWorld y reglas de asignación
modelo
    ↓ store y guardado existente
persistencia: CompositionData.elements[*].x/y/width/height/rotation/scale*
```

La relación crítica es:

```text
pan  = cambio de stagePos/viewport; no cambia posiciones persistidas
drag = cambio de elemento; sí cambia el modelo y puede guardarse
```

El zoom no debe multiplicar dos veces un delta. Todo evento debe convertirse a
coordenadas de mundo usando la transformación vigente del Stage antes de
aplicar hit-test o escribir en el store.

## 6. Contrato de historial

| Operación | History step |
|---|---|
| Pan | No |
| Selección/deselección | No |
| Zoom, centrar o ajustar | No |
| Drag de marimba | Sí, uno por gesto real |
| Transformación de marimba | Sí, uno por gesto real |
| Drag/asignación de persona | Sí, uno por operación efectiva |
| Drag bloqueado o cancelado | No |
| Cambio de vista accesible | No |

La futura implementación debe conservar la protección contra snapshots vacíos:
un gesto sin cambio real no debe ensuciar la composición ni contaminar undo.

## 7. Accesibilidad

### Requisitos automatizables

- Los controles de zoom, centrar, ajustar y exportar mantienen nombre accesible.
- Los controles que cambien secciones o vistas mantienen foco visible.
- El canvas no se usa como única fuente de información: la vista accesible
  mantiene controles HTML, nombres de marimbas/personas, estado de bloqueo y
  puestos ocupados/vacíos.
- `axe` debe seguir auditando la interfaz, pero no sustituye las pruebas de
  interacción espacial.
- No introducir una regla axe deshabilitada ni ocultar nodos para evitar una
  infracción.

### Pruebas manuales requeridas

- Navegación completa de `AccessibleEditor` solo con teclado.
- Lectura de nombres, estado bloqueado, puesto seleccionado y mensajes de
  resultado con lector de pantalla/UIA.
- Confirmar que el foco no desaparece al cambiar entre canvas, Inspector y vista
  accesible.
- Confirmar que un usuario que no puede usar el gesto espacial puede completar
  asignación, movimiento soportado y undo/redo mediante la alternativa accesible.

Pasar axe no demuestra que pan, drag, foco o lector de pantalla funcionen; esas
partes requieren pruebas de interacción y, cuando corresponda, manuales.

## 8. Matriz de pruebas futura

### Unitarias

- `clientToWorld` con zoom 0.3, 1 y 3.
- Conversión inversa alrededor del punto de zoom.
- Pan no modifica ningún elemento ni la firma persistida.
- Zoom conserva el punto de referencia.
- `worldToLocal/localToWorld` con rotación y escala.
- Hit-test de puesto con coordenadas negativas y contenido fuera del viewport.
- Límites y precisión de zoom.
- Un gesto cancelado no crea historial.

### E2E de pan y zoom

- Pan desktop sobre vacío.
- Space + drag, cuando se implemente.
- Pan táctil sobre vacío.
- Pinch-to-zoom si el soporte táctil se conserva.
- Pan/zoom no modifican el payload de composición.
- Zoom mínimo, máximo, reset, centrar y ajustar.

### E2E de selección

- Seleccionar marimba, persona, puesto y vacío.
- Escape y cambio de vista.
- Elemento bloqueado seleccionable pero no movible.
- Mantener selección/identidad tras zoom y pan.
- Confirmar que no se introduce selección múltiple accidental.

### E2E de drag e historial

- Mover marimba y verificar personas asignadas.
- Mover persona libre.
- Asignar, reemplazar, liberar y cancelar confirmación.
- Mover después de zoom y después de pan.
- Bloqueo de marimba, persona y persona sentada en marimba bloqueada.
- Undo/redo de cada operación efectiva.
- Pan, selección y zoom no consumen history.

### E2E de accesibilidad y regresión

- Navegación teclado de `AccessibleEditor`.
- Foco visible y retorno de foco.
- Anuncios de estado y lector de pantalla/UIA manual.
- Axe en las vistas existentes.
- Conservar como mínimo la referencia previa de 96/96 E2E, sin presentar esa
  evidencia como una ejecución nueva de esta fase.

## 9. Viabilidad

```text
VIABLE CON CAMBIOS CONTROLADOS
```

La interacción propuesta es compatible con los contratos actuales porque el
viewport ya está separado del modelo y el store ya distingue selección,
mutaciones, bloqueo e historial.

La futura implementación debe limitarse inicialmente a
`frontend/src/components/CanvasEditor.tsx`, estilos estrictamente necesarios y
pruebas. No debe modificar los archivos protegidos de 10B ni el modelo, API,
Compose o backend. Si la implementación requiere cambiar `composition.ts`,
`layout.ts`, `Inspector.tsx` o `AccessibleEditor.tsx`, deberá convertirse en un
cambio controlado explícito con pruebas adicionales, no asumirse dentro del
alcance básico.

El riesgo principal está en la ambigüedad táctil y en no duplicar snapshots de
historial. Por eso la primera entrega debe conservar selección única, no añadir
marquee ni gestos secundarios, y validar primero las conversiones de coordenadas.

## 10. Alcance de la futura implementación

### IN

- Formalizar y probar la máquina de estados de pan, selección y drag.
- Conservar pan sobre vacío y añadir solo la desambiguación aprobada para
  `Space + drag`.
- Conservar selección directa única de marimba, persona y puesto.
- Mantener zoom 0.3–3 y conversión de coordenadas alrededor del punto de zoom.
- Validar touch sin mover el viewport y un elemento en el mismo gesto.
- Mantener bloqueo, asignación, undo/redo y `AccessibleEditor`.
- Añadir pruebas deterministas de viewport, mundo, hit-test, historial y E2E.

### OUT

- Selección múltiple, Ctrl/Cmd, Shift y marquee.
- Edición masiva o nuevas herramientas de canvas.
- Nuevos formatos de exportación.
- Cambios de API, modelo, persistencia o migraciones.
- Cambios del motor de sugerencias.
- Colaboración en tiempo real.
- PDF backend.
- Sustituir `AccessibleEditor` por interacción visual.

## 11. Protecciones y estado de la inspección

- No se modificó código funcional.
- No se modificaron archivos protegidos.
- No se modificó Compose, backend, API ni producción.
- No se ejecutaron operaciones Git destructivas.
- No se eliminaron datos, volúmenes ni PostgreSQL.
- El worktree ya contenía modificaciones y archivos de fases anteriores; se
  conservaron intactos.
- Estado base inspeccionado: rama
  `checkpoint/fase1-motor-d1-d3-d5`, HEAD
  `3253c2a92b21d8a88919116048b92815a04b1e50`.
- Las evidencias 9J-R5/9L conservadas previamente —WCAG 5/5, E2E 96/96 y
  verificaciones asociadas— no se ejecutaron de nuevo porque 10B no cambia código
  ejecutable.

