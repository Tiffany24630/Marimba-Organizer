"""Crea composicion desde una distribucion preservando slots reales."""
import uuid
from fastapi import HTTPException
from app.models import Song, Person, Composition
from app.services.suggestions.engine_a import resolve_slots
from app.services.suggestions.requirements import get_song_requirements

def create_distribution_composition(song_id, distribution_assignments, name, db, slots=None):
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, 'La cancion %d no existe.' % song_id)
    
    # Una persona solo puede ocupar un puesto. Si llega repetida (varias
    # asignaciones musicales para la misma cancion) se queda con la primera:
    # duplicarla genera ids de elemento repetidos y deja el lienzo inconsistente.
    unique_assignments = []
    seen_persons = set()
    for a in (distribution_assignments or []):
        pid = a.get('person_id')
        if pid is not None and pid in seen_persons:
            continue
        if pid is not None:
            if not db.get(Person, pid):
                raise HTTPException(404, 'La persona %s no existe.' % pid)
            seen_persons.add(pid)
        unique_assignments.append(a)
    distribution_assignments = unique_assignments
    if slots is None:
        reqs = get_song_requirements(song_id, db)
        slots, _source = resolve_slots(song, db, reqs)

    by_id = {s['slot_id']: s for s in slots}
    # Agrupar por `marimba_id` (la instancia) y NO por nombre: dos instancias de
    # la misma plantilla comparten nombre y agruparlas por nombre las fusionaba en
    # una marimba con el doble de puestos (p.ej. un "tenor" de 3 con otro de 3).
    by_marimba = {}

    for s in slots:
        key = s.get('marimba_id') or s['marimba_name']
        by_marimba.setdefault(key, []).append(s)

    names = {}
    for s in slots:
        names[s.get('marimba_id') or s['marimba_name']] = s['marimba_name']

    for m in by_marimba:
        by_marimba[m].sort(key=lambda s: (s['slot_index'], s['slot_id']))

    # Un puesto fisico aloja a una sola persona. Si dos propuestas apuntan al
    # mismo puesto se conserva la primera y la otra persona queda sin asignar,
    # en lugar de sobrescribirla en silencio.
    assigned = {}
    for a in (distribution_assignments or []):
        sid = a.get('marimba_position_id')
        if sid and sid not in assigned:
            assigned[sid] = a
    
    W, H, PAD, GAP, SY, SH = 380, 150, 14, 10, 56, 54
    from app.services.suggestions.distributor import marimba_width
    elements = []

    for mi, (mkey, mslots) in enumerate(sorted(by_marimba.items())):
        mname = names.get(mkey, mkey)
        mid = 'marimba_%s' % uuid.uuid4().hex[:8]
        mx, my = 200 + (mi % 2) * 450, 200 + (mi // 2) * 250
        n = max(len(mslots), 1)
        W = marimba_width(len(mslots))
        sw = (W - 2 * PAD - GAP * (n - 1)) / n
        positions = []

        for i, s in enumerate(mslots):
            a = assigned.get(s['slot_id'])
            pid = a.get('person_id') if a else None
            positions.append({'id': s['slot_id'],
                              'type': s['position_type'],
                              'personId': pid})
            
            if pid:
                cx = PAD + i * (sw + GAP) + sw / 2
                cy = SY + SH / 2
                elements.append({
                    'id': 'person_%s' % pid, 'type': 'person',
                    'name': a.get('name', ''), 'personId': pid,
                    'positionType': a.get('musical_position', ''),
                    'marimbaId': mid, 'marimbaPositionId': s['slot_id'],
                    'x': mx + cx, 'y': my + cy,
                    'rotation': 0, 'scaleX': 1, 'scaleY': 1})
                
        elements.append({'id': mid, 'type': 'marimba', 'name': mname,
                         'x': mx, 'y': my, 'width': W, 'height': H,
                         'rotation': 0, 'scaleX': 1, 'scaleY': 1,
                         'positions': positions})
        
    comp = Composition(project_id=song.project_id, song_id=song_id,
                       name=name or song.name, width=1600, height=900,
                       data={'elements': elements})
    
    db.add(comp)
    db.commit()
    db.refresh(comp)
    
    return {c.name: getattr(comp, c.name) for c in comp.__table__.columns}
