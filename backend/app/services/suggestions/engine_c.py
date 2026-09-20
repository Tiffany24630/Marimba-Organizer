"""Orquestador del motor para una cancion (parte 3)."""
from app.services.suggestions.engine_a import get_previous_song, get_real_slots, get_previous_assignment_map
from app.services.suggestions.engine_d import propose_distribution
from app.models import Song
from fastapi import HTTPException
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements

def get_distribution_for_song(song_id, db):
    song = db.get(Song, song_id)

    if not song:
        raise HTTPException(404, 'La cancion %d no existe.' % song_id)
    
    if song.project is None:
        raise HTTPException(404, 'El proyecto no existe.')
    
    reqs = get_song_requirements(song_id, db)
    avail = sorted(
        [{'person_id': a.person_id, 'name': a.person.name} for a in song.assignments],
        key=lambda p: (p['name'], p['person_id']))
    prev = get_previous_song(song, db)
    slots = get_real_slots(prev, db)
    pmap = get_previous_assignment_map(prev, db)
    hist = get_person_history(song.project.id, db, exclude_song_id=song_id)
    hmap = {h['person_id']: h for h in hist}
    res = propose_distribution(reqs, avail, slots, pmap, hmap)
    cap = {}

    for s in slots:
        cap[s['position_type']] = cap.get(s['position_type'], 0) + 1

    return {'song_id': song_id, 'song_name': song.name,
            'previous_song': prev.name if prev else None,
            'marimbas_available': sorted({s['marimba_name'] for s in slots}),
            'capacity': dict(sorted(cap.items())), **res}