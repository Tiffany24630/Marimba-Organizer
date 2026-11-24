import uuid
from sqlalchemy import select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Song, Person, Composition
from app.services.suggestions.engine_a import get_default_templates, build_template_slots

MARIMBA_W = 380
MARIMBA_H = 150
PAD = 14
GAP = 10
SLOT_Y = 56
SLOT_H = 54

def plan_marimbas_from_templates(templates, position_counts):
    """
    Reparte los puestos entre varias marimbas usando las plantillas globales.

    Devuelve [{'id','name', 'positions'}] con el mismo contenido de puestos que una
    plantilla, replicada tantas veces como haga falta. Nunca devuelve una sola
    marimba gigante: cada instancia conserva la forma de su plantilla.
    """
    need = {k: int(v) for k, v in (position_counts or {}).items() if int(v) > 0}
    if not need:
        return []
    slots = build_template_slots(templates, need)
    by_id = {}
    for s in slots:
        by_id.setdefault(s['marimba_id'], []).append(s)
    plan = []
    # Orden estable por nombre para que la composicion sea siempre reproducible.
    for mid in sorted(by_id, key=lambda k: (by_id[k][0]['marimba_name'], k)):
        group = sorted(by_id[mid], key=lambda s: (s['slot_index'], s['slot_id']))
        plan.append({'id': mid,
                     'name': group[0]['marimba_name'],
                     'positions': [s['position_type'] for s in group]})
    return plan

def generate_proposals(assignments, history, templates=None):
    """
    Generar propuestas de distribución para una canción.

    assignments: [{person_id, person_name, position_name, mark}]
    history: lista de history dicts
    templates: plantillas globales (MarimbaTemplate). Si se pasa None se
               devuelve una propuesta por persona sin marimba asignada.

    Cada persona produce UNA sola propuesta: si aparece con varios puestos en la
    misma canción se queda con el primero, porque una persona solo puede ocupar
    un puesto. Las marimbas se arman con las plantillas globales.
    """
    history_by_person = {h['person_id']: h for h in history}

    # Una persona -> un unico puesto. Se conserva la primera asignacion.
    unique = []
    seen = set()
    for a in assignments:
        pid = a['person_id']
        if pid in seen:
            continue
        seen.add(pid)
        unique.append(a)
    dropped = len(assignments) - len(unique)

    position_counts = {}
    for a in unique:
        position_counts[a['position_name']] = position_counts.get(a['position_name'], 0) + 1

    # Puestos disponibles: primero las plantillas; si no hay, una marimba por posicion.
    if templates is None:
        marimba_plan = []
    else:
        marimba_plan = plan_marimbas_from_templates(templates, position_counts)
    free_slots = []
    for mi, m in enumerate(marimba_plan):
        for si, pt in enumerate(m['positions']):
            free_slots.append({'marimba': m['name'], 'mid': m.get('id', m['name']),
                               'type': pt, 'mi': mi, 'si': si})
    free_slots.sort(key=lambda s: (s['mi'], s['si']))

    proposals = []
    used_person_ids = set()
    # Clave REAL del puesto: (indice de marimba, indice de puesto). Antes se
    # guardaba `id(chosen)`, que nunca se consultaba, por lo que dos personas del
    # mismo tipo recibian el mismo puesto fisico.
    used_slots = set()
    unplaced = []

    for a in unique:
        pid = a['person_id']
        h = history_by_person.get(pid)
        last_marimba = h.get('last_marimba') if h else None
        last_position = h.get('last_position') if h else None
        last_song_name = h.get('last_song_name') if h else None

        reasons = []

        if last_position and last_position == a['position_name']:
            reasons.append('Continuidad de posición')

        # Continuidad de marimba: se respeta si esa marimba existe en el plan.
        marimba_name = last_marimba
        slot_index = 0
        mid = None
        # `templates is None` significa que NO hay informacion de plantillas (llamada
        # legacy): se conserva el comportamiento historico basado en el historial.
        # Si hay plantillas pero el plan queda vacio, es porque ninguna cubre este
        # puesto musical: la persona se reporta como `unplaced`.
        legacy = templates is None

        # Solo se consideran puestos LIBRES y del tipo musical exacto de la
        # persona: si la plantilla dice "Centro", solo se puede ocupar un "Centro".
        candidates = [s for s in free_slots
                      if s['type'] == a['position_name']
                      and (s['mi'], s['si']) not in used_slots]
        if candidates:
            if marimba_name:
                same = [s for s in candidates if s['marimba'] == marimba_name]
                chosen = same[0] if same else candidates[0]
            else:
                chosen = candidates[0]
            marimba_name = chosen['marimba']
            mid = chosen['mid']
            slot_index = chosen['si']
            used_slots.add((chosen['mi'], chosen['si']))
        elif legacy:
            # Sin plantillas: se mantiene la marimba de continuidad o una marimba
            # generica, como antes de UX-4. No se puede garantizar el tipo.
            marimba_name = marimba_name or 'Marimba 1'
            slot_index = 0
        elif marimba_name and any(m['name'] == marimba_name for m in marimba_plan):
            # Sin puesto libre de su tipo, pero se conserva la marimba de continuidad.
            slot_index = -1
        else:
            marimba_name = None
            slot_index = -1
            unplaced.append({'person_id': pid, 'name': a['person_name'],
                             'position_type': a['position_name']})

        if marimba_name and last_marimba == marimba_name:
            reasons.append(f'Continuidad de marimba ({marimba_name})')
        elif marimba_name:
            reasons.append(f'Plantilla: {marimba_name}')
        else:
            reasons.append('Sin historial suficiente')
        if not h:
            reasons.append('Primera vez en el proyecto')

        proposal = {
            'person_id': pid,
            'name': a['person_name'],
            'position_type': a['position_name'],
            'marimba_name': marimba_name,
            'marimba_id': mid,
            'marimba_position_index': slot_index,
            'reasons': reasons,
            'history': {
                'last_position': last_position,
                'last_marimba': last_marimba,
                'last_song_name': last_song_name,
            } if h else None,
        }

        proposals.append(proposal)
        used_person_ids.add(pid)

    # Orden estable dentro de cada marimba, como antes.
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
        'marimba_plan': marimba_plan,
        'duplicates_dropped': dropped,
        'unplaced': unplaced,
        'people_with_history': people_with_history,
        'people_without_history': people_without_history,
    }

