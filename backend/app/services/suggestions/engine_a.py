"""Motor de distribucion parte 1: slots reales + mapa previo + explicaciones."""
from sqlalchemy import select
from app.services.suggestions.history import parse_composition_marimba_info  # noqa
from app.services.suggestions.positions import normalize_mapping, same_position

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

    return [{'marimba_id': m, 'marimba_name': names.get(m, m), 'slot_id': s,
             'position_type': t, 'slot_index': i, 'occupied_by': occ.get(s)}
            for (m, s, t, i) in defs]

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
        # D1: se conserva tambien el identificador de la INSTANCIA de marimba.
        # Con `marimba_name` solo, dos instancias distintas de la misma plantilla
        # son indistinguibles y la continuidad puede llevarse a la marimba
        # equivocada. `marimba_id` es la clave real; el nombre queda como respaldo
        # para composiciones antiguas que no traigan el dato.
        info[a.person_id] = {'position': a.position.name,
                             'marimba_id': slot.get('marimba_id') or None,
                             'marimba_name': slot.get('marimba_name'),
                             'slot_id': slot.get('slot_id'),
                             'slot_index': slot.get('slot_index')}

    return info

def get_default_templates(db):
    """Plantillas globales disponibles como punto de partida para una propuesta."""
    from app.models import MarimbaTemplate
    return db.scalars(select(MarimbaTemplate).order_by(MarimbaTemplate.id)).all()

def build_template_slots(templates, requirements, max_per_template=8):
    """
    Construye puestos REALES a partir de las plantillas globales.

    Devuelve la misma estructura que `slots_from_composition`
    ({marimba_id, marimba_name, slot_id, position_type, slot_index, occupied_by})
    para que ambos caminos (composicion previa o plantillas) sean intercambiables.

    Se agregan instancias de plantilla hasta cubrir `requirements`. NO se crean
    marimbas inventadas: lo que las plantillas no cubren queda como faltante, de
    modo que los puestos siempre respetan los tipos de la plantilla original.

    `requirements` se normaliza: "Primeras" (como viene en el Excel) se cuenta
    contra los puestos "Primera" de la plantilla. Antes se comparaba por
    igualdad exacta y ninguna plantilla podia cubrir esos puestos.
    """
    need = {k: v for k, v in normalize_mapping(requirements).items() if v > 0}
    if not need:
        return []
    cap = {}
    slots = []
    instances = {}
    specs = []
    for t in templates or []:
        pos = [str(p).strip() for p in (t.positions or []) if str(p).strip()]
        if pos:
            specs.append([t, pos, True])
    while True:
        best, best_gain = None, 0
        for t, pos, usable in specs:
            if not usable:
                continue
            local, gain = {}, 0
            for p in pos:
                local[p] = local.get(p, 0) + 1
                if cap.get(p, 0) + local[p] <= need.get(p, 0):
                    gain += 1
            if gain > best_gain:
                best, best_gain = (t, pos), gain
        if best is None or best_gain == 0:
            break
        t, pos = best
        idx = instances.get(t.id, 0) + 1
        if idx > max_per_template:
            for spec in specs:
                if spec[0].id == t.id:
                    spec[2] = False
            continue
        instances[t.id] = idx
        instance_id = 'tpl%d_%d' % (t.id, idx)
        name = t.name if idx == 1 else '%s %d' % (t.name, idx)
        for i, p in enumerate(pos):
            cap[p] = cap.get(p, 0) + 1
            slots.append({'marimba_id': instance_id,
                          'marimba_name': name,
                          'slot_id': '%s_%d' % (instance_id, i),
                          'position_type': p, 'slot_index': i,
                          'occupied_by': None})
    # UX-4: NO se inventan marimbas. Si las plantillas no cubren una posicion,
    # esa persona queda sin asignar y se reporta como faltante. Agregar una marimba
    # "de relleno" comprimia los puestos hasta hacer el texto ilegible.
    return slots

def resolve_slots(song, db, requirements=None):
    """
    Fuente unica de puestos para proponer una distribucion.

    Prioridad:
      1. Puestos reales de la composicion de la cancion anterior (continuidad real).
      2. Si no hay ninguno, se arman a partir de las plantillas globales.

    Devuelve (slots, source) con source in ('composition','templates').
    """
    reqs = requirements or {}
    slots = get_real_slots(get_previous_song(song, db), db)
    if slots:
        return slots, 'composition'
    return build_template_slots(get_default_templates(db), reqs), 'templates'

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