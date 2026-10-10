# Acomodo · Organizador de marimba

Aplicación web para organizar músicos y puestos de marimba: importa el Excel que
ya usan, o arma el proyecto desde cero, y construye composiciones visuales
editables.

## Formas de empezar un proyecto

En la pantalla principal hay dos caminos:

1. **Nuevo proyecto en blanco** — botón `＋ Nuevo proyecto`. Crea un trabajo vacío
   sin Excel y sin plantilla. Dentro se pueden agregar canciones, personas y
   marimbas manualmente, o importar un Excel más adelante.
2. **Importar Excel** — analiza `examples/Puestos conciertos Marimba.xlsx` (o el
   propio) y genera el proyecto con sus canciones y participaciones.
3. **Agregar más piezas después** — dentro de un proyecto, el bloque colapsable
   **“Agregar más piezas con un Excel”** suma las canciones de otro archivo. Las
   piezas nuevas se agregan al final y **las que ya están no se modifican**.

### Sobre las piezas repetidas

Si el Excel trae una pieza cuyo nombre ya existe en el proyecto, esta **se agrega
igual** como pieza adicional y la interfaz avisa antes y después de confirmar
(para que el usuario decida si renombra o quita la fila). Solo se descartan las
repeticiones **dentro del mismo archivo**, porque ahí sí es un error del archivo.


## Ejecutar en VS Code sin Docker

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

La API queda en `http://localhost:8000` y Swagger en `http://localhost:8000/docs`.

### Frontend
En otra terminal:
```bash
cd frontend
npm install
npm run dev
```

Abrir `http://localhost:5173`.

El frontend usa `http://localhost:8000/api` por defecto. Para cambiarlo:
```env
VITE_API_URL=http://localhost:8000/api
```

## Ejecutar con Docker

Desde la raíz:
```bash
docker compose up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

## API y enlaces publicos

La API vive bajo el prefijo `/api`. Las rutas privadas requieren una sesion
valida en cookie; las operaciones de escritura tambien requieren la proteccion
anti-CSRF que usa el frontend. La unica lectura anonima relacionada con
enlaces es la consulta por token.

### Superficie de enlaces publicos

| Metodo y ruta | Acceso | Resultado principal |
| --- | --- | --- |
| `POST /api/compositions/{cid}/public-link` | Propietario autenticado + CSRF | Crea o reactiva un enlace y devuelve el token en claro una sola vez. |
| `GET /api/compositions/{cid}/public-link` | Propietario autenticado | Devuelve el estado administrativo; nunca devuelve el token. |
| `DELETE /api/compositions/{cid}/public-link` | Propietario autenticado + CSRF | Revoca el enlace sin borrar la composicion ni su historial. |
| `GET /api/public-links` | Usuario autenticado; solo sus proyectos | Lista los enlaces del propietario, sin tokens ni ids internos. |
| `GET /api/public/compositions/{token}` | Publico, sin sesion | Devuelve una composicion persistida en modo lectura. |

Crear un enlace acepta opcionalmente un cuerpo JSON con `expires_at` en formato
ISO-8601. La fecha debe estar en el futuro; omitirla, enviar `null` o enviar un
cuerpo vacio crea un enlace sin caducidad. Si ya existe un enlace, la operacion
lo reactiva con un token nuevo, por lo que el token anterior deja de funcionar.

La respuesta de creacion contiene `active`, `token`, `created_at` y
`expires_at`. La lectura de estado contiene `active`, `expired`, `created_at`,
`revoked_at` y `expires_at`. Una fecha invalida o no futura responde `422`;
una sesion ausente o invalida responde `401`; el acceso a una composicion que
no pertenece al propietario responde `404`; una escritura autenticada sin la
cabecera CSRF valida responde `403`. Las operaciones exitosas responden `200`.

El listado agregado responde una lista de objetos con estos campos:
`project_name`, `composition_name`, `created_at`, `expires_at`, `revoked_at` y
`status`. `status` solo puede ser `active`, `expired` o `revoked`; si un enlace
esta revocado y caducado, prevalece `revoked`. El listado no permite abrir,
copiar ni revocar enlaces: el token en claro solo se conoce al crearlo.

La lectura publica devuelve `name`, `width`, `height`, `data`, `song_name` y
`project_name`. No requiere sesion y es estrictamente de lectura: no permite
editar, enumerar enlaces ni consultar el historial de versiones. Un token
inexistente, revocado, caducado o asociado a una composicion borrada responde
`404` con el mismo mensaje generico. Esta uniformidad evita revelar el estado
del enlace. Una lectura valida responde `200`.

El endpoint publico por token esta protegido por rate-limit antes de buscar el
token. La politica por defecto es una ventana deslizante por IP de conexion de
`60` solicitudes cada `60` segundos. Se configura con
`PUBLIC_LINK_RATE_LIMIT` y `PUBLIC_LINK_RATE_WINDOW_S`; no se documentan aqui
valores temporales de entornos de prueba. Al superar el limite responde `429`
con la cabecera `Retry-After`. El listado autenticado y las operaciones del
propietario no usan este limite.

### Desarrollo y E2E

Desarrollo sin Docker:

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Para el entorno Docker de desarrollo, desde la raiz:

```bash
docker compose up --build
```

Para el entorno E2E aislado ya definido por el proyecto:

```bash
docker compose -p marimba7f \\
  -f docker-compose.yml -f docker-compose.7f.yml -f docker-compose.e2e.yml \\
  up -d --build
