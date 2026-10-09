# FASE 7L — DIÁLOGOS REALES, ACCESIBILIDAD DEL LIENZO Y ENCABEZADOS

> Continúa `FASE_7K_INTEGRATION.md`. Sin commits, push, merges ni cambios de
> rama. Sin conexión ni migración en producción. **Los resultados de 7J/7K no se
> presentan aquí como resultados de 7L.**

---

## 1. Objetivos

Eliminar la duplicidad entre `window.confirm()` y el diálogo accesible, corregir
la jerarquía de encabezados y ampliar las operaciones accesibles del editor sin
duplicar la lógica de negocio.

## 2. Estado inicial de Git

| Dato | Valor |
| ---- | ----- |
| Rama | `checkpoint/fase1-motor-d1-d3-d5` |
| HEAD | `3253c2a` (`test(e2e): prevent persistent test data contamination`) — **sin commits en la fase** |

## 3. Archivos protegidos — INTEGRIDAD CONFIRMADA

| Fichero | `git diff --stat` | ¿Tocado en 7L? |
| ------- | ---------------- | -------------- |
| `optimizer.py` | +7 | **NO** |
| `test_unified_core.py` | +216 | **NO** |
| `cli.py` | sin diferencias | **NO** |

El motor de distribución y el optimizador **no se han tocado**.

---

## 4. Diagnóstico inicial — CORRECCIÓN DE UN ERROR PROPIO

7K afirmó que quedaban **2** `window.confirm()` en `Project.tsx`. Era
**incorrecto**: fue una lectura parcial de las líneas. La búsqueda completa
devuelve **9 en toda la aplicación**.

| Fichero | Llamadas | Línea (antes) |
| ------- | -------: | ------------- |
| `Project.tsx` | 5 | 229, 239, 254, 384, 482 |
| `PersonPanel.tsx` | 2 | 65, 85 |
| `Inspector.tsx` | 1 | 115 |
| `Dashboard.tsx` | 1 | 37 |
| **Total** | **9** | |

Se documenta porque 7K afirmó algo que no era cierto, y porque de nuevo la
evidencia completa cambió el resultado.

---

## 5. Integración de `ConfirmModal` — VERIFICADO

### 5.1 Contrato ampliado

`ConfirmOptions` incorpora `destructive?:boolean`. Con ella, la etiqueta por
defecto del botón de confirmación pasa de «Continuar» a **«Eliminar»**: la acción
real queda dicha, no un verbo ambiguo.

### 5.2 Operaciones migradas (9/9)

| Fichero | Operación | ¿Destructiva? |
| ------- | --------- | ------------- |
| `Dashboard.tsx` | Eliminar proyecto | **Sí** |
| `Project.tsx` | Salir con cambios sin guardar | No |
| `Project.tsx` | Cambiar de composición con cambios | No |
| `Project.tsx` | Nueva composición con cambios | No |
| `Project.tsx` | Eliminar composición | **Sí** |
| `Project.tsx` | Eliminar canción | **Sí** |
| `PersonPanel.tsx` | Quitar persona de la composición | No |
| `PersonPanel.tsx` | Quitar persona del proyecto | **Sí** |
| `Inspector.tsx` | Eliminar marimba con personas | **Sí** |

**`window.confirm()` = 0 en el código de aplicación.** Verificado con búsqueda
de repositorio.

Se conserva el texto de cada mensaje: **no se pierde información** ni cambia el
comportamiento funcional. Las funciones pasaron a `async` solo donde lo exigía el
`await`.

### 5.3 Ciclo de foco

Implementado en 7K y ahora **verificado en el diálogo real**:

| Comportamiento | Verificado |
| --------------- | ---------- |
| Foco inicial en «Cancelar» | ✅ |
---

## 6. Corrección de `heading-order` — PENDIENTE

La infracción `moderate` `heading-order` en `.side-scroll > h3` **sigue sin
corregirse**: se localiza con precisión (el `<h3>` de las pestañas laterales salta
de nivel), pero la corrección exige revisar toda la jerarquía de la barra lateral
y del inspector, con riesgo de romper los selectores de las pruebas existentes.

Se documenta como pendiente en lugar de aplicar un cambio a ciegas.

---

