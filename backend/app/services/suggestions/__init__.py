from sqlalchemy.orm import Session
from app.models import Song, Project
# La decision de asignaciones vive en `core`; aqui solo se expone
# `get_suggestions_for_song` (adaptador de `/suggestions`) y `suggest` (legacy).
from app.services.suggestions.core import (build_distribution_core,
                                           to_suggestions_response)
# `create_composition_from_proposals` se conserva: construye la composicion a
# partir de `marimba_plan`, que el nucleo sigue produciendo. No decide asignaciones.
from app.services.suggestions.distributor import create_composition_from_proposals

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

    Fase 3: delega en `core.build_distribution_core`, el MISMO núcleo que usa
    `/distribution-suggestion`, y aplica el adaptador de formato de este endpoint.
    Así ambos endpoints coinciden en las asignaciones aunque sus contratos JSON
    sean distintos.
    """
    song = db.get(Song, song_id)
    if not song:
        from fastapi import HTTPException
        raise HTTPException(404, f'La canción {song_id} no existe.')

    project = db.get(Project, song.project_id)
    if not project:
        from fastapi import HTTPException
        raise HTTPException(404, f'El proyecto no existe.')

    return to_suggestions_response(build_distribution_core(song, db))