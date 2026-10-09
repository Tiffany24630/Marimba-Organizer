# FASE 7M — JERARQUÍA SEMÁNTICA, CONTROLES GEOMÉTRICOS Y ACCESIBILIDAD DEL EDITOR

> Continúa `FASE_7L_INTEGRATION.md`. Sin commits, push, merges ni cambios de
> rama. Sin conexión ni migración en producción. **Los resultados de fases
> anteriores no se atribuyen a 7M.**

**Estado general: PARCIALMENTE COMPLETADA**

---

## 1. Objetivos

Corregir la infracción `heading-order`, estudiar la geometría de las marimbas e
implementar controles accesibles **solo cuando sean seguros**.

## 2. Estado inicial de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a92b21d8a88919116048b92815a04b1e50` — **sin commits en 7M** |

## 3. Archivos protegidos — INTACTOS

| Fichero | `git diff --stat` | ¿Tocado en 7M? |
| ------- | ---------------- | -------------- |
| `optimizer.py` | +7 | **NO** |
| `test_unified_core.py` | +216 | **NO** |
| `cli.py` | sin diferencias | **NO** |

---

## 4. Diagnóstico de la jerarquía de encabezados

Estructura real del editor antes de 7M:

| Nivel | Ubicación | Problema |
| ----- | --------- | -------- |
| `<h1 class="sr-only">` | `Project.tsx:573` | Correcto (título de la composición) |
| `<h3>` | `Project.tsx:640` «Personas de la pieza» | **Salto h1 → h3** |
| `<h3>` | `Project.tsx:663` «Puestos detectados» | Ídem |
| `<h4>` | `PersonPanel.tsx:157,162` y `MarimbaPanel.tsx:17,65` | **Salto h2 → h4** |

axe solo informa del **primer** nodo, así que corregir los `<h3>` reveló los
`<h4>`: fue un hallazgo iterativo, no un suppressor.

## 5. Cambios semánticos — VERIFICADO

| Fichero | Cambio | Motivo |
| ------- | ------ | ------ |
| `Project.tsx:640,663` | `<h3>` → `<h2>` | Eran subsecciones directas del `<h1>` del editor |
| `PersonPanel.tsx:157,162` | `<h4>` → `<h3>` | Subsecciones de los `<h2>` de la barra lateral |
| `MarimbaPanel.tsx:17,65` | `<h4>` → `<h3>` | Ídem |

**Aspecto visual preservado** con dos reglas CSS acotadas que fijan el tamaño que
tenían por defecto: `.side-scroll h2{font-size:1.17em…}` y
`.pp-group h3{font-size:1em…}`. Se comprobó antes que **ninguna** regla CSS
existente dependía de esos `h3`/`h4` (solo `.inspector-header h3`,
`.acc-editor h3`, etc.), y que **ninguna** prueba E2E los selecciona.

El `Inspector` mantiene `h3`/`h4` porque vive en otra región landmark y no
participa en la jerarquía de la barra lateral.

### Resultado de axe (7M)

| Vista | Infracciones |
| ----- | -----------: |
| Inicio de sesión | **0** |
| Recuperación | **0** |
| Panel de proyectos | **0** |
| Vista de proyecto | **0** |
| Editor de composición | **0** |

**Las cinco vistas quedan en cero infracciones**, sin desactivar ninguna regla.

---

## 6. Diagnóstico de la geometría — DOCUMENTADO ANTES DE TOCAR NADA

| Pregunta | Respuesta real |
| -------- | -------------- |
| ¿Cómo se guarda el tamaño? | `marimba.width` y `marimba.height`, en `layout.ts` |
| ¿Se derivan los puestos del tamaño? | **Sí**: `slotRect` reparte el ancho entre los puestos |
| ¿Qué hace `withCascade`? | Recalcula **solo** `width/height/scaleX/scaleY` de las personas |
| ¿`withCascade` reposiciona? | **NO**. No toca `x`/`y` de las personas |
| ¿Qué sí reposiciona? | `withRepositioned`, usada por arrastre, `addPosition`, `removePosition` |
| `update(marimbaId,{width})` | Llama a `withCascade` **sin** `withRepositioned` |

### Consecuencia crítica

`update` sobre una marimba **redimensiona a las personas pero no las mueve**: su
`x`/`y` quedarían en la posición antigua, **despegadas visualmente de su puesto**.
Implementar «redimensionar» con `update` habría introducido exactamente la
corrupción que la regla 13 prohíbe.

### Qué hace `marimbaDragged`

```js
if(e.type==='person'&&e.marimbaId===id) return {...e, x:e.x+dx, y:e.y+dy};
```

Traslada la marimba **y desplaza a las personas el mismo delta**: la geometría
---

## 7. Controles numéricos de tamaño — NO IMPLEMENTADO (documentado)

