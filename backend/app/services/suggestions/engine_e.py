"""Crea composicion desde una distribucion preservando slots reales."""
import uuid
from fastapi import HTTPException
from app.models import Song, Person, Composition
from app.services.suggestions.engine_a import get_previous_song, get_real_slots

def create_distribution_composition(song_id, distribution_assignments, name, db, slots=None):
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, 'La cancion %d no existe.' % song_id)
    
    for a in (distribution_assignments or []):
        pid = a.get('person_id')

        if pid is not None and not db.get(Person, pid):
            raise HTTPException(404, 'La persona %s no existe.' % pid)
        
    if slots is None:
        slots = get_real_slots(get_previous_song(song, db), db)

    by_id = {s['slot_id']: s for s in slots}
    by_marimba = {}

    for s in slots:
        by_marimba.setdefault(s['marimba_name'], []).append(s)
        
    for m in by_marimba:
        by_marimba[m].sort(key=lambda s: (s['slot_index'], s['slot_id']))

    assigned = {a.get('marimba_position_id'): a for a in (distribution_assignments or [])
                if a.get('marimba_position_id')}
    
    W, H, PAD, GAP, SY, SH = 380, 150, 14, 10, 56, 54
    elements = []

    for mi, (mname, mslots) in enumerate(sorted(by_marimba.items())):
        mid = 'marimba_%s' % uuid.uuid4().hex[:8]
        mx, my = 200 + (mi % 2) * 450, 200 + (mi // 2) * 250
        n = max(len(mslots), 1)
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
