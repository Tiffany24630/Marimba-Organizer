from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Song, Composition
from app.services.suggestions.engine_a import slots_from_composition

STATUS_COVERED = 'covered'
STATUS_PARTIAL = 'partial'
STATUS_MISSING = 'missing'

def get_song_requirements(song_id, db):
    """
    Retornar {nombre_posicion: cantidad} basado en los SongAssignment de la canción.
    """
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    counts = {}

    for assignment in song.assignments:
        pos_name = assignment.position.name
        counts[pos_name] = counts.get(pos_name, 0) + 1

    return dict(sorted(counts.items(), key=lambda x: x[0]))

def get_song_assignments(song_id, db):
    """
    Retornar la lista de asignaciones para una canción:
    [{person_id, person_name, position_name, mark}, ...]
    """
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    return [
        {
            'person_id': a.person_id,
            'person_name': a.person.name,
            'position_name': a.position.name,
            'mark': a.mark,
        }

        for a in song.assignments
    ]

def get_composition_capacity(composition):
    """{tipo_de_puesto: cantidad} segun las posiciones reales de las marimbas.

    No usa plantillas: si una marimba tiene 5 puestos 'Primera' cuenta como 5,
    aunque el template de origen tuviera otra cantidad.
    """
    capacity = {}

    for slot in slots_from_composition(composition):
        ptype = (slot.get('position_type') or '').strip()

        if not ptype:
            continue

        capacity[ptype] = capacity.get(ptype, 0) + 1

    return dict(sorted(capacity.items()))

def get_capacity_composition(song, db, composition_id=None):
    """Composicion que sirve como fuente de capacidad.

    Si se indica `composition_id` se usa esa composicion; si no, la mas
    reciente de la cancion. Devuelve None si la cancion no tiene composicion.
    """
    if composition_id is not None:
        comp = db.get(Composition, composition_id)

        if not comp:
            raise HTTPException(404, f'La composición {composition_id} no existe.')

        if comp.song_id is not None and comp.song_id != song.id:
            raise HTTPException(400, 'La composición indicada pertenece a otra canción.')

        return comp

    if song.project is None:
        return None

    comps = [c for c in song.project.compositions if c.song_id == song.id and c.data]

    if not comps:
        return None

    return sorted(comps, key=lambda c: c.id)[-1]

def compare_requirements(required_counts, capacity):
    """Comparar requisitos contra capacidad. Solo informa, no modifica nada.

    Devuelve [{position_type, required, available, missing, status}] ordenado
    por cantidad requerida (descendente) y luego por nombre.
    """
    rows = []

    for ptype in sorted(required_counts, key=lambda p: (-required_counts[p], p)):
        required = required_counts[ptype]
        available = capacity.get(ptype, 0)
        missing = max(required - available, 0)

        if missing == 0:
            status = STATUS_COVERED
        elif available == 0:
            status = STATUS_MISSING
        else:
            status = STATUS_PARTIAL

        rows.append({'position_type': ptype, 'required': required,
                     'available': available, 'missing': missing,
                     'status': status})

    return rows

def get_song_requirements_report(song_id, db, composition_id=None):
    """Requisitos de la cancion contra los puestos disponibles en la composicion.

    Conserva `position_counts` (contrato previo) y agrega el detalle de
    capacidad. No agrega puestos, no mueve personas y no modifica composiciones.
    """
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    position_counts = get_song_requirements(song_id, db)
    composition = get_capacity_composition(song, db, composition_id)
    capacity = get_composition_capacity(composition) if composition is not None else {}
    rows = compare_requirements(position_counts, capacity)
    totals = {'required': sum(r['required'] for r in rows),
              'available': sum(r['available'] for r in rows),
              'missing': sum(r['missing'] for r in rows)}
    extra = [{'position_type': p, 'available': capacity[p]}
             for p in sorted(capacity) if p not in position_counts]

    return {'song_id': song.id,
            'song_name': song.name,
            'composition_id': composition.id if composition is not None else None,
            'capacity_source': 'composition' if composition is not None else 'sin_composicion',
            'position_counts': position_counts,
            'requirements': rows,
            'totals': totals,
            'extra_capacity': extra,
            'has_requirements': bool(position_counts),
            'complete': totals['missing'] == 0}