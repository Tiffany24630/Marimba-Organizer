# FASE 7K — SEMÁNTICA HTML, ACCESIBILIDAD DE DIÁLOGOS Y VALIDACIÓN INTEGRAL

> Continúa `FASE_7J_INTEGRATION.md`. Sin commits, push, merges ni cambios de
> rama. Sin conexión ni migración en producción. **Los resultados de 7I/7J no se
> repiten aquí como resultados de 7K.**

---

## 1. Objetivos

Corregir las cuatro reglas de semántica que 7J dejó pendientes, auditar el
ciclo de foco de las confirmaciones y ejecutar una regresión completa sin
cambios innecesarios.

## 2. Estado inicial de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a92b21d8a88919116048b92815a04b1e50` — **sin commits en la fase** |
| Modificados / sin seguimiento | 23 / 40 |

## 3. Archivos protegidos — INTEGRIDAD CONFIRMADA

| Fichero | `git diff --stat` | ¿Tocado en 7K? |
| ------- | ---------------- | -------------- |
| `backend/app/services/suggestions/optimizer.py` | +7 | **NO** |
| `backend/tests/test_unified_core.py` | +216 | **NO** |
| `backend/app/cli.py` | sin diferencias | **NO** |

El motor de distribución, el optimizador y sus reglas **no se han tocado**.

---

## 4. Hallazgo principal: el diálogo que se auditaba no se usa

Antes de corregir nada se buscó el mecanismo real de confirmación:

| Componente | Estado real |
| ---------- | ----------- |
| `ConfirmModal.tsx` / `ConfirmProvider` | Montado en `App.tsx`, pero **`show()` no se invoca desde ningún sitio** |
| `window.confirm()` | **Este es el mecanismo vivo**: `Dashboard.tsx:37`, `Inspector.tsx:60`, `PersonPanel.tsx`, `Project.tsx:226` |

El `role="dialog" aria-modal="true"` del que habla el código **nunca llega a
pintarse**. La primera versión de estas pruebas falló por eso (buscaba
`[role="dialog"]` y nunca aparecía), y **el fallo era correcto**: la prueba
atacaba algo que no existe en la aplicación real.

**Se corrigió igualmente `ConfirmModal.tsx`** (foco inicial en «Cancelar»,
trampa de foco, Escape y recuperación del foco), porque estaba roto y es un
componente montado; pero se documenta que **hoy es código latente**. Las
pruebas atacan el mecanismo real.

---

## 5. Correcciones de semántica — VERIFICADO

### Línea base medida (no supuesta)

| Vista | Infracciones 7J | Detalle |
| ----- | --------------: | ------- |
| Inicio de sesión | 2 | `landmark-one-main`, `region` |
| Recuperación | 2 | `landmark-one-main`, `region` |
| Panel de proyectos | 1 | `region` (`.session-bar > span`) |
| Vista de proyecto | 1 | `region` (`.session-bar > span`) |
| Editor | 3 | `landmark-unique` (`.sidebar`), `page-has-heading-one`, `region` |

### Correcciones aplicadas

| Regla | Fichero | Cambio | Por qué es correcto |
| ----- | ------- | ------ | ------------------- |
| `landmark-one-main` | `AuthScreen.tsx` | Los 3 `<div className="auth-wrap">` → `<main>` | Es la región principal de esas pantallas |
| `region` | `App.tsx` | `<div className="session-bar">` → `<header>` | `<header>` en este nivel **es** la región `banner` |
| `region` | `AuthScreen.tsx` | Resuelto por el `<main>` anterior | El contenido ya está en una región |
| `landmark-unique` | `Project.tsx` | `aria-label="Personas, marimbas y paneles"` | Distingue la barra lateral del inspector |
| `landmark-unique` | `Inspector.tsx` | `aria-label="Inspector del elemento seleccionado"` | Dos `complementary` dejan de ser anónimas |
| `page-has-heading-one` | `Project.tsx` | `<h1 class="sr-only">` con el nombre real de la composición | El título **es** el de la composición |

`.sr-only` usa `position:absolute` + `clip`, **nunca `display:none`**: con
`display:none` el elemento saldría del árbol de accesibilidad y el encabezado no
contaría.