## 7. Operaciones accesibles del lienzo — PARCIALMENTE

**Lo que `AccessibleEditor` ya cubría (7J) y sigue funcionando:** consultar
marimbas, puestos y personas; asignar; reasignar (mover); retirar; girar;
consultar bloqueos; deshacer/rehacer; respetar solo lectura; guardar y persistir.

**Lo que sigue SIN alternativa accesible:**

| Operación | Por qué no está cubierta |
| --------- | ------------------------ |
| Redimensionar una marimba arrastrando | Exige un control numérico nuevo conectado a `withCascade` |
| Colocar una persona en un punto exacto | El store solo expone asignación a **puestos**, no a coordenadas arbitrarias |
| Mover una marimba arrastrando | No hay acción equivalente en el store |

**Decisión:** **no se han implementado controles inventados.** Implementar
«redimensionar» exigiría tocar `withCascade` y la geometría de las personas
ocupadas —eso **sí** alteraría la representación de las composiciones—, y hacerlo
sin pruebas específicas sería arriesgar los datos.

---

## 8. Pruebas

| Suite | Resultado |
| ----- | --------- |
| Backend `pytest -q` | **279 passed**, 0 failed (33.46 s) |
| Frontend `npm test` | **67 passed**, 0 failed |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (2.94 s) |
| **E2E ronda 1** | **45 passed** (52.5 s) |
| **E2E ronda 2** | **45 passed** (50.5 s) |

`dialogos.spec.ts` se reescribió por completo: **7 pruebas** contra el diálogo
real (antes 4 contra `window.confirm`). Ninguna regla de axe desactivada.

---

## 9. Docker

Frontend **reconstruido** con `--build`; `tsc -b && vite build` en verde dentro
de la imagen (2.32 s). Backend **no reconstruido**: no cambió.

---

## 10. Integridad y seguridad

| Comprobación | Resultado |
| ------------ | --------- |
| **Cancelar nunca ejecuta la operación** | ✅ «Escape no debe eliminar el proyecto» |
| Confirmar ejecuta **una sola vez** | ✅ (`resolve` anula la promesa anterior) |
| Permisos y solo lectura intactos | ✅ store sin cambios |
| Aislamiento entre proyectos | ✅ 12 pruebas de roles/IDOR en verde |
| Identificadores de composiciones | ✅ intocables |
| Volúmenes / datos históricos | ❌ **NO** tocados |
| Producción | ❌ **NO** conectada |

---

## 11. HTTPS y producción

| Elemento | Estado |
| -------- | ------ |
| **HTTPS real** | ❌ **NO VERIFICADO** |
| Migración productiva | ❌ no ejecutada |
| Administrador en producción | ❌ no creado |
| Autorización | **PENDIENTE** |

---

## 12. Pendientes y riesgos

1. **`heading-order`** (`moderate`) sin corregir.
2. **Resize y colocación por coordenadas** sin alternativa accesible: requiere
   fase propia que toque geometría con pruebas específicas.
3. El **lienzo Konva** sigue sin ser accesible por teclado y **no se declara
   accesible**.
4. `ConfirmModal` ya no es código muerto: se usa en 9 operaciones.

---

## 13. Conclusión

**FASE 7L PARCIALMENTE COMPLETADA.** El objetivo principal —integrar un
mecanismo de confirmación accesible que **se utilice realmente**— está **cumplido
y verificado**: 9 de 9 confirmaciones migradas, 0 `window.confirm`, ciclo de foco
completo y probado en navegador real, 45 E2E en verde en dos rondas.

No se cumplen la corrección de `heading-order` ni la ampliación del lienzo, y se
documenta el motivo en lugar de forzar un cambio de riesgo.

**Próximo paso:** una fase dedicada a la jerarquía de encabezados y a los
controles numéricos de tamaño de marimba, con pruebas de no-regresión de la
geometría de las composiciones.
| Nunca en el botón destructivo | ✅ |
| Tab cicla dentro | ✅ |
| Shift+Tab cicla dentro | ✅ |
| Escape cancela (nunca confirma) | ✅ |
| Recuperación del foco al origen | ✅ |
| Nombre accesible vía `aria-labelledby` | ✅ |
| Sin listeners globales permanentes | ✅ (se registra al abrir, se quita al cerrar) |