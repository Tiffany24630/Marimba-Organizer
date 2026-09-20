import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Song, Person, Composition


MARIMBA_W = 380
MARIMBA_H = 150
PAD = 14
GAP = 10
SLOT_Y = 56
SLOT_H = 54


def generate_proposals(assignments, history):
    """
    Generar propuestas de distribución para una canción.

    assignments: [{person_id, person_name, position_name, mark}]
    history: lista de history dicts

    Cada asignación genera una propuesta. Si la persona tiene historial,
    se propone su última marimba (continuidad). Si no, se usa una marimba
    por defecto y se marca como "sin historial".
    """
    history_by_person = {h['person_id']: h for h in history}

    proposals = []
    used_person_ids = set()

    for a in assignments:
        pid = a['person_id']
        h = history_by_person.get(pid)
        last_marimba = h.get('last_marimba') if h else None
        last_position = h.get('last_position') if h else None
        last_song_name = h.get('last_song_name') if h else None

        reasons = []

        if last_position and last_position == a['position_name']:
            reasons.append('Continuidad de posición')

        marimba_name = last_marimba or 'Marimba 1'
        if last_marimba:
            reasons.append(f'Continuidad de marimba ({last_marimba})')
        else:
            reasons.append('Sin historial suficiente')

        proposal = {
            'person_id': pid,
            'name': a['person_name'],
            'position_type': a['position_name'],
            'marimba_name': marimba_name,
            'marimba_position_index': 0,
            'reasons': reasons,
            'history': {
                'last_position': last_position,
                'last_marimba': last_marimba,
                'last_song_name': last_song_name,
            } if h else None,
        }

        proposals.append(proposal)
        used_person_ids.add(pid)

    proposals = _assign_physical_positions(proposals)

    people_with_history = [
        {'person_id': h['person_id'], 'name': h['name'],
         'last_position': h.get('last_position'),
         'last_marimba': h.get('last_marimba'),
         'last_song_name': h.get('last_song_name')}
        for h in history if h['person_id'] in used_person_ids
    ]

    people_without_history = [
        {'person_id': pid, 'name': a['person_name']}
        for a in assignments if pid not in history_by_person
    ]

    return {
        'proposals': proposals,
        'people_with_history': people_with_history,
        'people_without_history': people_without_history,
    }


def _assign_physical_positions(proposals):
    """
    Agrupar propuestas por marimba_name y asignar índices físicos secuenciales.
    """
    by_marimba = {}
    for p in proposals:
        mb = p['marimba_name']
        if mb not in by_marimba:
            by_marimba[mb] = []
        by_marimba[mb].append(p)

    for mb_name, props in by_marimba.items():
        for j, p in enumerate(props):
            p['marimba_position_index'] = j

    return proposals


def create_composition_from_proposals(song_id, proposals, name, db):
    """
    Crear una composición a partir de propuestas.
    Agrupa propuestas por marimba_name y construye los elementos.
    """
    song = db.get(Song, song_id)
    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    project_id = song.project_id

    for p in proposals:
        pid = p.get('person_id')
        if pid is not None:
            person = db.get(Person, pid)
            if not person:
                raise HTTPException(404, f'La persona {pid} no existe.')

    marimbas = {}
    for p in proposals:
        mb = p['marimba_name']
        if mb not in marimbas:
            marimbas[mb] = []
        marimbas[mb].append(p)

    elements = []

    for marimba_idx, (mb_name, props) in enumerate(marimbas.items()):
        props_sorted = sorted(props, key=lambda x: x.get('marimba_position_index', 0))
        marimba_id = f'marimba_{uuid.uuid4().hex[:8]}'
        marimba_x = 200 + (marimba_idx % 2) * 450
        marimba_y = 200 + (marimba_idx // 2) * 250

        n = max(len(props_sorted), 1)
        slot_w = (MARIMBA_W - 2 * PAD - GAP * (n - 1)) / n

        positions = []
        for i, p in enumerate(props_sorted):
            pos_id = f'mp_{marimba_idx}_{i}'
            pid = p.get('person_id')
            positions.append({
                'id': pos_id,
                'type': p['position_type'],
                'personId': pid if pid else None,
            })

            if pid:
                slot_x = PAD + i * (slot_w + GAP)
                slot_center_x = slot_x + slot_w / 2
                slot_center_y = SLOT_Y + SLOT_H / 2
                elements.append({
                    'id': f'person_{pid}',
                    'type': 'person',
                    'name': p.get('name', ''),
                    'personId': pid,
                    'positionType': p['position_type'],
                    'marimbaId': marimba_id,
                    'marimbaPositionId': pos_id,
                    'x': marimba_x + slot_center_x,
                    'y': marimba_y + slot_center_y,
                    'rotation': 0,
                    'scaleX': 1,
                    'scaleY': 1,
                })

        elements.append({
            'id': marimba_id,
            'type': 'marimba',
            'name': mb_name,
            'x': marimba_x,
            'y': marimba_y,
            'width': MARIMBA_W,
            'height': MARIMBA_H,
            'rotation': 0,
            'scaleX': 1,
            'scaleY': 1,
            'positions': positions,
        })

        comp_name = name or song.name
    def obj(c):
        return {col.name: getattr(c, col.name) for col in c.__table__.columns}

    comp = Composition(
        project_id=project_id,
        song_id=song_id,
        name=comp_name,
        width=1600,
        height=900,
        data={'elements': elements},
    )
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return obj(comp)