### Resultado medido

| Vista | Antes | **Ahora** |
| ----- | ----: | ---------: |
| Inicio de sesión | 2 | **0** |
| Recuperación | 2 | **0** |
| Panel de proyectos | 1 | **0** |
| Vista de proyecto | 1 | **0** |
---

## 6. Auditoría de diálogos — VERIFICADO

**Componente auditado:** `ConfirmModal.tsx` (`ConfirmProvider`), el único
componente de diálogo propio.

| Defecto | Antes | Ahora |
| ------- | ----- | ----- |
| Foco inicial | No se movía: seguía en el botón de detrás | En **«Cancelar»**, nunca en el destructivo |
| Trampa de foco | Tab salía a los elementos de detrás | Tab y Shift+Tab ciclan dentro |
| Escape | No respondía | Cierra sin ejecutar la acción |
| Recuperación del foco | Se perdía en el `body` | Vuelve al elemento que lo abrió, si existe |

El manejador se registra **solo mientras el diálogo está abierto** y se elimina
al cerrar: no queda ningún listener global que interfiera con campos de texto,
el editor o componentes de terceros.

**Limitación honesta:** por §4, estas mejoras **no son comportamiento observable
hoy**, porque nada llama a `show()`.

### El mecanismo que sí está en uso: `window.confirm`

Verificado con pruebas E2E reales (`dialogos.spec.ts`, 4 pruebas en verde):

| Comprobación | Resultado |
| ------------ | --------- |
| La confirmación se abre al pulsar «Eliminar» | ✅ |
| El mensaje nombra el trabajo y advierte «no se puede deshacer» | ✅ |
| Aclara qué **NO** se borra | ✅ |
| **Escape cancela y NO borra nada** | ✅ |
| **Confirmar con Enter sí borra** y la vista se actualiza | ✅ |
| El botón que la abre es **alcanzable con teclado** | ✅ |

---

## 7. Auditoría de menús — PARCIALMENTE

Revisados los menús reales: pestañas laterales (`role="tablist"` con
`aria-selected`), menús contextuales del lienzo (seleccionados en Konva), listas
de personas y marimbas, y el panel `<details>` de importación.

**Verificado:** todos son botones o `details` nativos, alcanzables con Tab y
activables con Enter/Espacio. Los `details` expanden y contraen con el teclado
por comportamiento nativo.

**No verificado:** estado expandido anunciado en listas que se comportan como
menú, y recuperación de foco al cerrar menús contextuales del lienzo.
Documentado como pendiente: **no se ha implementado el patrón ARIA de menú en
ningún sitio**, porque ninguno de estos componentes es un menú real.

---

## 8. Validación de la alternativa accesible — SIN REGRESIONES

Las 2 pruebas de `accesible.spec.ts` siguen en verde dentro de la suite completa:
asignación solo con teclado, **persistencia tras recargar**, sincronización con
el lienzo, retirar, deshacer y cero infracciones graves en `.acc-editor`.

El componente **no se ha modificado** en 7K.

---

## 9. Docker — VERIFICADO

---

## 10. Integridad de los datos

| Comprobación | Resultado |
| ------------ | --------- |
| Composiciones conservan identificadores | ✅ |
| No se duplican asignaciones | ✅ (sin cambios en el store) |
| Puestos y marimbas conservan relaciones | ✅ |
| Deshacer/rehacer sigue funcionando | ✅ verificado en E2E |
| Permisos de usuario intactos | ✅ 12 pruebas de roles/IDOR en verde |
| Proyectos ajenos no accesibles | ✅ |
| **Cancelar no ejecuta operaciones** | ✅ verificado explícitamente |
| Solo lectura sigue bloqueando | ✅ |
| Datos históricos / volúmenes | ❌ **NO** tocados |
| Producción | ❌ **NO** conectada ni modificada |

Las pruebas de diálogo **crean y borran únicamente su propio proyecto**, con
nombre único.

---

## 11. Estado de HTTPS

**Sin cambios, NO VERIFICADO.**

| Elemento | Estado |
| -------- | ------ |
| Lógica `public_base_url` → `secure_cookies` | ✅ probada en 7I |
| Proxy inverso | ❌ no existe en este entorno |
| Certificado | ❌ no hay TLS |
| **Conexión HTTPS real** | ❌ **NO VERIFICADA** |
| Configuración de producción | ❌ no conectada |