```

Ese entorno publica el frontend en `http://localhost:18080`, el backend en
`http://localhost:18000` y Mailpit en `http://localhost:18025`. PostgreSQL usa
el volumen declarado por Compose. No se debe usar `docker compose down -v` en
este flujo.

### Limites conocidos de la API

- Los enlaces publicos no son sesiones autenticadas ni conceden permisos de
  escritura.
- El token no se puede recuperar desde el listado ni desde el estado del
  enlace; si se pierde, hay que crear/reactivar el enlace para obtener uno
  nuevo.
- El listado agregado no tiene paginacion, filtros ni busqueda.
- `POST /api/suggestions` permanece como adaptador legacy autenticado, y
  `GET /api/songs/{song_id}` permanece como recurso interno autenticado. Ambos
  estan registrados y cubiertos por pruebas; no se eliminan en esta fase.

## Flujo probado conceptualmente

1. Importar `examples/Puestos conciertos Marimba.xlsx`.
2. Analizar el archivo.
3. Confirmar la importación.
4. Abrir el proyecto generado.
5. Seleccionar una canción.
6. Añadir personas al lienzo.
7. Añadir una plantilla de marimba.
8. Mover/rotar/escalar elementos.
9. Exportar el canvas como PNG.
10. Guardar la composición.

## Decisión de arquitectura clave

Una plantilla (`Marimba tenor`, `Marimba grande`, `Marimbito`) solo sirve como punto de partida. La instancia usada en una composición puede tener cualquier cantidad y combinación de puestos. El Excel define asignaciones musicales por canción; no decide por sí mismo en qué marimba física estará cada persona.

## Motor de distribución (propone, el usuario decide)

Separa explícitamente **puesto musical** (Primera, Segunda, Bajo…) de **puesto
físico** (marimba → posición 0, 1, 2…). Reglas vigentes:

- Solo se crean marimbas a partir de las **plantillas** registradas.
- Cada persona se ubica **exclusivamente** en un puesto cuyo tipo coincide con su
  puesto musical: si la plantilla dice "Centro", la persona va a un "Centro".
- Cada instancia conserva la forma de su plantilla (un "tenor" de 3 puestos
  nunca aparece con 6, aunque se necesiten dos tenores: son dos instancias).
- Si las plantillas no cubren un puesto musical, la persona se reporta como
  `unplaced` en lugar de ocupar un puesto ajeno.

Servicio: `backend/app/services/suggestions/`

- `engine_a.py`: lectura de slots físicos reales y construcción de slots desde plantillas.
- `engine_b.py`: selección determinista (slots y candidatos).
- `engine_c.py`: orquestador por canción (`distribution-suggestion`).
- `engine_d.py`: bucle principal `propose_distribution`.
- `engine_e.py`: `create_distribution_composition` (crea composición al aplicar).
- `distribution.py`: fachada que reexporta todo.
- `distributor.py`: flujo de sugerencias por plantillas y creación de composición.
- `history.py`, `requirements.py`, `movement.py`: historial, requerimientos y cambios.

Endpoints:

- `GET /api/songs/{song_id}/distribution-suggestion` → propuesta, faltantes, avisos y razones.
- `POST /api/songs/{song_id}/distribution/apply` → crea una composición nueva (la anterior queda intacta).
- `GET /api/songs/{song_id}/suggestions` y `POST /api/songs/{song_id}/suggestions/apply` → sugerencias por plantillas.
- `GET/POST/PATCH/DELETE /api/marimba-templates` → gestión de plantillas.

Frontend: `DistributionPanel.tsx` y `SuggestionsPanel.tsx` (ambos piden confirmación
explícita; nunca aplican solos).

## Pruebas

```bash
# Backend (SQLite temporal, se regenera solo)
cd backend && python -m pytest tests -q

# Frontend
cd frontend && npx tsc -b --force
cd frontend && node --test tests/composition.test.cjs tests/ux25.test.cjs

# E2E contra la API en ejecución
cd backend && python qa_e2e_final.py
cd backend && python qa_requirements_e2e.py
```
