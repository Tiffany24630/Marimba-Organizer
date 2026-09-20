# Marimba Organizer

Aplicación web para importar el Excel real de distribución de puestos, seleccionar músicos y construir composiciones visuales editables para marimba.

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

Separa explícitamente **posición musical** (Primera, Segunda, Bajo…) de **posición física** (Marimba A → p0, p1, p2…). Nunca asume cuántos puestos tiene una marimba: lee la configuración real de cada instancia desde la composición de la canción anterior.

Servicio: `backend/app/services/suggestions/`

- `engine_a.py`: lectura de slots físicos reales y mapa de asignaciones anteriores.
- `engine_b.py`: selección determinista (slots y candidatos).
- `engine_c.py`: orquestador por canción.
- `engine_d.py`: bucle principal `propose_distribution`.
- `engine_e.py`: `create_distribution_composition` (crea composición al aplicar).
- `distribution.py`: fachada que reexporta todo.
- `history.py`, `requirements.py`, `distributor.py`, `movement.py`: flujo previo de historial/sugerencias por continuidad de marimba.

Orden determinista (sin solver, sin scores, sin ranking): conservar persona + posición + marimba + slot → persona + posición + marimba → persona + posición → historial compatible → sin historial → resto → reportar faltantes.

Endpoints:

- `GET /api/songs/{song_id}/distribution-suggestion` → propuesta, faltantes, avisos y razones.
- `POST /api/songs/{song_id}/distribution/apply` → crea una composición nueva (la canción anterior queda intacta).
- `GET /api/songs/{song_id}/history` y `GET /api/songs/{song_id}/requirements` → historial y requerimientos por canción.
- `GET /api/songs/{song_id}/suggestions` y `POST /api/songs/{song_id}/suggestions/apply` → flujo previo de sugerencias de continuidad de marimba.

Frontend: `frontend/src/components/DistributionPanel.tsx` (sección "Distribución propuesta" con confirmación explícita, nunca aplica solo) y `SuggestionsPanel.tsx` (continuidad).