## 12. Estado de la migración productiva

```
MIGRACIÓN PRODUCTIVA EJECUTADA:    NO
ADMINISTRADOR EN PRODUCCIÓN:       NO
PRODUCCIÓN CONECTADA O MODIFICADA: NO
AUTORIZACIÓN:                      PENDIENTE
```

Requisitos pendientes: autorización explícita, respaldo verificado, restauración
de prueba satisfactoria, procedimiento de recuperación, verificación de
compatibilidad y plan de ejecución.

---

## 13. Problemas encontrados y soluciones

| Problema | Causa | Solución |
| -------- | ----- | -------- |
| Backend no compilaba (heredado de 7I) | `config.py` sin `import os` y sin anotar | Corregido en 7I |
| 3 contrastes graves | Colores adivinados en 7I | Medidos y corregidos en 7J |
| 4 reglas de semántica | Estructura sin regiones | `<main>`, `<header>`, `aria-label`, `<h1>` |
| `ConfirmModal` sin ciclo de foco | Nunca implementado | Corregido (hoy latente) |
| Pruebas de diálogo fallaban | Atacaban un diálogo que nunca se abre | Redirigidas al mecanismo real |
| «No tests found» (7J) | Gestión de terminal, no el fichero | Verificado con `--list` |

---

## 14. Pendientes y riesgos

- **El lienzo Konva sigue sin ser accesible por teclado.** Existe alternativa
  HTML para asignar, mover, retirar y girar, pero redimensionar arrastrando o
  colocar en un punto exacto siguen siendo solo de ratón. **No se declara el
  editor accesible.**
- `heading-order` (`moderate`) en el editor.
- `ConfirmModal` está corregido pero **inalcanzable**: o se conecta a
  `window.confirm` (mejora real: diálogos traducibles y con foco gestionado) o
  se elimina por ser código muerto. **Requiere decisión.**
- HTTPS real y `Secure` en producción.
- **No se declara conformidad WCAG**: axe cubre la parte automatizable.

---

## 15. Conclusión

**FASE 7K COMPLETADA.** Las cuatro reglas de semántica pendientes están
corregidas y medidas (4 de 5 vistas quedan en **cero infracciones**), el ciclo
de foco del componente de diálogo está implementado, las cuatro pruebas del
mecanismo real de confirmación están en verde, y la regresión es limpia en dos
rondas consecutivas de 42 E2E más backend, frontend, TypeScript y build.

**Próximo paso técnico recomendado:** decidir qué hacer con `ConfirmModal`
(conectarlo o retirarlo) y abrir una fase para `heading-order` y la
accesibilidad del propio lienzo.
Imagen frontend **reconstruida** (`--build`) para incluir los cambios de 7K. El
backend **no se reconstruyó** porque no cambió: innecesario.

| Comprobación | Resultado |
| ------------ | --------- |
| `tsc -b && vite build` dentro de la imagen | **PASS** (3.17 s) |
| Contenedor arrancado con la imagen nueva | **Sí** |

`Mounts: []` sigue significando que **`Up` no garantiza código actual**.

---

## 16. Resultados de las pruebas

| Suite | Resultado |
| ----- | --------- |
| Backend `pytest -q` | **279 passed**, 0 failed (31.73 s) |
| Frontend `npm test` | **67 passed**, 0 failed |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (3.46 s) |
| axe-core, 5 vistas | **0 infracciones en 4 vistas**, 1 `moderate` en el editor |
| Diálogos (`dialogos.spec.ts`) | **4 passed** |
| **E2E ronda 1** | **42 passed** (49.1 s) |
| **E2E ronda 2** | **42 passed** (47.6 s) |

Entre rondas se ejecutó `r7h.py` y **no se tocó el estado a mano**. Ninguna regla
de axe se desactivó ni se excluyó.
| Editor | 3 | **1** (`heading-order`, `moderate`) |

**Las cuatro reglas pendientes quedan resueltas.** La `moderate` del editor no
estaba en la línea base porque la vista ni siquiera tenía `<h1>`; queda
documentada.