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