**Motivo técnico preciso:** la única operación disponible es `update`, y **no
reposiciona** a las personas asignadas (§6). Hacerlo bien exigiría combinarla con
`withRepositioned`, lo que **cambia el comportamiento de una acción del store
usada por el Inspector**, y necesita pruebas de regresión geométrica antes.

**Lo que falta para hacerlo correctamente:**

1. Pruebas de regresión que fijen la geometría esperada al redimensionar.
2. Decidir los límites mínimos: el modelo solo define `minSlotW` (104 px) para
   *añadir* puestos, no un mínimo de `marimba.width` al redimensionar.
3. Definir si el alto debe ajustarse a los puestos (hoy `slotH` es constante).
4. Cambiar `update` o añadir una acción nueva, con su historial.

**No se ha implementado nada de esto. No se declara esta funcionalidad.**

---

## 8. Colocación accesible de marimbas — IMPLEMENTADA

Sí era segura, porque `marimbaDragged` conserva la geometría. Añadido a
`AccessibleEditor.tsx`:

- Cuatro botones de incremento (← → ↑ ↓) de 10 px, con `aria-label` que nombra
  la acción completa («Mover Marimba tenor 10 a la derecha»).
- Dos campos numéricos para la posición exacta, con etiqueta asociada.
- La posición actual se muestra en texto.
- Cada pulsación es **un paso de deshacer**: `recordHistory()` + `marimbaDragged`
  + `endGesture()` — el mismo mecanismo que usa el lienzo al arrastrar.
- Respeta solo lectura y bloqueo (`elementLocked`), que ya bloqueaban el store.
- No se admiten coordenadas negativas: sacarían la marimba fuera del lienzo. No
  se inventan más límites porque el modelo no los tiene.
- El resultado se anuncia en la región `role="status"`.

**Sin duplicación:** no se crea estado paralelo; la vista lee el mismo store que
el lienzo, así que ambos se reflejan mutuamente.

---

## 9. Pruebas de la colocación — PENDIENTE (déficit real)

**La colocación NO tiene prueba E2E específica.** Los 45 tests siguen en verde,
pero cubren la colocación solo de forma **indirecta** (compilación, axe sobre
`.acc-editor`, suite completa).

Falta una prueba que mueva una marimba con el teclado y compruebe que la persona
sentada se traslada con ella y que el cambio persiste tras guardar y recargar.
Se documenta como pendiente; no se maquilla como cobertura.

---

## 10. Resultados de las pruebas (7M)

| Suite | Resultado |
| ----- | --------- |
| Backend `pytest -q` | **279 passed** (32.53 s) |
| Frontend `npm test` | **67 passed**, 0 failed |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (2.73 s) |
| axe-core, 5 vistas | **0 infracciones en las 5** |
| **E2E ronda 1** | **45 passed** (53.5 s) |
| **E2E ronda 2** | **45 passed** (52.0 s) |

Entre rondas se ejecutó `r7h.py`. Los diálogos accesibles de 7L siguen
operativos (sus 7 pruebas en verde).

## 11. Docker

Frontend **reconstruido dos veces** con `--build`: `tsc -b && vite build` en
verde dentro de la imagen cada vez (2.46 s y 2.36 s). Backend **no
reconstruido**: no cambió.

## 12. Integridad de los datos

No se modificó la geometría persistida ni ninguna acción del store. La
colocación usa `marimbaDragged`, que ya existía y ya usaba el lienzo. No se
tocaron identificadores, asignaciones ni permisos.

## 13. HTTPS y producción

**HTTPS real: NO VERIFICADO.** Producción **no conectada ni modificada**.
Migración **no ejecutada**; autorización **pendiente**.

---

## 14. Riesgos pendientes

1. **Redimensionado sin alternativa accesible** (bloqueado por §6/§7).
2. **Falta prueba E2E específica de la colocación por teclado** (§9).
3. El lienzo Konva **sigue sin ser accesible por teclado** y no se declara
   accesible.
4. Auditoría manual de menús (de 7K) sin completar.

---

## 15. Conclusão

**FASE 7M PARCIALMENTE COMPLETADA.** El objetivo A está **cumplido y verificado**:
`heading-order` corregido y las cinco vistas quedan en **cero infracciones** de
axe. El objetivo C está **implementado** de forma segura reutilizando
`marimbaDragged`.

El objetivo B —redimensionado— **no se implementa**, y no por falta de esfuerzo
sino porque la investigación demuestra que la operación disponible (`update`)
**corrompe la posición de las personas asignadas**. Se entrega el análisis de lo
que falta.

**No se declara conformidad WCAG**: axe cubre la parte automatizable, y el
lienzo sigue dependiendo del ratón.

**Próximo paso:** escribir la prueba E2E de la colocación por teclado y, en una
fase aparte con pruebas de regresión geométrica, decidir cómo exponer el
redimensionado sin romper la relación persona–puesto.
relativa se conserva intacta. Respeta `locked` y es la misma acción del arrastre.