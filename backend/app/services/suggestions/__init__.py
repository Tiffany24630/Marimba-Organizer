from sqlalchemy.orm import Session
from app.models import Song, Project
from app.services.suggestions.history import get_person_history
from app.services.suggestions.requirements import get_song_requirements, get_song_assignments, get_song_requirements_report
from app.services.suggestions.movement import analyze_changes
from app.services.suggestions.distributor import generate_proposals, create_composition_from_proposals

def suggest(data):
    """
    Función legacy para mantener compatibilidad con el endpoint POST /suggestions.
    Acepta un dict con 'history', 'people' y 'groups'.
    """
    hist = {}
    for x in data.get('history', []):
        hist.setdefault(x.get('person_id'), []).append(x.get('marimba_id'))

    movement = []
    for p in data.get('people', []):
        ids = hist.get(p.get('person_id'), [])
        if ids:
            counts = {i: ids.count(i) for i in set(ids)}
            preferred = max(counts, key=counts.get)
            movement.append({
                'person_id': p.get('person_id'),
                'name': p.get('name'),
                'suggested_marimba_id': preferred,
                'history': counts,
                'reason': 'Mantener la misma marimba reduce cambios respecto al historial cargado.',
            })

    return {'movement': movement, 'groups': data.get('groups', [])}

def get_suggestions_for_song(song_id, db):
    """
    Orquestar el análisis completo para una canción.
    Deriva historial desde datos existentes, calcula requerimientos,
    genera propuestas y analiza cambios.
    """
    song = db.get(Song, song_id)
    if not song:
        from fastapi import HTTPException
        raise HTTPException(404, f'La canción {song_id} no existe.')

    project = db.get(Project, song.project_id)
    if not project:
        from fastapi import HTTPException
        raise HTTPException(404, f'El proyecto no existe.')

    position_counts = get_song_requirements(song_id, db)
    assignments = get_song_assignments(song_id, db)
    history = get_person_history(song.project_id, db, exclude_song_id=song_id)
    dist = generate_proposals(assignments, history)
    proposals = dist['proposals']
    changes = analyze_changes(proposals, history)

    people_with_history = dist['people_with_history']
    people_without_history = dist['people_without_history']

    return {
        'song_name': song.name,
        'position_counts': position_counts,
        'proposals': proposals,
        'people_with_history': people_with_history,
        'people_without_history': people_without_history,
        'changes': changes,
    }