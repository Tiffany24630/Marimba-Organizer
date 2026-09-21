"""Motor de distribucion parte 1: slots reales + mapa previo + explicaciones."""
from app.services.suggestions.history import parse_composition_marimba_info  # noqa

def get_previous_song(song, db):
    others = [s for s in song.project.songs if s.id != song.id]
    
    if not others:
        return None
    
    before = [s for s in others if s.order_index < song.order_index]

    if before:
        before.sort(key=lambda s: (s.order_index, s.id))
        return before[-1]
    
    with_comp = [s for s in others
                 if any(c.song_id == s.id and c.data for c in song.project.compositions)]
    pool = with_comp or others
    pool.sort(key=lambda s: (s.order_index, s.id))
    below = [s for s in pool if (s.order_index, s.id) < (song.order_index, song.id)]

    return below[-1] if below else None

def slots_from_composition(comp):
    """Extraer los puestos reales de una composicion.

    Es la fuente unica de interpretacion de `composition.data['elements']`:
    devuelve una lista de slots {marimba_name, slot_id, position_type,
    slot_index, occupied_by}. Si la composicion no tiene marimbas devuelve [].
    """
    if comp is None:
        return []

    data = comp.data or {}
    elements = data.get('elements', []) if isinstance(data, dict) else []

    if not isinstance(elements, list):
        return []

    names, defs = {}, []

    for e in elements:
        if isinstance(e, dict) and e.get('type') == 'marimba':
            mid = e.get('id', '')
            names[mid] = e.get('name', '') or mid

            for idx, p in enumerate(e.get('positions', []) or []):
                if isinstance(p, dict):
                    defs.append((mid, p.get('id', ''), p.get('type', ''), idx))
    defs.sort(key=lambda t: (names.get(t[0], t[0]), t[3], t[1]))
    occ = {}

    for e in elements:
        if (isinstance(e, dict) and e.get('type') == 'person'
                and e.get('personId') is not None and e.get('marimbaPositionId')):
            occ[e['marimbaPositionId']] = e['personId']

    return [{'marimba_name': names.get(m, m), 'slot_id': s, 'position_type': t,
             'slot_index': i, 'occupied_by': occ.get(s)} for (m, s, t, i) in defs]

def get_real_slots(previous_song, db):
    if previous_song is None:
        return []

    comps = [c for c in previous_song.project.compositions
             if c.song_id == previous_song.id and c.data]

    if not comps:
        return []

    return slots_from_composition(sorted(comps, key=lambda c: c.id)[-1])

def get_previous_assignment_map(previous_song, db):
    if previous_song is None:
        return {}
    
    slots = get_real_slots(previous_song, db)
    by_occ = {s['occupied_by']: s for s in slots if s['occupied_by'] is not None}
    info = {}

    for a in previous_song.assignments:
        slot = by_occ.get(a.person_id, {})
        info[a.person_id] = {'position': a.position.name,
                             'marimba_name': slot.get('marimba_name'),
                             'slot_id': slot.get('slot_id'),
                             'slot_index': slot.get('slot_index')}
        
    return info

def _explain(same_pos, same_mar, same_slot, pos_chg, mar_chg, slot_chg, no_hist):
    if no_hist:
        return 'sin historial: primera asignacion'
    
    if same_pos and same_mar and same_slot:
        return 'Continuidad de posicion, marimba y puesto fisico'

    parts = []
    
    if same_pos:
        parts.append('mantiene posicion')

    if same_mar:
        parts.append('mantiene marimba')

    if same_slot:
        parts.append('mantiene puesto fisico')

    if pos_chg:
        parts.append('requiere cambio de posicion')

    if mar_chg:
        parts.append('requiere cambio de marimba')

    if slot_chg and same_mar:
        parts.append('cambia puesto fisico dentro de la misma marimba')

    return '; '.join(parts) if parts else 'asignacion disponible'