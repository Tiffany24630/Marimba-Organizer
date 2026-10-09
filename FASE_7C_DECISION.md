# Decisión tomada para la Fase 7C (autenticación multiusuario)

**Estado: DECIDIDO, NO APLICADO. Nada de esto se ha ejecutado todavía.**

## Qué se decided

Cuando se implemente la autenticación multiusuario (Fase 7C), los **65 proyectos
históricos** se asignarán a un **usuario normal de prueba**, creado durante esa
fase, y **NO a un administrador**.

## Por qué queda registrado aquí

El esquema actual (`projects`) **no tiene columna de propietario** y nunca la
tuvo: la información de qué usuario creó cada proyecto no existe y **no es
recuperable** a posteriori. Por eso la asignación de los históricos es una
decisión explícita, no algo que se pueda deducir de los datos.

Esta fase (7B) **no** aplica la decisión: no crea el usuario, no añade
`owner_id` ni ningún campo de propiedad, no asigna los proyectos y no implementa
autenticación ni permisos. Queda solo documentada.

## Cómo se aplicará en 7C

1. Crear el usuario de prueba con rol **normal** (no administrador).
2. Añadir `owner_id` a `projects` con migración **no destructiva** (columna
   nullable primero, para no romper las 65 filas existentes).
3. Asignar las 65 filas históricas a ese usuario.
4. A partir de ahí, aplicar autorización en el **backend** en todas las rutas
   (leer, modificar, eliminar, exportar, importar), no solo ocultando opciones
   en la interfaz.

## Punto de atención para 7C

El proyecto **no tiene autenticación**: `Project`, `Song` y `Composition` se
obtienen por ID sin comprobar nada. Antes de activar el aislamiento hay que
auditar **todas** las rutas que aceptan un ID (composiciones, canciones,
exportación, importación) para evitar acceso por sustitución de IDs.