def _assign_physical_positions(proposals):
    """
    Orden estable dentro de cada marimba.

    NO reescribe `marimba_position_index`: ese valor es el puesto EXACTO de la
    plantilla que se leyo como compatible para la persona (si la plantilla dice
    "Centro" en el indice 1, la persona va al indice 1). Antes se sobrescribia con
    un contador secuencial 0,1,2..., lo que colocaba a cada persona en un puesto de
    otro tipo y hacia que una marimba tuviera mas puestos de los que dice su
    plantilla.
    """
    for p in proposals:
        p.setdefault('marimba_position_index', -1)
    return proposals

MIN_SLOT_W = 104

def marimba_width(n_positions):
    """
    Ancho necesario para que `n` puestos sigan siendo legibles.
    Con 15 puestos en 380px cada texto salia vertical e ilegible.
    """
    n = max(int(n_positions or 0), 1)
    return max(380, 2 * PAD + n * MIN_SLOT_W + (n - 1) * GAP)

def create_composition_from_proposals(song_id, proposals, name, db, marimba_plan=None):
    """
    Crear una composición a partir de propuestas.
    
    Si se recibe `marimba_plan` (derivado de las plantillas globales) se crean
    las marimbas con TODOS los puestos de la plantilla, dejando libres los que
    no alcanzan a ocuparse. Si no se recibe, se agrupa por `marimba_name`.
    """
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, f'La canción {song_id} no existe.')

    project_id = song.project_id

    # Una persona no puede ocupar dos puestos: se conserva su primera propuesta.
    seen = set()
    deduped = []
    for p in proposals or []:
        pid = p.get('person_id')
        if pid is not None:
            if pid in seen:
                continue
            seen.add(pid)
        deduped.append(p)
    proposals = deduped

    for p in proposals:
        pid = p.get('person_id')

        if pid is not None:
            person = db.get(Person, pid)

            if not person:
                raise HTTPException(404, f'La persona {pid} no existe.')

    # grouping por marimba (siempre se necesita para ubicar a cada persona)
    grouped = {}

    for p in proposals:
        mb = p['marimba_name']

        if mb not in grouped:
            grouped[mb] = []

        grouped[mb].append(p)

    if marimba_plan:
        marimbas = [{'id': m.get('id', m['name']), 'name': m['name'],
                     'positions': list(m['positions'])}
                    for m in marimba_plan]
    else:
        marimbas = [{'id': mb, 'name': mb,
                     'positions': [p['position_type'] for p in sorted(props, key=lambda x: x.get('marimba_position_index', 0))]}
                    for mb, props in grouped.items()]

    # Persona -> (marimba, indice de puesto dentro de esa marimba).
    # Se agrupa por `marimba_id` (la INSTANCIA de plantilla) y no por nombre: dos
    # instancias distintas de la misma plantilla comparten nombre, y agrupar por
    # nombre las fusionaba en una sola marimba con el doble de puestos.
    placement = {}
    for mname, props in grouped.items():
        for p in sorted(props, key=lambda x: x.get('marimba_position_index', 0)):
            if p.get('person_id') is not None and p.get('marimba_position_index', -1) >= 0:
                key = p.get('marimba_id') or mname
                placement[p['person_id']] = (key, p['marimba_position_index'])

    elements = []

    for marimba_idx, spec in enumerate(marimbas):
        mb_id = spec['id']
        mb_name = spec['name']
        types = spec['positions']
        marimba_id = f'marimba_{uuid.uuid4().hex[:8]}'
        marimba_x = 200 + (marimba_idx % 2) * 450
        marimba_y = 200 + (marimba_idx // 2) * 250
        n = max(len(types), 1)
        width = marimba_width(len(types))
        slot_w = (width - 2 * PAD - GAP * (n - 1)) / n

        # Quien ocupa cada puesto de esta marimba. Se valida que el tipo del
        # puesto sea EXACTAMENTE el puesto musical de la persona: una propuesta
        # desactualizada nunca puede meter a alguien en un puesto ajeno.
        holder = {}
        wanted_type = {pr.get('person_id'): pr.get('position_type') for pr in proposals}
        for pid, (pkey, sidx) in placement.items():
            if pkey != mb_id or sidx >= len(types):
                continue
            # El puesto debe ser del mismo tipo musical que la persona. Es la
            # garantia final de "si la plantilla dice Centro, va a un Centro",
            # aunque la propuesta venga manipulada o desactualizada.
            if wanted_type.get(pid) != types[sidx]:
                continue
            holder.setdefault(sidx, pid)

        positions = []

        for i, ptype in enumerate(types):
            pos_id = f'mp_{marimba_id[9:17]}_{i}'
            pid = holder.get(i)
            positions.append({
                'id': pos_id,
                'type': ptype,
                'personId': pid if pid else None,
            })

            if pid:
                slot_x = PAD + i * (slot_w + GAP)
                slot_center_x = slot_x + slot_w / 2
                slot_center_y = SLOT_Y + SLOT_H / 2
                person_label = next((p.get('name', '') for p in proposals
                                     if p.get('person_id') == pid), '')
                ptype_person = wanted_type.get(pid) or ptype
                elements.append({
                    'id': f'person_{pid}',
                    'type': 'person',
                    'name': person_label,
                    'personId': pid,
                    'positionType': ptype_person,
                    'marimbaId': marimba_id,
                    'marimbaPositionId': pos_id,
                    'x': marimba_x + slot_center_x,
                    'y': marimba_y + slot_center_y,
                    'rotation': 0,
                    'scaleX': 1,
                    'scaleY': 1,
                    'locked': False,
                    'width': slot_w - 6,
                    'height': SLOT_H - 6,
                })

        elements.append({
            'id': marimba_id,
            'type': 'marimba',
            'name': mb_name,
            'x': marimba_x,
            'y': marimba_y,
            'width': width,
            'height': MARIMBA_H,
            'rotation': 0,
            'scaleX': 1,
            'scaleY': 1,
            'locked': False,
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